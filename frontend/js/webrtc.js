let localStream = null;
let screenStream = null;
let peers = {};
let peerInfo = {};
let isMuted = false;
let isDeafened = false;
let isScreenSharing = false;
let isNoiseSupprActive = false;
let currentVoiceChannel = null;
let audioContext = null;
let speakingInterval = null;
let presenceInterval = null;
let voiceSidebarSubs = [];

// Nós do pipeline de supressão de ruído
let nsSourceNode = null;
let nsDestNode = null;
let nsProcessedStream = null;
let callActiveStreamId = null;

const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80',          username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443',         username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

// Constraints de áudio de alta qualidade — 48 kHz, stereo, sem supressões automáticas ruins
const AUDIO_CONSTRAINTS = {
    audio: {
        sampleRate: 48000,
        sampleSize: 16,
        channelCount: 2,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        latency: 0,
        googEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: true,
        googHighpassFilter: true,
        googTypingNoiseDetection: true,
        googAudioMirroring: false
    },
    video: false
};

async function joinVoiceChannel(channelId, channelName) {
    if (currentVoiceChannel === channelId) {
        showVoiceView(channelName);
        return;
    }

    if (currentVoiceChannel !== null) leaveVoice();

    currentVoiceChannel = channelId;

    // Mostra a voice bar na sidebar e a view principal de call
    document.getElementById('voiceBarChannelName').textContent = channelName;
    document.getElementById('voiceBar').classList.remove('hidden');
    document.getElementById('voiceParticipants').innerHTML = '';
    showVoiceView(channelName);

    // Marca canal ativo na sidebar
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (activeItem) activeItem.classList.add('active');

    try {
        localStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
        updateMicState();
        const selfUser = getUser();
        addVoiceParticipant(selfUser.displayName || selfUser.username, true, 'vp-local', selfUser.avatarUrl);
        addSidebarVoiceMember(channelId, selfUser.displayName || selfUser.username, 'vp-local', selfUser.avatarUrl);
        startSpeakingDetection();
    } catch (err) {
        console.error('Mic error:', err);
    }

    subscribeToVoiceSignaling(channelId);
    announcePresence(channelId);

    if (presenceInterval) clearInterval(presenceInterval);
    presenceInterval = setInterval(() => {
        if (currentVoiceChannel === channelId) announcePresence(channelId);
        else clearInterval(presenceInterval);
    }, 5000);
}

// ── Supressão de Ruído ─────────────────────────────────────────
async function toggleNoiseSuppression() {
    isNoiseSupprActive = !isNoiseSupprActive;
    const btn = document.getElementById('noiseSupprBtn');
    btn.classList.toggle('ns-active', isNoiseSupprActive);
    btn.setAttribute('data-tooltip', isNoiseSupprActive ? 'Supressão Ativa' : 'Supressão Desativada');

    if (isNoiseSupprActive) {
        await applyNoiseSuppression();
    } else {
        removeNoiseSuppression();
    }
}

async function applyNoiseSuppression() {
    if (!localStream) return;

    // Cria contexto de áudio dedicado ao pipeline de NS
    const nsCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const source = nsCtx.createMediaStreamSource(localStream);

    // High-pass: corta ruídos de baixa frequência (ar condicionado, ventilador) < 100 Hz
    const highPass = nsCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 100;
    highPass.Q.value = 0.7;

    // Low-pass: corta ruídos de alta frequência (chiado, eletrônico) > 8 kHz
    const lowPass = nsCtx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 8000;
    lowPass.Q.value = 0.7;

    // Compressor dinâmico: nivela picos e esmaga ruído de fundo residual
    const compressor = nsCtx.createDynamicsCompressor();
    compressor.threshold.value = -40;  // começa a comprimir em -40 dB
    compressor.knee.value = 10;
    compressor.ratio.value = 12;       // compressão forte em sons fracos (ruído)
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    // Gain de compensação (compressor reduz volume — recupera)
    const gain = nsCtx.createGain();
    gain.gain.value = 1.4;

    // Pipeline: source → highpass → lowpass → compressor → gain → destination
    const dest = nsCtx.createMediaStreamDestination();
    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(compressor);
    compressor.connect(gain);
    gain.connect(dest);

    nsProcessedStream = dest.stream;
    nsSourceNode = source;
    nsDestNode = dest;

    // Substitui a faixa de áudio nos peers ativos
    const processedTrack = nsProcessedStream.getAudioTracks()[0];
    Object.values(peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender) sender.replaceTrack(processedTrack).catch(() => {});
    });

    // Guarda referência ao contexto para fechar depois
    nsSourceNode._ctx = nsCtx;
}

