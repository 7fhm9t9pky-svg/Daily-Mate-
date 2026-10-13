/**
 * Schermata di accesso: mostra login/registrazione finché l'utente non è
 * autenticato, poi richiama onReady(). main.js la usa per decidere quando
 * avviare App (e con quale storage).
 */
export class AuthGate {
  constructor(authClient, onReady) {
    this.auth = authClient;
    this.onReady = onReady;
    this.mode = 'login';
  }

  async start() {
    if (this.auth.isAuthenticated()) {
      const user = await this.auth.fetchMe();
      if (user) {
        document.getElementById('app-shell').hidden = false;
        return this.onReady();
      }
    }
    this.render();
  }

  render() {
    const root = document.getElementById('auth-gate');
    const shell = document.getElementById('app-shell');
    root.hidden = false;
    shell.hidden = true;

    const isSignup = this.mode === 'signup';
    root.innerHTML = `
      <div class="auth-card">
        <h1>Daily Mate</h1>
        <p class="auth-sub">${isSignup ? 'Crea un nuovo account' : 'Accedi al tuo spazio personale'}</p>
        <form class="auth-form">
          ${isSignup ? '<label class="field"><span>Nome da mostrare</span><input name="displayName" type="text"></label>' : ''}
          <label class="field"><span>Username</span><input name="username" type="text" required autocomplete="username"></label>
          <label class="field"><span>Password</span><input name="password" type="password" required minlength="6" autocomplete="${isSignup ? 'new-password' : 'current-password'}"></label>
          <p class="auth-error" hidden></p>
          <button class="btn primary" type="submit">${isSignup ? 'Crea account' : 'Accedi'}</button>
        </form>
        <button class="btn ghost auth-switch">${isSignup ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}</button>
      </div>`;

    root.querySelector('.auth-switch').onclick = () => { this.mode = isSignup ? 'login' : 'signup'; this.render(); };

    const form = root.querySelector('.auth-form');
    const errorEl = root.querySelector('.auth-error');
    form.onsubmit = async e => {
      e.preventDefault();
      errorEl.hidden = true;
      const fd = new FormData(form);
      try {
        if (isSignup) await this.auth.signup(fd.get('username'), fd.get('password'), fd.get('displayName'));
        else await this.auth.login(fd.get('username'), fd.get('password'));
        root.hidden = true;
        shell.hidden = false;
        this.onReady();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    };
  }
}
