import './style.css'

const api = (window as any).api as {
  getStatus: () => Promise<string>;
  copyDiagnostic: (payload: { status: string; note?: string }) => Promise<boolean>;
  startLogWatch: () => Promise<{ path: string }>;
  stopLogWatch: () => Promise<boolean>;
  getDiagnostic: (payload: { status: string; note?: string }) => Promise<{
    text: string;
    logPath: string;
  }>;
  openBugReport: (payload: {
    status: string;
    note?: string;
    title?: string;
  }) => Promise<{
    ok: boolean;
    via?: 'api' | 'github';
    url: string;
    issueNumber?: number;
    copied: boolean;
    truncated: boolean;
    apiError?: string;
  }>;
  openLogFolder: () => Promise<string>;
  onLogChunk: (callback: (chunk: string) => void) => void;
  onRefreshStatus: (callback: () => void) => void;
};

const logConsole = document.getElementById('logConsole')!;
const bugNoteInput = document.getElementById('bugNoteInput') as HTMLTextAreaElement;
const reportBugBtn = document.getElementById('reportBugBtn') as HTMLButtonElement;
const copyDiagBtn = document.getElementById('copyDiagBtn') as HTMLButtonElement;
const openLogFolderBtn = document.getElementById('openLogFolderBtn') as HTMLButtonElement;
const devHint = document.getElementById('devHint')!;

const MAX_LOG_CHARS = 120_000;
let currentStatus = 'UNKNOWN';

let pendingLog = '';
let flushScheduled = false;
function appendLog(chunk: string) {
  pendingLog = (pendingLog + chunk).slice(-MAX_LOG_CHARS);
  if (flushScheduled || document.hidden) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    const atBottom = logConsole.scrollHeight - logConsole.scrollTop - logConsole.clientHeight < 32;
    logConsole.textContent = ((logConsole.textContent ?? '') + pendingLog).slice(-MAX_LOG_CHARS);
    pendingLog = '';
    if (atBottom) logConsole.scrollTop = logConsole.scrollHeight;
  });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pendingLog) appendLog('');
});

async function refreshStatus() {
  try {
    currentStatus = await api.getStatus();
  } catch {
    currentStatus = 'UNKNOWN';
  }
}

api.onLogChunk((chunk) => appendLog(chunk));
api.onRefreshStatus(() => {
  void refreshStatus();
});

void (async () => {
  await refreshStatus();
  logConsole.textContent = '';
  try {
    const r = await api.startLogWatch();
    devHint.textContent = `Logs ao vivo · ${r.path}`;
  } catch (err) {
    appendLog(`(falha ao observar log: ${err instanceof Error ? err.message : String(err)})\n`);
  }
})();

copyDiagBtn.addEventListener('click', async () => {
  copyDiagBtn.disabled = true;
  try {
    await api.copyDiagnostic({
      status: currentStatus,
      note: bugNoteInput.value,
    });
    devHint.textContent = 'Diagnóstico copiado para a área de transferência.';
  } catch (err) {
    devHint.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    copyDiagBtn.disabled = false;
  }
});

reportBugBtn.addEventListener('click', async () => {
  reportBugBtn.disabled = true;
  devHint.textContent = 'Enviando relato...';
  try {
    const r = await api.openBugReport({
      status: currentStatus,
      note: bugNoteInput.value,
      title: `[GUI] ${currentStatus} — relato`,
    });
    if (r.via === 'api') {
      devHint.textContent = r.issueNumber
        ? `Issue #${r.issueNumber} criada pela API.`
        : 'Issue criada pela API.';
    } else if (r.apiError) {
      devHint.textContent = `API falhou (${r.apiError}). Abri o formulário do GitHub; diagnóstico no clipboard.`;
    } else if (r.truncated) {
      devHint.textContent =
        'Issue aberta (corpo truncado). Diagnóstico completo no clipboard.';
    } else {
      devHint.textContent =
        'Formulário do GitHub aberto (labels bug,gui). Diagnóstico no clipboard.';
    }
  } catch (err) {
    devHint.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    reportBugBtn.disabled = false;
  }
});

openLogFolderBtn.addEventListener('click', async () => {
  try {
    const dir = await api.openLogFolder();
    devHint.textContent = `Pasta: ${dir}`;
  } catch (err) {
    devHint.textContent = err instanceof Error ? err.message : String(err);
  }
});
