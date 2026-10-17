import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

function subscribeMedia(query) {
  return (callback) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  };
}

export function useMediaQuery(query) {
  return useSyncExternalStore(subscribeMedia(query), () => window.matchMedia(query).matches);
}

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

/** Re-render every `ms` milliseconds (for relative timestamps and typing indicators). */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * Long-press (touch) + right-click (mouse) → callback with the pointer position.
 * Returns props to spread on the target element.
 */
export function useContextAction(callback, delay = 450) {
  const ref = useRef({ timer: null, start: null, firedAt: 0 });
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const cancel = () => {
    clearTimeout(ref.current.timer);
    ref.current.timer = null;
  };
  // Android also fires `contextmenu` on long-press; only react once per gesture.
  const fire = (payload) => {
    const now = Date.now();
    if (now - ref.current.firedAt < 800) return;
    ref.current.firedAt = now;
    cbRef.current(payload);
  };

  return {
    onContextMenu(e) {
      e.preventDefault();
      cancel();
      fire({ x: e.clientX, y: e.clientY, target: e.currentTarget });
    },
    onTouchStart(e) {
      const t = e.touches[0];
      const start = { x: t.clientX, y: t.clientY };
      const target = e.currentTarget;
      ref.current.start = start;
      cancel();
      ref.current.timer = setTimeout(() => {
        ref.current.timer = null;
        navigator.vibrate?.(10);
        fire({ ...start, target });
      }, delay);
    },
    onTouchMove(e) {
      const t = e.touches[0];
      const { start } = ref.current;
      if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}
