/**
 * Modelli pronti per le pagine di Finanze ("＋ Nuova pagina").
 * Ogni modello costruisce una scheda del foglio: le caselle con i CALCOLI sono formule
 * (bloccate: non si toccano, si aggiornano da sole), l'utente inserisce solo i dati.
 *
 * Convenzioni della scheda:
 *   A1            titolo
 *   riga 3        intestazioni dell'elenco, dalla riga 4 le voci
 *   colonne K/L   riquadri: K = etichetta, L = valore (numero inserito oppure formula)
 */

const L = i => String.fromCharCode(65 + i);
const TODAY_M = 'DATE(YEAR(TODAY()),MONTH(TODAY()),1)';
const NEXT_M = 'DATE(YEAR(TODAY()),MONTH(TODAY())+1,1)';
const THIS_Y = 'DATE(YEAR(TODAY()),1,1)';
const NEXT_Y = 'DATE(YEAR(TODAY())+1,1,1)';
const MONEY = '#,##0.00', DATE = 'dd/mm/yyyy';

/** Piccolo costruttore di schede: riquadri (K/L), elenco con intestazioni, barre e suggerimenti. */
class Sheet {
  constructor(name) { this.cells = { A1: name }; this.fmt = {}; this.layout = [{ t: 'hero', ta: 'A1' }]; this.n = 0; this.cols = []; }
  /** Riquadro: ritorna l'indirizzo del valore. */
  box(label, v, f = MONEY) { if (v === 0 || v == null) v = ''; const r = ++this.n; this.cells['K' + r] = label; this.cells['L' + r] = v; if (f !== undefined) this.fmt['L' + r] = f; return 'L' + r; }
  /** Gruppo di riquadri mostrato insieme. `items` = [[etichetta, valore, formato?], ...] */
  group(title, items, big = true) {
    const pairs = items.map(([la, v, f]) => { const a = this.box(la, v, f); return ['K' + a.slice(1), a]; });
    this.layout.push({ t: 'stats', title, items: pairs, big });
    return pairs.map(p => p[1]);
  }
  hint(text) { this.layout.push({ t: 'hint', text }); }
  bars(title, items, max) { this.layout.push({ t: 'bars', title, items, max }); }
  /**
   * Elenco di voci. cols = [{ h: intestazione, f: formato, auto: 'formula con {r}' }]
   * (la prima colonna e' il titolo della voce). Le colonne `auto` si calcolano da sole.
   */
  list({ title, cols, choices, defaults, addLabel, empty }) {
    cols.forEach((c, i) => {
      this.cells[L(i) + '3'] = c.h;
      for (let r = 4; r <= 300; r++) {
        if (c.f) this.fmt[L(i) + r] = c.f;
        if (c.auto) this.cells[L(i) + r] = c.auto.replace(/\{r\}/g, r);
      }
    });
    this.cols = cols.map(c => c.h);
    this.layout.push({ t: 'list', key: 'A', c1: 'A', c2: L(cols.length - 1), r1: 4, r2: 1000, hr: 3, title, choices, defaults, addLabel, empty });
  }
  result(headLabel, headValue) { return { cells: this.cells, fmt: this.fmt, layout: this.layout, cols: this.cols, head: headLabel ? [headLabel, headValue] : null }; }
}

const MONEY_LIST = { h: 'Importo', f: MONEY };

