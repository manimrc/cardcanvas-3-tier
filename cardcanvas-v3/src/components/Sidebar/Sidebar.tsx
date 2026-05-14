'use client';
import { Folder, Board } from '@/types';
import FileTree from './FileTree';
import { PanelLeftClose, LogOut } from 'lucide-react';

export type SidebarView = 'workspaces' | 'tags' | 'whiteboard';

interface TagEntry {
  key: string;
  label: string;
}

interface UserInfo {
  id: string;
  username: string;
  displayName: string;
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
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
  globalTagEntries: TagEntry[];
  selectedTagKeys: string[];
  onToggleTagKey: (key: string) => void;
  onClearTagSelection: () => void;
  user?: UserInfo | null;
  onLogout?: () => void;
}

export default function Sidebar(props: Props) {
  return (
    <aside className={`sidebar${props.collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-icon">📋</div>
        <span className="logo">CardCanvas</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="tree-action-btn"
          onClick={props.onToggle}
          title="Collapse sidebar"
          style={{ color: 'var(--text-muted)' }}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="sidebar-mode-tabs">
        <button
          type="button"
          className={`sidebar-mode-tab${props.view === 'workspaces' ? ' active' : ''}`}
          onClick={() => props.onViewChange('workspaces')}
        >
          Workspaces
        </button>
        <button
          type="button"
          className={`sidebar-mode-tab${props.view === 'tags' ? ' active' : ''}`}
          onClick={() => props.onViewChange('tags')}
        >
          Tags
        </button>
        <button
          type="button"
          className={`sidebar-mode-tab${props.view === 'whiteboard' ? ' active' : ''}`}
          onClick={() => props.onViewChange('whiteboard')}
        >
          Whiteboard
        </button>
      </div>

      {props.view === 'tags' ? (
        <div className="sidebar-content sidebar-tags-panel">
          <div className="sidebar-section-title">Global tags</div>
          {props.globalTagEntries.length === 0 ? (
            <p className="sidebar-tags-empty">No hashtags yet. Add <code>#tags</code> in card text or use tag fields in the editor.</p>
          ) : (
            <>
              <div className="sidebar-tags-cloud">
                {props.globalTagEntries.map(({ key, label }) => {
                  const on = props.selectedTagKeys.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`sidebar-tag-pill${on ? ' selected' : ''}`}
                      onClick={() => props.onToggleTagKey(key)}
                    >
                      #{label}
                    </button>
                  );
                })}
              </div>
              {props.selectedTagKeys.length > 0 && (
                <button type="button" className="sidebar-tags-clear" onClick={props.onClearTagSelection}>
                  Clear selection
                </button>
              )}
            </>
          )}
        </div>
      ) : props.view === 'whiteboard' ? (
        null
      ) : (
        <div className="sidebar-content">
          <div className="sidebar-section-title">Workspaces</div>
          <FileTree
            folders={props.folders}
            boards={props.boards}
            activeBoardId={props.activeBoardId}
            onSelectBoard={props.onSelectBoard}
            onCreateFolder={props.onCreateFolder}
            onCreateBoard={props.onCreateBoard}
            onDeleteFolder={props.onDeleteFolder}
            onDeleteBoard={props.onDeleteBoard}
            onRenameFolder={props.onRenameFolder}
            onRenameBoard={props.onRenameBoard}
          />
        </div>
      )}

      {/* User section at bottom */}
      {props.user && (
        <div className="sidebar-user-section">
          <div className="sidebar-user-avatar">
            {(props.user.displayName || props.user.username).charAt(0)}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{props.user.displayName}</div>
            <div className="sidebar-user-handle">@{props.user.username}</div>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            title="Sign out"
            onClick={props.onLogout}
          >
            <LogOut size={14} />
          </button>
        </div>
      )}
    </aside>
  );
}

