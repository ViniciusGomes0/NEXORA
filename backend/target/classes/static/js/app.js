let currentServer = null;
let currentChannel = null;
const serverIconCache = {};

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
        const icon = serverIconCache[s.id] || s.iconUrl || '';
        if (icon) {
            btn.style.backgroundImage = `url('${icon}')`;
            btn.style.backgroundSize = 'cover';
            btn.style.backgroundPosition = 'center';
            btn.innerHTML = `<span class="server-icon-text"></span>`;
        } else {
            btn.innerHTML = `<span class="server-icon-text">${s.name[0].toUpperCase()}</span>`;
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

    if (channels.length > 0 && channels[0].type === 'TEXT') {
        openTextChannel(channels[0]);
    }
}

async function openTextChannel(channel) {
    currentChannel = channel;
    document.getElementById('homeView').classList.add('hidden');
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

function appendMessage(msg) {
    const list = document.getElementById('messageList');
    const div = document.createElement('div');
    div.className = 'message';
    const name = msg.authorDisplayName || msg.authorUsername || '?';
    const initial = name[0].toUpperCase();
    const time = new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const avatarHtml = msg.authorAvatarUrl
        ? `<div class="msg-avatar" style="background-image:url('${msg.authorAvatarUrl}');background-size:cover;background-position:center;"></div>`
        : `<div class="msg-avatar">${initial}</div>`;

    div.innerHTML = `
        ${avatarHtml}
        <div class="msg-body">
            <div class="msg-header">
                <span class="msg-author">${escapeHtml(name)}</span>
                <span class="msg-time">${time}</span>
            </div>
            <div class="msg-content">${escapeHtml(msg.content)}</div>
        </div>
    `;
    list.appendChild(div);
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function scrollToBottom() {
    const list = document.getElementById('messageList');
    list.scrollTop = list.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content || !currentChannel) return;
    if (!wsSendMessage(currentChannel.id, content)) {
        alert('Não conectado ao chat. Aguarde.');
        return;
    }
    input.value = '';
}

document.getElementById('messageInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function renderMembers(members) {
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

        const avatarHtml = m.avatarUrl
            ? `<div class="member-avatar" style="background-image:url('${m.avatarUrl}');background-size:cover;background-position:center;"></div>`
            : `<div class="member-avatar">${initial}</div>`;

        div.innerHTML = `
            <div class="member-avatar-wrap">
                ${avatarHtml}
                <span class="member-status-dot ${m.online ? 'dot-online' : 'dot-offline'}"></span>
            </div>
            <div class="member-name">${name}${isMe ? ' <span class="you-tag">você</span>' : ''}</div>
        `;
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
    item.innerHTML = `
        <span class="channel-icon">${icon}</span>
        <span class="channel-name-text">${ch.name}</span>
        <span class="channel-actions">
            <button class="ch-btn" onclick="event.stopPropagation(); openRenameChannel(${ch.id}, '${ch.name.replace(/'/g, "\\'")}')" title="Renomear">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            <button class="ch-btn ch-del" onclick="event.stopPropagation(); confirmDeleteChannel(${ch.id}, '${ch.name.replace(/'/g, "\\'")}')" title="Deletar">
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
        await refreshChannels();
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

function openServerSettings() {
    if (!currentServer) return;
    pendingServerIconUrl = null;
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

    const iconUrl = pendingServerIconUrl !== null ? pendingServerIconUrl : (currentServer.iconUrl || '');

    const res = await apiUpdateServer(currentServer.id, name, desc, iconUrl);
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
    if (user.avatarUrl) {
        avatarEl.style.backgroundImage = `url('${user.avatarUrl}')`;
        avatarEl.textContent = '';
    } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.textContent = (user.displayName || user.username || '?')[0].toUpperCase();
    }

    document.getElementById('profileOverlay').classList.remove('hidden');
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
    if (avatarUrl) {
        el.style.backgroundImage = `url('${avatarUrl}')`;
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
