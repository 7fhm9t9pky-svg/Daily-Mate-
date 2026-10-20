# Daily Mate — versione online multi-utente

Stessa app dello scaffold locale, ma con un piccolo backend che aggiunge:

- **Login/registrazione** per ogni amico (username + password)
- **Dati isolati per utente**: ognuno vede solo i propri eventi/documenti/avvisi/finanze/grafici
- **Un solo URL**: il server Express serve sia l'API sia il frontend (niente CORS)

```
daily-mate-online/
  app/        → frontend (lo stesso scaffold, con login + adapter remoto)
  server/     → backend: autenticazione + storage per-utente
  Dockerfile
```

## Dati personali e amici (importante)

La pagina **Finanze** contiene il tuo foglio "Lavoro" con i tuoi dati reali. Per non
mostrarli agli amici:

- il **primo account creato** su questo server è il *proprietario* e riceve il foglio completo
  (oppure l'account indicato in `OWNER_USERNAME` dentro `server/.env`);
- tutti gli altri account ricevono le **stesse schede e le stesse formule, ma vuote**
  (`server/seed/lavoro-template.json`): ognuno inserisce i propri dati.

Quindi: **registrati tu per primo**, poi manda il link agli amici.
I file `server/seed/lavoro-data.json` (i tuoi dati) e `server/seed/lavoro-template.json`
(la versione vuota) sono privati: non caricarli su GitHub o altri posti pubblici.

## Come funziona (in breve)

Il frontend non è cambiato nella sostanza: usa ancora `StorageAdapter.get/set/remove`.
È cambiato solo *quale* adapter viene iniettato in `App`:

- versione locale → `LocalStorageAdapter` (salva nel browser)
- versione online → `RemoteStorageAdapter` (chiama `/api/kv/:key` sul server,
  autenticato col token dell'utente)

Il server mantiene per ogni utente un proprio spazio chiave/valore
(`server/src/db.js`), quindi impostazioni, tema, attività, diario ecc. sono
automaticamente privati per ciascun amico, senza che `Repository`,
`SettingsManager` o `ThemeManager` debbano sapere che esistono più utenti:
tutta la logica di isolamento vive nel backend.

## Avviarlo in locale (per provarlo prima di pubblicarlo)

```bash
cd server
cp .env.example .env     # poi apri .env e cambia JWT_SECRET
npm install
npm start
```

Apri `http://localhost:3000`: vedrai la schermata di accesso, crea un account
di prova e usa l'app normalmente.

## Metterlo online: 3 opzioni

### Opzione A — Render o Railway (più semplice, gratis per iniziare)

1. Crea un repository Git con questa cartella (`daily-mate-online/`) e
   caricalo su GitHub.
2. Su [Render](https://render.com) o [Railway](https://railway.app): "New Web
   Service" → collega il repo.
3. Build command: `cd server && npm install` — Start command: `cd server && npm start`
   (oppure, se la piattaforma rileva il `Dockerfile`, usa direttamente quello).
4. Imposta le variabili d'ambiente: `JWT_SECRET` (obbligatoria, stringa lunga
   e casuale) e opzionalmente `PORT` (di solito la piattaforma lo imposta da sola).
5. **Importante**: aggiungi un volume/disco persistente montato su
   `server/data` (su Render si chiama "Persistent Disk"), altrimenti ad ogni
   deploy i dati di tutti vengono azzerati.
6. Deploy. Ricevi un URL tipo `https://daily-mate.onrender.com`: mandalo ai
   tuoi amici, ognuno si registra con il proprio account.

### Opzione B — Fly.io (buon piano gratuito, un po' più da riga di comando)

```bash
fly launch        # rileva il Dockerfile, crea l'app
fly volumes create daily_mate_data --size 1   # storage persistente
# nel fly.toml generato, monta il volume su /app/server/data
fly secrets set JWT_SECRET=una-stringa-lunga-e-casuale
fly deploy
```

### Opzione C — Un tuo VPS (controllo completo)

```bash
git clone <tuo-repo>
cd daily-mate-online
docker build -t daily-mate .
docker run -d -p 3000:3000 \
  -e JWT_SECRET=una-stringa-lunga-e-casuale \
  -v daily_mate_data:/app/server/data \
  --restart unless-stopped \
  daily-mate
```

Poi metti un reverse proxy (Caddy o nginx) davanti per avere HTTPS con un
dominio tuo — con Caddy basta una riga tipo:
```
dailymate.tuodominio.it {
  reverse_proxy localhost:3000
}
```

## Note su sicurezza e limiti (onestamente)

Questo backend è pensato per un gruppo di amici, non per il pubblico di
internet: è volutamente semplice. Prima di condividerlo largamente, tieni
presente che:

- Non c'è un vero "recupero password" (nessun invio email): se un amico perde
  la password, per ora bisogna intervenire a mano nel file `server/data/db.json`.
- Non c'è rate-limiting sulle richieste di login: va bene per un piccolo
  gruppo fidato, non per un servizio esposto a tutti.
- Il file `db.json` è leggibile da chi ha accesso al server: le password sono
  comunque hashate (scrypt), ma backup e accesso alla macchina vanno protetti.
- Cambia sempre `JWT_SECRET` dal valore di esempio prima di andare online.

Per un gruppo di amici è più che sufficiente; se in futuro vorrai aprirlo a
un pubblico più ampio, i punti sopra sono la prima cosa da rinforzare (reset
password via email, rate limiting, magari spostare `db.json` su un vero
database).


## Sicurezza dei dati (backup)

- I dati di ogni utente sono nel file `server/data/db.json`, salvato in modo sicuro (scrittura su file temporaneo + rinomina).
- **Copie automatiche fuori dalla cartella:** a ogni avvio e poi ogni 30 minuti (se ci sono modifiche) il server copia il database in `C:\Users\<tuo nome>\DailyMate-backup` (ultime 60 copie). Per cambiare cartella: `BACKUP_DIR` in `server\.env`.
- **Server spento o rete assente:** l'app tiene il dato nel browser e lo reinvia da sola (scritta rossa "non salvato online" in alto a destra, poi "salvato online").
- **Backup personale:** Impostazioni > Backup dei dati > Scarica / Ripristina.
- Quando aggiorni il programma con un nuovo zip, **non cancellare** `server\data` e `server\.env` (oppure ripristina da `DailyMate-backup`).


## Aggiornamenti automatici (nessun file da riscaricare)

Il server controlla ogni 3 minuti il repository GitHub scelto in **Impostazioni > Aggiornamenti automatici**.
Se c'e' una versione nuova la scarica da solo: le pagine (`app/`) cambiano subito, basta ricaricare il browser
(in alto compare anche "Nuova versione disponibile"); se cambia il server, questo si riavvia da solo.
Non vengono mai toccati: `server/data`, `server/.env`, `server/seed/lavoro-data.json`, i file `.bat`.
Il repository deve essere pubblico e NON deve contenere `server/seed/lavoro-data.json` (e' gia nel `.gitignore`).


## Amministratore, interfaccia per utente e notifiche

- **Amministratore** = il primo account registrato (oppure `OWNER_USERNAME` in `server/.env`). Vede la pagina **Amministrazione**.
- **Interfaccia per utente:** da Amministrazione > tocca un utente: pagine visibili, nomi del menu, colore/tema (anche bloccati), messaggio nella Home. Ogni utente ha la sua; le modifiche arrivano entro 30 secondi senza che l'utente faccia nulla.
- **Notifiche:** campanella in alto. Messaggi dell'admin (a tutti o a un utente), promemoria automatici per gli avvisi (giorno stesso/giorni prima, a partire dalle 8) e per gli eventi del calendario (10/30/60 minuti prima). Ogni utente sceglie in Impostazioni > Notifiche.
- **Notifiche sul dispositivo (anche ad app chiusa):** Impostazioni > Notifiche > Attiva. Usano il Web Push standard (nessuna dipendenza), servono HTTPS (l'indirizzo Tailscale va bene). Su iPhone: Condividi > Aggiungi alla schermata Home, poi apri l'app da li' e attiva le notifiche.
- Le chiavi del push sono in `server/data/vapid.json` (non cancellarlo, altrimenti i dispositivi vanno riattivati).


## Gruppi (calendario, avvisi e documenti condivisi)

- Menu **Gruppi**: in alto la barra di ricerca (per nome di gruppo o persona; se scrivi un codice compare il pulsante "Chiedi di entrare").
- **I miei gruppi**: ogni gruppo ha un codice univoco (es. `K7M2-9QXP`). Il creatore può rinominare, rimuovere persone o eliminare il gruppo; gli altri possono uscire.
- **Richieste da accettare**: inviti ricevuti (li accetti tu) e richieste di ingresso al tuo gruppo (le accetti tu come creatore).
- **Crea e invita**: crea un gruppo, entra con un codice, invita una persona cercandola per nome.
- In Calendario, Avvisi e Documenti, se fai parte di almeno un gruppo, il form ha il campo **Condividi con**: "Solo io" oppure un gruppo. Gli elementi condivisi sono visibili ai membri col simbolo 👥.
- Modifica/eliminazione: solo chi l'ha creato o il creatore del gruppo; tutti i membri possono però spuntare "Fatto" su un avviso. I membri ricevono una notifica per ogni nuovo elemento e i promemoria valgono anche per quelli condivisi.
- Dati nel server: `groups`, `requests`, `groupItems` dentro `server/data/db.json` (inclusi nei backup).

### Chat del gruppo
Toccando "Apri chat e condivisi" si apre la pagina del gruppo: prima la **chat live** (testo e foto, si aggiorna da sola ogni 3 secondi), poi il menu per passare a **Calendario, Avvisi e Documenti** del gruppo. Le foto sono ridotte automaticamente e salvate in `server/data/chat/`; restano gli ultimi 500 messaggi per gruppo.

## Finanze: schede per utente e pagine "+"
- **Amministratore**: in Amministrazione → utente puoi scegliere quali schede Finanze vede e rinominarle. Un utente normale, finché non scegli, vede solo Home banking, Ore lavoro, Investimenti aperti, Amministrazione, Entrate e uscite, Risparmio. Le schede nascoste restano nei calcoli (formule e collegamenti invariati).
- **Pagine "+"**: in Finanze e in ogni pagina c'è il tasto per creare una pagina (o sottopagina) con nome e colonne; funziona come le altre (voci, formule, totale). Si rinomina o elimina dal fondo della pagina.

## Ore lavoro per gli utenti e grafici guidati
- **Ore lavoro** (utenti normali): parte vuota. "Crea orario di lavoro" chiede nome e paga oraria standard; ogni giornata ha la sua paga modificabile. Ore totali, paghe, Paga tot., Acconti e Saldo residuo si calcolano come somma di tutti gli orari. L'amministratore tiene la scheda originale.
- Trading 212 e Conto KE sono visibili solo all'amministratore.
- **Attività → +**: grafico con tabella "etichetta + valore", dalle colonne di una pagina creata con il tasto +, oppure dalle ore/paga dei propri orari di lavoro (nomi semplici, nessuna lettera di cella).
- **Amministratore**: nella scheda Ore lavoro originale il tasto "Passa al nuovo sistema ore" porta (se vuoi) Switch Evolution e Cantiere nel nuovo sistema con paga e acconti; dal nuovo sistema si torna all'originale con un tasto. Ogni orario si elimina da "modifica" accanto al suo nome.
- **Formule collegate**: per gli utenti le formule che dipendono da altre celle sono bloccate: nel modulo il campo è vuoto e non modificabile ("Calcolato automaticamente"). L'amministratore le vede e le modifica.
- **Home banking** (utenti): niente "Altre banche" e "Banca prioritaria": si sostituiscono con le sottopagine ("＋ Nuova sottopagina"). **Investimenti aperti** (utenti): senza "Famiglia".
- **Anni** in Amministrazione (Annuale, fino a 23 anni) e in Entrate e uscite (fino a 16): "+ Aggiungi anno", si tolgono toccando la riga e "Elimina"; gli anni sono ordinati e i totali si calcolano da soli.

## Disconnessione automatica e ruolo Visitatore
- **Disconnessione**: dopo 3 minuti senza toccare, scrivere o scorrere, ogni utente viene disconnesso (negli ultimi 20 secondi compare l'avviso con "Resto qui"). Le modifiche in corso vengono salvate prima di uscire.
- **Ruoli** (solo il proprietario li cambia, da Amministrazione → utente → Permessi): **Utente** (normale) e **Visitatore** (ha la pagina Amministrazione: personalizza l'interfaccia degli utenti normali e invia notifiche, ma vede Finanze come un utente normale, senza i dati personali del proprietario; non può modificare il proprietario, gli altri visitatori o i ruoli, né gli aggiornamenti del server).

## Modelli pronti per le pagine (＋ Nuova pagina)
In **Finanze → ＋ Nuova pagina** (e nelle sottopagine) si sceglie da una galleria di modelli: **Piano di risparmio** (obiettivo + data → quanto mettere da parte al mese e alla settimana), **Piano del mese 50/30/20**, **Calcolatore rata** (mutuo/finanziamento), **Abbonamenti**, **Spese di casa / personali / animali / auto**, **Scadenze e bollette**, **Prestiti che hai fatto** e **Debiti da restituire** (con interesse che matura giorno per giorno), **Lista della spesa**, **Peso e salute**, più la **Pagina vuota** con colonne scelte da te.
- Le caselle con i calcoli (totali, "speso questo mese", rata, interessi…) sono **automatiche e bloccate**: si vedono ma non si possono toccare (portano la scritta "· auto"). L'utente inserisce solo i propri dati.
- Le categorie si scelgono da un menu, la data di una nuova spesa è già quella di oggi, e se non scrivi nulla non si crea una voce vuota.
- I modelli sono definiti in `app/modules/finance/templates.js`: per aggiungerne uno basta descrivere riquadri, colonne e formule. Il motore di calcolo (`engine.js`) ora conosce anche `DATE`, `DAY`, `MONTH`, `YEAR`, `COUNTIF` e `SUMIFS`.
- Le pagine create dai modelli sono disponibili anche come grafico nella pagina Attività ("Dai dati di una mia pagina di Finanze").
- Le modifiche alle pagine vengono salvate subito anche se si chiude o ricarica la pagina.

## Patrimonio con più valute (per gli utenti)
- Per gli utenti la scheda **Patrimonio** (ex "Home banking") è nuova: si scrive dove sono i soldi — **Contanti**, **Conti e carte (digitale)** o **Cripto** — con la valuta di ogni importo (euro, dollari, sterline… per contanti e digitale; BTC, ETH… per le cripto) e se sono **soldi che si possono investire**. Niente più somme automatiche "a sorpresa": contanti e investibili sono scelti dall'utente.
- In alto si sceglie la **valuta in cui vedere tutto**: ogni importo viene convertito e il patrimonio totale si ricalcola.
- **Cambi**: il server li scarica da solo (valute dalla BCE tramite frankfurter.dev, cripto da CoinGecko, entrambi gratuiti e senza chiave) al massimo ogni 6 ore e li salva in `server/data/rates.json`. Se internet non c'è usa l'ultimo valore salvato. Ogni cambio si può **scrivere a mano** (riquadro "Cambi" → tocca la valuta); quello scritto a mano ha la precedenza.
- Patrimonio totale = soldi disponibili + soldi già investiti (somma di "Soldi investiti" nella pagina Investimenti). I crediti sono mostrati a parte.
- L'amministratore mantiene la scheda originale, con nomi più chiari (`app/modules/finance/labels.js`: una tabella "cella, testo vecchio, testo nuovo" facile da modificare). Sotto il titolo di ogni pagina c'è ora una riga che spiega a cosa serve.

## Accesso richiesto a ogni apertura
La sessione non viene più ricordata dal browser: ogni volta che apri il link, premi "aggiorna" o riapri la pagina dopo averla chiusa, l'app chiede username e password. Si resta dentro solo mentre la pagina è aperta e usata (e vale sempre la disconnessione dopo 3 minuti di inattività). I ricaricamenti decisi dall'app stessa (nuova versione, cambio di ruolo) non chiedono di nuovo la password. Le modifiche non ancora salvate restano in coda e partono al primo accesso.

## Configurazione (dentro Finanze)
Il quadretto **⚙ Configurazione** raccoglie i dati che non cambiano mai, scritti una volta sola:
- **Le mie banche e i miei conti**: le prime due danno il nome alle colonne di *Entrate e uscite* (al posto di BPM/TR, che sono quelle dell'amministratore) e tutte compaiono come suggerimenti quando si aggiunge un conto in *Patrimonio*.
- **Paga oraria standard**: in *Ore lavoro* ogni lavoro e ogni giornata propongono "Standard"; con "Scrivo io" si scrive un'altra paga. Cambiando la paga standard si aggiornano da soli i lavori che la usano.
- **Valuta preferita**: la valuta in cui *Patrimonio* mostra i totali.

## Paghe con nome e conti per banca

- **Configurazione → Lavori e paghe**: ogni lavoro ha una o più paghe con nome (es. "Paga Swievo", "Paga Swievo 10%", "Paga cantiere"), con una "di solito". Si creano, modificano ed eliminano da lì; eliminando una paga le giornate già inserite mantengono l'importo calcolato.
- **Ore lavoro**: per ogni giornata si sceglie una delle paghe del lavoro oppure "Scrivo io".
- **Patrimonio**: ogni banca può avere più conti, ognuno con la sua valuta (euro, dollari, cripto…). Il totale si vede nella valuta preferita (euro o dollari, ecc.).

- **Valuta nelle caselle**: ogni casella importo (es. Entrate BPM) ha un menu per scegliere la valuta; il valore viene convertito in euro per i totali e riaprendo la casella ritrovi l'importo originale.
- **Nuovi modelli di pagina**: Viaggi, Regali e feste, Salute, Figli, Sport e hobby, Telefono e tecnologia, Spesa alimentare, Tasse e documenti.
- Le caselle scritte in un'altra valuta mostrano l'importo originale (es. 100,00 USD); i totali restano in euro.

## Calendario (Step 2)

Viste **Giorno / Settimana / Mese**, eventi **ripetuti** (ogni giorno, lun–ven, settimana, 2 settimane, mese, anno, con data di fine facoltativa; si può eliminare un solo giorno di una serie), **categorie e colori**, eventi **tutto il giorno**, **promemoria** per ogni evento (all'ora, 10/30/60/120 minuti prima, il giorno prima, oppure come nelle Impostazioni). La logica delle ripetizioni è in `app/modules/calendar/recurrence.js`, usata anche dal server per le notifiche.

## Arretrati e Prospettiva

- **Ore lavoro → Arretrati**: soldi dei mesi prima che un'azienda ti deve ancora (azienda scelta dalla Configurazione, mese, anno, importo). Saldo residuo = paga + arretrati − acconti. Il "Saldo Residuo" della scheda originale viene portato qui in automatico (o con il pulsante "Porta qui il saldo residuo").
- **Finanze → Prospettiva** (`finance/forecast`): stima dei soldi a fine mese e a fine mese prossimo = soldi disponibili − spese sicure (abbonamenti con prossimo rinnovo, scadenze non pagate) − spese abituali (media degli ultimi 60 giorni dalle pagine "spese"; per l'amministratore, in mancanza, la media di "Entrate e uscite"). Mostra anche i soldi che potrebbero arrivare e alcuni consigli. Logica in `forecast.js`.
- Il **patrimonio totale** include anche quello che devi ancora incassare: crediti e lavoro (arretrati + paga del periodo − acconti). Per l'amministratore col nuovo sistema ore, "Paga da ricevere" in Patrimonio usa le ore nuove.

## Avvisi e Note (Step 3)

La pagina **Avvisi** ha due schede. **Avvisi**: scadenze con data, che si possono ripetere (giorno, settimana, mese, anno: quando li spunti passano alla data dopo), colorare e fissare in alto; filtri Da fare / Fatti / Tutti e ricerca. **Note**: appunti di testo oppure elenchi con spunte (si spunta direttamente dalla scheda), con colori, fissate in alto e ricerca. Le note sono personali.

## Ibrido: nuova struttura (fase 1)
Barra in basso con 4 schede (Home, Agenda, Archivio, Finanze); l'ingranaggio in alto apre il menu con tutte le pagine (Gruppi, Attività, Impostazioni, Amministrazione…).
Agenda = Calendario | Scadenze (Avvisi). Archivio = Documenti | Note | Contatti (nuova rubrica). Colori più morbidi (verde salvia).

## Ibrido fase 2
Documenti: testo scritto nell'app (scaricabile in .txt), foto (ridotte) e PDF allegati, etichette di scadenza e filtri. Home: riga di aggiunta veloce (Evento, Scadenza, Nota, Documento, Contatto) e riquadro Prospettiva. Finanze: Panoramica | Movimenti | Conti e card del mese. Titoli grandi con riga grigia.

## Patrimonio nel tempo automatico
La casella del mese corrente e quella dell'anno corrente (es. 2026) seguono il patrimonio totale. Passato il mese/anno, l'ultimo valore resta fisso e si parte col successivo. Il valore fissato è quello dell'ultima volta che l'app è stata aperta o modificata.
Anno nuovo: i 12 mesi ripartono vuoti e gennaio prende subito il patrimonio corrente; la riga dell'anno passato resta fissa.

Aggiornamenti: il server chiede l'ultima versione direttamente a git (sempre aggiornata, nessun limite orario), con l'API di GitHub solo come ripiego.
