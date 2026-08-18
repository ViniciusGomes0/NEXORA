let stompClient = null;
let currentChannelSub = null;

function connectWebSocket() {
    const socket = new SockJS('http://localhost:8080/ws');
    stompClient = Stomp.over(socket);
    stompClient.debug = null;

    stompClient.connect(
        { Authorization: 'Bearer ' + getToken() },
        () => { console.log('WebSocket connected'); },
        (err) => { console.error('WS error:', err); setTimeout(connectWebSocket, 3000); }
    );
}

function subscribeToChannel(channelId) {
    if (currentChannelSub) {
        currentChannelSub.unsubscribe();
    }
    if (!stompClient || !stompClient.connected) return;

    currentChannelSub = stompClient.subscribe(`/topic/channel/${channelId}`, (frame) => {
        const msg = JSON.parse(frame.body);
        appendMessage(msg);
        scrollToBottom();
    });
}

function wsSendMessage(channelId, content) {
    if (!stompClient || !stompClient.connected) return false;
    stompClient.send(`/app/chat/${channelId}`, {}, JSON.stringify({ content }));
    return true;
}
