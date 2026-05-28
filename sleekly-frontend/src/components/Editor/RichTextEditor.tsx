'use client';
import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import TiptapImage from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

// Singleton lowlight instance with all common languages (JS, TS, Python, SQL,
// YAML, JSON, Bash, Rust, Go, CSS, HTML, Markdown, and ~25 more)
const lowlight = createLowlight(common);
import { Card } from '@/types';
import { CARD_COLORS } from '@/lib/constants';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import { getDesktopService } from '@/lib/desktop/desktopAdapter';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Code, AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, Image as ImageIcon, Highlighter, X, Undo, Redo,
  BookOpen, Minimize2, Table as TableIcon, Upload
} from 'lucide-react';

/** Heuristic: does this clipboard text look like markdown? */
function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) ||           // headings
    /^\|.+\|/m.test(text) ||             // tables
    /^```/m.test(text) ||                // code fences
    /^>\s/m.test(text) ||               // blockquotes
    /^[-*+]\s/m.test(text) ||           // unordered lists
    /^\d+\.\s/m.test(text) ||          // ordered lists
    /\*\*.+\*\*/.test(text) ||          // bold
    /`.+`/.test(text) ||                 // inline code
    /^---+$/m.test(text)                 // horizontal rule
  );
}

/** Convert markdown text → HTML via marked (loaded lazily) */
async function markdownToHtml(md: string): Promise<string> {
  const { marked } = await import('marked');
  marked.setOptions({ gfm: true, breaks: false });
  return marked(md) as string;
}

interface Props {
  card: Card;
  mode?: 'preview' | 'edit';
  onSave: (card: Partial<Card>) => void;
  onClose: () => void;
}

function ResizableImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const width = node.attrs.width ? Number(node.attrs.width) : undefined;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startWidth = rect.width;

    const handleMove = (ev: MouseEvent) => {
      const nextWidth = Math.max(80, Math.round(startWidth + ev.clientX - startX));
      updateAttributes({ width: nextWidth });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [updateAttributes]);

  return (
    <NodeViewWrapper
      as="span"
      style={{
        display: 'inline-block',
        position: 'relative',
        maxWidth: '100%',
        lineHeight: 0,
        outline: selected ? '2px solid var(--accent)' : 'none',
        borderRadius: 6,
      }}
    >
      <img
        ref={imageRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        title={node.attrs.title || undefined}
        style={{
          width: width ? `${width}px` : undefined,
          maxWidth: '100%',
          height: 'auto',
          display: 'block',
          borderRadius: 6,
        }}
        draggable={false}
      />
      <button
        type="button"
        aria-label="Resize image"
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          right: -6,
          bottom: -6,
          width: 14,
          height: 14,
          border: '1px solid var(--border)',
          borderRadius: 4,
          background: 'var(--bg-secondary)',
          cursor: 'nwse-resize',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        }}
      />
    </NodeViewWrapper>
  );
}

const ResizableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.getAttribute('width') || element.style.width.replace('px', '') || null,
        renderHTML: attributes => attributes.width ? { width: attributes.width } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

function cleanContent(content: string): string {
  if (!content) return '';
  const trimmed = content.trim();
  if (
    trimmed === 'Start typing...' ||
    trimmed === '<p>Start typing...</p>' ||
    trimmed === '<p>Start typing...</p><p></p>' ||
    trimmed === '<p>Start typing...</p><p><br></p>'
  ) {
    return '';
  }
  return content;
}

export default function RichTextEditor({ card, mode = 'preview', onSave, onClose }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState(card.title);
  const [color, setColor] = useState(card.color);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [url, setUrl] = useState(card.url || '');
  const [tagsInput, setTagsInput] = useState((card.tags || []).join(', '));
  const [contentUpdated, setContentUpdated] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      // Disable StarterKit's plain CodeBlock — CodeBlockLowlight takes over
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Underline,
      ResizableImage,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: 'Start typing...',
        emptyNodeClass: 'is-editor-empty',
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: cleanContent(card.content || ''),
    immediatelyRender: false,
    onUpdate: () => {
      setContentUpdated(Date.now());
    },
    editorProps: {
      attributes: { class: 'tiptap' },
      handlePaste: (view, event) => {
        // Image file paste → upload to local store
        const file = Array.from(event.clipboardData?.files || []).find(f => f.type.startsWith('image/'));
        if (file && user) {
          event.preventDefault();
          void uploadFile(file).then(src => {
            if (!src) return;
            const { state, dispatch } = view;
            const node = state.schema.nodes.image?.create({ src });
            if (node) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
          });
          return true;
        }
        // Markdown text paste is handled by the useEffect DOM listener below
        return false;
      },
      handleDrop: (view, event) => {
        const file = Array.from(event.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
        if (!file || !user) return false;
        event.preventDefault();
        void uploadFile(file).then(src => {
          if (!src) return;
          const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const node = view.state.schema.nodes.image?.create({ src });
          if (coordinates && node) {
            view.dispatch(view.state.tr.insert(coordinates.pos, node).scrollIntoView());
          }
        });
        return true;
      },
    },
  });

  // Markdown paste: attach native DOM listener on the editor element so we
  // have direct access to both the clipboard text AND the TipTap editor instance.
  useEffect(() => {
    if (!editor) return;
    const editorEl = editor.view.dom;
    const onPaste = (e: ClipboardEvent) => {
      // Skip if image file is present (handled by editorProps.handlePaste above)
      const hasImageFile = Array.from(e.clipboardData?.files || []).some(f => f.type.startsWith('image/'));
      if (hasImageFile) return;

      const text = e.clipboardData?.getData('text/plain') || '';
      if (!text || !looksLikeMarkdown(text)) return;

      e.preventDefault();
      e.stopPropagation();

      void markdownToHtml(text).then(html => {
        editor.chain().focus().insertContent(html).run();
      });
    };
    // Use capture so it fires before ProseMirror's own paste handler
    editorEl.addEventListener('paste', onPaste, true);
    return () => editorEl.removeEventListener('paste', onPaste, true);
  }, [editor]);

  const toggleFocusMode = useCallback(() => {
    if (!focusMode) {
      // Enter focus mode: make editor read-only + browser fullscreen
      editor?.setEditable(false);
      overlayRef.current?.requestFullscreen?.().catch(() => {});
      setFocusMode(true);
    } else {
      // Exit focus mode: restore editing + exit browser fullscreen
      editor?.setEditable(true);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      setFocusMode(false);
    }
  }, [focusMode, editor]);

  // Sync state when user exits fullscreen via Escape (browser native)
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && focusMode) {
        editor?.setEditable(true);
        setFocusMode(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [focusMode, editor]);

  const autoSave = useCallback(() => {
    const parsedTags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    const newContent = editor?.getHTML() || '';
    
    const hasChanges = 
      title !== card.title ||
      color !== card.color ||
      url !== (card.url || '') ||
      tagsInput !== (card.tags || []).join(', ') ||
      newContent !== (card.content || '');

    if (hasChanges) {
      onSave({
        id: card.id,
        title,
        content: newContent,
        color,
        url,
        tags: parsedTags,
      });
    }
  }, [card, title, color, url, tagsInput, editor, onSave]);

  const handleClose = useCallback(() => {
    autoSave();
    onClose();
  }, [autoSave, onClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      autoSave();
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, color, url, tagsInput, contentUpdated, autoSave]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (focusMode) {
          // Fullscreen exit is handled by fullscreenchange listener
          return;
        }
        handleClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        autoSave();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [autoSave, handleClose, focusMode]);



  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    if (!file || !user) return null;
    try {
      return await getDesktopService().uploadMedia(file, user.id);
    } catch (err) {
      console.error('Upload failed', err);
      return null;
    }
  }, [user]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const newUrl = await uploadFile(file);
    if (newUrl) {
      setUrl(newUrl);
    }
  };

  const handleInlineImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    const src = await uploadFile(file);
    if (src) {
      editor.chain().focus().setImage({ src }).run();
    }
  };

  const submitLink = () => {
    if (urlInput && editor) {
      editor.chain().focus().setLink({ href: urlInput }).run();
    }
    setShowLinkInput(false);
    setUrlInput('');
  };

  const submitImage = () => {
    if (urlInput && editor) {
      editor.chain().focus().setImage({ src: urlInput }).run();
    }
    setShowImageInput(false);
    setUrlInput('');
  };

  const openLinkPrompt = () => {
    setUrlInput('');
    setShowImageInput(false);
    setShowLinkInput(true);
  };

  const openImagePrompt = () => {
    setUrlInput('');
    setShowLinkInput(false);
    setShowImageInput(true);
  };

  if (!editor) return null;



  // ---- Focus / Zen reading mode ----
  if (focusMode) {
    return (
      <div ref={overlayRef} className="focus-mode-overlay">
        <div className="focus-mode-container">
          <div className="focus-mode-header">
            <h1 className="focus-mode-title">{title || 'Untitled'}</h1>
            <button
              type="button"
              className="focus-mode-exit-btn"
              onClick={toggleFocusMode}
              title="Exit focus mode"
            >
              <Minimize2 size={18} />
            </button>
          </div>
          <div className="focus-mode-content">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'preview' && (card.type === 'image' || card.type === 'pdf') && url) {
    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.9)', zIndex: 100000 }} onClick={handleClose}>
        <button 
          onClick={handleClose}
          style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 100001 }}
        >
          <X size={24} />
        </button>
        <div style={{ width: '90vw', height: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          {card.type === 'pdf' ? (
            <iframe src={`${url}#view=FitH&pagemode=thumbs`} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: '#fff' }} title={title} />
          ) : (
            <img src={url} alt={title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
          )}
        </div>
      </div>
    );
  }

  if (mode === 'edit' && (card.type === 'image' || card.type === 'pdf')) {
    return (
      <div ref={overlayRef} className="modal-overlay" onClick={handleClose}>
        <div
          className="editor-modal"
          style={{ width: 'min(560px, calc(100vw - 32px))', maxHeight: 'none', borderRadius: 12 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="editor-modal-header">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Card title..."
            />
            <div className="editor-top-actions">
              <button className="editor-close-btn" onClick={handleClose}><X size={16} /></button>
            </div>
          </div>

          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <div className="editor-top-color-picker" style={{ justifyContent: 'flex-start' }}>
              {CARD_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  className={`editor-top-color-dot${color === c.value ? ' active' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>

            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {card.type === 'image' ? 'IMAGE URL' : 'PDF URL'}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="inline-input"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://... or upload a file"
                />
                <label className="editor-save-btn" style={{ cursor: 'pointer', padding: '8px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}>
                  Upload
                  <input type="file" style={{ display: 'none' }} accept={card.type === 'image' ? 'image/*' : 'application/pdf'} onChange={handleFileUpload} />
                </label>
              </div>
            </label>

            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              TAGS
              <input
                className="inline-input"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="e.g. urgent, research, draft"
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={overlayRef} className="modal-overlay" onClick={handleClose}>
      <div className="editor-modal" onClick={e => e.stopPropagation()}>
        <div className="editor-modal-header">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Card title..."
          />
          <div className="editor-top-actions">
            <div className="editor-top-color-picker">
              {CARD_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  className={`editor-top-color-dot${color === c.value ? ' active' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>
            <button
              className="editor-top-action-btn focus-mode-btn"
              onClick={toggleFocusMode}
              title="Focus mode — distraction-free reading (hides browser UI)"
            >
              <BookOpen size={14} /> Focus
            </button>
            <button className="editor-close-btn" onClick={handleClose}><X size={16} /></button>
          </div>
        </div>

        {card.type !== 'richtext' && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {card.type === 'image' ? 'IMAGE URL' : card.type === 'pdf' ? 'PDF URL' : card.type === 'link' ? 'LINK URL' : 'SOURCE URL'}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="inline-input"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={`https://... or upload a file`}
              />
              {(card.type === 'image' || card.type === 'pdf') && (
                <label className="editor-save-btn" style={{ cursor: 'pointer', padding: '6px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}>
                  Upload
                  <input type="file" style={{ display: 'none' }} accept={card.type === 'image' ? 'image/*' : 'application/pdf'} onChange={handleFileUpload} />
                </label>
              )}
            </div>
          </div>
        )}

        <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>TAGS (COMMA SEPARATED)</label>
          <input
            className="inline-input"
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            placeholder="e.g. urgent, research, draft"
          />
        </div>

        <div className="editor-toolbar">
          <button className={`editor-toolbar-btn${editor.isActive('bold') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive('italic') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive('underline') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive('strike') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive('highlight') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlighter size={15} /></button>
          <div className="editor-toolbar-divider" />
          <button className={`editor-toolbar-btn${editor.isActive('heading', { level: 1 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></button>
          <div className="editor-toolbar-divider" />
          <button className={`editor-toolbar-btn${editor.isActive('bulletList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive('orderedList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive('blockquote') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive('codeBlock') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code size={15} /></button>
          <div className="editor-toolbar-divider" />
          <button className={`editor-toolbar-btn${editor.isActive('link') ? ' active' : ''}`} onClick={openLinkPrompt}><LinkIcon size={15} /></button>
          <button className="editor-toolbar-btn" onClick={openImagePrompt}><ImageIcon size={15} /></button>
          <button className="editor-toolbar-btn" onClick={() => inlineImageInputRef.current?.click()} title="Upload image"><Upload size={15} /></button>
          <button className="editor-toolbar-btn" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table"><TableIcon size={15} /></button>
          <div className="editor-toolbar-divider" />
          <button className={`editor-toolbar-btn${editor.isActive({ textAlign: 'left' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive({ textAlign: 'center' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={15} /></button>
          <button className={`editor-toolbar-btn${editor.isActive({ textAlign: 'right' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={15} /></button>
          <div className="editor-toolbar-divider" />
          <button className="editor-toolbar-btn" onClick={() => editor.chain().focus().undo().run()}><Undo size={15} /></button>
          <button className="editor-toolbar-btn" onClick={() => editor.chain().focus().redo().run()}><Redo size={15} /></button>
        </div>

        {showLinkInput && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
            <input className="inline-input" placeholder="Enter URL..." value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitLink()} autoFocus />
            <button className="editor-save-btn" onClick={submitLink} style={{ padding: '4px 12px' }}>Apply</button>
            <button className="editor-close-btn" onClick={() => setShowLinkInput(false)}><X size={14}/></button>
          </div>
        )}
        {showImageInput && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
            <input className="inline-input" placeholder="Enter image URL..." value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitImage()} autoFocus />
            <button className="editor-save-btn" onClick={submitImage} style={{ padding: '4px 12px' }}>Apply</button>
            <button className="editor-close-btn" onClick={() => setShowImageInput(false)}><X size={14}/></button>
          </div>
        )}

        <input
          ref={inlineImageInputRef}
          type="file"
          hidden
          accept="image/*"
          onChange={handleInlineImageUpload}
        />

        <div className="editor-content" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <EditorContent editor={editor} />
        </div>

      </div>
    </div>
  );
}
