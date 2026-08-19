let stompClient = null;
let currentChannelSub = null;
let currentChannelDeleteSub = null;
let currentChannelTypingSub = null;
let currentServerSub = null;

const typingUsers = new Map(); // username -> timeout id

function connectWebSocket() {
    const wsBase = (window.location.port === '5500' || window.location.port === '3000') ? 'http://localhost:8080' : '';
    const socket = new SockJS(wsBase + '/ws');
    stompClient = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect(
        { Authorization: 'Bearer ' + getToken() },
        () => { console.log('WebSocket connected'); },
        (err) => { console.error('WS error:', err); setTimeout(connectWebSocket, 3000); }
    );
}

function subscribeToServer(serverId) {
    if (currentServerSub) { currentServerSub.unsubscribe(); currentServerSub = null; }
    if (!stompClient || !stompClient.connected) return;

    currentServerSub = stompClient.subscribe(`/topic/server/${serverId}/channel-renamed`, (frame) => {
        const { channelId, name } = JSON.parse(frame.body);

        // Atualiza nome na sidebar
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
    });
}

function subscribeToChannel(channelId) {
    if (currentChannelSub) currentChannelSub.unsubscribe();
    if (currentChannelDeleteSub) currentChannelDeleteSub.unsubscribe();
    if (currentChannelTypingSub) currentChannelTypingSub.unsubscribe();
    typingUsers.clear();
    updateTypingIndicator();
    if (!stompClient || !stompClient.connected) return;

    currentChannelSub = stompClient.subscribe(`/topic/channel/${channelId}`, (frame) => {
        const msg = JSON.parse(frame.body);
        appendMessage(msg);
        scrollToBottom();
    });

    currentChannelDeleteSub = stompClient.subscribe(`/topic/channel/${channelId}/delete`, (frame) => {
        const messageId = JSON.parse(frame.body);
        removeMessageFromDOM(messageId);
    });

    currentChannelTypingSub = stompClient.subscribe(`/topic/channel/${channelId}/typing`, (frame) => {
        const username = JSON.parse(frame.body);
        const currentUser = getCurrentUsername();
        if (username === currentUser) return;
        if (typingUsers.has(username)) clearTimeout(typingUsers.get(username));
        const tid = setTimeout(() => {
            typingUsers.delete(username);
            updateTypingIndicator();
        }, 3000);
        typingUsers.set(username, tid);
        updateTypingIndicator();
    });
}

function updateTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (!el) return;
    const users = [...typingUsers.keys()];
    if (users.length === 0) {
        el.classList.add('hidden');
        el.innerHTML = '';
    } else {
        const names = users.length === 1 ? `<strong>${users[0]}</strong> está digitando`
            : users.length === 2 ? `<strong>${users[0]}</strong> e <strong>${users[1]}</strong> estão digitando`
            : 'Várias pessoas estão digitando';
        el.innerHTML = `${names}<span class="typing-dots"><span></span><span></span><span></span></span>`;
        el.classList.remove('hidden');
    }
}

function getCurrentUsername() {
    try {
        const token = getToken();
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub || '';
    } catch { return ''; }
}

function wsSendTyping(channelId) {
    if (!stompClient || !stompClient.connected) return;
    stompClient.send(`/app/chat/${channelId}/typing`, {}, '');
}

function wsSendMessage(channelId, content, replyToMessageId) {
    if (!stompClient || !stompClient.connected) return false;
    const payload = { content };
    if (replyToMessageId) payload.replyToMessageId = replyToMessageId;
    stompClient.send(`/app/chat/${channelId}`, {}, JSON.stringify(payload));
    return true;
}
