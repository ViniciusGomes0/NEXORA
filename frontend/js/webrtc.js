let localStream = null;
let screenStream = null;
let peers = {};
let isMuted = false;
let isDeafened = false;
let isScreenSharing = false;
let currentVoiceChannel = null;
let audioContext = null;
let speakingInterval = null;

const ICE_CONFIG = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

async function joinVoiceChannel(channelId, channelName) {
    if (currentVoiceChannel === channelId) return;

    if (currentVoiceChannel !== null) leaveVoice();

    currentVoiceChannel = channelId;

    // Mostra a voice bar na sidebar (não esconde o chat)
    document.getElementById('voiceBarChannelName').textContent = channelName;
    document.getElementById('voiceBar').classList.remove('hidden');
    document.getElementById('voiceParticipants').innerHTML = '';

    // Marca canal ativo na sidebar
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (activeItem) activeItem.classList.add('active');

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        updateMicState();
        addVoiceParticipant(getUser().displayName, true, 'vp-local');
        addSidebarVoiceMember(channelId, getUser().displayName, 'vp-local');
        startSpeakingDetection();
    } catch (err) {
        console.error('Mic error:', err);
    }

    subscribeToVoiceSignaling(channelId);
    announcePresence(channelId);
}

function leaveVoice() {
    stopSpeakingDetection();
    clearSidebarVoiceMembers();

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }
    Object.values(peers).forEach(pc => pc.close());
    peers = {};
    currentVoiceChannel = null;

    document.getElementById('voiceBar').classList.add('hidden');
    document.getElementById('voiceParticipants').innerHTML = '';
    document.getElementById('remoteAudios').innerHTML = '';
    document.getElementById('remoteVideos').innerHTML = '';
    document.getElementById('screenShareOverlay').classList.add('hidden');
    isScreenSharing = false;

    const btn = document.getElementById('screenShareBtn');
    btn.title = 'Compartilhar Tela';
    btn.classList.remove('screen-active');

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
}

// ── Detecção de fala (anel verde) ──────────────────────────────
function startSpeakingDetection() {
    if (!localStream) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(localStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);

        speakingInterval = setInterval(() => {
            // Aura verde fica no membro da sidebar esquerda (debaixo do canal de voz)
            const sidebarEl = document.getElementById('svm-vp-local');
            if (!sidebarEl) return;
            if (isMuted) {
                sidebarEl.classList.remove('speaking', 'mic-active');
                return;
            }
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            const isSpeaking = avg > 4;
            sidebarEl.classList.toggle('speaking', isSpeaking);
            sidebarEl.classList.toggle('mic-active', !isSpeaking);
        }, 80);
    } catch (e) {}
}

function stopSpeakingDetection() {
    if (speakingInterval) { clearInterval(speakingInterval); speakingInterval = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
}

// ── Compartilhamento de tela ───────────────────────────────────
async function toggleScreenShare() {
    if (isScreenSharing) { stopScreenShare(); return; }
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                frameRate: { ideal: 60, max: 144 },
                width:     { ideal: 1920 },
                height:    { ideal: 1080 },
                cursor:    'always'
            },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                sampleRate: 48000
            }
        });
        isScreenSharing = true;

        const btn = document.getElementById('screenShareBtn');
        btn.title = 'Parar Transmissão';
        btn.classList.add('screen-active');

        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = screenStream;
        document.getElementById('screenShareOverlay').classList.remove('hidden');

        screenStream.getVideoTracks()[0].onended = stopScreenShare;

        Object.values(peers).forEach(pc => {
            screenStream.getTracks().forEach(track => {
                const sender = pc.addTrack(track, screenStream);
                if (track.kind === 'video') applyHighQualityParams(sender);
            });
        });
    } catch (err) {
        console.error('Screen share error:', err);
    }
}

function applyHighQualityParams(sender) {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate   = 8_000_000; // 8 Mbps
    params.encodings[0].maxFramerate = 60;
    sender.setParameters(params).catch(() => {});
}

function stopScreenShare() {
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    isScreenSharing = false;

    const btn = document.getElementById('screenShareBtn');
    btn.title = 'Compartilhar Tela';
    btn.classList.remove('screen-active');

    const overlay = document.getElementById('screenShareOverlay');
    // Só esconde o overlay se não há vídeo remoto
    if (!document.querySelector('#remoteVideos video')) {
        overlay.classList.add('hidden');
    }
    document.getElementById('localVideo').srcObject = null;
}

// ── Microfone / Fones ──────────────────────────────────────────
function toggleMic() {
    isMuted = !isMuted;
    updateMicState();
    updateSidebarMicIcon();
}

function updateMicState() {
    if (localStream) {
        localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
    }
    const btn = document.getElementById('micBtn');
    btn.classList.toggle('muted', isMuted);
    btn.title = isMuted ? 'Microfone Mutado' : 'Microfone Ativo';
    btn.textContent = isMuted ? '🔇' : '🎙️';
}

