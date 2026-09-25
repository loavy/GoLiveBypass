import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const state = vi.hoisted(() => ({ dir: '', on: vi.fn(), request: vi.fn(), pulse: vi.fn() }));
vi.mock('electron', () => ({ app: { isPackaged: true, getAppPath: () => state.dir }, dialog: {} }));
vi.mock('electron-updater', () => ({ autoUpdater: { on: state.on } }));
vi.mock('https', () => ({ request: state.request }));
vi.mock('../electron/update-pulse', () => ({ UPDATE_STREAM_URL: '', createUpdatePulseClient: state.pulse }));
import { isLocalBuild } from '../electron/local-build';
import { setupUpdater } from '../electron/updater';
afterEach(() => { if (state.dir) rmSync(state.dir, { recursive: true, force: true }); vi.clearAllMocks(); });
it('local packaged builds never register an updater or contact the server, even when auto-update is enabled', () => {
  state.dir = mkdtempSync(join(tmpdir(), 'golive-local-'));
  writeFileSync(join(state.dir, 'package.json'), JSON.stringify({ goliveLocalBuild: true }));
  expect(isLocalBuild()).toBe(true);
  expect(setupUpdater(() => null, () => true)).toBeNull();
  expect(state.on).not.toHaveBeenCalled();
  expect(state.request).not.toHaveBeenCalled();
  expect(state.pulse).not.toHaveBeenCalled();
});
it('official builds remain eligible and malformed metadata does not enable the local flag', () => {
  state.dir = mkdtempSync(join(tmpdir(), 'golive-official-'));
  for (const data of ['{}', '{"goliveLocalBuild":false}', '{"goliveLocalBuild":"true"}', 'invalid']) {
    writeFileSync(join(state.dir, 'package.json'), data);
    expect(isLocalBuild()).toBe(false);
  }
});
