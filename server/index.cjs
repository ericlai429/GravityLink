const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// Configuration
const SANDBOX_DIR = path.join(__dirname, '..', 'sandbox');
const I13_CTRL_DIR = 'D:\\GitHub\\i13_ctrl';
const CONNECTION_PIN = process.env.MASTER_PIN || '888888';
const SECRET_KEY = 'GravityLink-Private-Key-2026';

if (!fs.existsSync(SANDBOX_DIR)) fs.mkdirSync(SANDBOX_DIR, { recursive: true });
if (!fs.existsSync(I13_CTRL_DIR)) fs.mkdirSync(I13_CTRL_DIR, { recursive: true });

// --- GEMINI AI INITIALIZATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let geminiModel = null;

if (GEMINI_API_KEY) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  console.log('🧠 Gemini AI: ONLINE (gemini-2.5-flash)');
} else {
  console.log('⚠️  Gemini AI: OFFLINE (未設定 GEMINI_API_KEY)');
}

const chatHistories = new Map();

async function getAIResponse(prompt, socketId) {
  if (!chatHistories.has(socketId)) chatHistories.set(socketId, []);
  const history = chatHistories.get(socketId);
  
  if (geminiModel) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const chat = geminiModel.startChat({
          history: history.slice(-10),
          generationConfig: { maxOutputTokens: 2048 },
        });
        const result = await chat.sendMessage(prompt);
        const reply = result.response.text();
        history.push({ role: 'user', parts: [{ text: prompt }] });
        history.push({ role: 'model', parts: [{ text: reply }] });
        return reply;
      } catch (err) {
        if (err.message.includes('429') && attempt === 0) {
          console.log('[Gemini] 額度限制，25秒後重試...');
          await new Promise(r => setTimeout(r, 25000));
          continue;
        }
        return `[AI 暫時無法回應] ${err.message.includes('429') ? '請求過於頻繁，請稍後再試。' : err.message}`;
      }
    }
  } else {
    return `[離線模式] 未設定 GEMINI_API_KEY 環境變數。`;
  }
}

// Encryption Utilities (Shared with client)
const encryptPayload = (data) => {
  const stringifiedData = typeof data === 'string' ? data : JSON.stringify(data);
  return CryptoJS.AES.encrypt(stringifiedData, SECRET_KEY).toString();
};

const decryptPayload = (ciphertext) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    try { return JSON.parse(decryptedString); } catch { return decryptedString; }
  } catch (error) {
    console.error('Decryption failed. Invalid payload or key.');
    return null;
  }
};

// App Setup
const app = express();
app.use(cors());

// Fallback Ports for Firewall Bypass
const FALLBACK_PORTS = [3001, 8080, 8443];

console.log('================================================');
console.log(`🚀 GravityLink Backend Starting...`);
console.log(`🔑 ANYDESK PIN:   ${CONNECTION_PIN}`);
console.log(`🎯 Target Dir:    ${SANDBOX_DIR}`);
console.log('================================================');

const io = new Server({
  cors: {
    origin: "*", // In production over WiFi, accept from iPhone's IP
    methods: ["GET", "POST"]
  },
  pingTimeout: 10000, // Important for unstable mobile networks
  pingInterval: 5000  // Frequent heartbeats to detect connection drops
});

