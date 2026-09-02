let currentServer = null;
let currentChannel = null;
const serverIconCache = {};
let serverMembers = [];
let mentionSelectedIndex = -1;

// ── Mobile navigation ──
function isMobile() { return window.innerWidth <= 768; }

const MOBILE_PANELS = ['serverNav', 'channelSidebar', 'mainContent', 'membersSidebar'];

function showMobilePanel(panel) {
    if (!isMobile()) return;

    const visible = {
        canais:  ['serverNav', 'channelSidebar'],
        chat:    ['mainContent'],
        membros: ['membersSidebar']
    }[panel] || ['mainContent'];

    MOBILE_PANELS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (visible.includes(id)) {
            el.classList.remove('mobile-hidden');
        } else {
            el.classList.add('mobile-hidden');
        }
    });

    // Update active tab indicator
    document.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));
    const tabIds = { canais: 'mobTabCanais', chat: 'mobTabChat', membros: 'mobTabMembros' };
    const tabEl = document.getElementById(tabIds[panel]);
    if (tabEl) tabEl.classList.add('active');

    // When switching to chat, scroll messages to bottom
    if (panel === 'chat') {
        requestAnimationFrame(scrollToBottom);
    }
}

// Sync mobile voice bar state from the desktop voice bar
function syncMobileVoiceBar() {
    const voiceBar = document.getElementById('voiceBar');
    const mobileVoiceBar = document.getElementById('mobileVoiceBar');
    if (!mobileVoiceBar) return;

    const connected = voiceBar && !voiceBar.classList.contains('hidden');
    if (connected) {
        mobileVoiceBar.classList.remove('hidden');
        // sync channel name
        const nameEl = document.getElementById('voiceBarChannelName');
        const mobName = document.getElementById('mobVoiceChannelName');
        if (nameEl && mobName) mobName.textContent = nameEl.textContent;
        // sync mic muted state
        const micBtn  = document.getElementById('micBtn');
        const mobMic  = document.getElementById('mobMicBtn');
        if (micBtn && mobMic) {
            mobMic.classList.toggle('muted', micBtn.classList.contains('muted'));
        }
        // sync deafen state
        const deafBtn = document.getElementById('deafBtn');
        const mobDeaf = document.getElementById('mobDeafBtn');
        if (deafBtn && mobDeaf) {
            mobDeaf.classList.toggle('muted', deafBtn.classList.contains('muted'));
        }
    } else {
        mobileVoiceBar.classList.add('hidden');
    }
}

// Restore all panels when resizing to desktop
window.addEventListener('resize', () => {
    if (!isMobile()) {
        document.body.style.height = '';
        MOBILE_PANELS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('mobile-hidden');
        });
    }
});

// Handle iOS virtual keyboard: resize body to visual viewport height
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        if (isMobile()) {
            document.body.style.height = window.visualViewport.height + 'px';
        }
    });
    window.visualViewport.addEventListener('scroll', () => {
        if (isMobile()) {
            document.body.style.height = window.visualViewport.height + 'px';
        }
    });
}

// Auth guard
if (!getToken()) {
    window.location.href = 'index.html';
}

function syncHomeSidebarProfile() {
    const user = getUser();
    const name = user.displayName || user.username || '?';
    document.getElementById('hspName').textContent = name;
    document.getElementById('hspTag').textContent = '#' + (user.tag || user.username || '');
    updateUserAvatar(document.getElementById('hspAvatar'), user.avatarUrl, name);
}

// Init
(async function init() {
    const user = getUser();
    document.getElementById('userDisplayName').textContent = user.displayName || user.username;
    document.getElementById('userTag').textContent = '#' + (user.tag || user.username || '');
    updateUserAvatar(document.getElementById('userAvatarSmall'), user.avatarUrl, user.displayName || user.username);
    document.getElementById('channelSidebar').classList.add('home-mode');
    syncHomeSidebarProfile();

    await loadServers();
    connectWebSocket();

    // Mobile: init panels and set up observers
    if (isMobile()) {
        // Pre-remove 'hidden' from membersSidebar so the Membros tab works at any time
        document.getElementById('membersSidebar').classList.remove('hidden');
        showMobilePanel('canais');

        // Watch voiceBar, micBtn, deafBtn for state sync into mobile voice bar
        const observe = (id) => {
            const el = document.getElementById(id);
            if (el) new MutationObserver(syncMobileVoiceBar).observe(el, { attributes: true, attributeFilter: ['class'] });
        };
        observe('voiceBar');
        observe('micBtn');
        observe('deafBtn');
        // observe channel name text for sync
        const nameEl = document.getElementById('voiceBarChannelName');
        if (nameEl) new MutationObserver(syncMobileVoiceBar).observe(nameEl, { childList: true, characterData: true, subtree: true });
    }

    // Atualiza membros a cada 30s
    setInterval(async () => {
        if (currentServer) {
            const members = await fetchMembers(currentServer.id);
            renderMembers(members);
        }
    }, 30000);
})();

async function loadServers() {
    const servers = await fetchMyServers();
    const list = document.getElementById('serverList');
    list.innerHTML = '';
    servers.forEach(s => {
        const btn = document.createElement('div');
        btn.className = 'server-icon';
        btn.title = s.name;
        const icon = safeImageUrl(serverIconCache[s.id] || s.iconUrl || '');
        if (icon) {
            btn.style.backgroundImage = `url("${icon}")`;
            btn.style.backgroundSize = 'cover';
            btn.style.backgroundPosition = 'center';
            btn.innerHTML = `<span class="server-icon-text"></span>`;
        } else {
            btn.innerHTML = `<span class="server-icon-text">${escapeHtml((s.name[0] || '?').toUpperCase())}</span>`;
        }
        btn.onclick = () => selectServer(s);
        btn.dataset.serverId = s.id;
        list.appendChild(btn);
    });
}

async function selectServer(server) {
    currentServer = server;
    document.getElementById('channelSidebar').classList.remove('home-mode');
    // Mobile: show channel list while loading
    if (isMobile()) showMobilePanel('canais');
    document.getElementById('currentServerName').textContent = server.name;

    // Mostra engrenagem só para o dono
    const settingsBtn = document.getElementById('serverSettingsBtn');
    if (String(server.ownerId) === String(getUser().id)) {
        settingsBtn.classList.remove('hidden');
    } else {
        settingsBtn.classList.add('hidden');
    }

    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    const btn = document.querySelector(`[data-server-id="${server.id}"]`);
    if (btn) btn.classList.add('active');

    const [channels, members] = await Promise.all([
        fetchChannels(server.id),
        fetchMembers(server.id)
    ]);
    renderMembers(members);

    const textDiv = document.getElementById('textChannels');
    const voiceDiv = document.getElementById('voiceChannels');
    const addIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    textDiv.innerHTML = `<div class="channel-category">CANAIS DE TEXTO <button class="category-add-btn" onclick="openCreateChannel('TEXT')" title="Novo canal de texto">${addIcon}</button></div>`;
    voiceDiv.innerHTML = `<div class="channel-category">CANAIS DE VOZ <button class="category-add-btn" onclick="openCreateChannel('VOICE')" title="Novo canal de voz">${addIcon}</button></div>`;

    channels.forEach(ch => {
        const item = buildChannelItem(ch);
        if (ch.type === 'TEXT') textDiv.appendChild(item);
        else voiceDiv.appendChild(item);
    });

    const voiceChannels = channels.filter(ch => ch.type === 'VOICE');
    subscribeVoiceSidebar(voiceChannels);
    subscribeToServer(server.id);

    if (channels.length > 0 && channels[0].type === 'TEXT') {
        openTextChannel(channels[0]);
    }
}

