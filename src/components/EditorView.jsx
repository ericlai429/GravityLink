import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

export default function EditorView({ code, setCode }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#282c34', height: '100%' }}>
      <CodeMirror
        value={code}
        height="100%"
        theme={oneDark}
        extensions={[javascript({ jsx: true })]}
        onChange={(value) => setCode(value)}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
        }}
        style={{ height: '100%' }}
      />
    </div>
  );
}
