const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const CryptoJS = require('crypto-js');

// Constants
const SECRET_KEY = 'GravityLink-Private-Key-2026';
const PORTS = [3001, 8080, 8443];

const app = express();
app.use(cors());
app.use(express.json());
app.get('/test', (req, res) => res.send('OK'));

// Helper for Encryption (Aligned with frontend)
const encryptPayload = (data) => {
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    return CryptoJS.AES.encrypt(s, SECRET_KEY).toString();
};
const decryptPayload = (ciphertext) => {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
        const s = bytes.toString(CryptoJS.enc.Utf8);
        try { return JSON.parse(s); } catch(e) { return s; }
    } catch (e) { return null; }
};

PORTS.forEach(port => {
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        transports: ['websocket', 'polling']
    });

    io.on('connection', (socket) => {
        console.log(`[+] [PORT:${port}] Connection: ${socket.id}`);
        
        socket.on('verify_pin', (encryptedPin) => {
            const pin = decryptPayload(encryptedPin);
            console.log(`[*] [PORT:${port}] Decrypted PIN: ${pin}`);
            
            // 暴力放行：只要是 888888 就過
            if (String(pin) === '888888') {
                console.log(`[V] [PORT:${port}] SUCCESS!`);
                socket.emit('auth_result', encryptPayload({ success: true }));
            } else {
                console.log(`[X] [PORT:${port}] FAILED!`);
                socket.emit('auth_result', encryptPayload({ success: false, message: '密碼錯誤' }));
            }
        });

        socket.on('disconnect', () => console.log(`[-] [PORT:${port}] Off`));
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`📡 [SERVER] Port ${port} is HUNGRY for connection`);
    });
});
