import { Capacitor } from '@capacitor/core';
import { closeMenu, useUi } from './ui.js';

/** True inside the Android app (Capacitor), false in a normal browser. */
export const isNative = Capacitor.isNativePlatform();

const TAB_ROOTS = ['/chats', '/contacts', '/discover', '/me', '/login', '/register'];

/** Hook up the Android back button and hide the splash screen once the app has rendered. */
export async function initNative(navigate) {
  if (!isNative) return;
  const [{ App }, { SplashScreen }] = await Promise.all([import('@capacitor/app'), import('@capacitor/splash-screen')]);
  SplashScreen.hide();

  App.addListener('backButton', () => {
    // Close the topmost overlay first: menu, then any open dialog.
    if (useUi.getState().menu) return closeMenu();
    const dialogs = document.querySelectorAll('dialog[open]');
    if (dialogs.length) return dialogs[dialogs.length - 1].close();

    // On a main tab, behave like WeChat: go to the background instead of quitting.
    if (TAB_ROOTS.includes(window.location.pathname)) return App.minimizeApp();
    if ((window.history.state?.idx ?? 0) > 0) window.history.back();
    else navigate('/chats', { replace: true });
  });
}

/** Android's WebView ignores download links, so hand files to the system browser there. */
export async function openExternal(url) {
  const absolute = new URL(url, window.location.origin).href;
  if (!isNative) {
    window.open(absolute, '_blank', 'noopener');
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: absolute });
}
