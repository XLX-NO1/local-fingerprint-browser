import type { FingerprintConfig } from './types';
import { allOsPresets } from './fingerprintPresets';
import { DEFAULT_CHROMIUM_VERSION } from './chromiumVersion';

const LANGUAGE_SETS = [
  ['en-US', 'en'],
  ['ja-JP', 'ja', 'en-US'],
  ['de-DE', 'de', 'en-US'],
  ['zh-CN', 'zh', 'en-US'],
];
const TIMEZONES = ['America/New_York', 'Asia/Tokyo', 'Europe/Berlin', 'Asia/Shanghai'];

export function generateLocalFingerprint(seed: string): FingerprintConfig {
  const random = mulberry32(hashSeed(seed));
  const presets = allOsPresets();
  const osProfile = presets[pickIndex(random, presets.length)];
  const languages = LANGUAGE_SETS[pickIndex(random, LANGUAGE_SETS.length)];
  const timezone = TIMEZONES[pickIndex(random, TIMEZONES.length)];
  const screen = [
    [1280, 800],
    [1366, 768],
    [1440, 900],
    [1536, 864],
    [1920, 1080],
  ][pickIndex(random, 5)];

  return {
    id: `fp-${hashSeed(seed).toString(16)}`,
    os: osProfile.os,
    browserVersion: DEFAULT_CHROMIUM_VERSION,
    userAgent: `Mozilla/5.0 (${osProfile.userAgentOs}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${DEFAULT_CHROMIUM_VERSION} Safari/537.36`,
    platform: osProfile.platform,
    languages,
    timezone,
    screenWidth: screen[0],
    screenHeight: screen[1],
    windowWidth: screen[0],
    windowHeight: screen[1],
    hardwareConcurrency: [4, 6, 8, 10, 12][pickIndex(random, 5)],
    deviceMemory: [4, 8, 16][pickIndex(random, 3)],
    webglVendor: osProfile.webglVendor,
    webglRenderer: osProfile.webglRenderer,
    canvasSeed: Math.floor(random() * 1_000_000),
    audioSeed: Math.floor(random() * 1_000_000),
    webrtcPolicy: 'proxy-only',
    mediaDevices: ['default-audio-input', 'default-audio-output'],
    plugins: ['Chrome PDF Viewer', 'Chromium PDF Viewer'],
    mimeTypes: ['application/pdf', 'text/pdf'],
  };
}

function pickIndex(random: () => number, length: number): number {
  return Math.floor(random() * length);
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