function removeNoiseSuppression() {
    if (nsSourceNode) {
        if (nsSourceNode._ctx) nsSourceNode._ctx.close().catch(() => {});
        nsSourceNode = null;
        nsDestNode = null;
    }
    nsProcessedStream = null;

    // Restaura a faixa de áudio original nos peers
    if (!localStream) return;
    const originalTrack = localStream.getAudioTracks()[0];
    if (!originalTrack) return;
    Object.values(peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender) sender.replaceTrack(originalTrack).catch(() => {});
    });
}

function resetNoiseSuppression() {
    isNoiseSupprActive = false;
    if (nsSourceNode) {
        if (nsSourceNode._ctx) nsSourceNode._ctx.close().catch(() => {});
        nsSourceNode = null;
        nsDestNode = null;
    }
    nsProcessedStream = null;
    const btn = document.getElementById('noiseSupprBtn');
    if (btn) { btn.classList.remove('ns-active'); btn.removeAttribute('data-tooltip'); }
}

function leaveVoice() {
    if (presenceInterval) { clearInterval(presenceInterval); presenceInterval = null; }

    // Avisa todos os peers que saiu — captura o canal antes de zerar
    const leavingChannel = currentVoiceChannel;
    currentVoiceChannel = null;
    if (leavingChannel) {
        const me = getUser();
        sendSignal(leavingChannel, { type: 'leave', from: String(me.id) });
    }

    resetNoiseSuppression();
    stopSpeakingDetection();
    clearSidebarVoiceMembers();
    peerInfo = {};

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

    document.getElementById('voiceBar').classList.add('hidden');
    document.getElementById('voiceParticipants').innerHTML = '';
    document.getElementById('remoteAudios').innerHTML = '';
    document.getElementById('remoteVideos').innerHTML = '';
    document.getElementById('screenShareOverlay').classList.add('hidden');
    isScreenSharing = false;

    document.getElementById('callGrid').innerHTML = '';
    document.getElementById('callScreenThumbs').innerHTML = '';
    document.getElementById('callScreenThumbs').classList.add('hidden');
    hideCallStage();
    hideVoiceView();
    callActiveStreamId = null;

    const btn = document.getElementById('screenShareBtn');
    btn.title = 'Compartilhar Tela';
    btn.classList.remove('screen-active');
    const callScreenBtn = document.getElementById('callScreenBtn');
    if (callScreenBtn) callScreenBtn.classList.remove('screen-active');

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
            const sidebarEl = document.getElementById('svm-vp-local');
            const callTile = document.getElementById('ctile-vp-local');
            if (isMuted) {
                if (sidebarEl) sidebarEl.classList.remove('speaking', 'mic-active');
                if (callTile) callTile.classList.remove('speaking');
                return;
            }
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            const isSpeaking = avg > 4;
            if (sidebarEl) {
                sidebarEl.classList.toggle('speaking', isSpeaking);
                sidebarEl.classList.toggle('mic-active', !isSpeaking);
            }
            if (callTile) callTile.classList.toggle('speaking', isSpeaking);
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
        const callBtn = document.getElementById('callScreenBtn');
        if (callBtn) { callBtn.title = 'Parar Transmissão'; callBtn.classList.add('screen-active'); }

        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = screenStream;
        document.getElementById('screenShareOverlay').classList.remove('hidden');

        // Adiciona miniatura local no modal
        const me = getUser();
        addScreenThumb('local', (me.displayName || me.username) + ' (você)', screenStream);

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

// Força Opus 48kHz stereo com bitrate alto para o sender de áudio
function applyHighQualityAudio(sender) {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    // 510 kbps — teto prático do Opus no WebRTC
    params.encodings[0].maxBitrate = 510_000;
    sender.setParameters(params).catch(() => {});
}

// Reescreve o SDP para priorizar Opus e habilitar stereo + fullband
function preferOpusInSDP(sdp) {
    return sdp.split('\r\n').map(line => {
        if (line.startsWith('a=fmtp:') && line.includes('opus')) {
            // Remove duplicatas e injeta os parâmetros ideais
            const base = line.replace(/;?stereo=\d/g, '')
                             .replace(/;?sprop-stereo=\d/g, '')
                             .replace(/;?maxaveragebitrate=\d+/g, '')
                             .replace(/;?cbr=\d/g, '');
            return base + ';stereo=1;sprop-stereo=1;maxaveragebitrate=510000;cbr=0';
        }
        return line;
    }).join('\r\n');
}

function stopScreenShare() {
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    isScreenSharing = false;

    const btn = document.getElementById('screenShareBtn');
    btn.title = 'Compartilhar Tela';
    btn.classList.remove('screen-active');
    const callBtn = document.getElementById('callScreenBtn');
    if (callBtn) { callBtn.title = 'Compartilhar Tela'; callBtn.classList.remove('screen-active'); }

    removeScreenThumb('local');

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
    const callBtn = document.getElementById('callMicBtn');
    if (callBtn) callBtn.classList.toggle('muted', isMuted);
}

function toggleDeafen() {
    isDeafened = !isDeafened;
    document.querySelectorAll('.remote-audio').forEach(a => { a.muted = isDeafened; });
    document.querySelectorAll('.remote-video').forEach(v => { v.muted = isDeafened; });
    const btn = document.getElementById('deafBtn');
    btn.classList.toggle('muted', isDeafened);
    btn.textContent = isDeafened ? '🔕' : '🎧';
    const callBtn = document.getElementById('callDeafBtn');
    if (callBtn) callBtn.classList.toggle('muted', isDeafened);
    const sv = document.getElementById('callStageVideo');
    if (sv && sv.srcObject) sv.muted = isDeafened;
}

// ── Participantes (painel de membros na direita) ───────────────
function addVoiceParticipant(displayName, isLocal = false, id = null, avatarUrl = '') {
    const container = document.getElementById('voiceParticipants');
    const elemId = id || `vp-${displayName}`;
    if (document.getElementById(elemId)) return;

    const initial = displayName ? displayName[0].toUpperCase() : '?';
    const avatarStyle = avatarUrl ? `style="background-image:url('${avatarUrl}');background-size:cover;background-position:center;"` : '';
    const div = document.createElement('div');
    div.className = 'voice-participant';
    div.id = elemId;
    div.innerHTML = `
        <div class="vp-avatar" ${avatarStyle}>${avatarUrl ? '' : initial}</div>
        <div class="vp-name">${displayName}${isLocal ? ' (você)' : ''}</div>
    `;
    container.appendChild(div);

    addCallTile(displayName, isLocal, elemId, avatarUrl);
}

function removeVoiceParticipant(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    removeCallTile(id);
}

// ── Tiles da Call View ─────────────────────────────────────────
function addCallTile(displayName, isLocal, id, avatarUrl) {
    const grid = document.getElementById('callGrid');
    const tileId = `ctile-${id}`;
    if (document.getElementById(tileId)) return;

    const initial = displayName ? displayName[0].toUpperCase() : '?';
    const avatarStyle = avatarUrl
        ? `style="background-image:url('${avatarUrl}');background-size:cover;background-position:center;"`
        : '';

    const tile = document.createElement('div');
    tile.className = 'call-tile';
    tile.id = tileId;
    tile.innerHTML = `
        <div class="call-tile-avatar" ${avatarStyle}>${avatarUrl ? '' : initial}</div>
        <div class="call-tile-name">${displayName}${isLocal ? ' (você)' : ''}</div>
    `;
    grid.appendChild(tile);
    updateCallGridLayout();
}

function removeCallTile(id) {
    const tile = document.getElementById(`ctile-${id}`);
    if (tile) tile.remove();
    updateCallGridLayout();
}

function updateCallGridLayout() {
    const grid = document.getElementById('callGrid');
    const count = grid.children.length;
    if (count <= 1)       grid.style.gridTemplateColumns = '1fr';
    else if (count <= 4)  grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    else if (count <= 9)  grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    else                  grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
}

// ── Controle da Voice View ─────────────────────────────────────
function showVoiceView(channelName) {
    document.getElementById('homeView').classList.add('hidden');
    document.getElementById('chatView').classList.add('hidden');
    document.getElementById('voiceView').classList.remove('hidden');
    document.getElementById('membersSidebar').classList.add('hidden');
    if (channelName) document.getElementById('callVoiceChannelName').textContent = channelName;
}

function hideVoiceView() {
    document.getElementById('voiceView').classList.add('hidden');
    document.getElementById('homeView').classList.remove('hidden');
}

function showCallStage() {
    document.getElementById('callStage').classList.remove('hidden');
    document.getElementById('callBody').classList.add('screen-active');
}

function hideCallStage() {
    document.getElementById('callStage').classList.add('hidden');
    document.getElementById('callBody').classList.remove('screen-active');
    const v = document.getElementById('callStageVideo');
    if (v) v.srcObject = null;
    callActiveStreamId = null;
}

function selectCallStream(id) {
    callActiveStreamId = id;
    const stream = getStreamById(id);
    const video = document.getElementById('callStageVideo');
    if (video) {
        video.srcObject = stream || null;
        if (stream) video.muted = (id === 'local') || isDeafened;
    }
    const lbl = document.getElementById('callStageSharer');
    if (lbl) {
        const info = id === 'local'
            ? { displayName: ((getUser().displayName || getUser().username) + ' (você)') }
            : (peerInfo[id] || { displayName: `Usuário ${id}` });
        lbl.textContent = info.displayName;
    }
    document.querySelectorAll('#callScreenThumbs .call-cthumb').forEach(t => {
        t.classList.toggle('active', t.dataset.id === id);
    });
}

function addCallScreenThumb(id, label, stream) {
    const container = document.getElementById('callScreenThumbs');
    let thumb = document.getElementById(`csthumb-${id}`);
    if (!thumb) {
        thumb = document.createElement('div');
        thumb.className = 'call-cthumb';
        thumb.id = `csthumb-${id}`;
        thumb.dataset.id = id;
        const video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsinline = true;
        const lbl = document.createElement('div');
        lbl.className = 'call-cthumb-label';
        lbl.textContent = label;
        thumb.appendChild(video);
        thumb.appendChild(lbl);
        thumb.addEventListener('click', () => { selectCallStream(id); selectScreenThumb(id); });
        container.appendChild(thumb);
    }
    thumb.querySelector('video').srcObject = stream;
    // Mostra barra de miniaturas só quando há mais de 1 stream
    container.classList.toggle('hidden', container.children.length <= 1);
}

function removeCallScreenThumb(id) {
    const thumb = document.getElementById(`csthumb-${id}`);
    if (thumb) thumb.remove();
    const container = document.getElementById('callScreenThumbs');
    container.classList.toggle('hidden', container.children.length <= 1);
    if (callActiveStreamId === id) {
        const next = container.querySelector('.call-cthumb');
        if (next) selectCallStream(next.dataset.id);
        else hideCallStage();
    }
}

// ── Modal de tela cheia ────────────────────────────────────────
let screenModalActiveId = null;

function openScreenModal() {
    const modal = document.getElementById('screenModal');
    modal.classList.remove('hidden');
    // Seleciona a primeira thumb disponível se nenhuma estiver ativa
    if (!screenModalActiveId) {
        const firstThumb = document.querySelector('.screen-thumb');
        if (firstThumb) selectScreenThumb(firstThumb.dataset.id);
    } else {
        selectScreenThumb(screenModalActiveId);
    }
}

function closeScreenModal() {
    document.getElementById('screenModal').classList.add('hidden');
    // Pausa o vídeo modal para evitar duplicidade de stream
    const mv = document.getElementById('screenModalVideo');
    mv.srcObject = null;
    screenModalActiveId = null;
}

function selectScreenThumb(id) {
    screenModalActiveId = id;
    const stream = getStreamById(id);
    const mv = document.getElementById('screenModalVideo');
    const empty = document.getElementById('screenModalEmpty');

    if (stream) {
        mv.srcObject = stream;
        mv.muted = (id === 'local') || isDeafened;
        mv.classList.remove('hidden');
        empty.classList.add('hidden');
    } else {
        mv.srcObject = null;
        mv.classList.add('hidden');
        empty.classList.remove('hidden');
    }

    document.querySelectorAll('.screen-thumb').forEach(t => {
        t.classList.toggle('active', t.dataset.id === id);
    });
}

function getStreamById(id) {
    if (id === 'local') return screenStream;
    const wrap = document.getElementById(`rv-${id}`);
    if (wrap) return wrap.querySelector('video').srcObject;
    return null;
}

function addScreenThumb(id, label, stream) {
    const thumbsEl = document.getElementById('screenModalThumbs');
    let thumb = document.getElementById(`sthumb-${id}`);
    if (!thumb) {
        thumb = document.createElement('div');
        thumb.className = 'screen-thumb';
        thumb.id = `sthumb-${id}`;
        thumb.dataset.id = id;

        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsinline = true;

        const lbl = document.createElement('div');
        lbl.className = 'screen-thumb-label';
        lbl.textContent = label;

        thumb.appendChild(video);
        thumb.appendChild(lbl);
        thumb.addEventListener('click', () => { selectScreenThumb(id); selectCallStream(id); });
        thumbsEl.appendChild(thumb);
    }
    thumb.querySelector('video').srcObject = stream;

    // Call view: mostra o stage e adiciona miniatura
    showCallStage();
    addCallScreenThumb(id, label, stream);
    if (!callActiveStreamId) selectCallStream(id);

    if (!screenModalActiveId) {
        selectScreenThumb(id);
    }
}

function removeScreenThumb(id) {
    const thumb = document.getElementById(`sthumb-${id}`);
    if (thumb) thumb.remove();
    if (screenModalActiveId === id) {
        screenModalActiveId = null;
        const next = document.querySelector('.screen-thumb');
        if (next) selectScreenThumb(next.dataset.id);
        else {
            const mv = document.getElementById('screenModalVideo');
            mv.srcObject = null;
            document.getElementById('screenModalEmpty').classList.remove('hidden');
        }
    }
    removeCallScreenThumb(id);
}

function addRemoteVideo(stream, userId) {
    if (!stream) return;

    if (stream.getVideoTracks().length === 0) {
        // Stream só de áudio (microfone)
        const audioContainer = document.getElementById('remoteAudios');
        let audio = document.getElementById(`ra-${userId}`);
        if (!audio) {
            audio = document.createElement('audio');
            audio.autoplay = true;
            audio.className = 'remote-audio';
            audio.id = `ra-${userId}`;
            audio.volume = 1.0;
            audioContainer.appendChild(audio);
        }
        audio.srcObject = stream;
        audio.muted = isDeafened;
        return;
    }

    // Stream com vídeo (compartilhamento de tela)
    document.getElementById('screenShareOverlay').classList.remove('hidden');
    const container = document.getElementById('remoteVideos');
    let wrap = document.getElementById(`rv-${userId}`);
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'remote-video-wrap';
        wrap.id = `rv-${userId}`;
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsinline = true;
        video.className = 'remote-video';
        video.muted = isDeafened;
        wrap.appendChild(video);
        container.appendChild(wrap);
    }
    wrap.querySelector('video').srcObject = stream;

    // Adiciona miniatura no modal
    const info = peerInfo[userId] || {};
    const label = info.displayName || `Usuário ${userId}`;
    addScreenThumb(userId, label, stream);
}