FALLBACK_PORTS.forEach(p => {
  const srv = http.createServer(app);

  // Attach the same Socket.IO instance to each HTTP server
  io.attach(srv);

  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[!] Port ${p} is already in use locally, skipping.`);
    }
  });

  srv.listen(p, '0.0.0.0', () => {
    console.log(`📡 Listening on Port: ${p}`);
  });
});

// Socket Handling
io.on('connection', (socket) => {
  console.log(`[+] New Connection: ${socket.id}. Challenging for PIN...`);
  socket.isAuthenticated = false;

  // DELAYED CHALLENGE: Give client 1s to initialize listeners
  setTimeout(() => {
    if (socket.connected) {
      socket.emit('auth_required', encryptPayload({ message: 'Authentication required.' }));
    }
  }, 1000);

  socket.on('verify_pin', async (encryptedPin) => {
    const pin = decryptPayload(encryptedPin);
    if (String(pin) === CONNECTION_PIN) {
      socket.isAuthenticated = true;
      socket.emit('auth_result', encryptPayload({ success: true }));
      console.log(`[+] Client ${socket.id} Authenticated Successfully.`);
      sendFileTree(socket);

      // ONE-TIME system status broadcast on login
      let gitUser = '', gitRemote = false;
      try {
        const { execSync } = require('child_process');
        gitUser = execSync('git config user.name', { cwd: SANDBOX_DIR }).toString().trim();
        try { execSync('git remote -v', { cwd: SANDBOX_DIR }); gitRemote = true; } catch(e) {}
      } catch(e) {}

      let apiOk = false;
      if (geminiModel) {
        try {
          await geminiModel.generateContent('ping');
          apiOk = true;
        } catch(e) {
          console.log(`[API] Gemini health check: ${e.message.substring(0, 60)}`);
        }
      }

      socket.emit('system_status', encryptPayload({
        gemini: { online: !!geminiModel, healthy: apiOk, model: 'gemini-2.5-flash' },
        git: { hasUser: !!gitUser, username: gitUser || '未設定', hasRemote: gitRemote },
        server: { port: 3001, sandbox: SANDBOX_DIR }
      }));
    } else {
      socket.emit('auth_result', encryptPayload({ success: false, message: '密碼錯誤' }));
    }
  });

  // --- AI REQUEST HANDLER (Real Gemini) ---
  socket.on('ai_request', async (encryptedPayload) => {
    const payload = decryptPayload(encryptedPayload);
    if (!socket.isAuthenticated) {
      socket.emit('auth_required', encryptPayload({ message: 'Auth required.' }));
      return;
    }
    
    const prompt = payload.prompt;
    const promptLower = prompt.toLowerCase();
    console.log(`[AI] "${prompt}" | Devices: ${io.engine.clientsCount}`);
    
    socket.broadcast.emit('ai_message', encryptPayload({ role: 'user', text: prompt }));
    io.sockets.emit('ai_state_change', encryptPayload({ isGenerating: true }));

    const isFileTask = promptLower.includes('修改') || promptLower.includes('寫入') || promptLower.includes('add') || promptLower.includes('modify') || promptLower.includes('create file');

    if (isFileTask) {
      const mockResult = { id: `req_${Date.now()}`, count: 1, type: 'File Edit', description: `已根據指令 "${prompt}" 準備好變更。` };
      socket.pendingEdits = mockResult;
      io.sockets.emit('ai_approval_request', encryptPayload(mockResult));
      io.sockets.emit('ai_message', encryptPayload({ role: 'ai', text: '[NB] 已偵測到代碼變更需求。' }));
    } else {
      try {
        const aiReply = await getAIResponse(prompt, socket.id);
        io.sockets.emit('ai_message', encryptPayload({ role: 'ai', text: aiReply }));
      } catch (err) {
        io.sockets.emit('ai_message', encryptPayload({ role: 'ai', text: `[NB] AI 回應失敗: ${err.message}` }));
      }
      io.sockets.emit('ai_state_change', encryptPayload({ isGenerating: false }));
    }
  });

  socket.on('ai_stop', () => {
    io.sockets.emit('ai_state_change', encryptPayload({ isGenerating: false }));
    io.sockets.emit('ai_message', encryptPayload({ role: 'ai', text: '[NB] 運算中斷。' }));
  });

  socket.on('approval_response', (encryptedPayload) => {
    const payload = decryptPayload(encryptedPayload);
    if (!payload) return;
    const statusText = payload.status === 'accepted' ? '[NB] ✅ 變更已套用！' : '[NB] 已取消。';
    io.sockets.emit('ai_message', encryptPayload({ role: 'ai', text: statusText }));
    io.sockets.emit('ai_state_change', encryptPayload({ isGenerating: false }));
  });

  // Create a pseudo-terminal for this connection using Windows cmd
  // For a robust pty, 'node-pty' is best, but spawn('cmd.exe') works for basic usage.
  const term = spawn('cmd.exe', [], { cwd: SANDBOX_DIR });

  term.stdout.on('data', (data) => {
    // Encrypt terminal output before sending to iPhone
    socket.emit('terminal_output', encryptPayload(data.toString()));
  });

  term.stderr.on('data', (data) => {
    socket.emit('terminal_output', encryptPayload(data.toString()));
  });

  socket.on('terminal_input', (encryptedInput) => {
    const input = decryptPayload(encryptedInput);
    if (input && term) {
      term.stdin.write(input);
    }
  });

  socket.on('fs_read', (encryptedPath) => {
    const filePath = decryptPayload(encryptedPath);
    if (filePath) {
      const fullPath = path.join(SANDBOX_DIR, filePath);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        socket.emit('fs_read_success', encryptPayload({ path: filePath, content }));
      } catch (err) {
        socket.emit('fs_error', encryptPayload(`Could not read file: ${err.message}`));
      }
    }
  });

  // Auto-save logic
  socket.on('fs_write', (encryptedData) => {
    const data = decryptPayload(encryptedData);
    if (data && data.path && data.content !== undefined) {
      const fullPath = path.join(SANDBOX_DIR, data.path);
      try {
        // Ensure subdirectories exist
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(fullPath, data.content, 'utf8');
        socket.emit('fs_write_success', encryptPayload({ path: data.path, timestamp: Date.now() }));
      } catch (err) {
        socket.emit('fs_error', encryptPayload(`Could not write file: ${err.message}`));
      }
    }
  });

  // Handle connection error logs from mobile
  socket.on('report_error_logs', (encryptedLogs) => {
    const logs = decryptPayload(encryptedLogs);
    if (Array.isArray(logs) && logs.length > 0) {
      const logFilePath = path.join(__dirname, '..', 'link_error_log.txt');
      let logOutput = `\n--- Sync Time: ${new Date().toISOString()} ---\n`;
      logs.forEach(log => {
        logOutput += `[${log.time}] Target IP: ${log.target_ip} | Error: ${log.error}\n`;
      });

      fs.appendFile(logFilePath, logOutput, (err) => {
        if (err) console.error('Failed to write link_error_log.txt:', err);
        else console.log(`[+] Wrote ${logs.length} offline error logs to link_error_log.txt`);
      });
    }
  });

  // Handle Debug Photo Uploads from Mobile
  socket.on('report_debug_image', (encryptedPayload) => {
    const payload = decryptPayload(encryptedPayload);
    if (payload && payload.filename && payload.base64Data) {
      const debugDir = path.join(SANDBOX_DIR, 'debug_images');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });

      // Remove the data:image/png;base64, prefix if present
      const base64Data = payload.base64Data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');

      const filePath = path.join(debugDir, payload.filename);
      fs.writeFile(filePath, buffer, (err) => {
        if (err) {
          console.error('Failed to save debug image:', err);
          socket.emit('fs_error', encryptPayload(`Failed to save image: ${err.message}`));
        } else {
          console.log(`[+] Saved debug image: ${payload.filename}`);
          socket.emit('image_upload_success', encryptPayload(payload.filename));
        }
      });
    }
  });

  // Handle Git Sync requests
  socket.on('git_sync', (encryptedMsg) => {
    const customMessage = decryptPayload(encryptedMsg) || `Mobile sync - ${new Date().toISOString()}`;
    console.log(`[Git] Starting sync with message: ${customMessage}`);

    // Command chain: add -> commit -> push
    const gitCommand = `git add . && git commit -m "${customMessage}" && git push`;

    exec(gitCommand, { cwd: SANDBOX_DIR }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Git] Sync Error: ${error.message}`);
        socket.emit('git_sync_result', encryptPayload({ success: false, output: error.message || stderr }));
        return;
      }
      console.log(`[Git] Sync Success:\n${stdout}`);
      socket.emit('git_sync_result', encryptPayload({ success: true, output: stdout }));
    });
  });

  // Handle New Project Creation in D:\GitHub\i13_ctrl
  socket.on('create_new_project', (encryptedName) => {
    const projectName = decryptPayload(encryptedName);
    if (projectName && /^[a-zA-Z0-9_-]+$/.test(projectName)) {
      const targetDir = path.join(I13_CTRL_DIR, projectName);
      if (fs.existsSync(targetDir)) {
        socket.emit('create_project_result', encryptPayload({ success: false, message: 'Project folder already exists!' }));
      } else {
        try {
          fs.mkdirSync(targetDir, { recursive: true });
          console.log(`[+] Created new project directory: ${targetDir}`);
          socket.emit('create_project_result', encryptPayload({ success: true, message: `Created successfully at ${targetDir}` }));
        } catch (err) {
          socket.emit('create_project_result', encryptPayload({ success: false, message: err.message }));
        }
      }
    } else {
      socket.emit('create_project_result', encryptPayload({ success: false, message: 'Invalid project name. English characters only.' }));
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Client Disconnected: ${socket.id}`);
    term.kill(); // Clean up terminal on disconnect
  });
});

// File Tree Synchronization
const buildFileTree = (dir) => {
  const result = [];
  const items = fs.readdirSync(dir);

  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    const node = { name: item, path: path.relative(SANDBOX_DIR, fullPath).replace(/\\/g, '/') };

    if (stat.isDirectory()) {
      node.type = 'directory';
      node.children = buildFileTree(fullPath);
    } else {
      node.type = 'file';
    }
    result.push(node);
  });

  // Sort: Directories first, then files
  return result.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
};

const sendFileTree = (targetSocket = io) => {
  try {
    const tree = buildFileTree(SANDBOX_DIR);
    targetSocket.emit('file_tree_update', encryptPayload(tree));
  } catch (err) {
    console.error("Failed to build file tree", err);
  }
};

// Watch for file changes and broadcast to all authenticated clients
const watcher = chokidar.watch(SANDBOX_DIR, { ignored: /(^|[\/\\])\../, persistent: true });
let treeUpdateTimeout = null;

watcher.on('all', (event, path) => {
  // Debounce tree updates to avoid spamming
  if (treeUpdateTimeout) clearTimeout(treeUpdateTimeout);
  treeUpdateTimeout = setTimeout(() => {
    // Only send to authenticated sockets
    const connectedSockets = io.sockets.sockets;
    for (const [id, s] of connectedSockets) {
      if (s.isAuthenticated) {
        sendFileTree(s);
      }
    }
  }, 300);
});

// Setup complete, server instances are listening below.