async function openTextChannel(channel) {
    currentChannel = channel;
    document.getElementById('homeView').classList.add('hidden');
    document.getElementById('voiceView').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    document.getElementById('membersSidebar').classList.remove('hidden');
    document.getElementById('channelName').textContent = channel.name;
    document.getElementById('messageInput').placeholder = `Mensagem #${channel.name}`;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`[data-channel-id="${channel.id}"]`);
    if (activeItem) activeItem.classList.add('active');

    const messages = await fetchMessages(channel.id);
    const list = document.getElementById('messageList');
    list.innerHTML = '';
    messages.reverse().forEach(appendMessage);
    scrollToBottom();

    subscribeToChannel(channel.id);

    // Mobile: switch to chat panel automatically
    if (isMobile()) showMobilePanel('chat');
}

let replyingTo = null;

function setReplyingTo(msg) {
    replyingTo = msg;
    const bar = document.getElementById('replyBar');
    const label = document.getElementById('replyBarLabel');
    const preview = document.getElementById('replyBarPreview');
    if (!bar) return;
    if (msg) {
        const name = msg.authorDisplayName || msg.authorUsername || '?';
        label.innerHTML = `Respondendo para <span class="reply-bar-name">${escapeHtml(name)}</span>`;
        preview.textContent = msg.content || (msg.imageUrl ? '[imagem]' : (msg.fileName ? '📎 ' + msg.fileName : ''));
        bar.classList.remove('hidden');
        document.getElementById('messageInput').focus();
    } else {
        bar.classList.add('hidden');
    }
}

function formatMentions(text) {
    const myUser = getUser() || {};
    const myNames = new Set([myUser.displayName, myUser.username].filter(Boolean));
    // Ordena do maior pro menor para evitar match parcial (ex: "Luanna" antes de "Lua")
    const memberNames = serverMembers
        .flatMap(m => [m.displayName, m.username].filter(Boolean))
        .sort((a, b) => b.length - a.length);

    // Divide no símbolo @ e processa cada pedaço
    const parts = text.split('@');
    if (parts.length === 1) return escapeHtml(text);

    let result = escapeHtml(parts[0]);
    for (let i = 1; i < parts.length; i++) {
        const seg = parts[i];
        if (!seg) { result += '@'; continue; }

        // Tenta casar com nome de membro conhecido (do maior pro menor)
        let matched = false;
        for (const name of memberNames) {
            if (seg.startsWith(name)) {
                const after = seg[name.length];
                if (after === undefined || /[\s,!?.\n]/.test(after)) {
                    const isMe = myNames.has(name);
                    result += `<span class="mention-chip${isMe ? ' mention-chip-me' : ''}">@${escapeHtml(name)}</span>`;
                    result += escapeHtml(seg.slice(name.length));
                    matched = true;
                    break;
                }
            }
        }

        if (!matched) {
            // @palavra desconhecida: destaca em azul mesmo assim
            const m = seg.match(/^(\S+)([\s\S]*)$/);
            if (m) {
                result += `<span class="mention-chip">@${escapeHtml(m[1])}</span>${escapeHtml(m[2])}`;
            } else {
                result += '@' + escapeHtml(seg);
            }
        }
    }
    return result;
}

function appendMessage(msg) {
    const list = document.getElementById('messageList');
    const div = document.createElement('div');
    div.className = 'message';
    div.dataset.msgId = msg.id;
    const name = msg.authorDisplayName || msg.authorUsername || '?';
    const initial = name[0].toUpperCase();
    const rawDate = msg.createdAt && !msg.createdAt.endsWith('Z') ? msg.createdAt + 'Z' : msg.createdAt;
    const time = new Date(rawDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    const safeAvatar = safeImageUrl(msg.authorAvatarUrl);
    const avatarHtml = safeAvatar
        ? `<div class="msg-avatar" style="background-image:url('${safeAvatar}');background-size:cover;background-position:center;"></div>`
        : `<div class="msg-avatar">${escapeHtml(initial)}</div>`;

    const textHtml = msg.content ? `<div class="msg-content">${formatMentions(msg.content)}</div>` : '';
    const safeImg = safeImageUrl(msg.imageUrl);
    const imageHtml = safeImg
        ? `<div class="msg-image-wrap"><img class="msg-image" src="${safeImg}" alt="imagem" loading="lazy" onclick="openImageViewer(this.src)" onerror="retryImageMime(this)"></div>`
        : '';
    const fileHtml = msg.fileUrl ? renderFileCard(msg) : '';

    let replyHtml = '';
    if (msg.replyToMessageId) {
        const rAuthor = escapeHtml(msg.replyToAuthorName || '?');
        const rText = msg.replyToContent ? escapeHtml(msg.replyToContent)
            : (msg.replyToImageUrl ? '[imagem]'
            : (msg.replyToFileName ? '📎 ' + escapeHtml(msg.replyToFileName) : ''));
        replyHtml = `
            <div class="msg-reply-quote" data-reply-to="${msg.replyToMessageId}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                <span class="msg-reply-author">${rAuthor}</span>
                <span class="msg-reply-text">${rText}</span>
            </div>`;
    }

    const myUser = getUser() || {};
    const myUsername = myUser.displayName || myUser.username;
    const isOwn = msg.authorDisplayName === myUsername || msg.authorUsername === myUsername;

    // Detecta se o usuário atual foi mencionado
    const contentLower = (msg.content || '').toLowerCase();
    const isMentionedMe = !isOwn && msg.content && (
        (myUser.displayName && contentLower.includes('@' + myUser.displayName.toLowerCase())) ||
        (myUser.username && contentLower.includes('@' + myUser.username.toLowerCase()))
    );
    if (isMentionedMe) div.classList.add('msg-mentioned');
    const deleteBtn = isOwn
        ? `<button class="msg-action-btn msg-delete-btn" title="Excluir mensagem">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
           </button>`
        : '';

    div.innerHTML = `
        ${replyHtml}
        <div class="msg-row">
            ${avatarHtml}
            <div class="msg-body">
                <div class="msg-header">
                    <span class="msg-author">${escapeHtml(name)}</span>
                    <span class="msg-time">${time}</span>
                </div>
                ${textHtml}${imageHtml}${fileHtml}
            </div>
            <div class="msg-actions">
                <button class="msg-action-btn msg-reply-btn" title="Responder">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                </button>
                ${deleteBtn}
            </div>
        </div>
    `;

    div.querySelector('.msg-reply-btn').addEventListener('click', () => setReplyingTo(msg));
    if (isOwn) {
        div.querySelector('.msg-delete-btn').addEventListener('click', () => deleteMessage(msg.id));
    }
    if (msg.authorId) {
        const clickable = [div.querySelector('.msg-avatar'), div.querySelector('.msg-author')];
        clickable.forEach(el => { if (el) { el.style.cursor = 'pointer'; el.addEventListener('click', () => openUserProfile(msg.authorId)); } });
    }

    // click on reply quote scrolls to original message
    const quote = div.querySelector('.msg-reply-quote');
    if (quote) {
        quote.addEventListener('click', () => {
            const target = list.querySelector(`[data-msg-id="${msg.replyToMessageId}"]`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.add('msg-highlight');
                setTimeout(() => target.classList.remove('msg-highlight'), 1500);
            }
        });
    }

    list.appendChild(div);
}

function openImageViewer(src) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;';
    overlay.onclick = () => overlay.remove();
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:8px;object-fit:contain;';
    overlay.appendChild(img);
    document.body.appendChild(overlay);
}

