import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/button';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  // Trigger enter animation after mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = useCallback((immediate = false) => {
    if (closing) return;
    if (immediate) {
      onClose();
      return;
    }
    setClosing(true);
    setVisible(false);
  }, [closing, onClose]);

  // After exit animation finishes, fire real onClose
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => onClose(), 140);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        // Right-click outside = another context menu is about to open; close instantly
        handleClose(e.button === 2);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [handleClose]);

  // Adjust position to keep menu on-screen
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  return createPortal(
    <div
      ref={menuRef}
      className={`fixed z-[100] bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[180px] w-56 max-w-[70vw] max-h-[58vh] overflow-y-auto
        origin-top-left transition-all duration-[140ms] ease-out
        ${visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-1'}`}
      style={{ top: y, left: x }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1.5 border-t border-gray-100" />
        ) : (
          <Button
            key={i}
            type="button"
            onClick={() => {
              item.onClick();
              handleClose();
            }}
            disabled={item.disabled}
            variant="ghost"
            size="sm"
            className={`w-full justify-start text-left px-3 py-1.5 text-sm gap-2 transition-colors ${
              item.danger
                ? 'text-red-600 hover:bg-red-50'
                : 'text-gray-700 hover:bg-gray-50 hover:text-dark-text'
            } ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {item.icon && (
              <i className={`fas ${item.icon} text-xs w-4 text-center ${item.danger ? 'text-red-400' : 'text-gray-400'}`}></i>
            )}
            <span className="flex-1 truncate" title={item.label}>{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-gray-300 font-mono">{item.shortcut}</span>
            )}
          </Button>
        )
      )}
    </div>,
    document.body
  );
}
