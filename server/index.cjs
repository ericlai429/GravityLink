const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const readline = require('readline');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- CONFIGURATION ---
const SECRET_KEY = 'GravityLink-Private-Key-2026';
const CORRECT_PIN = '888888';
const PORTS = [3001, 8080, 8443];

// --- DIRECT AI CONNECTION ---
const USE_RELAY = false;
const GEMINI_API_KEY = "AIzaSyCJv0svCDh-dx1CjC4_Ay6Edwp_OgqsGl0"; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const app = express();
app.use(cors());
app.use(express.json());

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

const activeIOs = [];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => {
    activeIOs.forEach(io => {
        io.emit('ai_message', encryptPayload({ role: 'assistant', text: `[NB 主機直接回覆]\n\n${line}` }));
    });
});

const getSystemStatus = () => ({
    git: { github: true, gitlab: true },
    gemini: { healthy: true, model: 'Multi-Model Engine' },
    keyValid: GEMINI_API_KEY.startsWith("AIzaSy"), // 檢查金鑰格式
    usage: {
        'gemini-2.0-flash': { max: 1000, used: 120, reset: '05/06 12:00' },
        'gemini-2.0-pro-exp-02-05': { max: 50, used: 5, reset: '05/07 00:00' },
        'gemini-1.5-flash': { max: 10000, used: 42, reset: '05/06 12:00' },
        'gemini-1.5-pro': { max: 50, used: 2, reset: '05/06 18:00' }
    }
});

PORTS.forEach(port => {
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        transports: ['websocket', 'polling']
    });
    activeIOs.push(io);

    io.on('connection', (socket) => {
        console.log(`[+] [PORT:${port}] Client Linked: ${socket.id}`);
        
        // 初次連線發送狀態
        socket.emit('system_status', encryptPayload(getSystemStatus()));

        socket.on('verify_pin', (enc) => {
            const pin = decryptPayload(enc);
            if (String(pin) === CORRECT_PIN) {
                socket.emit('auth_result', encryptPayload({ success: true }));
                socket.emit('system_status', encryptPayload(getSystemStatus()));
            }
        });

        socket.on('ai_request', async (enc) => {
            const req = decryptPayload(enc);
            if (!req) return;
            let modelId = req.modelId || 'gemini-2.5-flash';
            
            // 強制避障：Pro 目前沒配額，自動轉 Flash
            if (modelId === 'gemini-2.5-pro') {
                console.log(`[!] Redirecting ${modelId} -> gemini-2.5-flash due to quota limits.`);
                modelId = 'gemini-2.5-flash';
            }
            console.log(`[*] [PORT:${port}] Calling ${modelId}: "${req.prompt}"`);
            
            socket.emit('ai_message', encryptPayload({ role: 'assistant', text: `[1/3] 主機已接收指令...` }));
            
            try {
                const dynamicModel = genAI.getGenerativeModel({ model: modelId });
                socket.emit('ai_message', encryptPayload({ role: 'assistant', text: `[2/3] 正在透過 NB 調用 ${modelId}...` }));
                
                const result = await dynamicModel.generateContent(req.prompt);
                const responseText = result.response.text();
                
                socket.emit('ai_message', encryptPayload({ 
                    role: 'assistant', 
                    text: `[NB 代理執行成功]\n\n執行日誌：\n- 模型：${modelId}\n- 算力：主機代發\n\n--- 執行結果 ---\n\n${responseText}` 
                }));
            } catch (err) {
                console.error(`[!] [PORT:${port}] AI Error:`, err.message);
                socket.emit('ai_message', encryptPayload({ 
                    role: 'assistant', 
                    text: `[代理連動失敗]\n\n原因：${err.message}\n\n建議：請檢查 API Key 是否正確。` 
                }));
            }
        });

        socket.on('disconnect', () => console.log(`[-] [PORT:${port}] Off`));
    });

    server.listen(port, '0.0.0.0', () => console.log(`🚀 [BACKEND] Engine Live on ${port}`));
});
