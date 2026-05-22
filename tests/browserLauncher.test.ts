import { describe, expect, it } from 'vitest';
import { buildChromiumArgs, buildLaunchAutomationPlan } from '../electron/services/browserLauncher';
import { generateFingerprint } from '../electron/services/fingerprint';
import { parseProxyUrl } from '../electron/services/proxy';
import type { BrowserProfile } from '../src/types';

function makeProfile(): BrowserProfile {
  const now = new Date('2026-05-22T00:00:00.000Z').toISOString();
  return {
    id: 'profile-test',
    name: 'Test',
    group: 'Default',
    notes: '',
    proxy: parseProxyUrl('socks5://127.0.0.1:1080'),
    fingerprint: generateFingerprint('profile-test'),
    userDataDir: '/tmp/profile-test/chromium-user-data',
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}

describe('buildChromiumArgs', () => {
  it('includes isolation, proxy, language, window, extension, and webrtc args', () => {
    const profile = makeProfile();
    const args = buildChromiumArgs(profile, {
      extensionDir: '/app/fingerprint-extension',
      debugPort: 41234,
    });

    expect(args).toContain('--user-data-dir=/tmp/profile-test/chromium-user-data');
    expect(args).toContain('--remote-debugging-port=41234');
    expect(args).toContain('--proxy-server=socks5://127.0.0.1:1080');
    expect(args).toContain(`--lang=${profile.fingerprint.languages[0]}`);
    expect(args).toContain(`--window-size=${profile.fingerprint.windowWidth},${profile.fingerprint.windowHeight}`);
    expect(args).toContain('--load-extension=/app/fingerprint-extension');
    expect(args).toContain('--disable-extensions-except=/app/fingerprint-extension');
    expect(args).toContain('--allow-file-access-from-files');
    expect(args).toContain('--webrtc-ip-handling-policy=disable_non_proxied_udp');
  });

  it('builds an automation plan with preload script and CDP setup commands', () => {
    const profile = makeProfile();
    const plan = buildLaunchAutomationPlan(profile, {
      extensionDir: '/app/fingerprint-extension',
      debugPort: 41234,
    });

    expect(plan.args).toContain('--remote-debugging-port=41234');
    expect(plan.preloadScript).toContain(profile.fingerprint.userAgent);
    expect(plan.cdpCommands.map((command) => command.method)).toEqual([
      'Page.enable',
      'Runtime.enable',
      'Network.enable',
      'Target.setAutoAttach',
      'Page.addScriptToEvaluateOnNewDocument',
      'Network.setUserAgentOverride',
      'Emulation.setTimezoneOverride',
      'Emulation.setLocaleOverride',
      'Emulation.setDeviceMetricsOverride',
    ]);
  });

  it('can build an automation plan for a per-profile runtime extension directory', () => {
    const profile = makeProfile();
    const runtimeExtensionDir = `${profile.userDataDir}/local-fingerprint-extension`;

    const plan = buildLaunchAutomationPlan(profile, {
      extensionDir: runtimeExtensionDir,
      debugPort: 41234,
    });

    expect(plan.args).toContain(`--load-extension=${runtimeExtensionDir}`);
    expect(plan.args).toContain(`--disable-extensions-except=${runtimeExtensionDir}`);
  });

  it('does not append the self-test page url to startup args before injection', () => {
    const profile = makeProfile();
    const plan = buildLaunchAutomationPlan(profile, {
      extensionDir: '/app/fingerprint-extension',
      debugPort: 41234,
      selfTestUrl: 'file:///tmp/fingerprint-self-test.html',
    });

    expect(plan.args).not.toContain('file:///tmp/fingerprint-self-test.html');
    expect(plan.cdpCommands).toContainEqual({
      method: 'Page.navigate',
      params: { url: 'file:///tmp/fingerprint-self-test.html' },
    });
    expect(plan.cdpCommands.at(-1)?.method).toBe('Runtime.evaluate');
  });

  it('builds a navigation plan for opening pages inside an existing profile browser', () => {
    const profile = makeProfile();
    const plan = buildLaunchAutomationPlan(profile, {
      extensionDir: '/app/fingerprint-extension',
      debugPort: 41234,
    });

    expect(plan.debugPort).toBe(41234);
  });
});
