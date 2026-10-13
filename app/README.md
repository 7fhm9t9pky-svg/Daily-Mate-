# Daily Mate — app (frontend)

Pagine del menu a sinistra, nell'ordine di `main.js`:

| Pagina | Cartella | Cosa fa |
|---|---|---|
| Home | `modules/home` | Saluto, quadretti Calendario / Avvisi / Finanze, grafici “Attività”, “Punteggi” del mese |
| Calendario | `modules/calendar` | Giornata a ore (‹ › per cambiare giorno), eventi come blocchi |
| Documenti | `modules/documents` | Documenti con tipo, scadenza e note |
| Avvisi | `modules/alerts` | Scadenze con data (“tra 3 giorni”) |
| Finanze | `modules/finance` | Il foglio “Lavoro”: un quadretto per scheda, si apre con i dati e le formule |
| Attività | `modules/activity` | Resoconto grafico (Patrimonio, Investimenti, Entrate, Uscite) con tasto + per aggiungere altri grafici |
| Impostazioni | `modules/settings` | Nome, tema (chiaro/scuro/auto), colore, opzioni pagine, account |

## Struttura delle classi

```
Module (astratta)
 ├─ ListModule → AlertsModule, DocumentsModule   (lista + form generici)
 ├─ ActivityModule, CalendarModule, FinanceModule, HomeModule, SettingsModule
Entry → AlertItem, DocumentItem, CalendarEvent
Component → ogni vista (ListModuleView, DayView, FinanceView, SheetView, HomeView, SettingsView)
StorageAdapter → LocalStorageAdapter | RemoteStorageAdapter (quello usato online, per utente)
```

## Aggiungere una pagina

1. Crea la classe del modulo (estendi `ListModule` per le liste semplici, `Module` per il resto).
2. Registrala in `main.js` con `.use(...)`: l'ordine è l'ordine del menu.

## Finanze: come funziona

`modules/finance/engine.js` calcola le formule (SUM, IF, SUMIF, MID, ROUND…) del foglio.
`LavoroBook.js` unisce dati di partenza + modifiche dell'utente. `FinanceView.js` disegna i
quadretti (titoli e “numero chiave” in `SHEET_INFO`), `SheetView.js` disegna una scheda.
I dati di partenza arrivano dal server (`/api/seed/lavoro`); le modifiche si salvano per utente.

## Colori

Tutti i colori sono variabili CSS in `styles/tokens.css` (palette verde del foglio Lavoro,
con tema scuro). I colori alternativi sono in `core/ThemeManager.js` (`ACCENTS`).

- `ui/dateField.js`: campo data gg/mm/aaaa (indipendente dalla lingua del browser) usato in tutti i form.
- `ui/xlsxWriter.js`: crea file .xlsx senza librerie esterne (Esporta ore).
- `modules/finance/ExportPanel.js`: pannello "Esporta ore" della scheda ORE LAVORO.
