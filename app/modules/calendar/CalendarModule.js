import { Module } from '../Module.js';
import { Component } from '../../ui/Component.js';
import { FormModal } from '../../ui/FormModal.js';
import { SharedRepository } from '../../core/GroupService.js';
import { CalendarEvent } from './CalendarEvent.js';
import { addDays, fmtLong, minToTime, timeToMin, todayIso } from '../../core/dates.js';

const HH = 56; // altezza in pixel di un'ora
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Vista "giornata": le 24 ore in colonna, gli eventi come blocchi che occupano le loro ore. */
class DayView extends Component {
  constructor(module) { super(); this.m = module; this.date = todayIso(); }

  render() {
    const el = document.createElement('section');
    el.className = 'page';
    el.innerHTML = `
      <div class="cal-nav">
        <button data-act="prev" aria-label="Giorno precedente">‹</button>
        <h1 data-act="pick"></h1>
        <button class="today" data-act="today">Oggi</button>
        <button data-act="next" aria-label="Giorno successivo">›</button>
      </div>
      <div class="day" style="--hh:${HH}px">
        ${Array.from({ length: 24 }, (_, h) => `<div class="day-hour" data-h="${h}"><div class="lbl">${String(h).padStart(2, '0')}:00</div><div class="slot"></div></div>`).join('')}
        <div class="day-events"></div>
      </div>
      <button class="fab" data-act="add" aria-label="Nuovo evento">+</button>
      <input type="date" class="pick-date" hidden>`;
    this.titleEl = el.querySelector('h1');
    this.eventsEl = el.querySelector('.day-events');
    this.dayEl = el.querySelector('.day');
    this.picker = el.querySelector('.pick-date');
    el.addEventListener('click', e => this.#onClick(e));
    this.picker.addEventListener('change', () => { if (this.picker.value) { this.date = this.picker.value; this.draw(true); } });
    return el;
  }

  async afterMount() { await this.draw(true); }
  destroy() { this.el?.querySelector('.fab')?.remove(); super.destroy(); }

  #onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'prev') { this.date = addDays(this.date, -1); return this.draw(true); }
    if (act === 'next') { this.date = addDays(this.date, 1); return this.draw(true); }
    if (act === 'today') { this.date = todayIso(); return this.draw(true); }
    if (act === 'pick') { this.picker.value = this.date; this.picker.hidden = false; try { this.picker.showPicker(); } catch { this.picker.focus(); } return; }
    if (act === 'add') {
      const now = new Date(), h = this.date === todayIso() ? Math.min(now.getHours() + 1, 23) : 9;
      return this.openForm(null, h);
    }
    const ev = e.target.closest('.ev');
    if (ev) return this.openForm(this.items.find(x => x.id === ev.dataset.id));
    const hour = e.target.closest('.day-hour');
    if (hour) this.openForm(null, +hour.dataset.h);
  }

  async draw(scroll = false) {
    this.titleEl.textContent = fmtLong(this.date);
    this.picker.hidden = true;
    this.items = (await this.m.repo.query(e => e.date === this.date)).sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

    // eventi sovrapposti: affiancati in "corsie" dentro ogni gruppo
    const evs = this.items.map(e => { const s = timeToMin(e.start); return { e, s, t: Math.min(Math.max(timeToMin(e.end), s + 30), 1440), lane: 0, n: 1 }; });
    let group = [], groupEnd = -1;
    const close = () => { const n = Math.max(1, ...group.map(g => g.lane + 1)); group.forEach(g => g.n = n); group = []; };
    for (const ev of evs) {
      if (ev.s >= groupEnd) { close(); groupEnd = -1; }
      const used = new Set(group.filter(g => g.t > ev.s).map(g => g.lane));
      while (used.has(ev.lane)) ev.lane++;
      group.push(ev); groupEnd = Math.max(groupEnd, ev.t);
    }
    close();

    this.eventsEl.innerHTML = evs.map(({ e, s, t, lane, n }) => `
      <div class="ev" data-id="${e.id}" style="top:${s / 60 * HH + 1}px;height:${Math.max((t - s) / 60 * HH - 2, 24)}px;left:calc(${lane} * 100% / ${n} + 4px);width:calc(100% / ${n} - 8px)">
        ${esc(e.title) || 'Evento'}<small>${e.groupName ? '👥 ' + esc(e.groupName) + ' · ' : ''}${e.start}${e.end ? ' – ' + e.end : ''}${e.notes ? ' · ' + esc(e.notes.slice(0, 40)) : ''}</small>
      </div>`).join('');

    this.dayEl.querySelectorAll('.now-line').forEach(n => n.remove());
    const now = new Date(), isToday = this.date === todayIso();
    this.dayEl.querySelectorAll('.day-hour').forEach(r => r.classList.toggle('now', isToday && +r.dataset.h === now.getHours()));
    if (isToday) {
      const line = document.createElement('div');
      line.className = 'now-line';
      line.style.top = ((now.getHours() * 60 + now.getMinutes()) / 60 * HH) + 'px';
      this.dayEl.appendChild(line);
    }
    if (scroll) {
      const sc = this.el.closest('.app-main');
      const target = evs.length ? evs[0].s / 60 : isToday ? Math.max(now.getHours() - 1, 0) : 7;
      if (sc) sc.scrollTop = Math.max(target * HH - 40, 0);
    }
  }

  async openForm(item, hour = 9) {
    const startDefault = minToTime(hour * 60), endDefault = minToTime(Math.min(hour * 60 + 60, 1439));
    if (item && !item.canEdit) { alert('Questo evento è stato creato da un altro membro del gruppo: solo lui (o il creatore del gruppo) può modificarlo.'); return; }
    const share = await this.m.groups.shareField();
    const result = await FormModal.open({
      title: item ? 'Modifica evento' : 'Nuovo evento',
      fields: [
        { key: 'title', label: 'Titolo', type: 'text' },
        { key: 'date', label: 'Giorno', type: 'date' },
        { key: 'start', label: 'Inizio', type: 'time' },
        { key: 'end', label: 'Fine', type: 'time' },
        { key: 'notes', label: 'Note', type: 'textarea' },
        ...(share ? [share] : [])
      ],
      values: item ? { ...item } : { date: this.date, start: startDefault, end: endDefault },
      allowDelete: !!item
    });
    if (!result) return;
    if (result.__delete) await this.m.repo.delete(item.id);
    else {
      const ev = new CalendarEvent({ ...(item || {}), ...result });
      if (!ev.title.trim()) ev.title = 'Evento';
      if (!ev.date) ev.date = this.date;
      if (!ev.end || timeToMin(ev.end) <= timeToMin(ev.start)) ev.end = minToTime(Math.min(timeToMin(ev.start) + 60, 1439));
      await this.m.repo.save(ev);
      this.date = ev.date;
    }
    await this.draw();
  }
}

/** Calendario: la giornata a ore (data scorrevole con ‹ ›). */
export class CalendarModule extends Module {
  constructor({ storage, groups }) {
    super({ id: 'calendar', name: 'Calendario' });
    this.groups = groups;
    this.repo = new SharedRepository(storage, 'events', CalendarEvent, groups);
  }

  async getView() { this.repo.invalidate(); return new DayView(this); }

  /** Eventi di un giorno, in ordine di orario (usato dalla Home). */
  async eventsOn(iso) {
    return (await this.repo.query(e => e.date === iso)).sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  }
}
