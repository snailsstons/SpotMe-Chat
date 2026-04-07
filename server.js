const express = require('express');
const { ExpressPeerServer } = require('peer');
const cors = require('cors');

const app = express();
// Port wird von Cloud-Anbietern (Render/Railway) vorgegeben, lokal 9000
const PORT = process.env.PORT || 9000;

// Erlaube Verbindungen von deiner Website
app.use(cors());

// Eine simple Status-Seite, damit der Cloud-Host sieht, dass der Server läuft
app.get('/', (req, res) => {
  res.send('<h1>SpotMe PeerJS Server</h1><p>Status: Online 🟢</p>');
});

// Server starten
const server = app.listen(PORT, () => {
  console.log(`SpotMe Server läuft auf Port ${PORT}`);
});

// PeerJS initialisieren
const peerServer = ExpressPeerServer(server, {
  path: '/',
  proxied: true,
  allow_discovery: true // Erlaubt das Finden von Partnern
});

// PeerJS unter dem Pfad /peerjs erreichbar machen
app.use('/peerjs', peerServer);

// Optional: Logs in der Server-Konsole
peerServer.on('connection', (client) => {
  console.log(`Nutzer verbunden: ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`Nutzer getrennt: ${client.getId()}
  `);
});
