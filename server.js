const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Speichert die aktiven Räume: roomId -> Set(WebSockets)
const rooms = new Map();

wss.on('connection', (ws) => {
    let currentRoom = null;
    console.log('Neuer Client verbunden');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Client tritt einem Raum bei
            if (data.type === 'join') {
                currentRoom = data.roomId;
                if (!rooms.has(currentRoom)) {
                    rooms.set(currentRoom, new Set());
                }
                rooms.get(currentRoom).add(ws);
                console.log(`Client ist Raum beigetreten: ${currentRoom}`);
            }
            
            // 2. Signale weiterleiten (SDP, ICE, Join-Pings)
            else if (data.type === 'signal') {
                if (currentRoom && rooms.has(currentRoom)) {
                    rooms.get(currentRoom).forEach(client => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'signal',
                                payload: data.payload
                            }));
                        }
                    });
                }
            }
        } catch (err) {
            console.error("Fehler:", err);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).delete(ws);
            if (rooms.get(currentRoom).size === 0) {
                rooms.delete(currentRoom);
                console.log(`Raum ${currentRoom} gelöscht.`);
            }
        }
        console.log('Client getrennt');
    });
});

console.log(`Signaling Server läuft auf Port ${PO
                                               RT}`);
