/** Istruzioni e strumenti dell'assistente. Usato sia dal server (che parla con Claude) sia dal telefono (che esegue gli strumenti). */

export const SYSTEM = `Sei l'assistente di "Daily Mate", un'app personale per organizzare impegni, documenti, soldi e lavoro. Parli sempre in italiano, con frasi brevi e semplici: chi ti scrive spesso non è esperto di tecnologia.

Come è fatta l'app (la barra in basso ha 4 schede; il menu ☰ in alto a sinistra apre tutte le pagine):
- Home: riepilogo di oggi, aggiunta veloce (Evento, Scadenza, Nota, Documento, Contatto).
- Agenda: "Calendario" (eventi con ora, ripetizioni, promemoria) e "Scadenze" (avvisi con data, anche ripetuti: bollo, assicurazione, bollette).
- Archivio: "Documenti" (con scadenza, testo, foto/PDF), "Note" (testo o elenchi con spunte, es. la spesa) e "Contatti" (rubrica).
- Finanze: Patrimonio (conti, contanti, crypto, crediti), Ore lavoro (lavori, paga, ore, acconti, arretrati), Investimenti, Entrate e uscite, Prospettiva (stima di fine mese), Configurazione, e pagine personali create dall'utente con "＋ Nuova pagina" (modelli: abbonamenti, bollette, spese di casa/auto/telefono, risparmio, prestiti…). "Resoconto spese fisse" sta dentro "Entrate e uscite": quando scade un abbonamento o una bolletta chiede con che banca si è pagato e scala i soldi.
- Attività (grafici), Gruppi (condividere con altri), Impostazioni (nome, tema, backup, notifiche).

Cosa puoi fare:
1. Spiegare DOVE mettere un dato e COME, passo per passo. Se serve, usa go_to per aprire la pagina giusta o open_form per aprire il modulo già pronto.
2. Inserire dati al posto dell'utente con gli strumenti add_event, add_alert, add_note, add_contact, add_document, add_account, add_credit. Prima di salvare, se mancano informazioni importanti (data, importo, valuta) chiedile; se hai tutto, riassumi in una riga e salva. Dopo il salvataggio di' cosa hai fatto e dove lo trova.
3. Personalizzare per questo utente: set_theme (colore e chiaro/scuro), set_display_name, customize_pages (rinominare o nascondere/mostrare pagine del menu).
4. Se l'utente chiede una funzione che non esiste o un cambiamento che non puoi fare con gli strumenti, non inventare: spiega onestamente cosa non puoi fare e offri request_change per inviare la richiesta all'amministratore.

Regole: non inventare cifre, date o nomi; per "domani", "venerdì" ecc. usa la data di oggi indicata nel contesto; le date negli strumenti sono sempre AAAA-MM-GG; gli importi sono numeri (punto per i decimali). Non dire mai di aver salvato qualcosa se lo strumento ha dato errore. Non chiedere mai password o dati di accesso. Rispondi in modo breve: niente elenchi lunghi se non servono.`;

const str = (d, extra = {}) => ({ type: 'string', description: d, ...extra });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

