import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { GroupDetail } from './GroupDetail.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const looksLikeCode = q => /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(q.trim());
const norm = s => String(s || '').toLowerCase();

/** Gruppi: miei gruppi, richieste da accettare, creazione e inviti. Barra di ricerca per nome (o codice per entrare). */
class GroupsView extends Component {
  constructor(m) { super(); this.m = m; this.q = ''; this.st = { groups: [], incoming: [], outgoing: [] }; this.found = []; this.inviteTo = ''; this.msg = ''; }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    el.innerHTML = `
      <label class="fl"><span>Cerca (nome del gruppo o della persona; oppure scrivi un codice per entrare)</span>
        <input id="g-q" type="search" placeholder="Es. Famiglia, Marco, K7M2-9QXP" autocomplete="off"></label>
      <p class="set-note" id="g-msg" hidden></p>
      <div id="g-body"></div>`;
    el.querySelector('#g-q').oninput = e => { this.q = e.target.value; this.draw(); };
    el.addEventListener('click', e => this.#click(e));
    return el;
  }

  async afterMount() { await this.load(); }

  async load(force = true) {
    this.st = await this.m.svc.state(force);
    this.draw();
  }

  say(t, bad = false) {
    const p = this.el.querySelector('#g-msg'); p.hidden = !t; p.textContent = t || '';
    p.style.color = bad ? 'var(--neg)' : '';
  }

  async act(fn, okMsg) {
    try { await fn(); this.say(okMsg || ''); } catch (e) { this.say(e.message, true); }
    this.m.svc.invalidate(); await this.load(true);
  }

