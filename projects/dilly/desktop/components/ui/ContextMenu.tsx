'use client';
import { useState, useEffect, useRef } from 'react';

interface MenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  color?: string;
  divider?: boolean;
  action: () => void;
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
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 20);

  return (
    <div className="fixed inset-0 z-[100]" onContextMenu={e => e.preventDefault()}>
      <div
        ref={ref}
        className="absolute bg-surface-1 border border-border-main rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] py-1.5 min-w-[200px] backdrop-blur-xl overflow-hidden"
        style={{
          left: adjustedX,
          top: adjustedY,
          animation: 'ctxIn 120ms ease-out',
        }}
      >
        {items.map((item, i) => (
          item.divider ? (
            <div key={i} className="h-px bg-border-main mx-2 my-1.5" />
          ) : (
            <button
              key={i}
              onClick={() => { item.action(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-dilly-blue/10 transition-colors duration-100 group"
            >
              {item.icon && (
                <span className="text-[14px] w-5 text-center opacity-60 group-hover:opacity-100 transition-opacity">
                  {item.icon}
                </span>
              )}
              <span className={`text-[13px] font-medium flex-1 ${item.color || 'text-txt-1'} group-hover:text-dilly-blue transition-colors`}>
                {item.label}
              </span>
              {item.shortcut && (
                <span className="text-[10px] text-txt-3 font-mono tracking-wider bg-surface-2 px-1.5 py-0.5 rounded">
                  {item.shortcut}
                </span>
              )}
            </button>
          )
        ))}
      </div>
      <style>{`
        @keyframes ctxIn {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}