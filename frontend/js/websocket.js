let stompClient = null;
let currentChannelSub = null;
let currentChannelDeleteSub = null;

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
}

function wsSendMessage(channelId, content, replyToMessageId) {
    if (!stompClient || !stompClient.connected) return false;
    const payload = { content };
    if (replyToMessageId) payload.replyToMessageId = replyToMessageId;
    stompClient.send(`/app/chat/${channelId}`, {}, JSON.stringify(payload));
    return true;
}