/** Famiglia di modelli "spese": casa, personali, animali, auto. */
function expenses({ id, icon, title, desc, cats, noun, reminder }) {
  return {
    id, icon, group: 'Spese di ogni giorno', title, desc,
    fields: [
      { key: 'budget', label: 'Budget mensile in € (facoltativo)', type: 'text', num: true },
      ...(reminder ? [{ key: 'rem', label: reminder + ' (data, facoltativa)', type: 'date' }] : [])
    ],
    build(p, name) {
      const s = new Sheet(name);
      const bud = s.box('Budget mensile', p.budget ?? 0), rem = reminder ? s.box(reminder, p.rem ?? 0, DATE) : null;
      const sumM = `SUMIFS(B4:B1000,D4:D1000,">="&${TODAY_M},D4:D1000,"<"&${NEXT_M})`;
      const sumY = `SUMIFS(B4:B1000,D4:D1000,">="&${THIS_Y},D4:D1000,"<"&${NEXT_Y})`;
      const mm = 'L' + (s.n + 1);                                    // casella "Questo mese" (la prima del gruppo)
      const items = [
        ['Speso questo mese', '=' + sumM],
        ['Ti resta del budget', `=IF(${bud}>0,${bud}-${mm},"")`],
        ['Speso quest\'anno', '=' + sumY],
        ['Speso in totale', '=SUM(B4:B1000)']
      ];
      if (rem) items.push(['Giorni mancanti', `=IF(${rem}>0,${rem}-TODAY(),"")`, '0']);
      s.group('Situazione', items);
      s.bars('Dove vanno i soldi (in totale)', cats.map(c => { const a = s.box(c, `=SUMIF(C4:C1000,"${c}",B4:B1000)`); return ['K' + a.slice(1), a]; }));
      s.list({
        title: 'Le tue spese', addLabel: '+ Aggiungi una spesa', empty: `Ancora nessuna spesa. Tocca “+ Aggiungi una spesa” per registrare la prima ${noun}.`,
        cols: [{ h: 'Descrizione' }, MONEY_LIST, { h: 'Categoria' }, { h: 'Data', f: DATE }],
        choices: { C: cats }, defaults: { D: '@today' }
      });
      s.layout.push({ t: 'stats', title: 'Impostazioni (tocca per cambiare)', items: [['K1', bud], ...(rem ? [['K2', rem]] : [])], big: false });
      s.hint('Le caselle “Situazione” e “Dove vanno i soldi” si calcolano da sole: tu inserisci solo le spese.');
      return s.result('Speso questo mese', mm);
    }
  };
}

/** Prestiti (te li devono) e debiti (li devi tu): interesse semplice annuo, calcolato dalla data di inizio. */
function loans({ id, icon, title, desc, who, owed }) {
  return {
    id, icon, group: 'Soldi con altre persone', title, desc,
    fields: [],
    build(p, name) {
      const s = new Sheet(name);
      s.group('Situazione', [
        [owed ? 'Da riavere in totale' : 'Da restituire in totale', '=SUM(F4:F1000)'],
        ['Capitale', '=SUM(B4:B1000)'],
        ['Interessi maturati finora', '=SUM(E4:E1000)']
      ]);
      s.list({
        title: owed ? 'Chi ti deve dei soldi' : 'A chi devi dei soldi', addLabel: '+ Aggiungi', empty: `Nessuna voce. Tocca “+ Aggiungi” e scrivi ${who}, la somma, il tasso e la data di inizio.`,
        cols: [{ h: who.charAt(0).toUpperCase() + who.slice(1) }, { h: 'Capitale', f: MONEY }, { h: 'Tasso annuo %', f: '' }, { h: 'Data inizio', f: DATE },
          { h: 'Interessi maturati', f: MONEY, auto: '=IF(D{r}>0,ROUND(B{r}*C{r}/100*MAX(0,TODAY()-D{r})/365,2),0)' },
          { h: owed ? 'Totale da riavere' : 'Totale da restituire', f: MONEY, auto: '=B{r}+E{r}' }],
        defaults: { D: '@today' }
      });
      s.hint('Gli interessi si calcolano da soli (tasso annuo semplice, giorno per giorno dalla data di inizio). Se non c\'è interesse scrivi 0.');
      return s.result(owed ? 'Da riavere in totale' : 'Da restituire in totale', 'L1');
    }
  };
}

export const TEMPLATE_GROUPS = ['Risparmio e piani', 'Spese di ogni giorno', 'Soldi con altre persone', 'Ogni giorno'];

