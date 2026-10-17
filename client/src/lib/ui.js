import { create } from 'zustand';

/** Global, imperatively-opened UI: toasts, dialogs, context menus and the image viewer. */
export const useUi = create(() => ({
  toasts: [],
  banners: [],
  dialog: null,
  menu: null,
  viewer: null,
}));

let toastSeq = 0;
export function toast(message, { type = 'info', duration = 2200 } = {}) {
  const id = ++toastSeq;
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, type }] }));
  setTimeout(() => {
    useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, duration);
}

export function toastError(error) {
  toast(error?.message ?? String(error), { type: 'error', duration: 3000 });
}

function openDialog(dialog) {
  return new Promise((resolve) => {
    useUi.setState({
      dialog: {
        ...dialog,
        resolve: (value) => {
          useUi.setState({ dialog: null });
          resolve(value);
        },
      },
    });
  });
}

/** Resolves true/false. */
export function confirmDialog({ title, message, confirmText = '确定', cancelText = '取消', danger = false }) {
  return openDialog({ kind: 'confirm', title, message, confirmText, cancelText, danger });
}

/** Resolves the entered string, or null when cancelled. */
export function promptDialog({ title, message, value = '', placeholder = '', maxLength = 30, multiline = false, confirmText = '确定', allowEmpty = true }) {
  return openDialog({ kind: 'prompt', title, message, value, placeholder, maxLength, multiline, confirmText, allowEmpty });
}

/**
 * Open a context menu at a point (desktop) or as an action sheet (touch).
 * items: [{ label, icon?, danger?, onClick }]
 */
export function openMenu({ x, y, items, title }) {
  useUi.setState({ menu: { x, y, items: items.filter(Boolean), title } });
}

export function closeMenu() {
  useUi.setState({ menu: null });
}

export function openViewer(images, index = 0) {
  useUi.setState({ viewer: { images, index } });
}

export function closeViewer() {
  useUi.setState({ viewer: null });
}

/**
 * In-app "new message" banner. One banner per conversation: a newer message replaces the
 * previous one for that chat (with a running count). At most three are shown at once.
 */
export function showBanner({ conversationId, title, body, count = 1 }) {
  useUi.setState((s) => {
    const existing = s.banners.find((b) => b.conversationId === conversationId);
    const banner = {
      id: `${conversationId}-${Date.now()}`,
      conversationId,
      title,
      body,
      count: existing ? existing.count + count : count,
      at: Date.now(),
    };
    return { banners: [banner, ...s.banners.filter((b) => b.conversationId !== conversationId)].slice(0, 3) };
  });
}

export function closeBanner(id) {
  useUi.setState((s) => ({ banners: s.banners.filter((b) => b.id !== id) }));
}

export function closeBannersFor(conversationId) {
  useUi.setState((s) => ({ banners: s.banners.filter((b) => b.conversationId !== conversationId) }));
}
