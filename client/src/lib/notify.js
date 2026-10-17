import { usePrefs } from './prefs.js';

let audioCtx;

/** A short two-note chime synthesised on the fly (no audio asset needed). */
export function playChime() {
  if (!usePrefs.getState().sound) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.11;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // audio not available
  }
}

export function canNotify() {
  return typeof Notification !== 'undefined';
}

export async function requestNotificationPermission() {
  if (!canNotify()) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

export function showDesktopNotification(title, body, onClick) {
  if (!usePrefs.getState().desktop || !canNotify() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    const n = new Notification(title, { body, icon: '/favicon.svg', tag: title });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    // some platforms only allow notifications from a service worker
  }
}
