import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { socket } from '../utils/socket';
import { encryptPayload, decryptPayload } from '../utils/crypto';

export default function TerminalView() {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#2f81f7',
        selection: 'rgba(47, 129, 247, 0.3)',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    setTimeout(() => {
      fitAddon.fit();
    }, 10);

    term.writeln('\x1b[1;34mGravityLink\x1b[0m AES-256 Secure Terminal');
    term.writeln('Connected to AMD NB Server.');
    term.writeln('');

    // Send input to backend (Encrypted)
    term.onData(e => {
      if (socket.connected) {
        socket.emit('terminal_input', encryptPayload(e));
      } else {
        term.write('\x1b[31m[Network Disconnected - Input Buffered]\x1b[0m\r\n');
      }
    });

    // Receive output from backend (Encrypted)
    const handleOutput = (encryptedOutput) => {
      const output = decryptPayload(encryptedOutput);
      if (output) {
        term.write(output);
      }
    };

    socket.on('terminal_output', handleOutput);

    xtermRef.current = term;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.off('terminal_output', handleOutput);
      term.dispose();
    };
  }, []);

  return <div ref={terminalRef} style={{ width: '100%', height: '100%', padding: '10px', boxSizing: 'border-box' }} />;
}