  draw() {
    const q = norm(this.q.trim()), s = this.st;
    const hit = (...t) => !q || t.some(x => norm(x).includes(q));
    const groups = s.groups.filter(g => hit(g.name, ...g.members.map(m => m.name)));
    const inc = s.incoming.filter(r => hit(r.groupName, r.userName, r.byName));
    const out = s.outgoing.filter(r => hit(r.groupName, r.userName));
    const mine = s.groups.filter(g => g.isOwner);
    if (!mine.some(g => g.id === this.inviteTo)) this.inviteTo = mine[0]?.id || '';
    const body = this.el.querySelector('#g-body');

    body.innerHTML = `
      ${q && looksLikeCode(q) ? `<div class="set-block"><h3>Codice gruppo</h3><p class="set-note">Vuoi entrare nel gruppo con codice <b>${esc(this.q.trim().toUpperCase())}</b>? Il creatore dovrà accettare la tua richiesta.</p><button class="btn primary" data-act="join" data-code="${esc(this.q.trim())}">Chiedi di entrare</button></div>` : ''}

      <h2 class="s">I miei gruppi</h2>
      ${groups.length ? groups.map(g => `
        <div class="set-block">
          <h3>${esc(g.name)}${g.isOwner ? ' · creatore' : ''}</h3>
          <p class="set-note">Codice: <b style="user-select:all;letter-spacing:.08em">${esc(g.code)}</b> — chi lo conosce può chiedere di entrare.</p>
          <p class="set-note">Membri: ${g.members.map(m => esc(m.name) + (m.role === 'owner' ? ' (creatore)' : (g.isOwner ? ` <a href="#" data-act="remove" data-g="${g.id}" data-u="${m.id}" title="Rimuovi">✕</a>` : ''))).join(', ')}</p>
          <div class="seg">
            <button class="btn primary" data-act="open" data-g="${g.id}">Apri chat e condivisi ›</button>
            ${g.isOwner ? `<button data-act="rename" data-g="${g.id}" data-n="${esc(g.name)}">Rinomina</button><button data-act="del" data-g="${g.id}" data-n="${esc(g.name)}">Elimina gruppo</button>` : `<button data-act="leave" data-g="${g.id}" data-n="${esc(g.name)}">Esci dal gruppo</button>`}
          </div>
        </div>`).join('') : `<p class="empty">${s.groups.length ? 'Nessun gruppo corrisponde alla ricerca.' : 'Non fai ancora parte di nessun gruppo: creane uno qui sotto oppure entra con un codice.'}</p>`}

      <h2 class="s">Richieste da accettare${inc.length ? ` (${inc.length})` : ''}</h2>
      ${inc.length ? `<div class="lst">${inc.map(r => `
        <div class="set-block">
          <p>${r.type === 'invite' ? `<b>${esc(r.byName)}</b> ti ha invitato nel gruppo <b>${esc(r.groupName)}</b>` : `<b>${esc(r.userName)}</b> chiede di entrare in <b>${esc(r.groupName)}</b>`}</p>
          <div class="seg"><button class="btn primary" data-act="acc" data-r="${r.id}">Accetta</button><button data-act="rej" data-r="${r.id}">Rifiuta</button></div>
        </div>`).join('')}</div>` : '<p class="empty">Nessuna richiesta in attesa.</p>'}
      ${out.length ? `<h3 class="set-note">Inviate da te / in attesa di risposta</h3><div class="lst">${out.map(r => `
        <div class="set-block"><p>${r.type === 'request' ? `Hai chiesto di entrare in <b>${esc(r.groupName)}</b>` : `Hai invitato <b>${esc(r.userName)}</b> in <b>${esc(r.groupName)}</b>`}</p>
        <div class="seg"><button data-act="rej" data-r="${r.id}">Annulla</button></div></div>`).join('')}</div>` : ''}

      <h2 class="s">Crea e invita</h2>
      <div class="set-block">
        <h3>Nuovo gruppo</h3>
        <label class="fl"><span>Nome del gruppo</span><input id="g-new" type="text" maxlength="40" placeholder="Es. Famiglia"></label>
        <button class="btn primary" data-act="create">Crea gruppo</button>
      </div>
      <div class="set-block">
        <h3>Entra con un codice</h3>
        <label class="fl"><span>Codice del gruppo</span><input id="g-code" type="text" maxlength="9" placeholder="Es. K7M2-9QXP" autocomplete="off"></label>
        <button class="btn" data-act="join2">Chiedi di entrare</button>
      </div>
      <div class="set-block">
        <h3>Invita una persona</h3>
        ${mine.length ? `
        <label class="fl"><span>Nel gruppo</span><select id="g-inv-g">${mine.map(g => `<option value="${g.id}" ${g.id === this.inviteTo ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
        <label class="fl"><span>Cerca per nome (almeno 2 lettere)</span><input id="g-user" type="search" placeholder="Nome della persona" autocomplete="off"></label>
        <div class="lst" id="g-found">${this.#foundHtml()}</div>` : '<p class="set-note">Crea prima un gruppo: poi potrai invitare le persone.</p>'}
      </div>`;

    const sel = body.querySelector('#g-inv-g'); if (sel) sel.onchange = () => { this.inviteTo = sel.value; };
    const u = body.querySelector('#g-user');
    if (u) {
      u.value = this.userQ || '';
      u.oninput = () => { this.userQ = u.value; clearTimeout(this.t); this.t = setTimeout(() => this.#search(), 250); };
    }
  }

  #foundHtml() {
    if (!this.userQ || this.userQ.trim().length < 2) return '';
    if (!this.found.length) return '<p class="empty">Nessuna persona trovata con questo nome.</p>';
    return this.found.map(u => `<button class="row" data-act="invite" data-u="${u.id}"><span class="t">${esc(u.displayName)}<small>@${esc(u.username)}</small></span><span class="m">Invita ›</span></button>`).join('');
  }

  async #search() {
    const q = (this.userQ || '').trim();
    try { this.found = q.length >= 2 ? (await this.m.svc.api('/api/users/search?q=' + encodeURIComponent(q))).users : []; } catch { this.found = []; }
    const box = this.el.querySelector('#g-found'); if (box) box.innerHTML = this.#foundHtml();
  }

  #click(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.preventDefault();
    const d = b.dataset, svc = this.m.svc, v = id => this.el.querySelector(id)?.value.trim();
    const post = (path, body) => svc.api(path, { method: 'POST', body });
    switch (d.act) {
      case 'open': return this.m.app.router.goTo('groups/' + d.g);
      case 'create': return this.act(() => post('/api/groups', { name: v('#g-new') }), 'Gruppo creato. Ora puoi invitare le persone.');
      case 'join': return this.act(() => post('/api/groups/join', { code: d.code }), 'Richiesta inviata: il creatore del gruppo deve accettarla.');
      case 'join2': return this.act(() => post('/api/groups/join', { code: v('#g-code') }), 'Richiesta inviata: il creatore del gruppo deve accettarla.');
      case 'acc': return this.act(() => post(`/api/groups/requests/${d.r}/accept`), 'Fatto!');
      case 'rej': return this.act(() => post(`/api/groups/requests/${d.r}/reject`), 'Fatto.');
      case 'invite': return this.act(async () => { const r = await post(`/api/groups/${this.inviteTo}/invite`, { userId: d.u }); this.found = []; this.userQ = ''; return r; }, 'Invito inviato.');
      case 'rename': { const n = prompt('Nuovo nome del gruppo', d.n); if (n) this.act(() => svc.api(`/api/groups/${d.g}`, { method: 'PUT', body: { name: n } }), 'Nome cambiato.'); return; }
      case 'del': if (confirm(`Eliminare il gruppo “${d.n}”? Spariranno per tutti anche gli eventi, avvisi e documenti condivisi in questo gruppo.`)) this.act(() => svc.api(`/api/groups/${d.g}`, { method: 'DELETE' }), 'Gruppo eliminato.'); return;
      case 'leave': if (confirm(`Uscire dal gruppo “${d.n}”?`)) this.act(() => post(`/api/groups/${d.g}/leave`), 'Sei uscito dal gruppo.'); return;
      case 'remove': if (confirm('Rimuovere questa persona dal gruppo?')) this.act(() => post(`/api/groups/${d.g}/remove`, { userId: d.u }), 'Persona rimossa.'); return;
    }
  }
}

export class GroupsModule extends Module {
  constructor({ svc }) { super({ id: 'groups', name: 'Gruppi' }); this.svc = svc; }
  async getView(arg) { return arg ? new GroupDetail(this, arg) : new GroupsView(this); }
}
