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