function escapeHtml(str) {
    return String(str == null ? '' : str)
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Só aceita URLs de imagem seguras (http/https ou data:image/...).
// Bloqueia javascript:, e quebras de atributo/HTML via aspas.
function safeImageUrl(url) {
    if (!url) return '';
    const s = String(url).trim();
    if (/["'()<>]/.test(s)) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(s)) return s;
    return '';
}

// Recupera imagens antigas salvas com o MIME errado (ex.: GIF gravado como
// image/jpeg). Tenta os outros tipos uma vez cada antes de desistir.
function retryImageMime(img) {
    const m = /^data:image\/([a-z]+);base64,(.*)$/is.exec(img.src);
    if (!m) return;
    const tries = ['gif', 'png', 'webp', 'jpeg'].filter(t => t !== m[1].toLowerCase());
    const i = Number(img.dataset.mimeTry || 0);
    if (i >= tries.length) { img.onerror = null; img.classList.add('msg-image-broken'); return; }
    img.dataset.mimeTry = i + 1;
    img.src = `data:image/${tries[i]};base64,${m[2]}`;
}

function scrollToBottom() {
    const list = document.getElementById('messageList');
    list.scrollTop = list.scrollHeight;
}

async function deleteMessage(messageId) {
    // Remove imediatamente da tela (otimista)
    removeMessageFromDOM(messageId);
    const res = await apiDeleteMessage(messageId);
    // Se der erro, só mostra o toast — não redireciona nem recarrega
    if (res.error) showToast('Erro ao excluir mensagem', 'error');
}

function removeMessageFromDOM(messageId) {
    const el = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (el) el.remove();
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!currentChannel) return;
    const replyId = replyingTo ? replyingTo.id : null;

    // Se há anexos na bandeja, envia eles (com a legenda no primeiro).
    if (pendingAttachments.length) {
        const files = pendingAttachments.slice();
        clearPendingAttachments();
        input.value = '';
        setReplyingTo(null);
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const caption = i === 0 ? content : '';
            const isImg = f.type && f.type.startsWith('image/');
            const res = isImg
                ? await apiUploadImage(currentChannel.id, f, caption, replyId)
                : await apiUploadFile(currentChannel.id, f, caption, replyId);
            if (res.error) showToast(res.error, 'error');
        }
        return;
    }

    if (!content) return;
    if (!wsSendMessage(currentChannel.id, content, replyId)) {
        alert('Não conectado ao chat. Aguarde.');
        return;
    }
    input.value = '';
    setReplyingTo(null);
}

// ── Anexos pendentes (drag & drop / botões / colar) ──────────────
let pendingAttachments = [];
const _attachUrls = new WeakMap();

function stageFromInput(event) {
    stageFiles(event.target.files);
    event.target.value = '';
}

function stageFiles(fileList) {
    if (!currentChannel) { showToast('Abra um canal de texto primeiro', 'error'); return; }
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    for (const f of files) pendingAttachments.push(f);
    renderAttachTray();
    document.getElementById('messageInput').focus();
}

function removePendingAttachment(idx) {
    const f = pendingAttachments[idx];
    if (f && _attachUrls.has(f)) { URL.revokeObjectURL(_attachUrls.get(f)); _attachUrls.delete(f); }
    pendingAttachments.splice(idx, 1);
    renderAttachTray();
}

function clearPendingAttachments() {
    for (const f of pendingAttachments) {
        if (_attachUrls.has(f)) { URL.revokeObjectURL(_attachUrls.get(f)); _attachUrls.delete(f); }
    }
    pendingAttachments = [];
    renderAttachTray();
}

function renderAttachTray() {
    const tray = document.getElementById('attachTray');
    if (!tray) return;
    const input = document.getElementById('messageInput');
    if (!pendingAttachments.length) {
        tray.classList.add('hidden');
        tray.innerHTML = '';
        if (input && currentChannel) input.placeholder = `Mensagem #${currentChannel.name}`;
        return;
    }
    if (input) input.placeholder = 'Adicione uma legenda (opcional)…';
    tray.classList.remove('hidden');
    tray.innerHTML = pendingAttachments.map((f, i) => {
        const isImg = f.type && f.type.startsWith('image/');
        let media;
        if (isImg) {
            let url = _attachUrls.get(f);
            if (!url) { url = URL.createObjectURL(f); _attachUrls.set(f, url); }
            media = `<div class="att-chip-thumb" style="background-image:url('${url}')"></div>`;
        } else {
            media = `<div class="att-chip-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span class="att-chip-ext">${escapeHtml(fileExtLabel(f.name, f.type))}</span>
            </div>`;
        }
        return `<div class="att-chip">
            ${media}
            <div class="att-chip-info">
                <span class="att-chip-name">${escapeHtml(f.name)}</span>
                <span class="att-chip-size">${formatBytes(f.size)}</span>
            </div>
            <button class="att-chip-x" onclick="removePendingAttachment(${i})" title="Remover">✕</button>
        </div>`;
    }).join('');
}

// Drag & drop sobre a área de chat
(function initDragDrop() {
    const zone = document.getElementById('chatView');
    const overlay = document.getElementById('dropOverlay');
    if (!zone || !overlay) return;
    let depth = 0;
    const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

    zone.addEventListener('dragenter', e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth++;
        overlay.classList.remove('hidden');
    });
    zone.addEventListener('dragover', e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    zone.addEventListener('dragleave', e => {
        if (!hasFiles(e)) return;
        depth--;
        if (depth <= 0) { depth = 0; overlay.classList.add('hidden'); }
    });
    zone.addEventListener('drop', e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        overlay.classList.add('hidden');
        stageFiles(e.dataTransfer.files);
    });
})();

// Colar arquivo/imagem (Ctrl+V) no campo de mensagem
document.getElementById('messageInput').addEventListener('paste', e => {
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) {
        e.preventDefault();
        stageFiles(files);
    }
});

const FILE_ORIGIN = API_BASE.replace(/\/api$/, '');

function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(n < 10 ? 1 : 0) + ' ' + u[i];
}

function fileExtLabel(name, type) {
    const m = /\.([a-z0-9]{1,6})$/i.exec(name || '');
    if (m) return m[1].toUpperCase();
    if (type && type.includes('/')) return type.split('/')[1].slice(0, 4).toUpperCase();
    return 'FILE';
}

function renderFileCard(msg) {
    const name = escapeHtml(msg.fileName || 'arquivo');
    const size = formatBytes(msg.fileSize);
    const ext = escapeHtml(fileExtLabel(msg.fileName, msg.fileType));
    const url = FILE_ORIGIN + (msg.fileUrl || '');
    const isPdf = (msg.fileType || '').includes('pdf') || /\.pdf$/i.test(msg.fileName || '');
    return `
        <a class="msg-file${isPdf ? ' is-pdf' : ''}" href="${url}" target="_blank" rel="noopener" download="${name}">
            <span class="msg-file-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span class="msg-file-ext">${ext}</span>
            </span>
            <span class="msg-file-meta">
                <span class="msg-file-name">${name}</span>
                <span class="msg-file-size">${size}</span>
            </span>
            <span class="msg-file-dl">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </span>
        </a>`;
}

