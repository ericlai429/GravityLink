import React from 'react';
import { Folder, File, ChevronRight, ChevronDown, Lock, FolderPlus } from 'lucide-react';
import { socket, sendEncrypted } from '../utils/socket';
import { encryptPayload, decryptPayload } from '../utils/crypto';

export default function FileExplorer() {
  const [fileTree, setFileTree] = React.useState([]);

  React.useEffect(() => {
    const handleResult = (encryptedResult) => {
      const result = decryptPayload(encryptedResult);
      if (result) {
        alert(result.message);
      }
    };
    
    const handleTreeUpdate = (encryptedTree) => {
      const tree = decryptPayload(encryptedTree);
      if (tree) setFileTree(tree);
    };

    socket.on('create_project_result', handleResult);
    socket.on('file_tree_update', handleTreeUpdate);
    
    return () => {
      socket.off('create_project_result', handleResult);
      socket.off('file_tree_update', handleTreeUpdate);
    };
  }, []);

  const handleCreateProject = () => {
    if (!socket.connected) {
      alert("Please wait for server connection before creating a project.");
      return;
    }
    const projectName = prompt("Enter new project name (English characters/numbers only):", "new_project");
    if (!projectName) return;
    
    if (!/^[a-zA-Z0-9_-]+$/.test(projectName)) {
      alert("Invalid name. Please use only English letters, numbers, and underscores.");
      return;
    }

    sendEncrypted('create_new_project', projectName, encryptPayload);
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', backgroundColor: 'var(--bg-panel)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          GravityLink
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={handleCreateProject} 
            className="btn" 
            style={{ padding: '2px', color: 'var(--accent-color)' }} 
            title="Create New Project in i13_ctrl"
          >
            <FolderPlus size={16} />
          </button>
          <Lock size={12} color="var(--text-muted)" title="Read-Only via UI" />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {fileTree.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '16px', textAlign: 'center' }}>
            {socket.connected ? "Empty sandbox or loading..." : "Connecting to NB..."}
          </div>
        ) : (
          fileTree.map((node, i) => <FileNode key={i} node={node} level={0} />)
        )}
      </div>
    </div>
  );
}

// Recursive component to render the tree
function FileNode({ node, level }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const isDir = node.type === 'directory';
  const paddingLeft = `${level * 16}px`;

  return (
    <div>
      <div 
        onClick={() => isDir && setIsOpen(!isOpen)}
        style={{ 
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', 
          paddingLeft, cursor: isDir ? 'pointer' : 'default', userSelect: 'none',
          color: isDir ? 'var(--text-main)' : 'var(--text-muted)', fontSize: '0.9rem'
        }}
        className="tree-node"
      >
        {isDir ? (
          <>
            {isOpen ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
            <Folder size={16} color="var(--accent-color)" />
          </>
        ) : (
          <>
            <span style={{ width: '14px', display: 'inline-block' }}></span> {/* Spacer for alignment */}
            <File size={16} color="var(--text-muted)" />
          </>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      </div>
      
      {isDir && isOpen && node.children && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {node.children.map((child, i) => <FileNode key={i} node={child} level={level + 1} />)}
        </div>
      )}
    </div>
  );
}
