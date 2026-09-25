import { describe, expect, it, vi } from 'vitest';
import { createUiIpc, isAllowedExternalUrl, isTrustedUiSender, protectUiWindow } from '../electron/ui-security';

describe('desktop trust boundary', () => {
  const url = 'file:///app/dist/index.html';
  function fixture(frameUrl = url) {
    const frame = { url: frameUrl };
    const contents = { mainFrame: frame };
    const window = { isDestroyed: () => false, webContents: contents };
    const event = { sender: contents, senderFrame: frame };
    return { event, windows: [{ window, url }] } as any;
  }
  it('accepts only the registered document and main frame', () => {
    const good = fixture();
    expect(isTrustedUiSender(good.event, good.windows)).toBe(true);
    for (const badUrl of ['https://evil.example', 'file:///app/dist/logs.html', `${url}?injected=1`, `${url}.evil`]) {
      const bad = fixture(badUrl);
      expect(isTrustedUiSender(bad.event, bad.windows)).toBe(false);
    }
    expect(isTrustedUiSender({ ...good.event, senderFrame: { url } }, good.windows)).toBe(false);
    expect(isTrustedUiSender({ ...good.event, sender: {} }, good.windows)).toBe(false);
    expect(isTrustedUiSender({ ...good.event, senderFrame: null }, good.windows)).toBe(false);
  });
  it('rejects IPC before a privileged operation executes', async () => {
    const handlers = new Map();
    const raw = { handle: (c: string, fn: any) => handlers.set(c, fn), on: (c: string, fn: any) => handlers.set(c, fn) };
    const ipc = createUiIpc(raw as any, (e) => (e as any).trusted === true);
    const operation = vi.fn(() => 'ok');
    ipc.handle('activate', operation);
    expect(() => handlers.get('activate')({ trusted: false })).toThrow('não autorizada');
    expect(operation).not.toHaveBeenCalled();
    expect(await handlers.get('activate')({ trusted: true })).toBe('ok');
    operation.mockClear();
    ipc.on('resize', operation);
    handlers.get('resize')({ trusted: false });
    expect(operation).not.toHaveBeenCalled();
  });
  it('opens only HTTPS links on explicit support/account hosts', () => {
    expect(isAllowedExternalUrl('https://github.com/bezumiya/GoLiveBypass/issues/1')).toBe(true);
    expect(isAllowedExternalUrl('https://account.proton.me/signup')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'file:///tmp/payload', 'http://github.com', 'https://github.com.evil.example', 'https://user@github.com', 'https://github.com:8443', 'invalid']) {
      expect(isAllowedExternalUrl(bad)).toBe(false);
    }
  });
  it('blocks navigation, webviews, permissions and untrusted popups', () => {
    const events = new Map();
    let popup: any, permission: any;
    const open = vi.fn(async () => {});
    const window = { webContents: {
      setWindowOpenHandler: (fn: any) => { popup = fn; },
      on: (name: string, fn: any) => events.set(name, fn),
      session: { setPermissionRequestHandler: (fn: any) => { permission = fn; }, setPermissionCheckHandler: vi.fn() },
    } };
    protectUiWindow(window as any, open);
    expect(popup({ url: 'https://evil.example' })).toEqual({ action: 'deny' });
    expect(open).not.toHaveBeenCalled();
    popup({ url: 'https://discord.gg/example' });
    expect(open).toHaveBeenCalledOnce();
    for (const name of ['will-navigate', 'will-redirect', 'will-attach-webview']) {
      const preventDefault = vi.fn();
      events.get(name)({ preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
    }
    const result = vi.fn();
    permission(null, 'media', result);
    expect(result).toHaveBeenCalledWith(false);
  });
});
