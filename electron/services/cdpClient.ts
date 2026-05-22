import type { FingerprintConfig } from '../../src/types';

export interface CdpCommand {
  method: string;
  params?: Record<string, unknown>;
}

export interface CdpResponse {
  id: number;
  result?: unknown;
  error?: unknown;
}

export interface CdpTransport {
  send(payload: string): void;
  onMessage(handler: (payload: string) => void): void;
  close(): void;
}

interface CdpClientOptions {
  baseUrl?: string;
  retries?: number;
  retryDelayMs?: number;
}

export class CdpClient {
  private readonly baseUrl: string;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(private readonly debugPort: number, options: CdpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? `http://127.0.0.1:${debugPort}`;
    this.retries = options.retries ?? 40;
    this.retryDelayMs = options.retryDelayMs ?? 150;
  }

  async getPageWebSocketUrl(): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.retries; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}/json/list`);
        if (!response.ok) {
          throw new Error(`CDP list endpoint returned ${response.status}`);
        }
        const targets = (await response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
        const pageTarget = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
        if (!pageTarget?.webSocketDebuggerUrl) {
          throw new Error('CDP list endpoint did not include a page websocket target');
        }
        return pageTarget.webSocketDebuggerUrl;
      } catch (error) {
        lastError = error;
        await delay(this.retryDelayMs);
      }
    }

    throw new Error(`Unable to connect to Chromium CDP on port ${this.debugPort}: ${toMessage(lastError)}`);
  }

  async applyCommands(commands: CdpCommand[]): Promise<CdpResponse[]> {
    const webSocketUrl = await this.getPageWebSocketUrl();
    const transport = await openWebSocketTransport(webSocketUrl);
    return sendCdpCommands(transport, commands);
  }
}

export function buildCdpSetupCommands(fingerprint: FingerprintConfig, preloadScript: string, navigateUrl?: string): CdpCommand[] {
  const commands: CdpCommand[] = [
    {
      method: 'Page.enable',
    },
    {
      method: 'Runtime.enable',
    },
    {
      method: 'Network.enable',
    },
    {
      method: 'Target.setAutoAttach',
      params: {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      },
    },
    {
      method: 'Page.addScriptToEvaluateOnNewDocument',
      params: { source: preloadScript },
    },
    {
      method: 'Network.setUserAgentOverride',
      params: {
        userAgent: fingerprint.userAgent,
        acceptLanguage: fingerprint.languages.join(','),
        platform: fingerprint.platform,
      },
    },
    {
      method: 'Emulation.setTimezoneOverride',
      params: { timezoneId: fingerprint.timezone },
    },
    {
      method: 'Emulation.setLocaleOverride',
      params: { locale: fingerprint.languages[0] },
    },
    {
      method: 'Emulation.setDeviceMetricsOverride',
      params: {
        width: fingerprint.screenWidth,
        height: fingerprint.screenHeight,
        deviceScaleFactor: 1,
        mobile: false,
      },
    },
  ];

  if (navigateUrl) {
    commands.push({
      method: 'Page.navigate',
      params: { url: navigateUrl },
    });
    commands.push({
      method: 'Runtime.evaluate',
      params: {
        expression: `new Promise((resolve) => {
          let attempts = 0;
          const check = () => {
            if (window.__LOCAL_FINGERPRINT_SELF_TEST_RESULT__) {
              resolve(window.__LOCAL_FINGERPRINT_SELF_TEST_RESULT__);
              return;
            }
            attempts += 1;
            if (attempts >= 30) {
              resolve(null);
              return;
            }
            setTimeout(check, 100);
          };
          check();
        })`,
        returnByValue: true,
        awaitPromise: true,
      },
    });
  }

  return commands;
}

export function buildNavigateCommand(url: string): CdpCommand {
  return {
    method: 'Page.navigate',
    params: { url },
  };
}

export async function sendCdpCommands(transport: CdpTransport, commands: CdpCommand[], timeoutMs = 5000): Promise<CdpResponse[]> {
  const pending = new Map<number, (response: CdpResponse) => void>();
  transport.onMessage((payload) => {
    const message = JSON.parse(payload) as CdpResponse;
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });

  const responses: CdpResponse[] = [];
  for (const [index, command] of commands.entries()) {
    const id = index + 1;
    const response = await new Promise<CdpResponse>((resolve, reject) => {
      pending.set(id, resolve);
      transport.send(JSON.stringify({ id, ...command }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP command timed out: ${command.method}`));
        }
      }, timeoutMs);
    });
    responses.push(response);
  }
  transport.close();
  return responses;
}

async function openWebSocketTransport(url: string): Promise<CdpTransport> {
  const WebSocketCtor = globalThis.WebSocket;
  if (!WebSocketCtor) {
    throw new Error('WebSocket is not available in this runtime');
  }

  const socket = new WebSocketCtor(url);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error(`Unable to open CDP websocket: ${url}`)), { once: true });
  });

  return {
    send: (payload: string) => socket.send(payload),
    onMessage: (handler: (payload: string) => void) => {
      socket.addEventListener('message', (event) => handler(String(event.data)));
    },
    close: () => socket.close(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
