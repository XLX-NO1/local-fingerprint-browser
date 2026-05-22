import type { FingerprintConfig } from './types';
import { pickOsPreset } from './fingerprintPresets';

export type FingerprintFormState = {
  os: FingerprintConfig['os'];
  browserVersion: string;
  userAgent: string;
  platform: string;
  languages: string;
  timezone: string;
  screenWidth: string;
  screenHeight: string;
  windowWidth: string;
  windowHeight: string;
  hardwareConcurrency: string;
  deviceMemory: string;
  webglVendor: string;
  webglRenderer: string;
  webrtcPolicy: FingerprintConfig['webrtcPolicy'];
  plugins: string;
  mimeTypes: string;
};

export function fingerprintToForm(fingerprint: FingerprintConfig): FingerprintFormState {
  return {
    os: fingerprint.os,
    browserVersion: fingerprint.browserVersion,
    userAgent: fingerprint.userAgent,
    platform: fingerprint.platform,
    languages: fingerprint.languages.join(', '),
    timezone: fingerprint.timezone,
    screenWidth: String(fingerprint.screenWidth),
    screenHeight: String(fingerprint.screenHeight),
    windowWidth: String(fingerprint.windowWidth),
    windowHeight: String(fingerprint.windowHeight),
    hardwareConcurrency: String(fingerprint.hardwareConcurrency),
    deviceMemory: String(fingerprint.deviceMemory),
    webglVendor: fingerprint.webglVendor,
    webglRenderer: fingerprint.webglRenderer,
    webrtcPolicy: fingerprint.webrtcPolicy,
    plugins: fingerprint.plugins.join(', '),
    mimeTypes: fingerprint.mimeTypes.join(', '),
  };
}

export function formToFingerprint(base: FingerprintConfig, form: FingerprintFormState): FingerprintConfig {
  const next = {
    ...base,
    os: form.os,
    browserVersion: form.browserVersion.trim() || base.browserVersion,
    userAgent: form.userAgent.trim() || base.userAgent,
    platform: form.platform.trim() || base.platform,
    languages: parseList(form.languages, base.languages),
    timezone: form.timezone.trim() || base.timezone,
    screenWidth: parsePositiveInteger(form.screenWidth, base.screenWidth),
    screenHeight: parsePositiveInteger(form.screenHeight, base.screenHeight),
    windowWidth: parsePositiveInteger(form.windowWidth, base.windowWidth),
    windowHeight: parsePositiveInteger(form.windowHeight, base.windowHeight),
    hardwareConcurrency: parsePositiveInteger(form.hardwareConcurrency, base.hardwareConcurrency),
    deviceMemory: parsePositiveInteger(form.deviceMemory, base.deviceMemory),
    webglVendor: form.webglVendor.trim() || base.webglVendor,
    webglRenderer: form.webglRenderer.trim() || base.webglRenderer,
    webrtcPolicy: form.webrtcPolicy,
    plugins: parseList(form.plugins, base.plugins),
    mimeTypes: parseList(form.mimeTypes, base.mimeTypes),
  };
  return {
    ...next,
    id: fingerprintEditableId(next),
  };
}

export function hasFingerprintFormChanges(base: FingerprintConfig, form: FingerprintFormState): boolean {
  const current = fingerprintToForm(base);
  return Object.keys(current).some((key) => {
    const field = key as keyof FingerprintFormState;
    return current[field] !== form[field];
  });
}

export function applyFingerprintOsPreset(
  form: FingerprintFormState,
  os: FingerprintConfig['os'],
  random: () => number = Math.random,
): FingerprintFormState {
  const preset = pickOsPreset(os, random);
  return {
    ...form,
    os,
    platform: preset.platform,
    userAgent: replaceUserAgentOs(form.userAgent, preset.userAgentOs, form.browserVersion),
    webglVendor: preset.webglVendor,
    webglRenderer: preset.webglRenderer,
  };
}

function replaceUserAgentOs(userAgent: string, userAgentOs: string, browserVersion: string): string {
  const chromeVersion = browserVersion.trim() || extractChromeVersion(userAgent) || '126.0.0.0';
  const next = userAgent.trim()
    ? userAgent.replace(/Mozilla\/5\.0 \([^)]+\)/, `Mozilla/5.0 (${userAgentOs})`)
    : `Mozilla/5.0 (${userAgentOs}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  if (/Chrome\/[^\s]+/.test(next)) {
    return next.replace(/Chrome\/[^\s]+/, `Chrome/${chromeVersion}`);
  }
  return `${next} Chrome/${chromeVersion}`;
}

function extractChromeVersion(userAgent: string): string | undefined {
  return userAgent.match(/Chrome\/([^\s]+)/)?.[1];
}

function parseList(value: string, fallback: string[]): string[] {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function fingerprintEditableId(fingerprint: FingerprintConfig): string {
  const value = [
    fingerprint.os,
    fingerprint.browserVersion,
    fingerprint.userAgent,
    fingerprint.platform,
    fingerprint.languages.join('|'),
    fingerprint.timezone,
    fingerprint.screenWidth,
    fingerprint.screenHeight,
    fingerprint.windowWidth,
    fingerprint.windowHeight,
    fingerprint.hardwareConcurrency,
    fingerprint.deviceMemory,
    fingerprint.webglVendor,
    fingerprint.webglRenderer,
    fingerprint.webrtcPolicy,
    fingerprint.plugins.join('|'),
    fingerprint.mimeTypes.join('|'),
  ].join('::');
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fp-custom-${(hash >>> 0).toString(16)}`;
}
