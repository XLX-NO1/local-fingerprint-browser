import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserProfile } from '../../src/types';
import { buildCdpSetupCommands, type CdpCommand } from './cdpClient';
import { buildFingerprintPreloadScript } from './fingerprint';
import { proxyIdentity } from './proxy';

export interface EmbeddedBrowserViewPreferences {
  partition: string;
  preload: string;
  nodeIntegration: false;
  contextIsolation: true;
  sandbox: true;
}

export interface EmbeddedBrowserViewState {
  profileId?: string;
  fingerprintId?: string;
  proxyIdentity?: string;
}

export function embeddedFingerprintPreloadPath(profile: BrowserProfile): string {
  return join(profile.userDataDir, 'embedded-fingerprint-preload.js');
}

export async function writeEmbeddedFingerprintPreload(profile: BrowserProfile): Promise<string> {
  await mkdir(profile.userDataDir, { recursive: true });
  const preloadPath = embeddedFingerprintPreloadPath(profile);
  await writeFile(preloadPath, buildMainWorldPreloadScript(buildFingerprintPreloadScript(profile.fingerprint)), 'utf8');
  return preloadPath;
}

export function buildEmbeddedBrowserViewPreferences(profile: BrowserProfile): EmbeddedBrowserViewPreferences {
  return {
    partition: `persist:profile-${profile.id}`,
    preload: embeddedFingerprintPreloadPath(profile),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  };
}

export function buildEmbeddedCdpSetupCommands(profile: BrowserProfile): CdpCommand[] {
  return buildCdpSetupCommands(profile.fingerprint, buildMainWorldPreloadScript(buildFingerprintPreloadScript(profile.fingerprint)), undefined, {
    includeDeviceMetrics: false,
  });
}

export function embeddedBrowserViewState(profile: BrowserProfile): Required<EmbeddedBrowserViewState> {
  return {
    profileId: profile.id,
    fingerprintId: profile.fingerprint.id,
    proxyIdentity: proxyIdentity(profile.proxy),
  };
}

export function shouldRecreateEmbeddedBrowserView(current: EmbeddedBrowserViewState, profile: BrowserProfile): boolean {
  const next = embeddedBrowserViewState(profile);
  return current.profileId !== next.profileId
    || current.fingerprintId !== next.fingerprintId
    || current.proxyIdentity !== next.proxyIdentity;
}

export function buildAcceptLanguageHeader(languages: string[]): string {
  return languages
    .map((language, index) => (index === 0 ? language : `${language};q=${Math.max(0.1, 1 - index * 0.1).toFixed(1)}`))
    .join(',');
}

function buildMainWorldPreloadScript(source: string): string {
  return `
(() => {
  const source = ${JSON.stringify(source)};
  const shouldSkipFingerprintInjection = () => {
    try {
      return location.hostname === 'challenges.cloudflare.com';
    } catch {
      return false;
    }
  };
  let injected = false;
  const inject = () => {
    if (shouldSkipFingerprintInjection()) {
      return true;
    }
    if (injected) {
      return true;
    }
    const target = document.documentElement || document.head;
    if (!target) {
      return false;
    }
    const script = document.createElement('script');
    script.textContent = source;
    target.appendChild(script);
    script.remove();
    injected = true;
    return true;
  };
  if (!inject()) {
    const observer = new MutationObserver(() => {
      if (inject()) {
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  }
})();`;
}
