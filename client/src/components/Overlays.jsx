import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { closeMenu, closeViewer, useUi } from '../lib/ui.js';
import { isTouch } from '../lib/hooks.js';
import { Modal } from './Modal.jsx';

const supportsPopover = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;

function showOnTop(el) {
  if (!supportsPopover || !el) return;
  if (el.matches(':popover-open')) el.hidePopover();
  el.showPopover();
}

export function ToastHost() {
  const toasts = useUi((s) => s.toasts);
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!supportsPopover || !el) return;
    // Re-show so the toast layer stacks above any modal opened since.
    if (toasts.length) showOnTop(el);
    else if (el.matches(':popover-open')) el.hidePopover();
  }, [toasts]);
  return (
    <div ref={ref} popover="manual" className="toast-layer" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function MenuHost() {
  const menu = useUi((s) => s.menu);
  if (!menu) return null;
  return <FloatingMenu key={`${menu.x},${menu.y},${menu.items.length}`} menu={menu} />;
}

function FloatingMenu({ menu }) {
  const ref = useRef(null);
  const [sheet] = useState(isTouch);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (supportsPopover) el.showPopover();
    if (sheet) return;
    const { width, height } = el.getBoundingClientRect();
    let x = menu.x;
    let y = menu.y;
    if (x + width > window.innerWidth - 8) x = Math.max(8, x - width);
    if (y + height > window.innerHeight - 8) y = Math.max(8, y - height);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [menu, sheet]);

  // A manual popover with our own dismissal: with popover="auto", the pointerup that ends the
  // right-click which opened the menu would immediately light-dismiss it.
  useEffect(() => {
    const el = ref.current;
    const onPointerDown = (e) => {
      if (!el) return;
      if (e.target === el) {
        // Taps on the ::backdrop (action sheet) are reported on the popover itself.
        const r = el.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) closeMenu();
      } else if (!el.contains(e.target)) {
        closeMenu();
      }
    };
    const onKey = (e) => e.key === 'Escape' && closeMenu();
    const t = setTimeout(() => document.addEventListener('pointerdown', onPointerDown, true));
    document.addEventListener('keydown', onKey);
    // On phones the keyboard closing resizes the viewport; only desktop menus follow the window.
    if (!sheet) window.addEventListener('resize', closeMenu);
    window.addEventListener('blur', closeMenu);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('blur', closeMenu);
    };
  }, [sheet]);

  const run = (item) => {
    closeMenu();
    item.onClick?.();
  };

  const body = (
    <div ref={ref} popover="manual" className={sheet ? 'action-sheet' : 'context-menu'}>
      {menu.title && <div className="menu-title">{menu.title}</div>}
      {menu.items.map((item) => (
        <button key={item.label} type="button" className={item.danger ? 'danger' : ''} onClick={() => run(item)}>
          {item.icon && <item.icon size={16} aria-hidden="true" />}
          <span>{item.label}</span>
        </button>
      ))}
      {sheet && (
        <button type="button" className="sheet-cancel" onClick={closeMenu}>
          取消
        </button>
      )}
    </div>
  );

  if (supportsPopover) return body;
  return (
    <div className="menu-fallback-backdrop" onClick={(e) => e.target === e.currentTarget && closeMenu()}>
      {body}
    </div>
  );
}

export function DialogHost() {
  const dialog = useUi((s) => s.dialog);
  if (!dialog) return null;
  return dialog.kind === 'prompt' ? <PromptDialog dialog={dialog} /> : <ConfirmDialog dialog={dialog} />;
}

function ConfirmDialog({ dialog }) {
  const result = useRef(false);
  return (
    <Modal className="modal-alert" onClose={() => dialog.resolve(result.current)}>
      {dialog.title && <h2 className="alert-title">{dialog.title}</h2>}
      {dialog.message && <p className="alert-message">{dialog.message}</p>}
      <form method="dialog" className="alert-actions" onSubmit={(e) => {
        result.current = e.nativeEvent.submitter?.value === 'ok';
      }}>
        {/* Primary first in DOM so Enter submits it; CSS shows it on the right. */}
        <button value="ok" className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus>
          {dialog.confirmText}
        </button>
        <button value="cancel" className="btn btn-plain">
          {dialog.cancelText}
        </button>
      </form>
    </Modal>
  );
}

function PromptDialog({ dialog }) {
  const [value, setValue] = useState(dialog.value ?? '');
  const result = useRef(null);
  const Field = dialog.multiline ? 'textarea' : 'input';
  const tooLong = [...value].length > dialog.maxLength;
  const empty = !dialog.allowEmpty && !value.trim();
  return (
    <Modal className="modal-alert" onClose={() => dialog.resolve(result.current)}>
      {dialog.title && <h2 className="alert-title">{dialog.title}</h2>}
      {dialog.message && <p className="alert-message">{dialog.message}</p>}
      <form
        method="dialog"
        className="prompt-form"
        onSubmit={(e) => {
          if (e.nativeEvent.submitter?.value === 'ok') result.current = value.trim();
        }}
      >
        <Field
          className="input"
          value={value}
          placeholder={dialog.placeholder}
          onChange={(e) => setValue(e.target.value)}
          rows={dialog.multiline ? 6 : undefined}
          autoFocus
        />
        <div className={`field-count ${tooLong ? 'over' : ''}`}>
          {[...value].length}/{dialog.maxLength}
        </div>
        <div className="alert-actions">
          <button value="ok" className="btn btn-primary" disabled={tooLong || empty}>
            {dialog.confirmText}
          </button>
          <button value="cancel" className="btn btn-plain" formNoValidate>
            取消
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ImageViewerHost() {
  const viewer = useUi((s) => s.viewer);
  if (!viewer) return null;
  return <ImageViewer key={viewer.images.join('|')} viewer={viewer} />;
}

function ImageViewer({ viewer }) {
  const [index, setIndex] = useState(viewer.index);
  const ref = useRef(null);
  const touchStart = useRef(null);
  const swiped = useRef(false);
  const { images } = viewer;
  const go = (delta) => setIndex((i) => (i + delta + images.length) % images.length);
  const close = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    ref.current?.close();
  };

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      className="viewer"
      aria-label="图片预览"
      onClose={closeViewer}
      onClick={(e) => {
        if (e.target === e.currentTarget || e.target.classList.contains('viewer-stage')) close();
      }}
      // Swipe left/right between images on touch screens.
      onTouchStart={(e) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        if (!start || images.length < 2) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          swiped.current = true;
          go(dx < 0 ? 1 : -1);
        }
      }}
    >
      <div className="viewer-stage">
        <img src={images[index]} alt={`图片 ${index + 1}`} onClick={close} draggable="false" />
      </div>
      <div className="viewer-toolbar">
        {images.length > 1 && <span className="viewer-count">{index + 1} / {images.length}</span>}
        <a className="icon-btn" href={images[index]} download aria-label="下载图片" onClick={(e) => e.stopPropagation()}>
          <Download size={20} />
        </a>
        <button type="button" className="icon-btn" aria-label="关闭" onClick={() => ref.current.close()}>
          <X size={22} />
        </button>
      </div>
      {images.length > 1 && (
        <>
          <button type="button" className="viewer-nav prev" aria-label="上一张" onClick={() => go(-1)}>
            <ChevronLeft size={28} />
          </button>
          <button type="button" className="viewer-nav next" aria-label="下一张" onClick={() => go(1)}>
            <ChevronRight size={28} />
          </button>
        </>
      )}
    </dialog>
  );
}