export const TEMPLATES = [
  /* ---------- Risparmio e piani ---------- */
  {
    id: 'savings', icon: '🎯', group: 'Risparmio e piani', title: 'Piano di risparmio',
    desc: 'Scegli un obiettivo e una data: ti dico quanto mettere da parte ogni mese e ogni settimana.',
    fields: [
      { key: 'goal', label: 'Quanto vuoi raggiungere? (€)', type: 'text', num: true },
      { key: 'deadline', label: 'Entro quando? (data)', type: 'date' },
      { key: 'start', label: 'Hai già messo da parte qualcosa? (€, facoltativo)', type: 'text', num: true }
    ],
    build(p, name) {
      const s = new Sheet(name);
      const goal = s.box('Obiettivo', p.goal ?? 0), dl = s.box('Scadenza', p.deadline ?? 0, DATE), st = s.box('Già messi da parte all\'inizio', p.start ?? 0);
      const done = 'L' + (s.n + 1), miss = 'L' + (s.n + 2);
      const g = s.group('Come stai andando', [
        ['Risparmiato', `=${st}+SUM(B4:B1000)`],
        ['Ti manca', `=MAX(0,${goal}-${done})`],
        ['Completato', `=IF(${goal}>0,ROUND(${done}/${goal}*100,0)&"%","—")`, ''],
        ['Mesi rimasti', `=IF(${dl}>TODAY(),ROUND((${dl}-TODAY())/30.4,1),"—")`, ''],
        ['Da mettere da parte al mese', `=IF(${dl}>TODAY(),ROUND(${miss}/MAX(1,(${dl}-TODAY())/30.4),2),${miss})`],
        ['… oppure alla settimana', `=IF(${dl}>TODAY(),ROUND(${miss}/MAX(1,(${dl}-TODAY())/7),2),${miss})`]
      ]);
      s.bars('Verso l\'obiettivo', [['K' + done.slice(1), done]], goal);
      s.list({
        title: 'I tuoi versamenti (per un prelievo scrivi un importo negativo)', addLabel: '+ Aggiungi un versamento', empty: 'Nessun versamento ancora. Tocca “+ Aggiungi un versamento” ogni volta che metti da parte dei soldi.',
        cols: [{ h: 'Nota' }, MONEY_LIST, { h: 'Data', f: DATE }], defaults: { C: '@today' }
      });
      s.layout.push({ t: 'stats', title: 'Il tuo obiettivo (tocca per cambiare)', items: [['K1', goal], ['K2', dl], ['K3', st]], big: false });
      return s.result('Completato', g[2]);
    }
  },
  {
    id: 'plan', icon: '🧮', group: 'Risparmio e piani', title: 'Piano del mese (50/30/20)',
    desc: 'Scrivi quanto guadagni: ti dice quanto spendere per le necessità, i desideri e quanto risparmiare.',
    fields: [{ key: 'net', label: 'Entrate nette del mese (€)', type: 'text', num: true }],
    build(p, name) {
      const s = new Sheet(name);
      const net = s.box('Entrate nette del mese', p.net ?? 0), a = s.box('Necessità (%)', 50, ''), b = s.box('Desideri (%)', 30, ''), c = s.box('Risparmio (%)', 20, '');
      s.group('Come dividere i soldi', [
        ['Necessità: affitto, bollette, spesa', `=ROUND(${net}*${a}/100,2)`],
        ['Desideri: svago, ristoranti, extra', `=ROUND(${net}*${b}/100,2)`],
        ['Da risparmiare', `=ROUND(${net}*${c}/100,2)`],
        ['Risparmio in un anno', `=ROUND(${net}*${c}/100*12,2)`],
        ['Controllo percentuali', `=IF(${a}+${b}+${c}=100,"Tutto ok","Le tre percentuali devono fare 100")`, '']
      ]);
      s.layout.push({ t: 'stats', title: 'Le tue cifre (tocca per cambiare)', items: [['K1', net], ['K2', a], ['K3', b], ['K4', c]], big: false });
      s.hint('La regola 50/30/20 è un punto di partenza: puoi cambiare le percentuali, basta che facciano 100.');
      return s.result('Da risparmiare', 'L7');
    }
  },
  {
    id: 'loan', icon: '🏦', group: 'Risparmio e piani', title: 'Calcolatore rata (mutuo o finanziamento)',
    desc: 'Scrivi importo, tasso e durata: calcola la rata mensile e quanto paghi di interessi.',
    fields: [
      { key: 'amount', label: 'Importo finanziato (€)', type: 'text', num: true },
      { key: 'rate', label: 'Tasso annuo (%)', type: 'text', num: true },
      { key: 'years', label: 'Durata in anni', type: 'text', num: true }
    ],
    build(p, name) {
      const s = new Sheet(name);
      const am = s.box('Importo', p.amount ?? 0), rt = s.box('Tasso annuo %', p.rate ?? 0, ''), yr = s.box('Durata in anni', p.years ?? 0, '');
      const rata = 'L' + (s.n + 1), tot = 'L' + (s.n + 2);
      s.group('Il risultato', [
        ['Rata mensile', `=IF(${am}>0,IF(${rt}=0,ROUND(${am}/(${yr}*12),2),ROUND(${am}*(${rt}/1200)/(1-(1+${rt}/1200)^(-${yr}*12)),2)),"—")`],
        ['Totale da restituire', `=IF(${am}>0,ROUND(${rata}*${yr}*12,2),"—")`],
        ['Interessi in totale', `=ROUND(${tot}-${am},2)`]
      ]);
      s.layout.push({ t: 'stats', title: 'I dati (tocca per cambiare)', items: [['K1', am], ['K2', rt], ['K3', yr]], big: false });
      s.hint('Cambia importo, tasso o anni e il risultato si aggiorna subito. È un calcolo a rata costante (ammortamento alla francese).');
      return s.result('Rata mensile', rata);
    }
  },
  {
    id: 'subs', icon: '🔁', group: 'Risparmio e piani', title: 'Abbonamenti',
    desc: 'Netflix, palestra, telefono… vedi quanto spendi ogni mese e ogni anno.',
    fields: [],
    build(p, name) {
      const s = new Sheet(name);
      const m = 'L1';
      s.group('Quanto spendi', [['Al mese', '=SUM(E4:E1000)'], ['In un anno', `=ROUND(${m}*12,2)`]]);
      s.list({
        title: 'I tuoi abbonamenti', addLabel: '+ Aggiungi un abbonamento', empty: 'Nessun abbonamento. Tocca “+ Aggiungi un abbonamento”.',
        cols: [{ h: 'Servizio' }, MONEY_LIST, { h: 'Ogni quanto' }, { h: 'Prossimo rinnovo', f: DATE },
          { h: 'Costo al mese', f: MONEY, auto: '=IF(C{r}="Anno",ROUND(B{r}/12,2),IF(C{r}="3 mesi",ROUND(B{r}/3,2),IF(C{r}="Settimana",ROUND(B{r}*4.35,2),B{r})))' }],
        choices: { C: ['Mese', '3 mesi', 'Anno', 'Settimana'] }, defaults: { C: 'Mese' }
      });
      s.hint('Il costo al mese e il totale annuo si calcolano da soli.');
      return s.result('Al mese', m);
    }
  },

  /* ---------- Spese di ogni giorno ---------- */
  expenses({ id: 'home', icon: '🏠', title: 'Spese di casa', desc: 'Affitto o mutuo, bollette, spesa, manutenzione: quanto spendi al mese e dove vanno i soldi.', noun: 'spesa di casa', cats: ['Affitto / Mutuo', 'Bollette', 'Spesa', 'Manutenzione', 'Arredamento', 'Tasse', 'Altro'] }),
  expenses({ id: 'personal', icon: '👤', title: 'Spese personali', desc: 'Cibo, trasporti, svago, vestiti, salute: tieni sotto controllo il tuo budget.', noun: 'spesa', cats: ['Cibo e ristoranti', 'Trasporti', 'Svago', 'Abbigliamento', 'Salute', 'Regali', 'Altro'] }),
  expenses({ id: 'pet', icon: '🐾', title: 'Animali', desc: 'Cibo, veterinario, medicine, toelettatura: quanto costa il tuo amico a quattro zampe.', noun: 'spesa', reminder: 'Prossima visita o richiamo', cats: ['Cibo', 'Veterinario', 'Medicine', 'Toelettatura', 'Accessori', 'Altro'] }),
  expenses({ id: 'car', icon: '🚗', title: 'Auto e moto', desc: 'Carburante, assicurazione, bollo, tagliandi: il costo reale del tuo mezzo.', noun: 'spesa', reminder: 'Prossima scadenza (revisione, assicurazione…)', cats: ['Carburante', 'Assicurazione', 'Bollo', 'Manutenzione', 'Parcheggio e pedaggi', 'Altro'] }),
  {
    id: 'bills', icon: '🧾', group: 'Spese di ogni giorno', title: 'Scadenze e bollette',
    desc: 'Cosa devi pagare e quando: vedi subito quanto ti resta da pagare e cosa è già scaduto.',
    fields: [],
    build(p, name) {
      const s = new Sheet(name);
      s.group('Da pagare', [
        ['Ancora da pagare', '=SUMIF(D4:D1000,"Da pagare",B4:B1000)'],
        ['Già scaduto', `=SUMIFS(B4:B1000,D4:D1000,"Da pagare",C4:C1000,"<"&TODAY())`],
        ['Già pagato', '=SUMIF(D4:D1000,"Pagata",B4:B1000)']
      ]);
      s.list({
        title: 'Le tue scadenze', addLabel: '+ Aggiungi una scadenza', empty: 'Nessuna scadenza. Tocca “+ Aggiungi una scadenza”.',
        cols: [{ h: 'Cosa' }, MONEY_LIST, { h: 'Scadenza', f: DATE }, { h: 'Stato' },
          { h: 'Giorni mancanti', f: '0', auto: '=IF(D{r}="Pagata","",IF(C{r}>0,C{r}-TODAY(),""))' }],
        choices: { D: ['Da pagare', 'Pagata'] }, defaults: { D: 'Da pagare' }
      });
      s.hint('Quando paghi, apri la voce e cambia lo stato in “Pagata”: i totali si aggiornano da soli. Giorni mancanti negativi = scaduta.');
      return s.result('Ancora da pagare', 'L1');
    }
  },

  /* ---------- Soldi con altre persone ---------- */
  loans({ id: 'lent', icon: '🤝', title: 'Prestiti che hai fatto', desc: 'Soldi prestati ad altri, con l\'interesse che matura giorno per giorno.', who: 'persona', owed: true }),
  loans({ id: 'owed', icon: '📉', title: 'Debiti da restituire', desc: 'Soldi che devi restituire, con l\'interesse calcolato in automatico.', who: 'a chi', owed: false }),

  /* ---------- Ogni giorno ---------- */
  {
    id: 'shop', icon: '🛒', group: 'Ogni giorno', title: 'Lista della spesa',
    desc: 'Cosa comprare e quanto pensi di spendere. Spunta quello che hai già preso.',
    fields: [],
    build(p, name) {
      const s = new Sheet(name);
      s.group('Quanto spendi', [['Ancora da prendere', '=SUMIF(C4:C1000,"Da prendere",B4:B1000)'], ['Già preso', '=SUMIF(C4:C1000,"Preso",B4:B1000)'], ['Prodotti da prendere', '=COUNTIF(C4:C1000,"Da prendere")', '0']]);
      s.list({
        title: 'Cosa comprare', addLabel: '+ Aggiungi un prodotto', empty: 'La lista è vuota. Tocca “+ Aggiungi un prodotto”.',
        cols: [{ h: 'Prodotto' }, { h: 'Prezzo previsto', f: MONEY }, { h: 'Stato' }],
        choices: { C: ['Da prendere', 'Preso'] }, defaults: { C: 'Da prendere' }
      });
      return s.result('Ancora da prendere', 'L1');
    }
  },
  {
    id: 'weight', icon: '⚖️', group: 'Ogni giorno', title: 'Peso e salute',
    desc: 'Segna il peso ogni tanto e guarda media, minimo e massimo.',
    fields: [],
    build(p, name) {
      const s = new Sheet(name);
      s.group('Il tuo peso (kg)', [['Media', '=IF(COUNT(B4:B1000)>0,ROUND(AVERAGE(B4:B1000),1),"—")', ''], ['Più basso', '=IF(COUNT(B4:B1000)>0,MIN(B4:B1000),"—")', ''], ['Più alto', '=IF(COUNT(B4:B1000)>0,MAX(B4:B1000),"—")', '']]);
      s.list({
        title: 'Le tue pesate', addLabel: '+ Aggiungi una pesata', empty: 'Nessuna pesata. Tocca “+ Aggiungi una pesata”.',
        cols: [{ h: 'Nota' }, { h: 'Peso (kg)', f: '' }, { h: 'Data', f: DATE }], defaults: { C: '@today' }
      });
      return s.result('Media', 'L1');
    }
  }
  ,
  expenses({ id: 'travel', icon: '✈️', title: 'Viaggi e vacanze', desc: 'Voli, alloggio, cibo, escursioni: quanto costa ogni viaggio, passo dopo passo.', noun: 'spesa di viaggio', reminder: 'Data di partenza', cats: ['Trasporti', 'Alloggio', 'Cibo', 'Escursioni', 'Souvenir', 'Altro'] }),
  expenses({ id: 'gifts', icon: '🎁', title: 'Regali e feste', desc: 'Compleanni, Natale, matrimoni: tieni il conto dei regali e delle feste.', noun: 'spesa', reminder: 'Prossima ricorrenza', cats: ['Compleanni', 'Natale', 'Cerimonie', 'Feste', 'Altro'] }),
  expenses({ id: 'health', icon: '🩺', title: 'Salute e farmacia', desc: 'Visite, farmaci, dentista, occhiali: tutte le spese per stare bene.', noun: 'spesa', reminder: 'Prossima visita', cats: ['Visite', 'Farmaci', 'Dentista', 'Occhiali e lenti', 'Analisi', 'Altro'] }),
  expenses({ id: 'kids', icon: '🧒', title: 'Figli e scuola', desc: 'Scuola, libri, sport, babysitter: quanto costano i tuoi figli ogni mese.', noun: 'spesa', reminder: 'Prossima scadenza (retta, iscrizione…)', cats: ['Scuola e libri', 'Sport e attività', 'Abbigliamento', 'Babysitter', 'Salute', 'Altro'] }),
  expenses({ id: 'hobby', icon: '🎨', title: 'Sport e hobby', desc: 'Palestra, attrezzatura, corsi, passioni: quanto investi nel tuo tempo libero.', noun: 'spesa', cats: ['Palestra e corsi', 'Attrezzatura', 'Eventi', 'Materiali', 'Altro'] }),
  expenses({ id: 'tech', icon: '📱', title: 'Telefono, internet e tecnologia', desc: 'Offerte, dispositivi, riparazioni: i costi digitali sotto controllo.', noun: 'spesa', reminder: 'Prossimo rinnovo', cats: ['Telefono', 'Internet', 'Dispositivi', 'Riparazioni', 'Software e app', 'Altro'] }),
  expenses({ id: 'groceries', icon: '🥦', title: 'Spesa alimentare', desc: 'Supermercato, mercato, ordini a domicilio: quanto spendi per mangiare.', noun: 'spesa', cats: ['Supermercato', 'Mercato', 'Ordini a domicilio', 'Ristoranti', 'Altro'] }),
  expenses({ id: 'taxes', icon: '🏛️', title: 'Tasse e documenti', desc: 'Imposte, bolli, pratiche e commercialista: nulla più da dimenticare.', noun: 'spesa', reminder: 'Prossima scadenza fiscale', cats: ['Imposte', 'Bolli e marche', 'Commercialista', 'Pratiche', 'Altro'] })
];

export const templateById = id => TEMPLATES.find(t => t.id === id);