// ── WebRTC Signaling ───────────────────────────────────────────
function subscribeToVoiceSignaling(channelId) {
    if (!stompClient) return;
    stompClient.subscribe(`/topic/voice/${channelId}`, async (frame) => {
        const signal = JSON.parse(frame.body);
        const myId = String(getUser().id);
        if (signal.from === myId) return;

        if (signal.type === 'join') {
            peerInfo[signal.from] = { displayName: signal.displayName, avatarUrl: signal.avatarUrl };
            addVoiceParticipant(signal.displayName || `Usuário ${signal.from}`, false, `vp-${signal.from}`, signal.avatarUrl);
            addSidebarVoiceMember(channelId, signal.displayName || `Usuário ${signal.from}`, `vp-${signal.from}`, signal.avatarUrl);
            const pc = createPeer(signal.from, channelId);
            const offer = await pc.createOffer();
            const improvedOffer = { type: offer.type, sdp: preferOpusInSDP(offer.sdp) };
            await pc.setLocalDescription(improvedOffer);
            const me = getUser();
            sendSignal(channelId, { type: 'offer', sdp: improvedOffer, to: signal.from, from: myId, displayName: me.displayName || me.username, avatarUrl: me.avatarUrl || '' });
        } else if (signal.type === 'offer' && signal.to === myId) {
            if (signal.displayName) {
                peerInfo[signal.from] = { displayName: signal.displayName, avatarUrl: signal.avatarUrl };
                // Mostra o usuário na sidebar imediatamente, antes do WebRTC conectar
                addVoiceParticipant(signal.displayName, false, `vp-${signal.from}`, signal.avatarUrl || '');
                addSidebarVoiceMember(channelId, signal.displayName, `vp-${signal.from}`, signal.avatarUrl || '');
            }
            const pc = createPeer(signal.from, channelId);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            const improvedAnswer = { type: answer.type, sdp: preferOpusInSDP(answer.sdp) };
            await pc.setLocalDescription(improvedAnswer);
            sendSignal(channelId, { type: 'answer', sdp: improvedAnswer, to: signal.from, from: myId });
        } else if (signal.type === 'answer' && signal.to === myId) {
            const pc = peers[signal.from];
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'ice' && signal.to === myId) {
            const pc = peers[signal.from];
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else if (signal.type === 'leave') {
            const peerId = signal.from;
            if (peers[peerId]) { peers[peerId].close(); delete peers[peerId]; }
            delete peerInfo[peerId];
            removeVoiceParticipant(`vp-${peerId}`);
            removeSidebarVoiceMember(`vp-${peerId}`);
            removeScreenThumb(peerId);
            // Remove áudio/vídeo remoto
            const ra = document.getElementById(`ra-${peerId}`);
            if (ra) ra.remove();
            const rv = document.getElementById(`rv-${peerId}`);
            if (rv) rv.remove();
            if (!document.querySelector('#remoteVideos video')) {
                if (!isScreenSharing) document.getElementById('screenShareOverlay').classList.add('hidden');
            }
        }
    });
}

function createPeer(peerId, channelId) {
    if (peers[peerId]) peers[peerId].close();
    const pc = new RTCPeerConnection(ICE_CONFIG);
    peers[peerId] = pc;

    let makingOffer = false;

    if (localStream) {
        localStream.getTracks().forEach(track => {
            const sender = pc.addTrack(track, localStream);
            if (track.kind === 'audio') {
                pc.addEventListener('negotiationneeded', () => applyHighQualityAudio(sender), { once: true });
            }
        });
    }

    // Se já está compartilhando tela, adiciona os tracks para novos participantes
    if (screenStream) {
        screenStream.getTracks().forEach(track => {
            const sender = pc.addTrack(track, screenStream);
            if (track.kind === 'video') applyHighQualityParams(sender);
        });
    }

    // Renegociação automática (crítico para screen share funcionar)
    pc.onnegotiationneeded = async () => {
        if (makingOffer) return;
        try {
            makingOffer = true;
            const offer = await pc.createOffer();
            if (pc.signalingState !== 'stable') return;
            const improved = { type: offer.type, sdp: preferOpusInSDP(offer.sdp) };
            await pc.setLocalDescription(improved);
            const me = getUser();
            sendSignal(channelId, {
                type: 'offer', sdp: improved, to: peerId,
                from: String(me.id), displayName: me.displayName || me.username, avatarUrl: me.avatarUrl || ''
            });
        } catch (e) {
            console.error('Renegotiation error:', e);
        } finally {
            makingOffer = false;
        }
    };

    pc.onicecandidate = (e) => {
        if (e.candidate) {
            sendSignal(channelId, { type: 'ice', candidate: e.candidate, to: peerId, from: String(getUser().id) });
        }
    };

    pc.ontrack = (e) => {
        const info = peerInfo[peerId] || {};
        addVoiceParticipant(info.displayName || `Usuário ${peerId}`, false, `vp-${peerId}`, info.avatarUrl);
        addSidebarVoiceMember(currentVoiceChannel, info.displayName || `Usuário ${peerId}`, `vp-${peerId}`, info.avatarUrl);
        addRemoteVideo(e.streams[0], peerId);
    };

    return pc;
}

function announcePresence(channelId) {
    const user = getUser();
    sendSignal(channelId, { type: 'join', from: String(user.id), displayName: user.displayName || user.username, avatarUrl: user.avatarUrl || '' });
}

function subscribeVoiceSidebar(voiceChannels) {
    voiceSidebarSubs.forEach(sub => { try { sub.unsubscribe(); } catch(e) {} });
    voiceSidebarSubs = [];

    if (!stompClient || !stompClient.connected) {
        setTimeout(() => subscribeVoiceSidebar(voiceChannels), 1000);
        return;
    }

    voiceChannels.forEach(ch => {
        const sub = stompClient.subscribe(`/topic/voice/${ch.id}`, (frame) => {
            if (currentVoiceChannel === ch.id) return;

            const signal = JSON.parse(frame.body);
            if (signal.type === 'join') {
                addSidebarVoiceMember(ch.id, signal.displayName, `vp-${signal.from}`, signal.avatarUrl || '');
            } else if (signal.type === 'leave') {
                removeSidebarVoiceMember(`vp-${signal.from}`);
            }
        });
        voiceSidebarSubs.push(sub);
    });
}

function sendSignal(channelId, signal) {
    if (stompClient && stompClient.connected) {
        stompClient.send(`/app/voice/${channelId}`, {}, JSON.stringify(signal));
    }
}

// ── Membros na sidebar do canal de voz ─────────────────────────
function addSidebarVoiceMember(channelId, displayName, memberId, avatarUrl = '') {
    const channelEl = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (!channelEl) return;
    if (document.getElementById(`svm-${memberId}`)) return;

    const initial = displayName ? displayName[0].toUpperCase() : '?';
    const avatarStyle = avatarUrl ? `style="background-image:url('${avatarUrl}');background-size:cover;background-position:center;"` : '';
    const div = document.createElement('div');
    div.className = 'voice-sidebar-member';
    div.id = `svm-${memberId}`;
    div.innerHTML = `
        <div class="vsm-avatar" ${avatarStyle}>${avatarUrl ? '' : initial}</div>
        <span>${displayName}</span>
        <span class="vsm-mic" id="vsm-mic-${memberId}">🎙️</span>
    `;
    channelEl.insertAdjacentElement('afterend', div);
}

function leaveVoiceCleanup() { peerInfo = {}; }

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