document.getElementById('messageInput').addEventListener('keydown', e => {
    const popup = document.getElementById('mentionPopup');
    const isOpen = !popup.classList.contains('hidden');

    if (isOpen) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            mentionSelectedIndex = Math.min(mentionSelectedIndex + 1, popup.querySelectorAll('.mention-item').length - 1);
            updateMentionSelection();
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            mentionSelectedIndex = Math.max(mentionSelectedIndex - 1, 0);
            updateMentionSelection();
            return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            const selected = popup.querySelector('.mention-item.selected') || popup.querySelector('.mention-item');
            if (selected) insertMention(selected.dataset.name);
            return;
        }
        if (e.key === 'Escape') {
            closeMentionPopup();
            return;
        }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

let typingDebounce = null;
document.getElementById('messageInput').addEventListener('input', () => {
    handleMentionInput();
    if (currentChannel) {
        wsSendTyping(currentChannel.id);
        clearTimeout(typingDebounce);
        typingDebounce = setTimeout(() => {}, 2000);
    }
});

document.getElementById('messageInput').addEventListener('blur', () => {
    setTimeout(closeMentionPopup, 150);
});

function getMentionQuery() {
    const input = document.getElementById('messageInput');
    const val = input.value;
    const cursor = input.selectionStart;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@(\w*)$/);
    return match ? match[1] : null;
}

function handleMentionInput() {
    const query = getMentionQuery();
    if (query === null) { closeMentionPopup(); return; }
    const q = query.toLowerCase();
    const filtered = serverMembers.filter(m => {
        const name = (m.displayName || m.username || '').toLowerCase();
        const tag = (m.username || '').toLowerCase();
        return name.includes(q) || tag.includes(q);
    }).slice(0, 8);

    if (filtered.length === 0) { closeMentionPopup(); return; }
    renderMentionPopup(filtered);
}

function renderMentionPopup(members) {
    const popup = document.getElementById('mentionPopup');
    popup.innerHTML = `<div class="mention-popup-header">Membros — ${escapeHtml(currentServer ? currentServer.name : '')}</div>`;
    mentionSelectedIndex = 0;

    members.forEach((m, i) => {
        const name = m.displayName || m.username || '?';
        const tag = m.username || '';
        const initial = name[0].toUpperCase();
        const safeAvatar = safeImageUrl(m.avatarUrl);
        const avatarStyle = safeAvatar
            ? `style="background-image:url('${safeAvatar}');background-size:cover;background-position:center;"`
            : '';

        const item = document.createElement('div');
        item.className = 'mention-item' + (i === 0 ? ' selected' : '');
        item.dataset.name = name;
        item.innerHTML = `
            <div class="mention-avatar" ${avatarStyle}>${safeAvatar ? '' : escapeHtml(initial)}</div>
            <span class="mention-name">${escapeHtml(name)}</span>
            <span class="mention-tag">${escapeHtml(tag)}</span>
        `;
        item.addEventListener('mousedown', e => {
            e.preventDefault();
            insertMention(name);
        });
        popup.appendChild(item);
    });

    popup.classList.remove('hidden');
}

function updateMentionSelection() {
    const items = document.getElementById('mentionPopup').querySelectorAll('.mention-item');
    items.forEach((el, i) => el.classList.toggle('selected', i === mentionSelectedIndex));
    const sel = items[mentionSelectedIndex];
    if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function insertMention(name) {
    const input = document.getElementById('messageInput');
    const val = input.value;
    const cursor = input.selectionStart;
    const before = val.slice(0, cursor).replace(/@\w*$/, `@${name} `);
    const after = val.slice(cursor);
    input.value = before + after;
    input.selectionStart = input.selectionEnd = before.length;
    input.focus();
    closeMentionPopup();
}

function closeMentionPopup() {
    document.getElementById('mentionPopup').classList.add('hidden');
    mentionSelectedIndex = -1;
}

function renderMembers(members) {
    serverMembers = members || [];
    const list = document.getElementById('membersList');
    list.innerHTML = '';
    if (!members || members.length === 0) return;

    const myId = getUser().id;
    const online  = members.filter(m => m.online).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    const offline = members.filter(m => !m.online).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

    function makeMemberEl(m) {
        const isMe = String(m.id) === String(myId);
        const name = m.displayName || m.username || '?';
        const initial = name[0].toUpperCase();
        const div = document.createElement('div');
        div.className = `member-item${m.online ? '' : ' member-offline'}`;

        const safeAvatar = safeImageUrl(m.avatarUrl);
        const avatarHtml = safeAvatar
            ? `<div class="member-avatar" style="background-image:url('${safeAvatar}');background-size:cover;background-position:center;"></div>`
            : `<div class="member-avatar">${escapeHtml(initial)}</div>`;

        div.innerHTML = `
            <div class="member-avatar-wrap">
                ${avatarHtml}
                <span class="member-status-dot ${m.online ? 'dot-online' : 'dot-offline'}"></span>
            </div>
            <div class="member-name">${escapeHtml(name)}${isMe ? ' <span class="you-tag">você</span>' : ''}</div>
        `;
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => openUserProfile(m.id));
        return div;
    }

    if (online.length) {
        const h = document.createElement('div');
        h.className = 'channel-category';
        h.textContent = `ONLINE — ${online.length}`;
        list.appendChild(h);
        online.forEach(m => list.appendChild(makeMemberEl(m)));
    }

    if (offline.length) {
        const h = document.createElement('div');
        h.className = 'channel-category';
        h.textContent = `OFFLINE — ${offline.length}`;
        list.appendChild(h);
        offline.forEach(m => list.appendChild(makeMemberEl(m)));
    }
}

function buildChannelItem(ch) {
    const item = document.createElement('div');
    item.className = 'channel-item';
    item.dataset.channelId = ch.id;
    item.dataset.channelType = ch.type;

    const icon = ch.type === 'TEXT' ? '#' : '🔊';
    item.dataset.channelName = ch.name;
    item.innerHTML = `
        <span class="channel-icon">${icon}</span>
        <span class="channel-name-text">${escapeHtml(ch.name)}</span>
        <span class="channel-actions">
            <button class="ch-btn" onclick="event.stopPropagation(); openRenameChannel(${ch.id}, this.closest('[data-channel-id]').dataset.channelName)" title="Renomear">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            <button class="ch-btn ch-del" onclick="event.stopPropagation(); confirmDeleteChannel(${ch.id}, this.closest('[data-channel-id]').dataset.channelName)" title="Deletar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
            </button>
        </span>
    `;

    if (ch.type === 'TEXT') {
        item.onclick = () => openTextChannel(ch);
    } else {
        item.onclick = () => joinVoiceChannel(ch.id, ch.name);
    }
    return item;
}

function openCreateChannel(type) {
    document.getElementById('newChannelType').value = type;
    openModal('createChannel');
}

function openRenameChannel(channelId, currentName) {
    document.getElementById('renameChannelId').value = channelId;
    document.getElementById('renameChannelName').value = currentName;
    openModal('renameChannel');
}