function toggleDeafen() {
    isDeafened = !isDeafened;
    document.querySelectorAll('.remote-audio').forEach(a => { a.muted = isDeafened; });
    const btn = document.getElementById('deafBtn');
    btn.classList.toggle('muted', isDeafened);
    btn.textContent = isDeafened ? '🔕' : '🎧';
}

// ── Participantes (painel de membros na direita) ───────────────
function addVoiceParticipant(displayName, isLocal = false, id = null) {
    const container = document.getElementById('voiceParticipants');
    const elemId = id || `vp-${displayName}`;
    if (document.getElementById(elemId)) return;

    const initial = displayName ? displayName[0].toUpperCase() : '?';
    const div = document.createElement('div');
    div.className = 'voice-participant';
    div.id = elemId;
    div.innerHTML = `
        <div class="vp-avatar">${initial}</div>
        <div class="vp-name">${displayName}${isLocal ? ' (você)' : ''}</div>
    `;
    container.appendChild(div);
}

function removeVoiceParticipant(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function addRemoteVideo(stream, userId) {
    // Áudio vai pro container oculto
    if (stream.getVideoTracks().length === 0) {
        const audioContainer = document.getElementById('remoteAudios');
        if (document.getElementById(`ra-${userId}`)) return;
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.className = 'remote-audio';
        audio.id = `ra-${userId}`;
        audio.srcObject = stream;
        if (isDeafened) audio.muted = true;
        audioContainer.appendChild(audio);
        return;
    }

    // Vídeo vai pro overlay
    const container = document.getElementById('remoteVideos');
    if (document.getElementById(`rv-${userId}`)) return;

    document.getElementById('screenShareOverlay').classList.remove('hidden');
        document.getElementById('screenShareOverlay').classList.remove('hidden');

    const wrap = document.createElement('div');
    wrap.className = 'remote-video-wrap';
    wrap.id = `rv-${userId}`;
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsinline = true;
    video.srcObject = stream;
    wrap.appendChild(video);
    container.appendChild(wrap);
}

// ── WebRTC Signaling ───────────────────────────────────────────
function subscribeToVoiceSignaling(channelId) {
    if (!stompClient) return;
    stompClient.subscribe(`/topic/voice/${channelId}`, async (frame) => {
        const signal = JSON.parse(frame.body);
        const myId = String(getUser().id);
        if (signal.from === myId) return;

        if (signal.type === 'join') {
            const pc = createPeer(signal.from, channelId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal(channelId, { type: 'offer', sdp: offer, to: signal.from, from: myId });
        } else if (signal.type === 'offer' && signal.to === myId) {
            const pc = createPeer(signal.from, channelId);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(channelId, { type: 'answer', sdp: answer, to: signal.from, from: myId });
        } else if (signal.type === 'answer' && signal.to === myId) {
            const pc = peers[signal.from];
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'ice' && signal.to === myId) {
            const pc = peers[signal.from];
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    });
}

function createPeer(peerId, channelId) {
    if (peers[peerId]) peers[peerId].close();
    const pc = new RTCPeerConnection(ICE_CONFIG);
    peers[peerId] = pc;

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (e) => {
        if (e.candidate) {
            sendSignal(channelId, { type: 'ice', candidate: e.candidate, to: peerId, from: String(getUser().id) });
        }
    };

    pc.ontrack = (e) => {
        addVoiceParticipant(`Usuário ${peerId}`, false, `vp-${peerId}`);
        addRemoteVideo(e.streams[0], peerId);
    };

    return pc;
}

function announcePresence(channelId) {
    sendSignal(channelId, { type: 'join', from: String(getUser().id) });
}

function sendSignal(channelId, signal) {
    if (stompClient && stompClient.connected) {
        stompClient.send(`/app/voice/${channelId}`, {}, JSON.stringify(signal));
    }
}

// ── Membros na sidebar do canal de voz ─────────────────────────
function addSidebarVoiceMember(channelId, displayName, memberId) {
    const channelEl = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (!channelEl) return;
    if (document.getElementById(`svm-${memberId}`)) return;

    const div = document.createElement('div');
    div.className = 'voice-sidebar-member';
    div.id = `svm-${memberId}`;
    div.innerHTML = `
        <div class="vsm-avatar">${displayName[0].toUpperCase()}</div>
        <span>${displayName}</span>
        <span class="vsm-mic" id="vsm-mic-${memberId}">🎙️</span>
    `;
    channelEl.insertAdjacentElement('afterend', div);
}

function removeSidebarVoiceMember(memberId) {
    const el = document.getElementById(`svm-${memberId}`);
    if (el) el.remove();
}

function clearSidebarVoiceMembers() {
    document.querySelectorAll('.voice-sidebar-member').forEach(el => el.remove());
}

function updateSidebarMicIcon() {
    const micEl = document.getElementById('vsm-mic-vp-local');
    if (micEl) micEl.textContent = isMuted ? '🔇' : '🎙️';
}
