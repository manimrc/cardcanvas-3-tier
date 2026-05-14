'use client';
import { useState, useRef, useEffect } from 'react';
import { Folder, Board } from '@/types';
import {
  FolderIcon, FolderOpen, FileText, ChevronRight, ChevronDown,
  Plus, Trash2, Edit3
} from 'lucide-react';

interface Props {
  folders: Folder[];
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateBoard: (folderId: string) => void;
  onDeleteFolder: (id: string) => void;
  onDeleteBoard: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onRenameBoard: (id: string, name: string) => void;
}

interface TreeNode {
  folder: Folder;
  children: TreeNode[];
  boards: Board[];
}

function buildTree(folders: Folder[], boards: Board[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  folders.forEach(f => map.set(f.id, { folder: f, children: [], boards: [] }));
  boards.forEach(b => {
    const node = map.get(b.folderId);
    if (node) node.boards.push(b);
  });
  const roots: TreeNode[] = [];
  map.forEach(node => {
    if (node.folder.parentId && map.has(node.folder.parentId)) {
      map.get(node.folder.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function FolderNode({ node, activeBoardId, onSelectBoard, onCreateFolder, onCreateBoard, onDeleteFolder, onDeleteBoard, onRenameFolder, onRenameBoard, depth }: {
  node: TreeNode; depth: number;
} & Omit<Props, 'folders' | 'boards'>) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.folder.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const handleRename = () => {
    if (name.trim() && name !== node.folder.name) onRenameFolder(node.folder.id, name.trim());
    setEditing(false);
  };

  return (
    <div>
      <div className="tree-item" style={{ paddingLeft: 8 + depth * 12 }}>
        <span className="icon" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="icon">
          {expanded ? <FolderOpen size={14} /> : <FolderIcon size={14} />}
        </span>
        {editing ? (
          <input
            ref={inputRef}
            className="inline-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
          />
        ) : (
          <span className="label" onDoubleClick={() => setEditing(true)}>{node.folder.name}</span>
        )}
        <div className="actions">
          <button className="tree-action-btn" title="Add board" onClick={() => onCreateBoard(node.folder.id)}><Plus size={12} /></button>
          <button className="tree-action-btn" title="Rename" onClick={() => setEditing(true)}><Edit3 size={12} /></button>
          <button className="tree-action-btn" title="Delete" onClick={() => onDeleteFolder(node.folder.id)}><Trash2 size={12} /></button>
        </div>
      </div>
      {expanded && (
        <div className="tree-children">
          {node.boards.map(b => (
            <BoardItem
              key={b.id}
              board={b}
              active={b.id === activeBoardId}
              onSelect={() => onSelectBoard(b.id)}
              onDelete={() => onDeleteBoard(b.id)}
              onRename={(newName) => onRenameBoard(b.id, newName)}
              depth={depth + 1}
            />
          ))}
          {node.children.map(child => (
            <FolderNode
              key={child.folder.id}
              node={child}
              activeBoardId={activeBoardId}
              onSelectBoard={onSelectBoard}
              onCreateFolder={onCreateFolder}
              onCreateBoard={onCreateBoard}
              onDeleteFolder={onDeleteFolder}
              onDeleteBoard={onDeleteBoard}
              onRenameFolder={onRenameFolder}
              onRenameBoard={onRenameBoard}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardItem({ board, active, onSelect, onDelete, onRename, depth }: {
  board: Board; active: boolean; onSelect: () => void; onDelete: () => void;
  onRename: (name: string) => void; depth: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const handleRename = () => {
    if (name.trim() && name !== board.name) onRename(name.trim());
    setEditing(false);
  };

  return (
    <div
      className={`tree-item${active ? ' active' : ''}`}
      style={{ paddingLeft: 8 + depth * 12 }}
      onClick={onSelect}
    >
      <span className="icon"><FileText size={14} /></span>
      {editing ? (
        <input
          ref={inputRef}
          className="inline-input"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className="label">{board.name}</span>
      )}
      <div className="actions">
        <button className="tree-action-btn" title="Rename" onClick={e => { e.stopPropagation(); setEditing(true); }}><Edit3 size={12} /></button>
        <button className="tree-action-btn" title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

export default function FileTree(props: Props) {
  const tree = buildTree(props.folders, props.boards);

  return (
    <div>
      {tree.map(node => (
        <FolderNode key={node.folder.id} node={node} {...props} depth={0} />
      ))}
      <button className="tree-add-btn" onClick={() => props.onCreateFolder(null)}>
        <Plus size={12} /> New Folder
      </button>
    </div>
  );
}
