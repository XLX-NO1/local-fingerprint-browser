import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { BrowserProfile, LaunchResult } from '../../src/types';
import type { CdpCommand } from './cdpClient';
import { buildCdpSetupCommands, buildNavigateCommand, CdpClient } from './cdpClient';
import { prepareExtensionRuntime } from './extensionRuntime';
import { buildFingerprintPreloadScript } from './fingerprint';
import { proxyToChromiumUrl } from './proxy';
import { prepareSelfTestPage } from './selfTestPage';
import { extractSelfTestReportFromExecutionResult, summarizeSelfTestReport } from './selfTestResult';

interface ChromiumArgOptions {
  extensionDir: string;
  debugPort: number;
  selfTestUrl?: string;
}

interface LaunchAutomationPlan {
  args: string[];
  preloadScript: string;
  cdpCommands: CdpCommand[];
  debugPort: number;
}

export function buildChromiumArgs(profile: BrowserProfile, options: ChromiumArgOptions): string[] {
  const args = [
    `--user-data-dir=${profile.userDataDir}`,
    `--remote-debugging-port=${options.debugPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--lang=${profile.fingerprint.languages[0]}`,
    `--window-size=${profile.fingerprint.windowWidth},${profile.fingerprint.windowHeight}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-component-update',
    '--allow-file-access-from-files',
    '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  ];

  if (profile.proxy) {
    args.push(`--proxy-server=${proxyToChromiumUrl(profile.proxy)}`);
    args.push('--proxy-bypass-list=<-loopback>');
  }

  if (options.extensionDir) {
    args.push(`--load-extension=${options.extensionDir}`);
    args.push(`--disable-extensions-except=${options.extensionDir}`);
  }

  if (options.selfTestUrl) {
    args.push('about:blank');
  }

  return args;
}

export function buildLaunchAutomationPlan(profile: BrowserProfile, options: ChromiumArgOptions): LaunchAutomationPlan {
  const preloadScript = buildFingerprintPreloadScript(profile.fingerprint);
  return {
    args: buildChromiumArgs(profile, options),
    preloadScript,
    cdpCommands: buildCdpSetupCommands(profile.fingerprint, preloadScript, options.selfTestUrl),
    debugPort: options.debugPort,
  };
}

export class BrowserLauncher {
  private readonly processes = new Map<string, ChildProcess>();
  private readonly debugPorts = new Map<string, number>();

  constructor(
    private readonly chromiumPath: string,
    private readonly extensionDir: string,
  ) {}

  async launch(profile: BrowserProfile): Promise<LaunchResult> {
    const launchTrace: string[] = [];
    if (!existsSync(this.chromiumPath)) {
      throw new Error(`Chromium executable not found: ${this.chromiumPath}`);
    }

    await mkdir(profile.userDataDir, { recursive: true });
    launchTrace.push('profile directory ready');
    const debugPort = allocateDebugPort(profile.id);
    const runtimeExtensionDir = await prepareExtensionRuntime(profile, this.extensionDir);
    launchTrace.push('extension runtime prepared');
    const selfTestPage = await prepareSelfTestPage(profile);
    launchTrace.push('self-test page prepared');
    const plan = buildLaunchAutomationPlan(profile, { extensionDir: runtimeExtensionDir, debugPort, selfTestUrl: selfTestPage.fileUrl });
    const child = spawn(this.chromiumPath, plan.args, {
      detached: false,
      stdio: 'ignore',
    });

    if (!child.pid) {
      throw new Error('Failed to launch Chromium process');
    }

    this.processes.set(profile.id, child);
    this.debugPorts.set(profile.id, debugPort);
    child.once('exit', () => this.processes.delete(profile.id));
    launchTrace.push(`chromium process started: ${child.pid}`);

    let automationStatus: LaunchResult['automationStatus'] = 'attached';
    let automationError: string | undefined;
    let selfTestSummary: string | undefined;
    let selfTestReport: Record<string, unknown> | undefined;
    try {
      const responses = await new CdpClient(debugPort).applyCommands(plan.cdpCommands);
      selfTestReport = extractSelfTestReport(responses.at(-1)?.result);
      selfTestSummary = summarizeSelfTestReport(selfTestReport);
      launchTrace.push('cdp preload and self-test commands completed');
    } catch (error) {
      automationStatus = 'degraded';
      automationError = error instanceof Error ? error.message : String(error);
      launchTrace.push(`cdp degraded: ${automationError}`);
    }

    return {
      profileId: profile.id,
      pid: child.pid,
      debugPort,
      selfTestUrl: selfTestPage.fileUrl,
      selfTestSummary,
      selfTestReport,
      launchTrace,
      automationStatus,
      automationError,
    };
  }

  async stop(profileId: string): Promise<void> {
    const child = this.processes.get(profileId);
    if (!child) {
      return;
    }
    child.kill();
    this.processes.delete(profileId);
    this.debugPorts.delete(profileId);
  }

  async openUrl(profileId: string, url: string): Promise<void> {
    const debugPort = this.debugPorts.get(profileId);
    if (!debugPort) {
      throw new Error(`Profile browser is not running: ${profileId}`);
    }
    await new CdpClient(debugPort).applyCommands([buildNavigateCommand(url)]);
  }
}

const extractSelfTestReport = extractSelfTestReportFromExecutionResult;

export function findChromiumPath(): string | undefined {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function allocateDebugPort(profileId: string): number {
  let hash = 0;
  for (let index = 0; index < profileId.length; index += 1) {
    hash = (hash * 33 + profileId.charCodeAt(index)) >>> 0;
  }
  return 40000 + (hash % 10000);
}
