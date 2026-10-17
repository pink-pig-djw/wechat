import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const supportsClosedBy = typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;

/**
 * Native modal <dialog>: focus trapping, Esc / back-gesture dismissal and top-layer stacking come for free.
 * Rendered only while open; closing (Esc, backdrop, ✕) calls `onClose`.
 */
export function Modal({ onClose, title, children, footer, className = '', width, dismissible = true, headerExtra }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Light-dismiss fallback for browsers without <dialog closedby>.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || supportsClosedBy || !dismissible) return undefined;
    const onClick = (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = r.top <= event.clientY && event.clientY <= r.bottom && r.left <= event.clientX && event.clientX <= r.right;
      if (!inside) dialog.close();
    };
    dialog.addEventListener('click', onClick);
    return () => dialog.removeEventListener('click', onClick);
  }, [dismissible]);

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      closedby={dismissible ? 'any' : 'none'}
      aria-labelledby={title ? titleId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      style={width ? { '--modal-width': typeof width === 'number' ? `${width}px` : width } : undefined}
    >
      {title != null && (
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          {headerExtra}
          <button type="button" className="icon-btn" aria-label="关闭" onClick={() => ref.current?.close()}>
            <X size={20} />
          </button>
        </header>
      )}
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </dialog>
  );
}
