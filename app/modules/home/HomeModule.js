import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { MES } from '../finance/LavoroBook.js';
import { fmtShort, relative, todayIso } from '../../core/dates.js';
import { eur, pct } from '../../core/format.js';
import { spark } from '../../ui/charts.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Home: saluto + un quadretto per Calendario, Avvisi e Finanze, i grafici
 * (Attività) e i punteggi del mese. Ogni quadretto apre la sua pagina.
 */
class HomeView extends Component {
  constructor(module) { super(); this.m = module; this.month = new Date().getMonth(); }

  render() {
    const el = document.createElement('section');
    el.className = 'page home';
    const app = this.m.app, name = app.displayName(), welcome = app.ui?.welcome || '';
    const show = id => !app.isHidden(id), nm = (id, d) => app.ui?.labels?.[id] || d;
    el.innerHTML = `
      <div class="hero"><h1>Ciao${name ? ' ' + esc(name) : ''}</h1>${welcome ? `<p>${esc(welcome)}</p>` : ''}</div>
      <div class="quick">${[['calendar', 'calendar', 'Evento', '📅'], ['alerts', 'alerts', 'Scadenza', '⏰'], ['notes', 'alerts/notes', 'Nota', '📝'], ['documents', 'documents', 'Documento', '📄'], ['contacts', 'contacts', 'Contatto', '👤']].filter(([, path]) => show(path.split('/')[0])).map(([k, path, l, ic]) => `<button data-q="${k}" data-path="${path}"><i>${ic}</i><span>${l}</span></button>`).join('')}</div>
      <div class="home-grid">
        ${show('calendar') ? `<button class="big-tile" data-go="calendar"><h3>${esc(nm('calendar', 'Calendario'))}</h3><div class="bits" id="h-cal"></div></button>` : ''}
        ${show('alerts') ? `<button class="big-tile" data-go="alerts"><h3>${esc(nm('alerts', 'Avvisi'))}</h3><div class="bits" id="h-alerts"></div></button>` : ''}
        ${show('finance') ? `<button class="big-tile accent" data-go="finance"><h3>${esc(nm('finance', 'Finanze'))}</h3><div id="h-fin"></div></button>` : ''}
      </div>
      ${show('finance') ? `<button class="big-tile fc-home" data-go="finance/forecast" hidden><h3>Prospettiva di fine mese</h3><div id="h-fc"></div></button>` : ''}
      ${show('activity') ? `<div class="sec-head"><h2 class="s">${esc(nm('activity', 'Attività'))}</h2><button class="link" data-go="activity">Vedi tutto ›</button></div>
      <div class="mini-grid" id="h-mini"></div>` : ''}
      ${show('finance') ? `<h2 class="s">Come va questo mese</h2>
      <div class="score" id="h-score"></div>` : ''}`;
    el.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => this.m.app.router.goTo(b.dataset.go); });
    el.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => this.m.app.quickAdd(b.dataset.q, b.dataset.path); });
    el.querySelector('#h-score')?.addEventListener('click', e => {
      const d = e.target.closest('[data-m]')?.dataset.m;
      if (d) { this.month = (this.month + Number(d) + 12) % 12; this.#drawMonth(); }
    });
    return el;
  }

  async afterMount() {
    this.#drawCalendar(); this.#drawAlerts(); this.#drawForecast();
    await this.#drawMonth();
  }

  async #drawCalendar() {
    const cal = this.m.app.registry.get('calendar');
    const box = this.el.querySelector('#h-cal');
    const evs = cal ? await cal.eventsOn(todayIso()) : [];
    if (!evs.length) { box.innerHTML = '<div class="sub">Nessun evento oggi</div>'; return; }
    box.innerHTML = evs.slice(0, 3).map(e => `<div class="bit"><span>${esc(e.title)}</span><em>${e.allDay ? "tutto il giorno" : "ore " + e.start}</em></div>`).join('')
      + (evs.length > 3 ? `<div class="sub">+ altri ${evs.length - 3}</div>` : '')
      + (evs[0].notes ? `<div class="sub">${esc(evs[0].notes.slice(0, 60))}</div>` : '');
  }

  async #drawForecast() {
    const box = this.el.querySelector('#h-fc'), fin = this.m.app.registry.get('finance'); if (!box || !fin) return;
    const F = await fin.getForecast(); if (!F || (F.usualDaily == null && !F.sure?.length)) return;
    box.innerHTML = `<div class="sub">Stima a fine ${esc(F.month)}</div><div class="v">${eur(F.endMonth)}</div>`;
    box.closest('.fc-home').hidden = false;
  }

  async #drawAlerts() {
    const al = this.m.app.registry.get('alerts');
    const box = this.el.querySelector('#h-alerts');
    const list = al ? await al.upcoming(3) : [];
    if (!list.length) { box.innerHTML = '<div class="sub">Nessun avviso in arrivo</div>'; return; }
    box.innerHTML = list.map(a => `<div class="bit"><span>${esc(a.title)}</span><em>${fmtShort(a.date).slice(0, 6)}${a.date.slice(2, 4)} · ${relative(a.date)}</em></div>`).join('');
  }

  async #drawMonth() {
    const fin = this.m.app.registry.get('finance');
    const d = fin ? await fin.getHomeData(this.month) : null;
    const mese = MES[this.month][0].toUpperCase() + MES[this.month].slice(1);
    const fbox = this.el.querySelector('#h-fin');
    if (fbox) { if (!d) fbox.innerHTML = '<div class="sub">Dati non disponibili</div>';
    else fbox.innerHTML = `<div class="sub">Patrimonio totale</div><div class="v">${eur(d.patrimonio)}</div>
      <div class="sub">Andamento investimenti: ${pct(d.investPct)}</div>`; }

    const act = this.m.app.registry.get('activity'), mini = this.el.querySelector('#h-mini');
    const cards = act && mini ? await act.getCards(8) : [];
    if (mini) mini.innerHTML = cards.map(c =>
      `<div class="mini" data-go="activity"><small>${esc(c.shortTitle)}</small><b>${c.value}</b>${spark(c.points.map(p => p.v))}</div>`).join('')
      || '<div class="sub">Nessun grafico: aggiungilo dalla pagina Attività</div>';
    this.el.querySelectorAll('.mini[data-go]').forEach(b => { b.onclick = () => this.m.app.router.goTo('activity'); });

    const sc = d?.scores || {};
    // per le uscite scendere e' un bene: il colore segue "meglio/peggio", la freccia il segno
    const row = (label, v, goodWhenUp) => {
      const arrow = v == null || !isFinite(v) ? '–' : v >= 0 ? '▲' : '▼';
      const good = v == null || v === 0 ? '' : ((v > 0) === goodWhenUp ? 'up' : 'down');
      return `<div class="score-row"><span class="arrow ${good}">${arrow}</span><span class="lbl">${label}</span><b>${pct(v)}</b></div>`;
    };
    const scoreBox = this.el.querySelector('#h-score');
    if (scoreBox) scoreBox.innerHTML = `
      <div class="score-head"><button data-m="-1" aria-label="Mese precedente">‹</button><b>${mese}</b><button data-m="1" aria-label="Mese successivo">›</button></div>
      ${row('Risparmiato sulle entrate', sc.risparmio, true)}${row('Patrimonio rispetto al mese prima', sc.patrimonio, true)}${row('Uscite rispetto al mese prima', sc.uscite, false)}`;
  }
}

export class HomeModule extends Module {
  constructor() { super({ id: 'home', name: 'Home' }); }
  async getView() { return new HomeView(this); }
}
