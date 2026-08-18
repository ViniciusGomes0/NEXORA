const API = 'http://localhost:8080/api';

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
    document.querySelector(`.tab:nth-child(${tab === 'login' ? 1 : 2})`).classList.add('active');
    document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm').classList.remove('hidden');
}

document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    try {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('loginEmail').value,
                password: document.getElementById('loginPassword').value
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao entrar');
        saveSession(data);
        window.location.href = 'app.html';
    } catch (err) {
        errEl.textContent = err.message;
    }
});

document.getElementById('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('registerError');
    errEl.textContent = '';
    try {
        const res = await fetch(`${API}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('regUsername').value,
                displayName: document.getElementById('regDisplayName').value,
                email: document.getElementById('regEmail').value,
                password: document.getElementById('regPassword').value
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao criar conta');
        saveSession(data);
        window.location.href = 'app.html';
    } catch (err) {
        errEl.textContent = err.message;
    }
});

function saveSession(data) {
    localStorage.setItem('nexora_token', data.token);
    localStorage.setItem('nexora_user', JSON.stringify({
        id: data.id,
        username: data.username,
        tag: data.tag,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl || ''
    }));
}

// Limpa sessão ao voltar para o login
localStorage.removeItem('nexora_token');
localStorage.removeItem('nexora_user');