async function submitRenameChannel() {
    const channelId = document.getElementById('renameChannelId').value;
    const name = document.getElementById('renameChannelName').value.trim();
    if (!name) return;
    try {
        const res = await apiRenameChannel(channelId, name);
        if (res.error) { showToast(res.error, 'error'); return; }
        closeModal();
        showToast('Canal renomeado com sucesso!', 'success');

        // Atualiza apenas o nome na sidebar sem reconectar a call
        const nameEl = document.querySelector(`[data-channel-id="${channelId}"] .channel-name-text`);
        if (nameEl) nameEl.textContent = name;

        // Atualiza voice bar se for o canal de voz ativo
        if (String(currentVoiceChannel) === String(channelId)) {
            document.getElementById('voiceBarChannelName').textContent = name;
            const callTitle = document.getElementById('callChannelName');
            if (callTitle) callTitle.textContent = name;
        }

        // Atualiza header do chat se for o canal de texto ativo
        if (currentChannel && String(currentChannel.id) === String(channelId)) {
            const headerEl = document.getElementById('channelName');
            if (headerEl) headerEl.textContent = name;
            const inputEl = document.getElementById('messageInput');
            if (inputEl) inputEl.placeholder = `Mensagem #${name}`;
            currentChannel.name = name;
        }
    } catch (e) {
        showToast('Erro ao renomear canal.', 'error');
    }
}

async function confirmDeleteChannel(channelId, channelName) {
    document.getElementById('deleteChannelId').value = channelId;
    document.getElementById('deleteChannelNameLabel').textContent = channelName;
    openModal('deleteChannel');
}

async function submitDeleteChannel() {
    const channelId = document.getElementById('deleteChannelId').value;
    try {
        const res = await apiDeleteChannel(channelId);
        if (res.error) { showToast(res.error, 'error'); return; }
        closeModal();
        showToast('Canal deletado.', 'success');
        if (currentChannel && String(currentChannel.id) === String(channelId)) {
            currentChannel = null;
            document.getElementById('chatView').classList.add('hidden');
            document.getElementById('homeView').classList.remove('hidden');
        }
        await refreshChannels();
    } catch (e) {
        showToast('Erro ao deletar canal.', 'error');
    }
}

// Atualiza só a lista de canais sem trocar a view atual
async function refreshChannels() {
    if (!currentServer) return;
    const channels = await fetchChannels(currentServer.id);

    const addIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const textDiv = document.getElementById('textChannels');
    const voiceDiv = document.getElementById('voiceChannels');
    textDiv.innerHTML = `<div class="channel-category">CANAIS DE TEXTO <button class="category-add-btn" onclick="openCreateChannel('TEXT')" title="Novo canal de texto">${addIcon}</button></div>`;
    voiceDiv.innerHTML = `<div class="channel-category">CANAIS DE VOZ <button class="category-add-btn" onclick="openCreateChannel('VOICE')" title="Novo canal de voz">${addIcon}</button></div>`;

    channels.forEach(ch => {
        const item = buildChannelItem(ch);
        if (ch.type === 'TEXT') textDiv.appendChild(item);
        else voiceDiv.appendChild(item);
    });

    // Restaura active no canal de texto atual
    if (currentChannel) {
        const el = document.querySelector(`[data-channel-id="${currentChannel.id}"]`);
        if (el) el.classList.add('active');
    }

    // Restaura o estado visual da call sem desconectar
    if (currentVoiceChannel) {
        const el = document.querySelector(`[data-channel-id="${currentVoiceChannel}"]`);
        if (el) {
            el.classList.add('active');

            // Atualiza nome no voice bar caso o canal tenha sido renomeado
            const newName = el.querySelector('.channel-name-text')?.textContent;
            if (newName) document.getElementById('voiceBarChannelName').textContent = newName;

            // Re-adiciona o nome do usuário debaixo do canal
            const user = getUser();
            addSidebarVoiceMember(currentVoiceChannel, user.displayName || user.username, 'vp-local');
        }
    }
}

function showHome() {
    document.getElementById('homeView').classList.remove('hidden');
    document.getElementById('chatView').classList.add('hidden');
    document.getElementById('voiceView').classList.add('hidden');
    document.getElementById('membersSidebar').classList.add('hidden');
    document.getElementById('channelSidebar').classList.add('home-mode');
    syncHomeSidebarProfile();
    currentServer = null;
    currentChannel = null;
    document.getElementById('currentServerName').textContent = 'Selecione um servidor';
    document.getElementById('membersList').innerHTML = '';
    document.getElementById('serverSettingsBtn').classList.add('hidden');
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
}

// ── Configurações do Servidor ─────────────────────────────────
let pendingServerIconUrl = null;
let pendingServerIconFile = null;

function openServerSettings() {
    if (!currentServer) return;
    pendingServerIconUrl = null;
    pendingServerIconFile = null;
    document.getElementById('settingsServerName').value = currentServer.name;
    document.getElementById('settingsServerDesc').value = currentServer.description || '';
    document.getElementById('settingsInviteCode').textContent = currentServer.inviteCode;
    document.getElementById('serverIconInput').value = '';
    renderSettingsIconPreview(currentServer.iconUrl || '', currentServer.name);
    openModal('serverSettings');
}

function renderSettingsIconPreview(iconUrl, name) {
    const el = document.getElementById('serverIconPreview');
    if (iconUrl) {
        el.style.backgroundImage = `url('${iconUrl}')`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
    } else {
        el.style.backgroundImage = '';
        el.style.backgroundSize = '';
        el.style.backgroundPosition = '';
        el.textContent = name ? name[0].toUpperCase() : '?';
    }
}

function previewServerIcon(event) {
    const file = event.target.files[0];
    if (!file) return;
    pendingServerIconFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        pendingServerIconUrl = e.target.result;
        renderSettingsIconPreview(e.target.result, '');
    };
    reader.readAsDataURL(file);
}

async function saveServerSettings() {
    if (!currentServer) return;
    const name = document.getElementById('settingsServerName').value.trim();
    const desc = document.getElementById('settingsServerDesc').value.trim();
    if (!name) return;

    // Upload icon via multipart first if a new file was selected
    if (pendingServerIconFile) {
        const iconRes = await apiUploadServerIcon(currentServer.id, pendingServerIconFile);
        if (iconRes.error) { showToast(iconRes.error, 'error'); return; }
        pendingServerIconUrl = iconRes.iconUrl || pendingServerIconUrl;
    }

    const res = await apiUpdateServer(currentServer.id, name, desc, null);
    if (res.error) { showToast(res.error, 'error'); return; }

    currentServer = res;
    document.getElementById('currentServerName').textContent = res.name;

    const finalIconUrl = pendingServerIconUrl || res.iconUrl || '';
    if (finalIconUrl) serverIconCache[res.id] = finalIconUrl;
    const navBtn = document.querySelector(`[data-server-id="${res.id}"]`);
    if (navBtn) {
        navBtn.title = res.name;
        if (finalIconUrl) {
            navBtn.style.backgroundImage = `url('${finalIconUrl}')`;
            navBtn.style.backgroundSize = 'cover';
            navBtn.style.backgroundPosition = 'center';
            const span = navBtn.querySelector('.server-icon-text');
            if (span) span.textContent = '';
        } else {
            navBtn.style.backgroundImage = '';
            const span = navBtn.querySelector('.server-icon-text');
            if (span) span.textContent = res.name[0].toUpperCase();
        }
    }

    closeModal();
    showToast('Servidor atualizado!', 'success');
}

