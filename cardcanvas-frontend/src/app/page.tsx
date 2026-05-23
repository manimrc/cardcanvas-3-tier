'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/components/AuthContext';
import { api } from '@/lib/api';
import { Card, Board, Folder, CardType } from '@/types';
import Sidebar, { type SidebarView } from '@/components/Sidebar/Sidebar';
import Toolbar from '@/components/Toolbar/Toolbar';
import InfiniteCanvas, { type InfiniteCanvasHandle } from '@/components/Canvas/InfiniteCanvas';
import TagGridView from '@/components/Canvas/TagGridView';
import RichTextEditor from '@/components/Editor/RichTextEditor';
import AddMediaModal from '@/components/AddMediaModal';
import WhiteboardView from '@/components/Whiteboard/WhiteboardView';
import JournalView from '@/components/Journal/JournalView';
import { collectGlobalTagEntries, cardMatchesSelectedTags } from '@/lib/hashtags';
import { inferMediaType } from '@/lib/mediaType';
import { findNonOverlappingPosition } from '@/lib/collision';
import { PanelLeft } from 'lucide-react';

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function Home() {
  const { user, logout } = useAuth();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(() => readStorage('cc_activeBoardId', null));
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarView>(() => readStorage<SidebarView>('cc_sidebarView', 'workspaces'));
  const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([]);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingCardMode, setEditingCardMode] = useState<'preview' | 'edit'>('preview');
  const [loading, setLoading] = useState(true);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [isLightMode, setIsLightMode] = useState(() => readStorage('cc_isLightMode', true));
  const [searchQuery, setSearchQuery] = useState('');
  const [journalDate, setJournalDate] = useState(() => new Date());

  const handleLogout = useCallback(() => { logout(); }, [logout]);

  const workspaceScrollRef = useRef<Record<string, { left: number; top: number }>>({});
  const workspaceCanvasRef = useRef<InfiniteCanvasHandle>(null);

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('cc_isLightMode', JSON.stringify(isLightMode));
  }, [isLightMode]);

  useEffect(() => {
    if (activeBoardId) localStorage.setItem('cc_activeBoardId', JSON.stringify(activeBoardId));
  }, [activeBoardId]);

  useEffect(() => {
    localStorage.setItem('cc_sidebarView', JSON.stringify(sidebarView));
  }, [sidebarView]);

  const fetchAllCards = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.cards.listAll();
      setAllCards(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch all cards:', err);
    }
  }, [user]);

  const activeBoardIdRef = useRef(activeBoardId);
  activeBoardIdRef.current = activeBoardId;

  const fetchTree = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.workspace.tree();
      setFolders(data.folders || []);
      setBoards(data.boards || []);
      if (data.boards?.length > 0) {
        if (!activeBoardIdRef.current || !data.boards.some((b: Board) => b.id === activeBoardIdRef.current)) {
          setActiveBoardId(data.boards[0].id);
        }
      } else {
        setActiveBoardId(null);
      }
    } catch (err) {
      console.error('Failed to fetch tree:', err);
    }
    setLoading(false);
  }, [user]);

  const fetchCards = useCallback(async () => {
    if (!user || !activeBoardId) { setCards([]); return; }
    try {
      const data = await api.cards.list(activeBoardId);
      setCards(Array.isArray(data) ? data : []);
      const board = boards.find(b => b.id === activeBoardId);
      setActiveBoard(board || null);
    } catch (err) {
      console.error('Failed to fetch cards:', err);
    }
  }, [user, activeBoardId, boards]);

  useEffect(() => { fetchTree(); }, [fetchTree]);
  useEffect(() => { fetchCards(); }, [fetchCards]);
  useEffect(() => { void fetchAllCards(); }, [fetchAllCards]);
  useEffect(() => { if (sidebarView === 'tags') void fetchAllCards(); }, [sidebarView, fetchAllCards]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) setSidebarCollapsed(true);
  }, []);

  const globalTagEntries = useMemo(() => collectGlobalTagEntries(allCards), [allCards]);
  const boardNameMap = useMemo(() => Object.fromEntries(boards.map(b => [b.id, b.name])), [boards]);
  const getWorkspaceScroll = useCallback((id: string) => workspaceScrollRef.current[id], []);
  const persistWorkspaceScroll = useCallback((id: string, left: number, top: number) => {
    workspaceScrollRef.current[id] = { left, top };
  }, []);

  const matchesSearch = useCallback((c: Card) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (c.title || '').toLowerCase().includes(q) || (c.content || '').toLowerCase().includes(q);
  }, [searchQuery]);

  const filteredWorkspaceCards = useMemo(() => cards.filter(c => matchesSearch(c)), [cards, matchesSearch]);
  const filteredTagCards = useMemo(() => allCards.filter(c => matchesSearch(c) && cardMatchesSelectedTags(c, selectedTagKeys)), [allCards, matchesSearch, selectedTagKeys]);

  const getViewportSpot = useCallback((width = 280, height = 200) => {
    const vp = workspaceCanvasRef.current?.getViewportPosition();
    const baseX = vp?.x ?? 120;
    const baseY = vp?.y ?? 120;
    return findNonOverlappingPosition('__new__', baseX, baseY, width, height, cards);
  }, [cards]);

  const toggleTagKey = useCallback((key: string) => {
    setSelectedTagKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }, []);

  const createCard = useCallback(async (type: string, x: number, y: number, url?: string) => {
    if (!user || !activeBoardId) return;

    const defaults: Record<string, Partial<Card>> = {
      richtext: { title: 'New Note', content: '', color: '#FFF9C4' },
      link:     { title: 'New Link', content: '<p>Paste a URL here</p>', color: '#BBDEFB' },
      image:    { title: 'New Image', content: '<p>Add an image URL</p>', color: '#C8E6C9' },
      pdf:      { title: 'PDF Document', content: '', color: '#FFE0B2' },
      article:  { title: 'Clipped Article', content: '<p>Paste article content...</p>', color: '#E1BEE7' },
    };
    const d = defaults[type] || defaults.richtext;
    if (url) d.url = url;

    const w = d.width ?? 280;
    const h = d.height ?? 200;
    const resolved = findNonOverlappingPosition('__new__', x, y, w, h, cards);

    try {
      const card = await api.cards.create({
        id: generateUUID(),
        board_id: activeBoardId,
        type: type as CardType,
        x: resolved.x,
        y: resolved.y,
        width: w,
        height: h,
        is_locked: false,
        ...d,
      });
      setCards(prev => [...prev, card]);
      setAllCards(prev => [...prev, card]);
    } catch (err) {
      console.error('Failed to create card:', err);
    }
  }, [user, activeBoardId, cards]);

  const updateCard = useCallback(async (update: Partial<Card>) => {
    if (!user) return;
    setCards(prev => prev.map(c => (c.id === update.id ? { ...c, ...update } : c)));
    setAllCards(prev => prev.map(c => (c.id === update.id ? { ...c, ...update } : c)));
    try {
      if (update.id) {
        await api.cards.update(update.id, update);
      }
    } catch (err) {
      console.error('Failed to update card:', err);
    }
  }, [user]);

  const deleteCard = useCallback(async (id: string) => {
    if (!user) return;
    setCards(prev => prev.filter(c => c.id !== id));
    setAllCards(prev => prev.filter(c => c.id !== id));
    try {
      await api.cards.delete(id);
    } catch (err) {
      console.error('Failed to delete card:', err);
    }
  }, [user]);

  const createFolder = useCallback(async () => {
    if (!user) return;
    try {
      await api.workspace.createFolder('New Folder');
      fetchTree();
    } catch (err) { console.error(err); }
  }, [user, fetchTree]);

  const deleteFolder = useCallback(async (id: string) => {
    if (!user) return;
    try {
      await api.workspace.deleteFolder(id);
      fetchTree();
    } catch (err) { console.error(err); }
  }, [user, fetchTree]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    if (!user) return;
    try {
      await api.workspace.renameFolder(id, name);
      fetchTree();
    } catch (err) { console.error(err); }
  }, [user, fetchTree]);

  const createBoard = useCallback(async (folderId: string) => {
    if (!user) return;
    try {
      const board = await api.workspace.createBoard('Untitled Board', folderId || null);
      await fetchTree();
      setActiveBoardId(board.id);
    } catch (err) { console.error(err); }
  }, [user, fetchTree]);

  const deleteBoard = useCallback(async (id: string) => {
    if (!user) return;
    try {
      await api.workspace.deleteBoard(id);
      if (activeBoardId === id) setActiveBoardId(null);
      fetchTree();
      void fetchAllCards();
    } catch (err) { console.error(err); }
  }, [user, activeBoardId, fetchTree, fetchAllCards]);

  const renameBoard = useCallback(async (id: string, name: string) => {
    if (!user) return;
    try {
      await api.workspace.renameBoard(id, name);
      fetchTree();
    } catch (err) { console.error(err); }
  }, [user, fetchTree]);

  const handleBoardNameChange = useCallback((name: string) => {
    if (activeBoardId) {
      setActiveBoard(prev => (prev ? { ...prev, name } : null));
      renameBoard(activeBoardId, name);
    }
  }, [activeBoardId, renameBoard]);

  const exportBoardPng = useCallback(async () => {
    if (!activeBoardId) return;
    const host = workspaceCanvasRef.current?.getScrollContainer();
    if (!host) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(host, {
        scale: 2, useCORS: true, allowTaint: true, logging: false,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0f0f13',
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      const safe = (activeBoard?.name || 'board').replace(/[^\w\-]+/g, '_').slice(0, 60);
      a.download = `${safe || 'board'}.png`;
      a.click();
    } catch (err) { console.error('Export failed:', err); }
  }, [activeBoardId, activeBoard?.name]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Loading CardCanvas...</div>
        </div>
      </div>
    );
  }

  const isWhiteboard = sidebarView === 'whiteboard';
  const isJournal = sidebarView === 'journal';
  const tagsToolbar = sidebarView === 'tags';

  return (
    <div className="app-layout">
      {!sidebarCollapsed && (
        <div className="sidebar-overlay" onClick={() => setSidebarCollapsed(true)} />
      )}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        view={sidebarView}
        onViewChange={setSidebarView}
        folders={folders}
        boards={boards}
        activeBoardId={activeBoardId}
        onSelectBoard={id => { setActiveBoardId(id); setSidebarView('workspaces'); }}
        onCreateFolder={createFolder}
        onCreateBoard={createBoard}
        onDeleteFolder={deleteFolder}
        onDeleteBoard={deleteBoard}
        onRenameFolder={renameFolder}
        onRenameBoard={renameBoard}
        globalTagEntries={globalTagEntries}
        selectedTagKeys={selectedTagKeys}
        onToggleTagKey={toggleTagKey}
        onClearTagSelection={() => setSelectedTagKeys([])}
        user={user}
        onLogout={handleLogout}
        journalDate={journalDate}
        onJournalDateChange={setJournalDate}
      />

      <div className="main-area">
        {!isWhiteboard && !isJournal && (
          <Toolbar
            mode={tagsToolbar ? 'tags' : 'workspace'}
            boardName={activeBoard?.name || ''}
            onBoardNameChange={handleBoardNameChange}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onAddCard={type => {
              if (type === 'richtext') {
                const pos = getViewportSpot();
                createCard(type, pos.x, pos.y);
              } else {
                setMediaModalOpen(true);
              }
            }}
            onExport={tagsToolbar ? undefined : exportBoardPng}
            isLightMode={isLightMode}
            onToggleTheme={() => setIsLightMode(!isLightMode)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        )}

        {isWhiteboard && sidebarCollapsed && (
          <button type="button" className="whiteboard-sidebar-toggle" onClick={() => setSidebarCollapsed(false)} title="Open sidebar">
            <PanelLeft size={18} />
          </button>
        )}

        {isJournal && sidebarCollapsed && (
          <button type="button" className="whiteboard-sidebar-toggle" onClick={() => setSidebarCollapsed(false)} title="Open sidebar">
            <PanelLeft size={18} />
          </button>
        )}

        {isJournal ? (
          <JournalView selectedDate={journalDate} isLightMode={isLightMode} />
        ) : isWhiteboard ? (
          activeBoardId ? (
            <WhiteboardView isLightMode={isLightMode} boardId={activeBoardId} />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 48 }}>🎨</div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>Select or create a board to use the whiteboard</div>
            </div>
          )
        ) : sidebarView === 'tags' ? (
          <TagGridView
            cards={filteredTagCards}
            boardNameMap={boardNameMap}
            onDeleteCard={deleteCard}
            onEditCard={(card, mode = 'preview') => { setEditingCard(card); setEditingCardMode(mode); }}
          />
        ) : activeBoardId ? (
          <InfiniteCanvas
            ref={workspaceCanvasRef}
            cards={filteredWorkspaceCards}
            boardId={activeBoardId}
            getRestoredScroll={getWorkspaceScroll}
            onPersistScroll={persistWorkspaceScroll}
            onUpdateCard={updateCard}
            onCreateCard={createCard}
            onDeleteCard={deleteCard}
            onEditCard={(card, mode = 'preview') => { setEditingCard(card); setEditingCardMode(mode); }}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 48 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Select or create a board to get started</div>
          </div>
        )}
      </div>

      {editingCard && (
        <RichTextEditor
          card={editingCard}
          mode={editingCardMode}
          onSave={updateCard}
          onClose={() => setEditingCard(null)}
        />
      )}

      <AddMediaModal
        open={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        onConfirm={(u, mime) => {
          const pos = getViewportSpot();
          createCard(inferMediaType(u, mime), pos.x, pos.y, u);
        }}
      />
    </div>
  );
}
