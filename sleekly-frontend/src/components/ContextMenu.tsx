'use client';
import { useEffect, useRef } from 'react';

interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="context-menu-divider" />
        ) : (
          <button
            key={i}
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            onClick={() => { item.onClick(); onClose(); }}
          >
            {item.icon && <span>{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
