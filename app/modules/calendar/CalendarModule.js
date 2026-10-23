import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { SharedRepository } from '../../core/GroupService.js';
import { CalendarEvent, CATEGORIES, COLORS, REMINDERS, colorOf } from './CalendarEvent.js';
import { REPEATS, expand } from './recurrence.js';
import { addDays, fmtLong, fmtShort, fromIso, minToTime, timeToMin, todayIso, toIso } from '../../core/dates.js';

const HH = 56; // altezza in pixel di un'ora
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const mondayOf = iso => { const d = fromIso(iso), w = (d.getDay() + 6) % 7; return addDays(iso, -w); };
const byTime = (a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || timeToMin(a.start) - timeToMin(b.start);
const timeLabel = e => e.allDay ? 'Tutto il giorno' : `${e.start}${e.end ? ' – ' + e.end : ''}`;

/** Calendario con tre viste: giornata a ore, settimana (elenco dei 7 giorni) e mese (griglia con i colori). */
class CalendarView extends Component {
  constructor(module) { super(); this.m = module; this.date = todayIso(); this.mode = 'month'; }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    el.innerHTML = `
      <div class="cal-nav">
        <button data-act="prev" aria-label="Indietro">‹</button>
        <h1 data-act="pick"></h1>
        <button class="today" data-act="today">Oggi</button>
        <button data-act="next" aria-label="Avanti">›</button>
      </div>
      <div class="cal-tabs"><button data-mode="day">Giorno</button><button data-mode="week">Settimana</button><button data-mode="month">Mese</button></div>
      <div class="cal-legend"></div>
      <div class="cal-body"></div>
      <button class="fab" data-act="add" aria-label="Nuovo evento">+</button>
      <input type="date" class="pick-date" hidden>`;
    this.titleEl = el.querySelector('h1');
    this.body = el.querySelector('.cal-body');
    this.picker = el.querySelector('.pick-date');
    el.addEventListener('click', e => this.#onClick(e));
    this.picker.addEventListener('change', () => { if (this.picker.value) { this.date = this.picker.value; this.draw(true); } });
    return el;
  }

  async afterMount() { await this.draw(true); if (this.m.app?.consumeQuick?.('calendar')) this.openForm(null, Math.min(new Date().getHours() + 1, 23), this.date); }
  destroy() { this.el?.querySelector('.fab')?.remove(); super.destroy(); }

  #step(dir) {
    if (this.mode === 'day') this.date = addDays(this.date, dir);
    else if (this.mode === 'week') this.date = addDays(this.date, 7 * dir);
    else { const d = fromIso(this.date); d.setDate(1); d.setMonth(d.getMonth() + dir); this.date = toIso(d); }
    return this.draw(true);
  }

  #onClick(e) {
    const t = e.target, act = t.closest('[data-act]')?.dataset.act;
    const md = t.closest('[data-mode]'); if (md) { this.mode = md.dataset.mode; return this.draw(true); }
    if (act === 'prev') return this.#step(-1);
    if (act === 'next') return this.#step(1);
    if (act === 'today') { this.date = todayIso(); return this.draw(true); }
    if (act === 'pick') { this.picker.value = this.date; this.picker.hidden = false; try { this.picker.showPicker(); } catch { this.picker.focus(); } return; }
    if (act === 'add') {
      const now = new Date(), h = this.date === todayIso() ? Math.min(now.getHours() + 1, 23) : 9;
      return this.openForm(null, h, this.date);
    }
    const goDay = t.closest('[data-goday]'); if (goDay) { this.date = goDay.dataset.goday; this.mode = 'day'; return this.draw(true); }
    const addOn = t.closest('[data-addon]'); if (addOn) return this.openForm(null, 9, addOn.dataset.addon);
    const ev = t.closest('[data-id]');
    if (ev) return this.openForm(this.all.find(x => x.id === ev.dataset.id), 9, ev.dataset.occ);
    const hour = t.closest('.day-hour');
    if (hour) this.openForm(null, +hour.dataset.h, this.date);
  }

  /** Eventi (con ripetizioni) tra due date, ognuno con il suo giorno. */
  async #range(from, to) {
    this.all = await this.m.repo.getAll();
    return expand(this.all, from, to).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  }

  async draw(scroll = false) {
    this.picker.hidden = true;
    this.el.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === this.mode));
    if (this.mode === 'day') await this.#drawDay(scroll);
    else if (this.mode === 'week') await this.#drawWeek();
    else await this.#drawMonth();
    this.#legend();
  }

  #legend() {
    const used = new Set((this.visible || []).map(e => e.category));
    this.el.querySelector('.cal-legend').innerHTML = [...used].filter(c => CATEGORIES[c]).map(c => `<span><i style="background:${CATEGORIES[c].color}"></i>${CATEGORIES[c].name}</span>`).join('');
  }

  // ---------------- vista GIORNO
  async #drawDay(scroll) {
    this.titleEl.textContent = fmtLong(this.date);
    this.visible = await this.#range(this.date, this.date);
    const all = this.visible, timed = all.filter(e => !e.allDay), strip = all.filter(e => e.allDay);
    const evs = timed.map(e => { const s = timeToMin(e.start); return { e, s, t: Math.min(Math.max(timeToMin(e.end), s + 30), 1440), lane: 0, n: 1 }; });
    let group = [], groupEnd = -1;
    const close = () => { const n = Math.max(1, ...group.map(g => g.lane + 1)); group.forEach(g => g.n = n); group = []; };
    for (const ev of evs) {
      if (ev.s >= groupEnd) { close(); groupEnd = -1; }
      const used = new Set(group.filter(g => g.t > ev.s).map(g => g.lane));
      while (used.has(ev.lane)) ev.lane++;
      group.push(ev); groupEnd = Math.max(groupEnd, ev.t);
    }
    close();
    const rep = e => e.repeat !== 'none' ? '🔁 ' : '';
    this.body.innerHTML = `${strip.length ? `<div class="allday">${strip.map(e => `<button class="chip-ev" data-id="${e.id}" data-occ="${e.date}" style="background:${colorOf(e)}">${rep(e)}${esc(e.title) || 'Evento'}</button>`).join('')}</div>` : ''}
      <div class="day" style="--hh:${HH}px">
        ${Array.from({ length: 24 }, (_, h) => `<div class="day-hour" data-h="${h}"><div class="lbl">${String(h).padStart(2, '0')}:00</div><div class="slot"></div></div>`).join('')}
        <div class="day-events">${evs.map(({ e, s, t, lane, n }) => `
          <div class="ev" data-id="${e.id}" data-occ="${e.date}" style="background:${colorOf(e)};top:${s / 60 * HH + 1}px;height:${Math.max((t - s) / 60 * HH - 2, 24)}px;left:calc(${lane} * 100% / ${n} + 4px);width:calc(100% / ${n} - 8px)">
            ${rep(e)}${esc(e.title) || 'Evento'}<small>${e.groupName ? '👥 ' + esc(e.groupName) + ' · ' : ''}${e.start}${e.end ? ' – ' + e.end : ''}${e.notes ? ' · ' + esc(e.notes.slice(0, 40)) : ''}</small>
          </div>`).join('')}</div>
      </div>`;
    const dayEl = this.body.querySelector('.day'), now = new Date(), isToday = this.date === todayIso();
    dayEl.querySelectorAll('.day-hour').forEach(r => r.classList.toggle('now', isToday && +r.dataset.h === now.getHours()));
    if (isToday) {
      const line = document.createElement('div');
      line.className = 'now-line';
      line.style.top = ((now.getHours() * 60 + now.getMinutes()) / 60 * HH) + 'px';
      dayEl.appendChild(line);
    }
    if (scroll) {
      const sc = this.el.closest('.app-main');
      if (sc) {
        if (isToday) { const line = dayEl.querySelector('.now-line'); sc.scrollTop = Math.max(dayEl.offsetTop + line.offsetTop - 160, 0); }   // oggi: si apre sulla barra rossa (ora corrente)
        else sc.scrollTop = Math.max((evs.length ? evs[0].s / 60 : 7) * HH - 40, 0);
      }
    }
  }

  // ---------------- vista SETTIMANA
  async #drawWeek() {
    const mon = mondayOf(this.date), sun = addDays(mon, 6), a = fromIso(mon), b = fromIso(sun);
    this.titleEl.textContent = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MESI[b.getMonth()]}` : `${a.getDate()} ${MESI[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MESI[b.getMonth()].slice(0, 3)}`;
    this.visible = await this.#range(mon, sun);
    const today = todayIso();
    this.body.innerHTML = '<div class="wk">' + Array.from({ length: 7 }, (_, k) => {
      const iso = addDays(mon, k), d = fromIso(iso), list = this.visible.filter(e => e.date === iso);
      return `<div class="wk-day${iso === today ? ' today' : ''}${iso === this.date ? ' sel' : ''}">
        <button class="wk-h" data-goday="${iso}"><b>${GIORNI[k]}</b><span>${d.getDate()}</span></button>
        <div class="wk-l">${list.map(e => `<button class="wk-e" data-id="${e.id}" data-occ="${e.date}" style="border-left-color:${colorOf(e)}"><small>${timeLabel(e)}</small>${e.repeat !== 'none' ? '🔁 ' : ''}${esc(e.title) || 'Evento'}</button>`).join('') || '<span class="wk-n">Libero</span>'}</div>
        <button class="wk-a" data-addon="${iso}" aria-label="Aggiungi un evento">+</button></div>`;
    }).join('') + '</div>';
  }

  // ---------------- vista MESE
  async #drawMonth() {
    const d = fromIso(this.date), y = d.getFullYear(), mth = d.getMonth();
    this.titleEl.textContent = `${MESI[mth]} ${y}`;
    const first = toIso(new Date(y, mth, 1)), start = mondayOf(first), last = toIso(new Date(y, mth + 1, 0)), end = addDays(mondayOf(last), 6);
    this.visible = await this.#range(start, end);
    const today = todayIso(), cells = [];
    for (let iso = start; iso <= end; iso = addDays(iso, 1)) {
      const list = this.visible.filter(e => e.date === iso), out = fromIso(iso).getMonth() !== mth;
      cells.push(`<button class="mo-c${out ? ' out' : ''}${iso === today ? ' today' : ''}${iso === this.date ? ' sel' : ''}" data-goday="${iso}"><b>${fromIso(iso).getDate()}</b>
        ${list.slice(0, 3).map(e => `<span class="mo-e" style="background:${colorOf(e)}">${esc(e.title) || 'Evento'}</span>`).join('')}${list.length > 3 ? `<em>+${list.length - 3}</em>` : ''}</button>`);
    }
    this.body.innerHTML = `<div class="mo"><div class="mo-h">${GIORNI.map(g => `<span>${g}</span>`).join('')}</div><div class="mo-g">${cells.join('')}</div></div>
      <p class="set-note">Tocca un giorno per aprirlo.</p>`;
  }

  // ---------------- creazione / modifica
  async openForm(item, hour = 9, occ = '') {
    const day = occ || this.date, startDefault = minToTime(hour * 60), endDefault = minToTime(Math.min(hour * 60 + 60, 1439));
    if (item && !item.canEdit) { alert('Questo evento è stato creato da un altro membro del gruppo: solo lui (o il creatore del gruppo) può modificarlo.'); return; }
    const share = await this.m.groups.shareField();
    const rep = item && item.repeat !== 'none';
    const result = await FormModal.open({
      title: item ? (rep ? 'Modifica evento (si ripete)' : 'Modifica evento') : 'Nuovo evento',
      fields: [
        { key: 'title', label: 'Titolo', type: 'text' },
        { key: 'category', label: 'Categoria', type: 'select', options: Object.entries(CATEGORIES).map(([v, c]) => ({ value: v, label: `${c.icon} ${c.name}` })) },
        { key: 'date', label: rep ? 'Primo giorno (da qui si ripete)' : 'Giorno', type: 'date' },
        { key: 'when', label: 'Durata', type: 'select', options: [{ value: 'time', label: 'A un orario preciso' }, { value: 'all', label: 'Tutto il giorno' }] },
        { key: 'start', label: 'Inizio', type: 'time', showIf: { field: 'when', value: 'time' } },
        { key: 'end', label: 'Fine', type: 'time', showIf: { field: 'when', value: 'time' } },
        { key: 'repeat', label: 'Si ripete?', type: 'select', options: REPEATS.map(([value, label]) => ({ value, label })) },
        { key: 'until', label: 'Ripeti fino al (facoltativo, lascia vuoto per sempre)', type: 'date' },
        { key: 'remind', label: 'Promemoria (notifica)', type: 'select', options: REMINDERS.map(([value, label]) => ({ value, label })) },
        { key: 'color', label: 'Colore', type: 'select', options: Object.entries(COLORS).map(([value, label]) => ({ value, label })) },
        { key: 'notes', label: 'Note', type: 'textarea' },
        ...(share ? [share] : [])
      ],
      values: item ? { ...item, when: item.allDay ? 'all' : 'time' } : { date: day, when: 'time', start: startDefault, end: endDefault, category: 'personal', repeat: 'none', until: '', remind: '', color: '' },
      allowDelete: !!item
    });
    if (!result) return;
    if (result.__delete) {
      if (item.repeat !== 'none' && occ) {
        const only = confirm(`Questo evento si ripete.\n\nOK = elimina solo il giorno ${fmtShort(occ)}\nAnnulla = elimina tutte le ripetizioni`);
        if (only) { item.skip = [...(item.skip || []), occ]; await this.m.repo.save(item); }
        else await this.m.repo.delete(item.id);
      } else await this.m.repo.delete(item.id);
    } else {
      const { when, ...rest } = result;
      const ev = new CalendarEvent({ ...(item || {}), ...rest, allDay: when === 'all' });
      if (!ev.title.trim()) ev.title = 'Evento';
      if (!ev.date) ev.date = day;
      if (ev.repeat === 'none') { ev.until = ''; ev.skip = []; }
      if (!ev.allDay && (!ev.end || timeToMin(ev.end) <= timeToMin(ev.start))) ev.end = minToTime(Math.min(timeToMin(ev.start) + 60, 1439));
      await this.m.repo.save(ev);
      if (ev.repeat === 'none') this.date = ev.date;
    }
    await this.draw();
  }
}

/** Calendario: giorno, settimana e mese, con eventi ripetuti, categorie a colori e promemoria. */
export class CalendarModule extends Module {
  constructor({ storage, groups }) {
    super({ id: 'calendar', name: 'Calendario' });
    this.groups = groups;
    this.repo = new SharedRepository(storage, 'events', CalendarEvent, groups);
  }

  async getView() { this.repo.invalidate(); return new CalendarView(this); }

  /** Eventi di un giorno, in ordine di orario, ripetizioni comprese (usato dalla Home). */
  async eventsOn(iso) {
    return expand(await this.repo.getAll(), iso, iso).sort(byTime);
  }
}
