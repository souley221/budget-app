// Redirect if already logged in
if (localStorage.getItem('budget_token')) {
  window.location.href = '/dashboard.html';
}

function switchMode(mode) {
  document.getElementById('formLogin').classList.toggle('active', mode === 'login');
  document.getElementById('formRegister').classList.toggle('active', mode === 'register');
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', (i===0 && mode==='login') || (i===1 && mode==='register')));
  clearAlerts();
}

function clearAlerts() {
  document.querySelectorAll('.alert').forEach(a => { a.className = 'alert'; a.textContent = ''; });
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert ${type} show`;
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="spinner"></span>Chargement…`
    : (btnId === 'btnLogin' ? 'Se connecter' : 'Créer mon compte');
}

async function login() {
  clearAlerts();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) return showAlert('loginAlert', 'Veuillez remplir tous les champs.', 'error');
  setLoading('btnLogin', true);
  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) return showAlert('loginAlert', data.error || 'Erreur de connexion', 'error');
    localStorage.setItem('budget_token', data.token);
    localStorage.setItem('budget_username', data.username);
    window.location.href = '/dashboard.html';
  } catch { showAlert('loginAlert', 'Impossible de contacter le serveur.', 'error'); }
  finally { setLoading('btnLogin', false); }
}

async function register() {
  clearAlerts();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const password2 = document.getElementById('regPassword2').value;
  if (!username || !password) return showAlert('registerAlert', 'Veuillez remplir tous les champs.', 'error');
  if (password !== password2) return showAlert('registerAlert', 'Les mots de passe ne correspondent pas.', 'error');
  if (password.length < 6) return showAlert('registerAlert', 'Mot de passe trop court (min. 6 caractères).', 'error');
  setLoading('btnRegister', true);
  try {
    const r = await fetch('/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) return showAlert('registerAlert', data.error || 'Erreur lors de la création', 'error');
    localStorage.setItem('budget_token', data.token);
    localStorage.setItem('budget_username', data.username);
    window.location.href = '/dashboard.html';
  } catch { showAlert('registerAlert', 'Impossible de contacter le serveur.', 'error'); }
  finally { setLoading('btnRegister', false); }
}

// Enter key
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (document.getElementById('formLogin').classList.contains('active')) login();
  else register();
});
