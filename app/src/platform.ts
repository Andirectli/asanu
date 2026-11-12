// Everything OS-specific lives here so a Windows build only touches this file and src-tauri.
import { invoke } from '@tauri-apps/api/core';

export const isTauri = '__TAURI_INTERNALS__' in window;
export const isMac = /Mac/.test(navigator.platform);
/** Display name of the primary modifier: ⌘ on macOS, Ctrl elsewhere. */
export const modKey = isMac ? '⌘' : 'Ctrl';
export const isMod = (e: KeyboardEvent | React.KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);

// Session tokens live in the OS keystore (macOS Keychain via Rust `keyring`).
// The browser fallback is only for `npm run dev` without Tauri and keeps the token per tab.
export async function loadToken(server: string): Promise<string | null> {
  if (isTauri) return invoke<string | null>('token_get', { server });
  return sessionStorage.getItem(`asanu-token:${server}`);
}

export async function saveToken(server: string, token: string): Promise<void> {
  if (isTauri) return invoke('token_set', { server, token });
  sessionStorage.setItem(`asanu-token:${server}`, token);
}

export async function deleteToken(server: string): Promise<void> {
  if (isTauri) return invoke('token_delete', { server });
  sessionStorage.removeItem(`asanu-token:${server}`);
}

export function deviceName(): string {
  return isTauri ? `Asanu Desktop (${isMac ? 'macOS' : 'Windows'})` : 'Asanu Browser';
}