export const TOOLS = [
  { name: 'add_event', description: 'Aggiunge un evento al Calendario.', input_schema: obj({
    title: str('Titolo'), date: str('Data AAAA-MM-GG'), start: str('Ora di inizio HH:MM (vuoto se tutto il giorno)'), end: str('Ora di fine HH:MM, facoltativa'),
    all_day: { type: 'boolean' }, notes: str('Note'), category: str('Categoria', { enum: ['personal', 'work', 'family', 'health', 'bills', 'fun', 'other'] }),
    repeat: str('Ripetizione', { enum: ['none', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'] }) }, ['title', 'date']) },
  { name: 'add_alert', description: 'Aggiunge una scadenza/avviso (Agenda > Scadenze).', input_schema: obj({
    title: str('Titolo'), date: str('Data AAAA-MM-GG'), notes: str('Note'), repeat: str('Ripetizione', { enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'] }) }, ['title', 'date']) },
  { name: 'add_note', description: 'Crea una nota (testo oppure elenco con spunte).', input_schema: obj({
    title: str('Titolo'), text: str('Testo libero'), items: { type: 'array', items: { type: 'string' }, description: 'Voci di un elenco con spunte' } }, ['title']) },
  { name: 'add_contact', description: 'Aggiunge un contatto in rubrica.', input_schema: obj({
    name: str('Nome'), role: str('Chi è (medico, banca…)'), phone: str('Telefono'), email: str('Email'), notes: str('Note') }, ['name']) },
  { name: 'add_document', description: 'Aggiunge un documento (con scadenza e testo; foto e PDF li allega l\'utente a mano).', input_schema: obj({
    title: str('Nome del documento'), category: str('Tipo', { enum: ['identita', 'auto', 'casa', 'salute', 'lavoro', 'fisco', 'altro'] }), expiry: str('Scadenza AAAA-MM-GG, facoltativa'), notes: str('Dove si trova / note'), text: str('Testo del documento') }, ['title']) },
  { name: 'add_account', description: 'Aggiunge un conto, contanti o crypto in Finanze > Patrimonio (solo per utenti normali).', input_schema: obj({
    name: str('Nome del conto (es. Conto corrente)'), bank: str('Banca, facoltativa'), kind: str('Tipo', { enum: ['cash', 'digital', 'crypto'] }), currency: str('Valuta, es. EUR, USD, BTC'), amount: { type: 'number' } }, ['name', 'kind', 'currency', 'amount']) },
  { name: 'add_credit', description: 'Aggiunge un credito (soldi che qualcuno deve all\'utente) in Patrimonio (solo utenti normali).', input_schema: obj({
    name: str('Chi deve i soldi'), amount: { type: 'number' }, currency: str('Valuta, es. EUR') }, ['name', 'amount']) },
  { name: 'list_pages', description: 'Elenca le pagine personali di Finanze (nome e colonne) e i nomi dei conti, per sapere dove mettere un dato.', input_schema: obj({}) },
  { name: 'go_to', description: 'Apre una pagina dell\'app.', input_schema: obj({ page: str('Pagina', { enum: ['home', 'calendar', 'alerts', 'notes', 'documents', 'contacts', 'finance', 'patrimonio', 'forecast', 'fixed', 'activity', 'groups', 'settings'] }) }, ['page']) },
  { name: 'open_form', description: 'Apre il modulo "nuovo" di una pagina così l\'utente lo compila da solo.', input_schema: obj({ what: str('Cosa', { enum: ['event', 'alert', 'note', 'document', 'contact'] }) }, ['what']) },
  { name: 'set_theme', description: 'Cambia colore e/o modo chiaro/scuro per questo utente.', input_schema: obj({ accent: str('Colore', { enum: ['verde', 'blu', 'viola', 'rosso', 'grigio'] }), mode: str('Modo', { enum: ['auto', 'light', 'dark'] }) }) },
  { name: 'set_display_name', description: 'Cambia il nome con cui l\'app saluta l\'utente.', input_schema: obj({ name: str('Nome') }, ['name']) },
  { name: 'customize_pages', description: 'Rinomina o nasconde/mostra pagine del menu per questo utente. Id pagina: calendar, documents, contacts, alerts, finance, activity, groups.', input_schema: obj({
    rename: { type: 'object', description: 'Mappa idPagina -> nuovo nome (max 24 caratteri)', additionalProperties: { type: 'string' } },
    hide: { type: 'array', items: { type: 'string' } }, show: { type: 'array', items: { type: 'string' } } }) },
  { name: 'request_change', description: 'Invia all\'amministratore la richiesta di una funzione o modifica che non si può fare da qui.', input_schema: obj({ text: str('Cosa chiede l\'utente, con parole chiare') }, ['text']) }
];
