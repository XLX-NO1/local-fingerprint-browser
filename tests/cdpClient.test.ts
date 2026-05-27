import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FingerprintConfig } from '../src/types';
import { CdpClient, buildCdpSetupCommands, buildNavigateCommand, sendCdpCommands } from '../electron/services/cdpClient';
import { generateFingerprint } from '../electron/services/fingerprint';
import { deriveUserAgentMetadata } from '../electron/services/fingerprint/model';

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url === '/json/list') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify([
        {
          id: 'page-1',
          type: 'page',
          url: 'about:blank',
          webSocketDebuggerUrl: 'ws://127.0.0.1:40123/devtools/page/page-1',
        },
      ]));
      return;
    }
    if (request.url === '/json/version') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1:40123/devtools/browser/test' }));
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server failed to bind');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('CdpClient', () => {
  it('fetches the page websocket endpoint from json list', async () => {
    const client = new CdpClient(40123, { baseUrl });

    await expect(client.getPageWebSocketUrl()).resolves.toBe('ws://127.0.0.1:40123/devtools/page/page-1');
  });

  it('builds setup commands for fingerprint injection', () => {
    const fingerprint = generateFingerprint('profile-cdp');
    const commands = buildCdpSetupCommands(fingerprint, 'preload-script', 'file:///tmp/self-test.html');

    expect(commands).toContainEqual({
      method: 'Page.enable',
    });
    expect(commands).toContainEqual({
      method: 'Runtime.enable',
    });
    expect(commands).toContainEqual({
      method: 'Network.enable',
    });
    expect(commands).toContainEqual({
      method: 'Target.setAutoAttach',
      params: {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      },
    });
    expect(commands).toContainEqual({
      method: 'Page.addScriptToEvaluateOnNewDocument',
      params: { source: 'preload-script' },
    });
    expect(commands).toContainEqual({
      method: 'Network.setUserAgentOverride',
      params: {
        userAgent: fingerprint.userAgent,
        acceptLanguage: fingerprint.languages.join(','),
        platform: fingerprint.platform,
        userAgentMetadata: deriveUserAgentMetadata(fingerprint),
      },
    });
    expect(commands).toContainEqual({
      method: 'Emulation.setTimezoneOverride',
      params: { timezoneId: fingerprint.timezone },
    });
    expect(commands).toContainEqual({
      method: 'Emulation.setLocaleOverride',
      params: { locale: fingerprint.languages[0] },
    });
    expect(commands).toContainEqual({
      method: 'Emulation.setDeviceMetricsOverride',
      params: {
        width: fingerprint.screenWidth,
        height: fingerprint.screenHeight,
        deviceScaleFactor: 1,
        mobile: false,
      },
    });
    expect(commands).toContainEqual({
      method: 'Page.navigate',
      params: { url: 'file:///tmp/self-test.html' },
    });
    expect(commands.at(-1)).toEqual({
      method: 'Runtime.evaluate',
      params: {
        expression: expect.stringContaining('__LOCAL_FINGERPRINT_SELF_TEST_RESULT__'),
        returnByValue: true,
        awaitPromise: true,
      },
    });
    expect(commands.at(-1)?.params?.expression).toContain('result.complete');
  });

  it('throws a clear error when the endpoint is unavailable', async () => {
    const client = new CdpClient(49999, { baseUrl: 'http://127.0.0.1:9', retries: 1, retryDelayMs: 1 });

    await expect(client.getPageWebSocketUrl()).rejects.toThrow('Unable to connect to Chromium CDP');
  });

  it('sends setup commands and returns command responses', async () => {
    const sent: string[] = [];
    let onMessage: ((payload: string) => void) | undefined;
    const transport = {
      send: vi.fn((payload: string) => {
        sent.push(payload);
        const parsed = JSON.parse(payload) as { id: number };
        onMessage?.(JSON.stringify({ id: parsed.id, result: { echoedMethod: JSON.parse(payload).method } }));
      }),
      close: vi.fn(),
      onMessage: vi.fn((handler: (payload: string) => void) => {
        onMessage = handler;
      }),
    };

    const responses = await sendCdpCommands(transport, [
      { method: 'Page.enable' },
      { method: 'Runtime.enable', params: { target: 'main' } },
    ]);

    expect(sent.map((payload) => JSON.parse(payload))).toEqual([
      { id: 1, method: 'Page.enable' },
      { id: 2, method: 'Runtime.enable', params: { target: 'main' } },
    ]);
    expect(responses).toEqual([
      { id: 1, result: { echoedMethod: 'Page.enable' } },
      { id: 2, result: { echoedMethod: 'Runtime.enable' } },
    ]);
    expect(transport.close).toHaveBeenCalled();
  });

  it('builds a page navigation command for opening user urls', () => {
    expect(buildNavigateCommand('https://example.com/')).toEqual({
      method: 'Page.navigate',
      params: { url: 'https://example.com/' },
    });
  });

  it('sends commands sequentially after each response', async () => {
    const sent: string[] = [];
    const handlers: Array<(payload: string) => void> = [];
    const transport = {
      send: vi.fn((payload: string) => {
        sent.push(payload);
      }),
      close: vi.fn(),
      onMessage: vi.fn((handler: (payload: string) => void) => {
        handlers.push(handler);
      }),
    };

    const promise = sendCdpCommands(transport, [{ method: 'First.command' }, { method: 'Second.command' }]);

    expect(sent.map((payload) => JSON.parse(payload).method)).toEqual(['First.command']);
    handlers[0](JSON.stringify({ id: 1, result: {} }));
    await Promise.resolve();
    expect(sent.map((payload) => JSON.parse(payload).method)).toEqual(['First.command', 'Second.command']);
    handlers[0](JSON.stringify({ id: 2, result: {} }));

    await expect(promise).resolves.toHaveLength(2);
  });
});

export function expectFingerprintConfig(_fingerprint: FingerprintConfig): void {
  // Compile-time helper to keep the imported type exercised.
}
