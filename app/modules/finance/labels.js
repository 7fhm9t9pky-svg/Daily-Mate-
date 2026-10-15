/**
 * Nomi piu' chiari per le schede originali di Finanze: [scheda, cella, testo attuale, testo nuovo].
 * Si cambia solo se la cella contiene esattamente il testo atteso (cosi' non tocca nomi scritti da te).
 */
export const LABELS = [
  // Home banking -> Patrimonio
  [0, 'A4', 'SOMME', 'IL TUO PATRIMONIO'], [0, 'A5', 'Totale', 'Patrimonio totale'],
  [0, 'A10', 'Investibili', 'Soldi da investire'], [0, 'B10', 'Investiti', 'Già investiti'],
  [0, 'C10', "Ritorno sull'Investimento", 'Valore degli investimenti'], [0, 'D10', 'Differenza', 'Guadagno o perdita'],
  [0, 'A14', 'ALTRE BANCHE', 'ALTRI CONTI'], [0, 'A15', 'Capitale Personale:', 'Soldi sugli altri conti'], [0, 'A19', 'Banca Prioritaria', 'Conto principale'],
  [0, 'A24', 'DA VERSARE', 'SOLDI IN ARRIVO'], [0, 'A25', 'Soldi da Parte', 'Messi da parte'], [0, 'B25', 'Lavoro', 'Paga da ricevere'],
  [0, 'A29', 'IN ENTRATA', 'CREDITI (soldi che ti devono)'], [0, 'A30', 'Nome', 'Chi ti deve soldi'], [0, 'B30', 'Credito da Riscuotere', 'Quanto deve darti'], [0, 'C30', 'Totale Credito', 'Totale crediti'],
  [0, 'B43', 'in uscita:', 'Soldi in uscita'],
  // Investimenti in corso
  [2, 'A1', 'TIPO DI INVESTIMENTO', 'Investimento'], [2, 'C1', 'CAPITALE INVESTITO', 'Soldi investiti'], [2, 'D1', 'RITORNO SUL CAPITALE', 'Guadagno sul capitale'],
  [2, 'E1', 'RITORNO NETTO', 'Guadagno netto'], [2, 'F1', 'CONTABILIZZATO', 'Già conteggiato'], [2, 'G1', 'DA CONTABILIZZARE', 'Da conteggiare'],
  [2, 'H1', 'NETTO RISCOSSO', 'Netto incassato'], [2, 'I1', 'NOTE', 'Note'], [2, 'J1', 'TOT DA CONTABILIZZARE', 'Totale da conteggiare'],
  [2, 'K1', 'ANDAMENTO %', 'Andamento %'], [2, 'L1', 'ANDAMENTO', 'Andamento'], [2, 'M1', 'Tot. investito', 'Totale investito'],
  [2, 'L4', 'Valore portafogli', 'Valore del portafoglio'], [2, 'J5', 'RITORNO TOT SU INVESTIMENTI', 'Guadagno totale sugli investimenti'],
  [2, 'J8', 'RITORNO LORDO', 'Guadagno lordo'], [2, 'J12', 'RITORNO NETTO', 'Guadagno netto'],
  // PIM azionario
  [3, 'H1', 'Storico Ordini', 'Operazioni passate'], [3, 'I1', 'Numero Quote', 'Numero di quote'], [3, 'L1', 'TOT transazione', 'Totale operazione'],
  [3, 'M1', 'Utile', 'Guadagno'], [3, 'N1', 'Imposte', 'Tasse'], [3, 'P1', 'Imposte Dividendi', 'Tasse sui dividendi'],
  // Patrimonio nel tempo (ex Amministrazione)
  [4, 'D1', 'Annuale', 'Patrimonio anno per anno'], [4, 'D27', 'Mensile', 'Patrimonio mese per mese'],
  // Entrate e uscite
  [5, 'A1', 'ANNUALE', 'ANNO PER ANNO'], [5, 'A20', 'MENSILE', 'MESE PER MESE'],
  [5, 'D1', 'Tot Entrate', 'Totale entrate'], [5, 'G1', 'Tot Uscite', 'Totale uscite'], [5, 'I1', 'Guadagno Giornaliero', 'Guadagno al giorno'],
  [5, 'D20', 'Tot Entrate', 'Totale entrate'], [5, 'G20', 'Tot Uscite', 'Totale uscite'],
  ...['A24:marzo:Marzo', 'A25:aprile:Aprile', 'A26:maggio:Maggio', 'A27:giugno:Giugno', 'A28:luglio:Luglio', 'A29:agosto:Agosto', 'A30:settembre:Settembre', 'A31:ottobre:Ottobre', 'A32:novembre:Novembre', 'A33:dicembre:Dicembre'].map(x => { const [a, o, n] = x.split(':'); return [5, a, o, n]; }),
  // Risparmi
  [8, 'A1', 'Valore', 'Somma messa da parte'], [8, 'B1', 'Percentuale', 'Interesse %'], [8, 'C1', 'Data di Inizio', 'Data di inizio'],
  [8, 'D1', 'Interesse', 'Interessi maturati'], [8, 'F1', 'Tot+Risparmi', 'Totale con interessi']
];

/** Spiegazione di una riga sotto il titolo di ogni pagina originale. */
export const SHEET_HELP = {
  0: 'Quanto possiedi in tutto, quanto puoi investire e quanti soldi ti devono.',
  2: 'Gli investimenti che hai in corso: quanto hai messo e come stanno andando.',
  4: 'Come cresce il tuo patrimonio: anno per anno, mese per mese e settimana per settimana.',
  5: 'Quanto entra e quanto esce, anno per anno e mese per mese, e quanto ti resta.',
  8: 'Soldi messi da parte con un interesse: quanto hai risparmiato e quanto matura.'
};

export function applyLabels(sheets) {
  for (const [i, a, old, nw] of LABELS) {
    const c = sheets[i]?.cells;
    if (c && typeof c[a] === 'string' && c[a].trim() === old.trim()) c[a] = nw;
  }
}
