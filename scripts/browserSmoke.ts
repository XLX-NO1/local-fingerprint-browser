import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

type SmokeMode = 'browser-view' | 'web-contents-view' | 'dom-webview';

type SmokeResult = {
  mode: SmokeMode;
  landingTitle: string;
  openedUrl: string;
  popupOpenedInInternalTab: boolean;
  tabCount: number;
  downloadStatus?: string;
  downloadFilename?: string;
  selfTestOpened: boolean;
  externalProtocolBlocked?: boolean;
  addressSynced?: boolean;
};

const requireElectron = createRequire(__filename);
const electronPath = requireElectron('electron') as string;

async function main(): Promise<void> {
  const server = await startSmokeServer();
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const results = [
      await runSmokeMode('browser-view', baseUrl),
      await runSmokeMode('web-contents-view', baseUrl),
      await runSmokeMode('dom-webview', baseUrl),
    ];
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await closeServer(server);
  }
}

async function runSmokeMode(mode: SmokeMode, baseUrl: string): Promise<SmokeResult> {
  const userDataDir = await mkdtemp(join(tmpdir(), `lfb-browser-smoke-${mode}-`));
  try {
    const result = await runElectronSmokeProcess(mode, baseUrl, userDataDir);
    assertSmokeResult(result, mode);
    return result;
  } finally {
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  }
}

function runElectronSmokeProcess(mode: SmokeMode, baseUrl: string, userDataDir: string): Promise<SmokeResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(electronPath, ['.'], {
      cwd: process.cwd(),
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        ELECTRON_BROWSER_SMOKE_URL: `${baseUrl}/`,
        ELECTRON_BROWSER_SMOKE_USER_DATA_DIR: userDataDir,
        ...(mode === 'dom-webview' ? { ELECTRON_DOM_WEBVIEW_SMOKE: '1' } : { ELECTRON_BROWSER_SMOKE: '1' }),
        ...(mode === 'web-contents-view' ? { USE_WEB_CONTENTS_VIEW: '1' } : { USE_WEB_CONTENTS_VIEW: '0' }),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => {
      settled = true;
      stopElectronSmokeChild(child.pid, 'SIGTERM');
      reject(new Error(`Electron browser smoke timed out for ${mode}. stdout=${stdout} stderr=${stderr}`));
    }, 30000);
    const resolveAndStopChild = (result: SmokeResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      stopElectronSmokeChild(child.pid, 'SIGTERM');
      resolve(result);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.startsWith('ELECTRON_BROWSER_SMOKE_RESULT ')) {
          continue;
        }
        resolveAndStopChild(JSON.parse(line.slice('ELECTRON_BROWSER_SMOKE_RESULT '.length)) as SmokeResult);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      if (settled) {
        return;
      }
      clearTimeout(timeout);
      reject(new Error(`Electron browser smoke failed for ${mode} with code ${code}. stdout=${stdout} stderr=${stderr}`));
    });
  });
}

function stopElectronSmokeChild(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      process.kill(pid, signal);
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The process may already have exited after printing the smoke result.
    }
  }
}

function assertSmokeResult(result: SmokeResult, mode: SmokeMode): void {
  if (result.mode !== mode) {
    throw new Error(`Expected ${mode} smoke mode, got ${result.mode}.`);
  }
  if (result.landingTitle !== 'Smoke Landing') {
    throw new Error(`Unexpected smoke landing title: ${result.landingTitle}`);
  }
  if (!result.popupOpenedInInternalTab || result.tabCount < 2) {
    throw new Error(`Target blank did not open as an internal tab for ${mode}.`);
  }
  if (mode !== 'dom-webview' && (result.downloadStatus !== 'completed' || result.downloadFilename !== 'smoke-download.txt')) {
    throw new Error(`Download smoke failed for ${mode}: ${result.downloadFilename} ${result.downloadStatus}`);
  }
  if (mode === 'dom-webview' && (!result.externalProtocolBlocked || !result.addressSynced)) {
    throw new Error(`DOM webview smoke failed: externalProtocolBlocked=${result.externalProtocolBlocked} addressSynced=${result.addressSynced}`);
  }
  if (!result.selfTestOpened) {
    throw new Error(`Self-test page did not open for ${mode}.`);
  }
}

function startSmokeServer(): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.url === '/popup') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><title>Smoke Popup</title><h1>popup</h1>');
      return;
    }
    if (request.url === '/download') {
      response.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': 'attachment; filename="smoke-download.txt"',
      });
      response.end('local fingerprint browser smoke download\n');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
      <title>Smoke Landing</title>
      <h1>smoke landing</h1>
      <a data-smoke-target-blank href="/popup" target="_blank">open popup</a>
      <a data-smoke-download href="/download">download</a>`);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
