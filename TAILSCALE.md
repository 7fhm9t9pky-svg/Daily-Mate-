# Daily Mate sul tuo PC, raggiungibile dagli amici (con Tailscale)

Niente server a pagamento: l'app gira sul **tuo** PC, resta raggiungibile da
internet finché il PC è acceso, grazie a [Tailscale](https://tailscale.com)
(gratis fino a 100 dispositivi/3 utenti, più che sufficiente).

I tuoi amici **non devono installare nulla**: ricevono un link
`https://...ts.net` e lo aprono come un sito qualsiasi, da telefono o PC.

## Preparazione (una tantum)

1. **Installa Node.js** (se non ce l'hai già): [nodejs.org](https://nodejs.org) →
   scarica la versione "LTS" → installa con le opzioni di default.

2. **Installa Tailscale**: [tailscale.com/download](https://tailscale.com/download) →
   versione Windows → installa e fai login (puoi usare Google/Microsoft/GitHub,
   niente carta di credito richiesta per il piano gratuito).

3. **Attiva "Funnel"** (è la funzione che rende il link pubblico): apri
   [login.tailscale.com/admin/settings/general](https://login.tailscale.com/admin/settings/general)
   nel browser (stesso account) e attiva l'interruttore **Funnel**. Poi vai
   nella scheda **DNS** della stessa console e attiva **HTTPS Certificates**
   se non è già attivo.

4. **(Consigliato) Disattiva la scadenza della chiave** del tuo PC, altrimenti
   dopo qualche mese Tailscale ti chiede di rifare il login e l'app smette di
   essere raggiungibile finché non lo fai: vai su
   [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines),
   trova il tuo PC nell'elenco, apri il menu "···" e scegli **Disable key expiry**.

5. **Impedisci la sospensione del PC**: Impostazioni di Windows → Sistema →
   Alimentazione e batteria → imposta "Lo schermo si spegne / Il dispositivo va
   in sospensione" su **Mai** (almeno mentre è collegato alla corrente). Se
   il PC va in sospensione, l'app diventa irraggiungibile finché non lo riattivi.

## Uso quotidiano

1. Scompatta questo zip in una cartella stabile (es. `Documenti\daily-mate-online`).
2. Fai doppio click su **`avvia.bat`**.
   - La primissima volta scarica le dipendenze del server e crea un file
     `.env` con una password segreta generata automaticamente: ci vuole
     qualche secondo in più, è normale.
   - Si aprono due finestre: una è il server (lasciala aperta, puoi ridurla
     a icona), l'altra ti mostra l'indirizzo pubblico, tipo:
     `https://tuo-pc.tailxxxxx.ts.net`
3. **Registrati tu per primo** con quell'indirizzo: il primo account è il tuo e riceve il foglio Finanze con i tuoi dati (gli amici ricevono lo stesso foglio ma vuoto). Poi copia l'indirizzo e mandalo ai tuoi amici. Ognuno apre il link e si
   registra con il proprio account (username + password): da quel momento i
   suoi dati (attività, diario, eventi, finanze) sono separati dai tuoi.
4. Quando vuoi smettere di condividere (es. a fine giornata), fai doppio
   click su **`ferma.bat`**, oppure chiudi le finestre e spegni/sospendi il PC
   — in entrambi i casi il link smette di funzionare finché non rilanci `avvia.bat`.

## Cosa fa davvero `avvia.bat`, in breve

1. Controlla che Node.js e Tailscale siano installati.
2. La prima volta, installa le dipendenze del server e genera `.env`.
3. Avvia il server Daily Mate sulla porta 3000 (resta visibile solo sul tuo PC).
4. Dice a Tailscale: "esponi la porta 3000 con un indirizzo pubblico HTTPS"
   (`tailscale funnel`) — è questo passaggio che rende l'app raggiungibile
   da fuori casa tua, senza dover configurare il router.

## Limiti onesti da sapere

- **Il PC deve restare acceso e connesso a internet**: se lo spegni o va in
  sospensione, l'app non è raggiungibile (i dati però restano salvi, ripartono
  non appena riaccendi e rilanci `avvia.bat`).
- Il link `https://...ts.net` non è indicizzato né facile da indovinare, ma
  è comunque **pubblico**: chiunque lo riceva può provare ad accedere (da lì
  in poi serve comunque username+password per entrare davvero). Condividilo
  solo con chi deve usarlo, non pubblicarlo online.
- Se cambi nome al PC in Tailscale, l'indirizzo cambia: in quel caso rimanda
  il nuovo link agli amici.
- Questa modalità è alternativa a quella descritta in `README.md` (deploy su
  Render/Railway/un VPS): lì l'app gira su un server sempre acceso di
  qualcun altro, qui gira sul tuo PC. Scegli quella che preferisci, non
  servono entrambe insieme.
