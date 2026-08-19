let stompClient = null;
let currentChannelSub = null;
let currentChannelDeleteSub = null;
let currentChannelTypingSub = null;

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

        const myUsername = getCurrentUsername();
        const isOwn = msg.authorUsername === myUsername || msg.authorDisplayName === myUsername;
        if (!isOwn && !document.hasFocus()) {
            const chName = currentChannel ? currentChannel.name : 'canal';
            const srvName = currentServer ? currentServer.name : 'Servidor';
            showMessageNotification(msg, chName, srvName);
        }
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
