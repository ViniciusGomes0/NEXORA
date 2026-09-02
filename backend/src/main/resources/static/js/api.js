const API_BASE = (window.location.port === '5500' || window.location.port === '3000') ? 'http://localhost:8080/api' : '/api';

function getToken() {
    return localStorage.getItem('nexora_token');
}

function getUser() {
    return JSON.parse(localStorage.getItem('nexora_user') || '{}');
}

async function apiFetch(path, options = {}) {
    const res = await fetch(API_BASE + path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + getToken(),
            ...(options.headers || {})
        }
    });
    if (res.status === 401) {
        localStorage.clear();
        window.location.href = 'index.html';
    }
    return res;
}

async function safeJson(res) {
    const text = await res.text();
    if (!text || !text.trim()) return {};
    try { return JSON.parse(text); } catch { return { error: 'Resposta inválida do servidor' }; }
}

async function fetchMyServers() {
    const res = await apiFetch('/servers/me');
    return res.ok ? res.json() : [];
}

async function fetchChannels(serverId) {
    const res = await apiFetch(`/servers/${serverId}/channels`);
    return res.ok ? res.json() : [];
}

async function fetchMessages(channelId, page = 0) {
    const res = await apiFetch(`/channels/${channelId}/messages?page=${page}`);
    return res.ok ? res.json() : [];
}

async function apiCreateServer(name, description) {
    const res = await apiFetch('/servers', {
        method: 'POST',
        body: JSON.stringify({ name, description })
    });
    return safeJson(res);
}

async function apiJoinServer(inviteCode) {
    const res = await apiFetch(`/servers/join/${inviteCode}`, { method: 'POST' });
    return safeJson(res);
}

async function fetchMembers(serverId) {
    try {
        const res = await apiFetch(`/servers/${serverId}/members`);
        if (!res.ok) {
            console.error('fetchMembers error', res.status, await res.text());
            return [];
        }
        return res.json();
    } catch (e) {
        console.error('fetchMembers exception', e);
        return [];
    }
}

async function apiCreateChannel(serverId, name, type) {
    const res = await apiFetch(`/servers/${serverId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name, type })
    });
    return safeJson(res);
}

async function apiRenameChannel(channelId, name) {
    const res = await apiFetch(`/servers/channels/${channelId}`, {
        method: 'PUT',
        body: JSON.stringify({ name })
    });
    if (!res.ok) return { error: `Erro ${res.status}` };
    return safeJson(res);
}

async function apiGetUser(id) {
    const res = await apiFetch(`/users/${id}`);
    return res.ok ? res.json() : null;
}

async function apiGetMe() {
    const res = await apiFetch('/users/me');
    return res.ok ? res.json() : {};
}

async function apiUpdateMe(displayName, avatarUrl) {
    const res = await apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify({ displayName, avatarUrl })
    });
    if (!res.ok) return { error: `Erro ${res.status}` };
    return res.json();
}

async function apiDeleteChannel(channelId) {
    const res = await apiFetch(`/servers/channels/${channelId}`, { method: 'DELETE' });
    if (!res.ok) return { error: `Erro ${res.status}` };
    return safeJson(res);
}

async function apiUpdateServer(serverId, name, description, iconUrl) {
    const res = await apiFetch(`/servers/${serverId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, iconUrl: iconUrl || null })
    });
    if (!res.ok) return { error: `Erro ${res.status}` };
    return safeJson(res);
}

async function apiUploadServerIcon(serverId, file) {
    const form = new FormData();
    form.append('icon', file);
    const res = await fetch(API_BASE + `/servers/${serverId}/icon`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
        body: form
    });
    if (!res.ok) return { error: `Erro ao enviar ícone (${res.status})` };
    return safeJson(res);
}

async function apiDeleteServer(serverId) {
    const res = await apiFetch(`/servers/${serverId}`, { method: 'DELETE' });
    if (!res.ok) return { error: `Erro ${res.status}` };
    return safeJson(res);
}

async function apiRegenerateInvite(serverId) {
    const res = await apiFetch(`/servers/${serverId}/regenerate-invite`, { method: 'POST' });
    if (!res.ok) return { error: `Erro ${res.status}` };
    return safeJson(res);
}

async function apiDeleteMessage(messageId) {
    const res = await fetch(API_BASE + `/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { error: body || `Erro ${res.status}` };
    }
    return {};
}

async function apiUploadImage(channelId, file) {
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(API_BASE + `/channels/${channelId}/images`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
        body: form
    });
    if (!res.ok) return { error: `Erro ao enviar imagem (${res.status})` };
    return safeJson(res);
}

async function apiUploadFile(channelId, file, replyToMessageId) {
    const form = new FormData();
    form.append('file', file);
    if (replyToMessageId) form.append('replyToMessageId', replyToMessageId);
    const res = await fetch(API_BASE + `/channels/${channelId}/files`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
        body: form
    });
    if (!res.ok) {
        const j = await safeJson(res);
        return { error: j.error || `Erro ao enviar arquivo (${res.status})` };
    }
    return safeJson(res);
}
