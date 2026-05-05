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
const I13_CTRL_DIR = 'D:\\GitHub\\i13_ctrl'; // Target directory for new mobile projects

// Generate Anydesk-style PIN
const CONNECTION_PIN = Math.floor(100000 + Math.random() * 900000).toString();

// Ensure Sandbox and Target directories exist
if (!fs.existsSync(SANDBOX_DIR)) fs.mkdirSync(SANDBOX_DIR, { recursive: true });
if (!fs.existsSync(I13_CTRL_DIR)) fs.mkdirSync(I13_CTRL_DIR, { recursive: true });

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
  console.log(`[+] Client Connected: ${socket.id}`);

  // Auth Flag for this socket
  socket.isAuthenticated = false;

  // Handle Anydesk PIN Verification
  socket.on('verify_pin', (encryptedPin) => {
    const pin = decryptPayload(encryptedPin);
    if (pin === CONNECTION_PIN) {
      socket.isAuthenticated = true;
      socket.emit('auth_result', encryptPayload({ success: true }));
      console.log(`[+] Client ${socket.id} Authenticated Successfully.`);
      // Send initial file tree
      sendFileTree(socket);
    } else {
      socket.emit('auth_result', encryptPayload({ success: false, message: 'Invalid PIN' }));
    }
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
