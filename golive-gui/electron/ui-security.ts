import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

/** Exact document identity; neither sibling files nor subframes inherit trust. */
export function isTrustedUiSender(
  event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>,
  windows: Array<{ window: BrowserWindow | null; url: string }>,
): boolean {
  return windows.some(({ window, url }) => {
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return false;
    if (!event.senderFrame || event.senderFrame !== window.webContents.mainFrame) return false;
    try {
      const actual = new URL(event.senderFrame.url);
      actual.hash = '';
      return actual.href === new URL(url).href;
    } catch { return false; }
  });
}

export function createUiIpc(ipc: IpcMain, trusted: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean) {
  return {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => any) {
      ipc.handle(channel, (event, ...args) => {
        if (!trusted(event)) throw new Error('Origem IPC não autorizada.');
        return listener(event, ...args);
      });
    },
    on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) {
      ipc.on(channel, (event, ...args) => {
        if (trusted(event)) listener(event, ...args);
      });
    },
  };
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['github.com', 'discord.gg', 'account.proton.me'].includes(url.hostname);
  } catch { return false; }
}

export function protectUiWindow(win: BrowserWindow, openExternal: (url: string) => Promise<unknown>) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-redirect', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
}
