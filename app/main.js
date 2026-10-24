import { App } from './core/App.js';
import { AuthClient } from './core/AuthClient.js';
import { AuthGate } from './core/AuthGate.js';
import { GroupService } from './core/GroupService.js';
import { GroupsModule } from './modules/groups/GroupsModule.js';
import { RemoteStorageAdapter } from './core/storage/RemoteStorageAdapter.js';
import { HomeModule } from './modules/home/HomeModule.js';
import { CalendarModule } from './modules/calendar/CalendarModule.js';
import { DocumentsModule } from './modules/documents/DocumentsModule.js';
import { ContactsModule } from './modules/contacts/ContactsModule.js';
import { AlertsModule } from './modules/alerts/AlertsModule.js';
import { FinanceModule } from './modules/finance/FinanceModule.js';
import { ActivityModule } from './modules/activity/ActivityModule.js';
import { AdminModule } from './modules/admin/AdminModule.js';
import { Assistant } from './core/Assistant.js';
import { Notifier } from './core/Notifier.js';
import { UpdateWatcher } from './core/UpdateWatcher.js';
import { IdleLogout } from './core/IdleLogout.js';
import { SettingsModule } from './modules/settings/SettingsModule.js';

// Frontend e API sono serviti dallo stesso server (vedi /server): stessa origine, niente CORS.
// Service worker: tiene una copia dell'app sul telefono, cosi' si apre anche a server spento.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready).then(reg => {
    const urls = performance.getEntriesByType('resource').map(r => r.name).filter(u => u.startsWith(location.origin) && !u.includes('/api/'));
    reg.active?.postMessage({ cache: ['/', ...urls] });
  }).catch(() => {});
}
const auth = new AuthClient();
const gate = new AuthGate(auth, boot);
gate.start();

function boot() {
  const storage = new RemoteStorageAdapter(auth);
  const groupSvc = new GroupService(auth);
  const app = new App({ storage, auth });

  // L'ordine qui e' l'ordine del menu a sinistra.
  app
    .use(new HomeModule())
    .use(new CalendarModule({ storage, groups: groupSvc }))
    .use(new DocumentsModule({ storage, groups: groupSvc }))
    .use(new AlertsModule({ storage, groups: groupSvc }))
    .use(new ContactsModule({ storage }))
    .use(new GroupsModule({ svc: groupSvc }))
    .use(new FinanceModule())
    .use(new ActivityModule())
    .use(new SettingsModule());
  if (auth.user?.isAdmin) app.use(new AdminModule());   // visibile solo all'amministratore

  app.start();
  if (auth.offline) {   // server spento: avviso ben visibile (la barra sparisce da sola quando si torna online)
    const bar = document.createElement('div'); bar.className = 'update-bar idle-bar';
    bar.innerHTML = '<span>📴 Modalità offline: le modifiche restano sul telefono e partono da sole quando il server torna acceso</span>';
    document.body.appendChild(bar);
  }
  new UpdateWatcher().start();
  app.assistant = new Assistant(app); app.assistant.mount();
  app.notifier = new Notifier(app);
  app.notifier.start();
  app.idle = new IdleLogout(app); app.idle.start();                  // fuori dopo 3 minuti di inattività
  window.dailyMate = app; // comodo per il debug dalla console del browser
}