function copySettingsInvite() {
    const code = document.getElementById('settingsInviteCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copySettingsInviteBtn');
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
    });
}

async function regenerateInvite() {
    if (!currentServer) return;
    const res = await apiRegenerateInvite(currentServer.id);
    if (res.error) { showToast(res.error, 'error'); return; }
    currentServer = res;
    document.getElementById('settingsInviteCode').textContent = res.inviteCode;
    showToast('Código de convite regenerado!', 'success');
}

function confirmDeleteServer() {
    if (!currentServer) return;
    document.getElementById('deleteServerNameLabel').textContent = currentServer.name;
    openModal('confirmDeleteServer');
}

async function submitDeleteServer() {
    if (!currentServer) return;
    const res = await apiDeleteServer(currentServer.id);
    if (res.error) { showToast(res.error, 'error'); return; }
    closeModal();
    showToast('Servidor deletado.', 'success');
    showHome();
    await loadServers();
}

function downloadApp() {
    window.open('https://github.com/ViniciusGomes0/NEXORA/releases/download/v1.0.5/Nexora.Setup.1.0.5.exe', '_blank');
}

// Modals
function openModal(id) {
    document.querySelectorAll('.modal-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`modal-${id}`).classList.remove('hidden');
    document.getElementById('modalOverlay').classList.remove('hidden');

    if (id === 'inviteCode' && currentServer) {
        document.getElementById('inviteCodeDisplay').textContent = currentServer.inviteCode;
    }
}

function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
}

async function createServer() {
    const name = document.getElementById('serverName').value.trim();
    if (!name) return;
    const desc = document.getElementById('serverDesc').value.trim();
    const server = await apiCreateServer(name, desc);
    if (server.error) { alert(server.error); return; }
    closeModal();
    await loadServers();
    selectServer(server);
}

async function joinServer() {
    const code = document.getElementById('inviteInput').value.trim();
    if (!code) return;
    const server = await apiJoinServer(code);
    if (server.error) { alert(server.error); return; }
    closeModal();
    await loadServers();
    selectServer(server);
}

async function createChannel() {
    if (!currentServer) return;
    const name = document.getElementById('newChannelName').value.trim();
    const type = document.getElementById('newChannelType').value;
    if (!name) return;
    const ch = await apiCreateChannel(currentServer.id, name, type);
    if (ch.error) { showToast(ch.error, 'error'); return; }
    closeModal();
    document.getElementById('newChannelName').value = '';
    showToast('Canal criado!', 'success');
    await refreshChannels();
}

function copyInvite() {
    const code = document.getElementById('inviteCodeDisplay').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector('#modal-inviteCode .btn-primary');
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
    });
}

// ── Perfil ────────────────────────────────────────────────────
function openProfilePanel() {
    const user = getUser();
    document.getElementById('profileUsername').textContent = user.displayName || user.username;
    document.getElementById('profileTag').textContent = '#' + (user.tag || user.username);
    document.getElementById('profileDisplayName').value = user.displayName || user.username;

    const avatarEl = document.getElementById('profileAvatarLarge');
    const profileAvatar = safeImageUrl(user.avatarUrl);
    if (profileAvatar) {
        avatarEl.style.backgroundImage = `url("${profileAvatar}")`;
        avatarEl.textContent = '';
    } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.textContent = (user.displayName || user.username || '?')[0].toUpperCase();
    }

    document.getElementById('profileOverlay').classList.remove('hidden');
}

async function openUserProfile(userId) {
    const myId = getUser()?.id;
    if (String(userId) === String(myId)) { openProfilePanel(); return; }
    const data = await apiGetUser(userId);
    if (!data) return;
    const name = data.displayName || data.username || '?';
    document.getElementById('userProfileUsername').textContent = name;
    document.getElementById('userProfileTag').textContent = '#' + (data.tag || data.username);
    const avatarEl = document.getElementById('userProfileAvatar');
    const userAvatar = safeImageUrl(data.avatarUrl);
    if (userAvatar) {
        avatarEl.style.backgroundImage = `url("${userAvatar}")`;
        avatarEl.textContent = '';
    } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.textContent = name[0].toUpperCase();
    }
    document.getElementById('userProfileOverlay').classList.remove('hidden');
}

function closeUserProfile() {
    document.getElementById('userProfileOverlay').classList.add('hidden');
}

function closeProfileDialog() {
    document.getElementById('profileOverlay').classList.add('hidden');
    document.getElementById('profileAvatarLarge').dataset.pendingUrl = '';
}

function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Redimensiona para no máximo 256x256 antes de salvar
            const MAX = 256;
            const scale = Math.min(MAX / img.width, MAX / img.height, 1);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

            const avatarEl = document.getElementById('profileAvatarLarge');
            avatarEl.style.backgroundImage = `url('${dataUrl}')`;
            avatarEl.textContent = '';
            avatarEl.dataset.pendingUrl = dataUrl;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

async function saveProfile() {
    const displayName = document.getElementById('profileDisplayName').value.trim();
    const avatarEl = document.getElementById('profileAvatarLarge');
    const avatarUrl = avatarEl.dataset.pendingUrl || getUser().avatarUrl || '';

    const res = await apiUpdateMe(displayName, avatarUrl);
    if (res.error) { showToast(res.error, 'error'); return; }

    // Atualiza localStorage
    const user = getUser();
    user.displayName = res.displayName;
    user.avatarUrl = res.avatarUrl;
    localStorage.setItem('nexora_user', JSON.stringify(user));

    // Atualiza UI
    document.getElementById('userDisplayName').textContent = res.displayName;
    updateUserAvatar(document.getElementById('userAvatarSmall'), res.avatarUrl, res.displayName);
    syncHomeSidebarProfile();
    delete avatarEl.dataset.pendingUrl;

    showToast('Perfil atualizado!', 'success');
    closeProfileDialog();
}

