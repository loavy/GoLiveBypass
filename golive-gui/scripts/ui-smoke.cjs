// Real sandboxed Electron renderer, mock backend: no VPN, credentials or updater.
// Run after compile: electron scripts/ui-smoke.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
app.disableHardwareAcceleration();
setTimeout(() => { console.error('UI smoke timed out'); app.exit(1); }, 30_000).unref();
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const runtimeRoot = process.env.GOLIVE_UI_PACKAGE || root;
const runtimePackage = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'golive-ui-smoke-'));
app.setPath('userData', profile);
const output = process.env.GOLIVE_UI_ARTIFACT_DIR || path.join(root, 'dist-app', 'review');
fs.mkdirSync(output, { recursive: true });
const securityModule = new Module('ui-security');
securityModule._compile(ts.transpileModule(fs.readFileSync(path.join(root, 'electron/ui-security.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, 'ui-security.cjs');
const { createUiIpc, isTrustedUiSender, protectUiWindow } = securityModule.exports;
let win;
const trustedWindows = [];
const errors = [];
const requests = [];
let status = 'INACTIVE';
let mode = 'proton';
let authenticated = false;
let optimizationOutcome;
let finishOptimization;
let activationCalls = 0;
let holdActivation = false;
let finishActivation;
let routePreference = 'auto';
let quitCalls = 0;
const statusReplies = [];
const responses = {
  'get-app-version': () => `${runtimePackage.version}${runtimePackage.goliveLocalBuild ? ' local' : ''}`, 'get-platform': () => 'linux',
  'get-status': () => statusReplies.length ? statusReplies.shift()() : status,
  'activate': () => {
    activationCalls++;
    if (!holdActivation) { status = 'ACTIVE'; return; }
    return new Promise((resolve, reject) => {
      finishActivation = (error) => {
        if (error) reject(error);
        else { status = 'ACTIVE'; resolve(); }
      };
    });
  },
  'quit-app': () => { quitCalls++; },
  'deactivate': () => { status = 'INACTIVE'; },
  'get-linux-preflight': () => null,
  'get-startup': () => false, 'get-auto-update': () => false,
  'get-update-channel': () => 'stable', 'get-wg-conf-name': () => '',
  'get-vpn-mode': () => mode, 'set-vpn-mode': (_e, next) => { mode = next; return next; },
  'get-proton-settings': () => ({ vpnMode: mode, routePreference, username: authenticated ? 'fixture-user' : '', country: '', freeOnly: true, autoPing: false, autoFailover: false }),
  'check-proton-session': () => ({ valid: authenticated }),
  'optimize-proton-route': () => new Promise((resolve, reject) => {
    finishOptimization = () => optimizationOutcome instanceof Error ? reject(optimizationOutcome) : resolve(optimizationOutcome);
  }),
  'cancel-proton-optimization': () => { finishOptimization(); return { success: true }; },
  'discover-proton-routes': () => ({ success: true, routes: [] }),
  'get-proton-plan': () => ({ success: true, status: 'free' }),
  'start-log-watch': () => ({ path: '/tmp/example.log' }),
};
const guarded = createUiIpc(ipcMain, (event) => isTrustedUiSender(event, trustedWindows));
const preload = fs.readFileSync(path.join(root, 'electron/preload.ts'), 'utf8');
for (const [, channel] of preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)) {
  guarded.handle(channel, responses[channel] || (() => true));
}
guarded.on('resize-window', (_e, h) => win.setContentSize(720, Math.min(900, Math.ceil(h))));
guarded.on('set-theme', () => {});
const pause = () => new Promise((resolve) => setTimeout(resolve, 350));
async function waitFor(check, label) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
}
async function screenshot(name) {
  await pause();
  fs.writeFileSync(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG());
}
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 720, height: 760, show: false, webPreferences: {
    preload: path.join(runtimeRoot, 'dist-electron/preload.cjs'),
    nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true,
  } });
  protectUiWindow(win, async () => {});
  win.webContents.on('console-message', ({ level, message }) => {
    if (['warning', 'error'].includes(level) && !message.includes('deprecated')) errors.push(message);
  });
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    if (/^https?:/.test(details.url)) requests.push(details.url);
    callback({ cancel: /^https?:/.test(details.url) });
  });
  const doc = path.join(runtimeRoot, 'dist/index.html');
  trustedWindows.push({ window: win, url: pathToFileURL(doc).href });
  await win.loadFile(doc);
  await pause();
  const result = await win.webContents.executeJavaScript(`({
    api: typeof window.api?.getStatus, node: typeof require,
    status: document.getElementById('statusText').textContent,
    loginVisible: !document.getElementById('protonAuthForm').hidden,
    overflow: document.documentElement.scrollWidth > innerWidth,
  })`);
  assert.equal(result.api, 'function');
  assert.equal(result.node, 'undefined');
  assert.equal(result.loginVisible, true);
  assert.equal(result.overflow, false);
  assert.notEqual(result.status, 'Carregando');
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.discord-btn') === null`), true);
  if (runtimePackage.goliveLocalBuild) {
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('autoUpdateToggle').disabled`), true);
  }
  await screenshot('interface-dark');
  await win.webContents.executeJavaScript(`document.getElementById('settingsBtn').click()`);
  await screenshot('settings');
  await win.webContents.executeJavaScript(`document.querySelector('[data-theme-opt="light"]').click(); document.getElementById('settingsClose').click()`);
  await screenshot('interface-light');
  await win.webContents.executeJavaScript(`document.getElementById('tabCustom').click()`);
  await pause();
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('panelCustom').hidden`), false);
  await screenshot('custom-profile');
  // CSP must reject injected inline script, even in the trusted local document.
  await win.webContents.executeJavaScript(`(() => { const s = document.createElement('script'); s.textContent = 'window.__injected = true'; document.body.append(s); })()`);
  assert.equal(await win.webContents.executeJavaScript('window.__injected'), undefined);
  assert.ok(errors.some((message) => /Content Security Policy|script-src/.test(message)));
  const unexpected = errors.filter((message) => !/Content Security Policy|script-src/.test(message));
  assert.deepEqual(unexpected, []);
  assert.deepEqual(requests, []);
  win.setContentSize(480, 720);
  await screenshot('compact');
  assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth'), false);
  // Run real renderer actions against controlled IPC outcomes. No network or account.
  authenticated = true;
  mode = 'proton';
  const optimizationCases = [
    ['success', { success: true, server: 'MX-FREE#11', pingMs: 137 }],
    ['cancelled', { success: false, cancelled: true }],
    ['failure', { success: false, error: 'Fixture measurement failure' }],
    ['exception', new Error('Fixture IPC failure')],
    ['deferred', { deferred: true }],
    ['missing-discord', { success: true, server: 'MX-FREE#11' }],
  ];
  for (const [name, outcome] of optimizationCases) {
    status = name === 'missing-discord' ? 'NOT_FOUND' : 'INACTIVE';
    optimizationOutcome = outcome;
    finishOptimization = undefined;
    await win.loadFile(doc);
    await waitFor(() => Boolean(finishOptimization), `${name}: optimization started`);
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('toggleBtn').disabled`), true, name);
    if (name === 'cancelled') {
      await win.webContents.executeJavaScript(`document.getElementById('protonCancelMeasurementBtn').click()`);
    } else finishOptimization();
    await waitFor(() => win.webContents.executeJavaScript(`!document.getElementById('protonOptimizeBtn').disabled`), `${name}: optimization finished`);
    const blocked = name === 'missing-discord';
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('toggleBtn').disabled`), blocked, name);
    // Close the result dialog, then verify the click reaches the activation IPC.
    await win.webContents.executeJavaScript(`document.getElementById('protonCloseMeasurementBtn').click()`);
    const before = activationCalls;
    await win.webContents.executeJavaScript(`document.getElementById('toggleBtn').click()`);
    if (blocked) {
      await pause();
      assert.equal(activationCalls, before);
    } else {
      await waitFor(() => activationCalls === before + 1, `${name}: activation IPC`);
      await waitFor(() => win.webContents.executeJavaScript(`document.getElementById('btnText').textContent === 'Desativar Bypass'`), `${name}: active state`);
    }
  }
  // A manually selected route must survive startup without automatic optimization.
  status = 'INACTIVE';
  routePreference = 'manual';
  finishOptimization = undefined;
  await win.loadFile(doc);
  await waitFor(() => win.webContents.executeJavaScript(`!document.getElementById('toggleBtn').disabled`), 'manual route ready');
  assert.equal(finishOptimization, undefined);
  holdActivation = true;
  const beforeActivation = activationCalls;
  await win.webContents.executeJavaScript(`document.getElementById('toggleBtn').click()`);
  await waitFor(() => Boolean(finishActivation), 'activation started');
  win.webContents.send('refresh-status');
  await pause();
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('toggleBtn').disabled`), true);
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('btnText').textContent`), 'Ativando…');
  await win.webContents.executeJavaScript(`document.getElementById('toggleBtn').dispatchEvent(new MouseEvent('click'))`);
  await pause();
  assert.equal(activationCalls, beforeActivation + 1, 'no duplicate activation during refresh');
  finishActivation();
  await waitFor(() => win.webContents.executeJavaScript(`document.getElementById('btnText').textContent === 'Desativar Bypass'`), 'activation complete');
  let finishOldStatus;
  statusReplies.push(() => new Promise((resolve) => { finishOldStatus = resolve; }));
  win.webContents.send('refresh-status');
  await waitFor(() => Boolean(finishOldStatus), 'old status waiting');
  win.webContents.send('refresh-status');
  await pause();
  finishOldStatus('INACTIVE');
  await pause();
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('btnText').textContent`), 'Desativar Bypass', 'ignore stale status');
  await win.webContents.executeJavaScript(`document.getElementById('toggleBtn').click()`);
  await waitFor(() => win.webContents.executeJavaScript(`document.getElementById('btnText').textContent === 'Ativar Bypass'`), 'deactivated');
  finishActivation = undefined;
  await win.webContents.executeJavaScript(`window.alert = () => {}; document.getElementById('toggleBtn').click()`);
  await waitFor(() => Boolean(finishActivation), 'failed activation started');
  finishActivation(new Error('Fixture activation failure'));
  await waitFor(() => win.webContents.executeJavaScript(`!document.getElementById('toggleBtn').disabled`), 'retry enabled after failure');
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('toggleBtn').classList.contains('loading')`), false);
  await win.webContents.executeJavaScript(`document.getElementById('settingsBtn').click(); document.getElementById('quitAppBtn').click(); document.getElementById('quitAppBtn').click()`);
  await waitFor(() => quitCalls === 1, 'explicit exit without tray');
  const logDoc = path.join(runtimeRoot, 'dist/logs.html');
  trustedWindows[0].url = pathToFileURL(logDoc).href;
  await win.loadFile(logDoc);
  await pause();
  win.webContents.send('log-chunk', '<script>untrusted log</script>\nDiagnostic fixture\n');
  await pause();
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#logConsole script') === null`), true);
  assert.match(await win.webContents.executeJavaScript(`document.getElementById('logConsole').textContent`), /Diagnostic fixture/);
  await win.webContents.executeJavaScript(`document.getElementById('copyDiagBtn').click()`);
  await pause();
  assert.match(await win.webContents.executeJavaScript(`document.getElementById('devHint').textContent`), /copiado/);
  await screenshot('logs');
  fs.writeFileSync(path.join(output, 'ui-smoke.json'), JSON.stringify({ result, externalRequests: requests, optimizationCases: optimizationCases.map(([name]) => name), stabilityCases: ['manual startup', 'duplicate activation', 'stale status', 'activation failure recovery', 'exit without tray'], activationCalls, quitCalls, passed: true }, null, 2));
  console.log('UI smoke passed: isolated preload, IPC, themes, settings, import panel, CSP, local resources and logs.');
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
app.on('quit', () => fs.rmSync(profile, { recursive: true, force: true }));
