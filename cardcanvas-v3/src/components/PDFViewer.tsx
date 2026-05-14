'use client';
import { X } from 'lucide-react';

interface Props {
  url: string;
  title: string;
  onClose: () => void;
}

export default function PDFViewer({ url, title, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pdf-viewer-modal" onClick={e => e.stopPropagation()}>
        <div className="pdf-viewer-header">
          <span>📄 {title}</span>
          <button className="editor-close-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="pdf-viewer-body">
          <iframe
            src={url}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              borderRadius: '8px',
            }}
            title={title}
          />
        </div>
      </div>
    </div>
  );
}