function updateUserAvatar(el, avatarUrl, displayName) {
    const safe = safeImageUrl(avatarUrl);
    if (safe) {
        el.style.backgroundImage = `url("${safe}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
    } else {
        el.style.backgroundImage = '';
        el.textContent = (displayName || '?')[0].toUpperCase();
    }
}


function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function logout() {
    if (localStream) leaveVoice();
    localStorage.clear();
    window.location.href = 'index.html';
}

// ── Emoji Picker ──────────────────────────────────────────────────────────────

const EMOJI_CATEGORIES = [
    { id: 'frequent', label: 'Frequentes', icon: '🕐', emojis: [] },
    { id: 'smileys', label: 'Rostos e Emoções', icon: '😀', emojis: [
        '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','🫠','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🫗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😶‍🌫️','😏','😒','🙄','😬','😮‍💨','🤥','🫨','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','😵‍💫','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','☹️','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'
    ]},
    { id: 'people', label: 'Pessoas e Corpo', icon: '👋', emojis: [
        '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','🫷','🫸','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','🫦','👶','🧒','👦','👧','🧑','👱','👨','🧔','🧔‍♂️','🧔‍♀️','👨‍🦰','👨‍🦱','👨‍🦳','👨‍🦲','👩','👩‍🦰','🧑‍🦰','👩‍🦱','🧑‍🦱','👩‍🦳','🧑‍🦳','👩‍🦲','🧑‍🦲','👱‍♀️','👱‍♂️','🧓','👴','👵','🙍','🙍‍♂️','🙍‍♀️','🙎','🙎‍♂️','🙎‍♀️','🙅','🙅‍♂️','🙅‍♀️','🙆','🙆‍♂️','🙆‍♀️','💁','💁‍♂️','💁‍♀️','🙋','🙋‍♂️','🙋‍♀️','🧏','🧏‍♂️','🧏‍♀️','🙇','🙇‍♂️','🙇‍♀️','🤦','🤦‍♂️','🤦‍♀️','🤷','🤷‍♂️','🤷‍♀️','👮','👮‍♂️','👮‍♀️','🕵️','🕵️‍♂️','🕵️‍♀️','💂','💂‍♂️','💂‍♀️','🥷','👷','👷‍♂️','👷‍♀️','🫅','🤴','👸','👳','👳‍♂️','👳‍♀️','👲','🧕','🤵','🤵‍♂️','🤵‍♀️','👰','👰‍♂️','👰‍♀️','🤰','🫃','🫄','🤱','👩‍🍼','👨‍🍼','🧑‍🍼','👼','🎅','🤶','🧑‍🎄','🦸','🦸‍♂️','🦸‍♀️','🦹','🦹‍♂️','🦹‍♀️','🧙','🧙‍♂️','🧙‍♀️','🧚','🧚‍♂️','🧚‍♀️','🧛','🧛‍♂️','🧛‍♀️','🧜','🧜‍♂️','🧜‍♀️','🧝','🧝‍♂️','🧝‍♀️','🧞','🧞‍♂️','🧞‍♀️','🧟','🧟‍♂️','🧟‍♀️','🧌','💆','💆‍♂️','💆‍♀️','💇','💇‍♂️','💇‍♀️','🚶','🚶‍♂️','🚶‍♀️','🧍','🧍‍♂️','🧍‍♀️','🧎','🧎‍♂️','🧎‍♀️','🏃','🏃‍♂️','🏃‍♀️','💃','🕺','🕴️','👫','👬','👭','👩‍❤️‍👨','👩‍❤️‍👩','💑','👨‍❤️‍👨','👩‍❤️‍💋‍👨','💏','👩‍❤️‍💋‍👩','👨‍❤️‍💋‍👨','👨‍👩‍👦','👨‍👩‍👧','👨‍👩‍👧‍👦','👨‍👩‍👦‍👦','👨‍👩‍👧‍👧','👨‍👧','👨‍👧‍👦','👨‍👧‍👧','👨‍👦','👨‍👦‍👦','👩‍👧','👩‍👧‍👦','👩‍👧‍👧','👩‍👦','👩‍👦‍👦','🗣️','👤','👥','🫂'
    ]},
    { id: 'nature', label: 'Animais e Natureza', icon: '🐶', emojis: [
        '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐦‍⬛','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🪳','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🦭','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔','🐾','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘️','🍀','🎍','🎋','🍃','🍂','🍁','🪺','🪹','🍄','🐚','🪸','🪨','🌾','💐','🌷','🌹','🥀','🪷','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌟','⭐','🌠','🌌','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','💧','💦','🌊','🌀','🌈','☂️','☔','⚡','🌪️','🌫️','🌁'
    ]},
    { id: 'food', label: 'Comida e Bebida', icon: '🍔', emojis: [
        '🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝','🍅','🫒','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🫘','🌰','🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🫗','🥤','🧋','🧃','🧉','🧊','🥢','🍽️','🍴','🥄','🔪','🫙'
    ]},
    { id: 'travel', label: 'Viagem e Lugares', icon: '✈️', emojis: [
        '🌍','🌎','🌏','🌐','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🪨','🪵','🛖','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♾️','🎠','🎡','🎢','💈','🎪','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎️','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🛶','🚤','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🌠','🌌','🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','🌙','🌚','🌛','🌜','☀️','🌝','🌞','⭐','🌟','💫','⚡','☁️','⛅','🌤️','🌈','☂️','☔','❄️','⛄','☃️','💨','💧','💦','🌊'
    ]},
    { id: 'activities', label: 'Atividades', icon: '⚽', emojis: [
        '⚽','🏀','🏈','⚾','🥎','🏐','🏉','🥏','🎾','🪃','🏸','🏒','🏑','🥍','🏓','🏸','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏊','🏄','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🎙️','🎚️','🎛️','📻','🎷','🪗','🎸','🎹','🎺','🎻','🥁','🪘','🎮','🕹️','🎲','🧩','🃏','🀄','🎴','🎯','🎳','🎱'
    ]},
    { id: 'objects', label: 'Objetos', icon: '💡', emojis: [
        '👓','🕶️','🥽','🦺','👔','👕','👖','🧣','🧤','🧥','🧦','👗','👘','🥻','🩱','🩲','🩳','👙','👚','👛','👜','👝','🛍️','🎒','🩴','👞','👟','🥾','🥿','👠','👡','🩰','👢','👑','👒','🎩','🧢','🪖','⛑️','📿','💄','💍','💎','🔇','🔈','🔉','🔊','📢','📣','📯','🔔','🔕','🎵','🎶','📻','🎷','🎸','🎹','🎺','🎻','🪗','🥁','🪘','📱','📲','☎️','📞','📟','📠','🔋','🪫','🔌','💻','🖥️','🖨️','⌨️','🖱️','🖲️','💽','💾','💿','📀','🧮','🎥','🎞️','📽️','🎬','📺','📷','📸','📹','📼','🔍','🔎','💡','🔦','🏮','🪔','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🏷️','💰','🪙','💴','💵','💶','💷','💸','💳','🧾','✉️','📧','📨','📩','📤','📥','📦','📫','📪','📬','📭','📮','🗳️','✏️','✒️','🖋️','🖊️','🖌️','🖍️','📝','💼','📁','📂','🗂️','📅','📆','🗒️','🗓️','📇','📈','📉','📊','📋','📌','📍','📎','🖇️','📏','📐','✂️','🗃️','🗄️','🗑️','🔒','🔓','🔏','🔐','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🔫','🪃','🛡️','🔧','🪛','🔩','⚙️','🗜️','⚖️','🦯','🔗','⛓️','🪝','🧲','🪜','⚗️','🪣','🧪','🧫','🧬','🔭','🔬','🕳️','🩺','💊','🩹','🩼','🩻','🩸','🧬','🦠','🧫','🦷','🩻'
    ]},
    { id: 'symbols', label: 'Símbolos', icon: '❤️', emojis: [
        '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','❤️‍🔥','❤️‍🩹','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','♾️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔉','🔊','📢','🔔','🔕','🔇'
    ]},
    { id: 'flags', label: 'Bandeiras', icon: '🏁', emojis: [
        '🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇦🇨','🇦🇩','🇦🇪','🇦🇫','🇦🇬','🇦🇮','🇦🇱','🇦🇲','🇦🇴','🇦🇶','🇦🇷','🇦🇸','🇦🇹','🇦🇺','🇦🇼','🇦🇽','🇦🇿','🇧🇦','🇧🇧','🇧🇩','🇧🇪','🇧🇫','🇧🇬','🇧🇭','🇧🇮','🇧🇯','🇧🇱','🇧🇲','🇧🇳','🇧🇴','🇧🇶','🇧🇷','🇧🇸','🇧🇹','🇧🇻','🇧🇼','🇧🇾','🇧🇿','🇨🇦','🇨🇨','🇨🇩','🇨🇫','🇨🇬','🇨🇭','🇨🇮','🇨🇰','🇨🇱','🇨🇲','🇨🇳','🇨🇴','🇨🇵','🇨🇷','🇨🇺','🇨🇻','🇨🇼','🇨🇽','🇨🇾','🇨🇿','🇩🇪','🇩🇬','🇩🇯','🇩🇰','🇩🇲','🇩🇴','🇩🇿','🇪🇦','🇪🇨','🇪🇪','🇪🇬','🇪🇭','🇪🇷','🇪🇸','🇪🇹','🇪🇺','🇫🇮','🇫🇯','🇫🇰','🇫🇲','🇫🇴','🇫🇷','🇬🇦','🇬🇧','🇬🇩','🇬🇪','🇬🇫','🇬🇬','🇬🇭','🇬🇮','🇬🇱','🇬🇲','🇬🇳','🇬🇵','🇬🇶','🇬🇷','🇬🇸','🇬🇹','🇬🇺','🇬🇼','🇬🇾','🇭🇰','🇭🇲','🇭🇳','🇭🇷','🇭🇹','🇭🇺','🇮🇨','🇮🇩','🇮🇪','🇮🇱','🇮🇲','🇮🇳','🇮🇴','🇮🇶','🇮🇷','🇮🇸','🇮🇹','🇯🇪','🇯🇲','🇯🇴','🇯🇵','🇰🇪','🇰🇬','🇰🇭','🇰🇮','🇰🇲','🇰🇳','🇰🇵','🇰🇷','🇰🇼','🇰🇾','🇰🇿','🇱🇦','🇱🇧','🇱🇨','🇱🇮','🇱🇰','🇱🇷','🇱🇸','🇱🇹','🇱🇺','🇱🇻','🇱🇾','🇲🇦','🇲🇨','🇲🇩','🇲🇪','🇲🇫','🇲🇬','🇲🇭','🇲🇰','🇲🇱','🇲🇲','🇲🇳','🇲🇴','🇲🇵','🇲🇶','🇲🇷','🇲🇸','🇲🇹','🇲🇺','🇲🇻','🇲🇼','🇲🇽','🇲🇾','🇲🇿','🇳🇦','🇳🇨','🇳🇪','🇳🇫','🇳🇬','🇳🇮','🇳🇱','🇳🇴','🇳🇵','🇳🇷','🇳🇺','🇳🇿','🇴🇲','🇵🇦','🇵🇪','🇵🇫','🇵🇬','🇵🇭','🇵🇰','🇵🇱','🇵🇲','🇵🇳','🇵🇷','🇵🇸','🇵🇹','🇵🇼','🇵🇾','🇶🇦','🇷🇪','🇷🇴','🇷🇸','🇷🇺','🇷🇼','🇸🇦','🇸🇧','🇸🇨','🇸🇩','🇸🇪','🇸🇬','🇸🇭','🇸🇮','🇸🇯','🇸🇰','🇸🇱','🇸🇲','🇸🇳','🇸🇴','🇸🇷','🇸🇸','🇸🇹','🇸🇻','🇸🇽','🇸🇾','🇸🇿','🇹🇦','🇹🇨','🇹🇩','🇹🇫','🇹🇬','🇹🇭','🇹🇯','🇹🇰','🇹🇱','🇹🇲','🇹🇳','🇹🇴','🇹🇷','🇹🇹','🇹🇻','🇹🇼','🇹🇿','🇺🇦','🇺🇬','🇺🇲','🇺🇳','🇺🇸','🇺🇾','🇺🇿','🇻🇦','🇻🇨','🇻🇪','🇻🇬','🇻🇮','🇻🇳','🇻🇺','🇼🇫','🇼🇸','🇽🇰','🇾🇪','🇾🇹','🇿🇦','🇿🇲','🇿🇼'
    ]}
];

const FREQUENT_KEY = 'nexora_frequent_emojis';
let emojiPickerOpen = false;

function getFrequentEmojis() {
    try { return JSON.parse(localStorage.getItem(FREQUENT_KEY) || '[]'); } catch { return []; }
}

function addFrequentEmoji(emoji) {
    let freq = getFrequentEmojis();
    freq = [emoji, ...freq.filter(e => e !== emoji)].slice(0, 36);
    localStorage.setItem(FREQUENT_KEY, JSON.stringify(freq));
}

function buildEmojiPicker() {
    const categoriesEl = document.getElementById('emojiCategories');
    const gridEl = document.getElementById('emojiGrid');
    if (!categoriesEl || !gridEl) return;

    // Update frequent emojis category
    EMOJI_CATEGORIES[0].emojis = getFrequentEmojis();

    categoriesEl.innerHTML = '';
    EMOJI_CATEGORIES.forEach((cat, i) => {
        const btn = document.createElement('button');
        btn.className = 'emoji-cat-btn' + (i === 0 ? ' active' : '');
        btn.textContent = cat.icon;
        btn.title = cat.label;
        btn.onclick = () => {
            document.querySelectorAll('.emoji-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            scrollToCategory(cat.id);
        };
        categoriesEl.appendChild(btn);
    });

    renderEmojiGrid(EMOJI_CATEGORIES);
}

function renderEmojiGrid(categories) {
    const gridEl = document.getElementById('emojiGrid');
    gridEl.innerHTML = '';
    categories.forEach(cat => {
        if (!cat.emojis.length) return;
        const label = document.createElement('div');
        label.className = 'emoji-cat-label';
        label.textContent = cat.label;
        label.dataset.catId = cat.id;
        gridEl.appendChild(label);

        const row = document.createElement('div');
        row.className = 'emoji-grid-row';
        cat.emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'emoji-btn';
            btn.textContent = emoji;
            btn.title = emoji;
            btn.onclick = () => insertEmoji(emoji);
            row.appendChild(btn);
        });
        gridEl.appendChild(row);
    });
}

function scrollToCategory(catId) {
    const el = document.querySelector(`.emoji-cat-label[data-cat-id="${catId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filterEmojis(query) {
    if (!query.trim()) {
        renderEmojiGrid(EMOJI_CATEGORIES);
        return;
    }
    const q = query.toLowerCase();
    const results = [];
    EMOJI_CATEGORIES.forEach(cat => {
        cat.emojis.forEach(emoji => {
            if (emoji.includes(q)) results.push(emoji);
        });
    });
    renderEmojiGrid([{ id: 'search', label: 'Resultados', icon: '🔍', emojis: results }]);
}

function insertEmoji(emoji) {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = input.value;
    input.value = val.slice(0, start) + emoji + val.slice(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.focus();
    addFrequentEmoji(emoji);
}

function toggleEmojiPicker(e) {
    e.stopPropagation();
    const picker = document.getElementById('emojiPicker');
    if (!picker) return;
    emojiPickerOpen = !emojiPickerOpen;
    if (emojiPickerOpen) {
        buildEmojiPicker();
        picker.classList.remove('hidden');
        document.getElementById('emojiSearch').value = '';
        document.getElementById('emojiSearch').focus();
    } else {
        picker.classList.add('hidden');
    }
}

document.addEventListener('click', (e) => {
    const picker = document.getElementById('emojiPicker');
    const btn = document.getElementById('emojiPickerToggle');
    if (picker && !picker.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        picker.classList.add('hidden');
        emojiPickerOpen = false;
    }
});
