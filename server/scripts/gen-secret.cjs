// Stampa una stringa casuale lunga, usata da avvia.bat per creare .env
// alla prima esecuzione. File .cjs (non .js) perche' server/package.json ha
// "type": "module": senza questa estensione Node tratterebbe require() come
// un errore.
console.log(require('crypto').randomBytes(48).toString('hex'));
