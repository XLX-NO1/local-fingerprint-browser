import type { FingerprintConfig } from '../../../src/types';
import { DEFAULT_CHROMIUM_MAJOR_VERSION, DEFAULT_CHROMIUM_VERSION } from '../../../src/chromiumVersion';

export type DeviceClass = 'windows_desktop' | 'windows_laptop' | 'mac_intel' | 'mac_apple_silicon' | 'linux_desktop';

export interface HardwareFingerprintInput {
  seed: string;
  deviceClass: DeviceClass;
  regionCode?: RegionCode;
  browserVersion?: string;
}

export interface DeviceProfile {
  deviceClass: DeviceClass;
  os: FingerprintConfig['os'];
  platform: string;
  userAgentOs: string;
}

export interface BrowserProfileSpec {
  family: 'chrome' | 'chromium';
  version: string;
  majorVersion: string;
  brandOrderSeed: number;
}

export type RegionCode = 'US' | 'JP' | 'DE' | 'CN' | 'GB' | 'FR' | 'SG' | 'HK';

export interface LocaleProfile {
  regionCode: RegionCode;
  languages: string[];
  timezone: string;
  acceptLanguage: string;
}

export interface DisplayProfile {
  screenWidth: number;
  screenHeight: number;
  availWidth: number;
  availHeight: number;
  windowWidth: number;
  windowHeight: number;
  deviceScaleFactor: number;
  colorDepth: 24 | 30;
  pixelDepth: 24 | 30;
}

export interface HardwareProfile {
  cpuCores: number;
  memoryGb: number;
  architecture: 'x86' | 'arm';
}

export interface GraphicsProfile {
  family: string;
  webglVendor: string;
  webglRenderer: string;
  webglParameters: Record<string, number | string | number[]>;
}

export interface CapabilityPolicy {
  canvas: 'real' | 'noise';
  audio: 'real' | 'noise';
  webgl: 'real' | 'metadata' | 'noise';
  webrtc: FingerprintConfig['webrtcPolicy'];
  clientRects: 'real' | 'noise';
  fonts: 'system-family';
  mediaDevices: 'default-profile';
  permissions: 'prompt-default';
  chromeRuntime: 'chrome-compatible';
  networkInfo: 'desktop-4g-compatible';
}

export interface NoiseProfile {
  canvasSeed: number;
  audioSeed: number;
  webglSeed: number;
  clientRectsSeed: number;
}

export interface UserAgentBrandVersion {
  brand: string;
  version: string;
}

export interface UserAgentMetadata {
  brands: UserAgentBrandVersion[];
  fullVersionList: UserAgentBrandVersion[];
  platform: 'Windows' | 'macOS' | 'Linux';
  platformVersion: string;
  architecture: 'x86' | 'arm';
  bitness: '64';
  model: '';
  mobile: false;
  uaFullVersion: string;
}

export interface DerivedFingerprintValues {
  userAgent: string;
  platform: string;
  languages: string[];
  acceptLanguage: string;
  timezone: string;
  userAgentMetadata: UserAgentMetadata;
  screen: DisplayProfile;
  webgl: GraphicsProfile;
  plugins: string[];
  mimeTypes: string[];
}

export interface HardwareFingerprintProfile {
  id: string;
  schemaVersion: 2;
  seed: string;
  device: DeviceProfile;
  browser: BrowserProfileSpec;
  locale: LocaleProfile;
  display: DisplayProfile;
  hardware: HardwareProfile;
  graphics: GraphicsProfile;
  capabilities: CapabilityPolicy;
  noise: NoiseProfile;
  derived: DerivedFingerprintValues;
}

export interface HardwareFingerprintValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REGION_PRESETS: Record<RegionCode, { languages: string[]; timezone: string }> = {
  US: { languages: ['en-US', 'en'], timezone: 'America/New_York' },
  JP: { languages: ['ja-JP', 'ja', 'en-US'], timezone: 'Asia/Tokyo' },
  DE: { languages: ['de-DE', 'de', 'en-US'], timezone: 'Europe/Berlin' },
  CN: { languages: ['zh-CN', 'zh', 'en-US'], timezone: 'Asia/Shanghai' },
  GB: { languages: ['en-GB', 'en'], timezone: 'Europe/London' },
  FR: { languages: ['fr-FR', 'fr', 'en-US'], timezone: 'Europe/Paris' },
  SG: { languages: ['en-SG', 'en', 'zh-CN'], timezone: 'Asia/Singapore' },
  HK: { languages: ['zh-HK', 'zh', 'en-US'], timezone: 'Asia/Hong_Kong' },
};

const DEVICE_PRESETS: Record<DeviceClass, DeviceProfile> = {
  windows_desktop: {
    deviceClass: 'windows_desktop',
    os: 'windows',
    platform: 'Win32',
    userAgentOs: 'Windows NT 11.0; Win64; x64',
  },
  windows_laptop: {
    deviceClass: 'windows_laptop',
    os: 'windows',
    platform: 'Win32',
    userAgentOs: 'Windows NT 10.0; Win64; x64',
  },
  mac_intel: {
    deviceClass: 'mac_intel',
    os: 'macos',
    platform: 'MacIntel',
    userAgentOs: 'Macintosh; Intel Mac OS X 13_6_1',
  },
  mac_apple_silicon: {
    deviceClass: 'mac_apple_silicon',
    os: 'macos',
    platform: 'MacARM64',
    userAgentOs: 'Macintosh; Intel Mac OS X 15_5',
  },
  linux_desktop: {
    deviceClass: 'linux_desktop',
    os: 'linux',
    platform: 'Linux x86_64',
    userAgentOs: 'X11; Linux x86_64',
  },
};

const HARDWARE_OPTIONS: Record<DeviceClass, { cpu: number[]; memory: number[]; architecture: 'x86' | 'arm' }> = {
  windows_desktop: { cpu: [4, 6, 8, 12, 16], memory: [4, 8, 16, 32], architecture: 'x86' },
  windows_laptop: { cpu: [4, 6, 8, 10, 12], memory: [4, 8, 16, 32], architecture: 'x86' },
  mac_intel: { cpu: [4, 6, 8, 10], memory: [8, 16, 32], architecture: 'x86' },
  mac_apple_silicon: { cpu: [8, 10, 12, 16], memory: [8, 16, 24, 32, 64], architecture: 'arm' },
  linux_desktop: { cpu: [4, 6, 8, 12, 16], memory: [4, 8, 16, 32], architecture: 'x86' },
};

const DISPLAY_OPTIONS: Record<DeviceClass, DisplayProfile[]> = {
  windows_desktop: [
    display(1920, 1080, 1),
    display(2560, 1440, 1),
    display(1536, 864, 1),
  ],
  windows_laptop: [
    display(1366, 768, 1),
    display(1440, 900, 1),
    display(1536, 864, 1),
  ],
  mac_intel: [
    display(1440, 900, 2, 25),
    display(1680, 1050, 2, 25),
  ],
  mac_apple_silicon: [
    display(3024, 1964, 2, 25),
    display(2880, 1800, 2, 25),
  ],
  linux_desktop: [
    display(1920, 1080, 1),
    display(1366, 768, 1),
    display(2560, 1440, 1),
  ],
};

const GRAPHICS_OPTIONS: Record<DeviceClass, GraphicsProfile[]> = {
  windows_desktop: [
    graphics('nvidia_rtx', 'Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    graphics('amd_radeon', 'Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    graphics('intel_uhd', 'Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
  ],
  windows_laptop: [
    graphics('intel_iris', 'Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    graphics('nvidia_laptop', 'Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)'),
  ],
  mac_intel: [
    graphics('intel_uhd', 'Google Inc. (Apple)', 'ANGLE (Apple, Intel(R) UHD Graphics 630, OpenGL 4.1)'),
    graphics('amd_radeon_pro', 'Google Inc. (Apple)', 'ANGLE (Apple, AMD Radeon Pro 560X OpenGL Engine, OpenGL 4.1)'),
  ],
  mac_apple_silicon: [
    graphics('apple_m1', 'Google Inc. (Apple)', 'ANGLE (Apple, Apple M1, OpenGL 4.1)'),
    graphics('apple_m2', 'Google Inc. (Apple)', 'ANGLE (Apple, Apple M2, OpenGL 4.1)'),
    graphics('apple_m3', 'Google Inc. (Apple)', 'ANGLE (Apple, Apple M3, OpenGL 4.1)'),
    graphics('apple_m4', 'Google Inc. (Apple)', 'ANGLE (Apple, Apple M4, OpenGL 4.1)'),
    graphics('apple_m5', 'Google Inc. (Apple)', 'ANGLE (Apple, Apple M5, OpenGL 4.1)'),
  ],
  linux_desktop: [
    graphics('intel_mesa', 'Google Inc. (Intel)', 'ANGLE (Intel, Mesa Intel(R) UHD Graphics, OpenGL 4.6)'),
    graphics('amd_mesa', 'Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon RX 6600, OpenGL 4.6)'),
  ],
};

export function generateHardwareFingerprintProfile(input: HardwareFingerprintInput): HardwareFingerprintProfile {
  const random = mulberry32(hashSeed(input.seed));
  const device = DEVICE_PRESETS[input.deviceClass];
  const browserVersion = input.browserVersion ?? DEFAULT_CHROMIUM_VERSION;
  const browser: BrowserProfileSpec = {
    family: 'chrome',
    version: browserVersion,
    majorVersion: browserVersion.split('.')[0] || DEFAULT_CHROMIUM_MAJOR_VERSION,
    brandOrderSeed: Math.floor(random() * 1_000_000),
  };
  const locale = buildLocaleProfile(input.regionCode ?? 'US');
  const hardwareOptions = HARDWARE_OPTIONS[input.deviceClass];
  const hardware: HardwareProfile = {
    cpuCores: pick(random, hardwareOptions.cpu),
    memoryGb: pick(random, hardwareOptions.memory),
    architecture: hardwareOptions.architecture,
  };
  const displayProfile = pick(random, DISPLAY_OPTIONS[input.deviceClass]);
  const graphicsProfile = pick(random, GRAPHICS_OPTIONS[input.deviceClass]);
  const noise: NoiseProfile = {
    canvasSeed: Math.floor(random() * 1_000_000),
    audioSeed: Math.floor(random() * 1_000_000),
    webglSeed: Math.floor(random() * 1_000_000),
    clientRectsSeed: Math.floor(random() * 1_000_000),
  };
  const userAgent = buildUserAgent(device.userAgentOs, browser.version);
  const userAgentMetadata = buildUserAgentMetadata(device, hardware.architecture, browser.version, browser.majorVersion);

  return {
    id: `hfp-${hashSeed(input.seed).toString(16)}`,
    schemaVersion: 2,
    seed: input.seed,
    device,
    browser,
    locale,
    display: displayProfile,
    hardware,
    graphics: graphicsProfile,
    capabilities: defaultCapabilityPolicy(),
    noise,
    derived: {
      userAgent,
      platform: device.platform,
      languages: locale.languages,
      acceptLanguage: locale.acceptLanguage,
      timezone: locale.timezone,
      userAgentMetadata,
      screen: displayProfile,
      webgl: graphicsProfile,
      plugins: defaultPlugins(),
      mimeTypes: defaultMimeTypes(),
    },
  };
}

export function generateFingerprintConfig(seed: string): FingerprintConfig {
  const random = mulberry32(hashSeed(seed));
  const deviceClasses: DeviceClass[] = ['windows_desktop', 'windows_laptop', 'mac_intel', 'mac_apple_silicon', 'linux_desktop'];
  const regionCodes: RegionCode[] = ['US', 'JP', 'DE', 'CN', 'GB', 'FR', 'SG', 'HK'];
  return fingerprintConfigFromHardwareProfile(generateHardwareFingerprintProfile({
    seed,
    deviceClass: pick(random, deviceClasses),
    regionCode: pick(random, regionCodes),
  }));
}

export function fingerprintConfigFromHardwareProfile(profile: HardwareFingerprintProfile): FingerprintConfig {
  return {
    id: profile.id,
    os: profile.device.os,
    browserVersion: profile.browser.version,
    userAgent: profile.derived.userAgent,
    platform: profile.derived.platform,
    languages: profile.derived.languages,
    timezone: profile.derived.timezone,
    screenWidth: profile.display.screenWidth,
    screenHeight: profile.display.screenHeight,
    windowWidth: profile.display.windowWidth,
    windowHeight: profile.display.windowHeight,
    hardwareConcurrency: profile.hardware.cpuCores,
    deviceMemory: profile.hardware.memoryGb,
    webglVendor: profile.graphics.webglVendor,
    webglRenderer: profile.graphics.webglRenderer,
    canvasSeed: profile.noise.canvasSeed,
    audioSeed: profile.noise.audioSeed,
    webrtcPolicy: profile.capabilities.webrtc,
    mediaDevices: ['default-audio-input', 'default-audio-output'],
    plugins: profile.derived.plugins,
    mimeTypes: profile.derived.mimeTypes,
  };
}

export function normalizeFingerprintConfig(config: FingerprintConfig, seed = config.id): HardwareFingerprintProfile {
  const device = inferDeviceProfile(config);
  const locale = {
    regionCode: inferRegionCode(config.languages, config.timezone),
    languages: config.languages,
    timezone: config.timezone,
    acceptLanguage: buildAcceptLanguage(config.languages),
  };
  const browser: BrowserProfileSpec = {
    family: 'chrome',
    version: config.browserVersion,
    majorVersion: config.browserVersion.split('.')[0] || DEFAULT_CHROMIUM_MAJOR_VERSION,
    brandOrderSeed: hashSeed(`${seed}:brand`) % 1_000_000,
  };
  const hardware: HardwareProfile = {
    cpuCores: config.hardwareConcurrency,
    memoryGb: config.deviceMemory,
    architecture: deriveArchitecture(config),
  };
  const displayProfile: DisplayProfile = {
    screenWidth: config.screenWidth,
    screenHeight: config.screenHeight,
    availWidth: config.screenWidth,
    availHeight: config.screenHeight - (config.os === 'macos' ? 25 : 40),
    windowWidth: config.windowWidth,
    windowHeight: config.windowHeight,
    deviceScaleFactor: config.os === 'macos' && config.screenWidth >= 2800 ? 2 : 1,
    colorDepth: 24,
    pixelDepth: 24,
  };
  const graphicsProfile = graphics(`custom-${hashSeed(config.webglRenderer).toString(16)}`, config.webglVendor, config.webglRenderer);
  const userAgentMetadata = deriveUserAgentMetadata(config);

  return {
    id: config.id,
    schemaVersion: 2,
    seed,
    device,
    browser,
    locale,
    display: displayProfile,
    hardware,
    graphics: graphicsProfile,
    capabilities: {
      ...defaultCapabilityPolicy(),
      webrtc: config.webrtcPolicy,
    },
    noise: {
      canvasSeed: config.canvasSeed,
      audioSeed: config.audioSeed,
      webglSeed: hashSeed(`${seed}:webgl`),
      clientRectsSeed: hashSeed(`${seed}:client-rects`),
    },
    derived: {
      userAgent: config.userAgent,
      platform: config.platform,
      languages: config.languages,
      acceptLanguage: locale.acceptLanguage,
      timezone: config.timezone,
      userAgentMetadata,
      screen: displayProfile,
      webgl: graphicsProfile,
      plugins: config.plugins,
      mimeTypes: config.mimeTypes,
    },
  };
}

export function deriveUserAgentMetadata(config: Pick<FingerprintConfig, 'os' | 'platform' | 'userAgent' | 'browserVersion' | 'webglRenderer'>): UserAgentMetadata {
  const architecture = deriveArchitecture(config);
  const platform = config.os === 'macos' ? 'macOS' : config.os === 'windows' ? 'Windows' : 'Linux';
  const platformVersion = derivePlatformVersion(config);
  const majorVersion = config.browserVersion.split('.')[0] || DEFAULT_CHROMIUM_MAJOR_VERSION;
  return buildUserAgentMetadata({ os: config.os, platform: config.platform, userAgentOs: '', deviceClass: inferDeviceClass(config) }, architecture, config.browserVersion, majorVersion, platform, platformVersion);
}

export function validateHardwareFingerprintProfile(profile: HardwareFingerprintProfile): HardwareFingerprintValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (profile.device.deviceClass === 'mac_apple_silicon' && profile.hardware.architecture !== 'arm') {
    errors.push('Apple Silicon profiles must use arm architecture.');
  }
  if (profile.device.os === 'macos' && /Direct3D/i.test(profile.graphics.webglRenderer)) {
    errors.push('macOS profiles must not use Direct3D WebGL renderers.');
  }
  if (profile.device.os === 'windows' && /Mesa|OpenGL Engine/i.test(profile.graphics.webglRenderer)) {
    errors.push('Windows profiles must not use Mesa or macOS OpenGL WebGL renderers.');
  }
  if (profile.device.os === 'windows' && profile.derived.userAgentMetadata.platform !== 'Windows') {
    errors.push('Windows profiles must use Windows UA metadata platform.');
  }
  if (profile.device.os === 'macos' && profile.derived.userAgentMetadata.platform !== 'macOS') {
    errors.push('macOS profiles must use macOS UA metadata platform.');
  }
  if (profile.hardware.architecture !== profile.derived.userAgentMetadata.architecture) {
    errors.push('Hardware architecture must match UA metadata architecture.');
  }
  if (profile.display.windowWidth > profile.display.screenWidth || profile.display.windowHeight > profile.display.screenHeight) {
    errors.push('Window dimensions must fit within screen dimensions.');
  }
  if (!profile.derived.userAgent.includes(`Chrome/${profile.browser.version}`)) {
    errors.push('User-Agent Chrome version must match browser version.');
  }
  if (profile.derived.userAgentMetadata.uaFullVersion !== profile.browser.version) {
    errors.push('UA metadata full version must match browser version.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function inferDeviceProfile(config: FingerprintConfig): DeviceProfile {
  const deviceClass = inferDeviceClass(config);
  return {
    ...DEVICE_PRESETS[deviceClass],
    os: config.os,
    platform: config.platform,
    userAgentOs: extractUserAgentOs(config.userAgent) ?? DEVICE_PRESETS[deviceClass].userAgentOs,
  };
}

function inferDeviceClass(config: Pick<FingerprintConfig, 'os' | 'platform' | 'webglRenderer'>): DeviceClass {
  if (config.os === 'windows') {
    return 'windows_desktop';
  }
  if (config.os === 'linux') {
    return 'linux_desktop';
  }
  if (config.platform === 'MacARM64' || /Apple M[1-5]/.test(config.webglRenderer)) {
    return 'mac_apple_silicon';
  }
  return 'mac_intel';
}

function deriveArchitecture(config: Pick<FingerprintConfig, 'os' | 'platform' | 'webglRenderer'>): 'x86' | 'arm' {
  if (config.os === 'macos' && (config.platform === 'MacARM64' || /Apple M[1-5]/.test(config.webglRenderer))) {
    return 'arm';
  }
  return 'x86';
}

function derivePlatformVersion(config: Pick<FingerprintConfig, 'os' | 'userAgent'>): string {
  if (config.os === 'windows') {
    return config.userAgent.includes('Windows NT 11.0') ? '11.0.0' : '10.0.0';
  }
  if (config.os === 'macos') {
    return config.userAgent.match(/Mac OS X ([^)]+)/)?.[1]?.replace(/_/g, '.') ?? '';
  }
  return '6.5.0';
}

function buildUserAgentMetadata(
  device: DeviceProfile,
  architecture: 'x86' | 'arm',
  fullVersion: string,
  majorVersion: string,
  platformOverride?: UserAgentMetadata['platform'],
  platformVersionOverride?: string,
): UserAgentMetadata {
  const platform = platformOverride ?? (device.os === 'macos' ? 'macOS' : device.os === 'windows' ? 'Windows' : 'Linux');
  const platformVersion = platformVersionOverride ?? derivePlatformVersion({
    os: device.os,
    userAgent: buildUserAgent(device.userAgentOs, fullVersion),
  });
  const brands = [
    { brand: 'Not_A Brand', version: '99' },
    { brand: 'Chromium', version: majorVersion },
    { brand: 'Google Chrome', version: majorVersion },
  ];
  const fullVersionList = brands.map((brand) => ({
    brand: brand.brand,
    version: brand.brand === 'Not_A Brand' ? '99.0.0.0' : fullVersion,
  }));

  return {
    brands,
    fullVersionList,
    platform,
    platformVersion,
    architecture,
    bitness: '64',
    model: '',
    mobile: false,
    uaFullVersion: fullVersion,
  };
}

function buildUserAgent(userAgentOs: string, browserVersion: string): string {
  return `Mozilla/5.0 (${userAgentOs}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
}

function buildLocaleProfile(regionCode: RegionCode): LocaleProfile {
  const preset = REGION_PRESETS[regionCode];
  return {
    regionCode,
    languages: preset.languages,
    timezone: preset.timezone,
    acceptLanguage: buildAcceptLanguage(preset.languages),
  };
}

function inferRegionCode(languages: string[], timezone: string): RegionCode {
  const timezoneMatch = Object.entries(REGION_PRESETS).find(([, preset]) => preset.timezone === timezone)?.[0] as RegionCode | undefined;
  if (timezoneMatch) {
    return timezoneMatch;
  }
  return (Object.entries(REGION_PRESETS).find(([, preset]) => preset.languages[0] === languages[0])?.[0] as RegionCode | undefined) ?? 'US';
}

export function buildAcceptLanguage(languages: string[]): string {
  return languages
    .map((language, index) => (index === 0 ? language : `${language};q=${Math.max(0.1, 1 - index * 0.1).toFixed(1)}`))
    .join(',');
}

function defaultCapabilityPolicy(): CapabilityPolicy {
  return {
    canvas: 'noise',
    audio: 'noise',
    webgl: 'metadata',
    webrtc: 'proxy-only',
    clientRects: 'noise',
    fonts: 'system-family',
    mediaDevices: 'default-profile',
    permissions: 'prompt-default',
    chromeRuntime: 'chrome-compatible',
    networkInfo: 'desktop-4g-compatible',
  };
}

function defaultPlugins(): string[] {
  return ['Chrome PDF Viewer', 'Chromium PDF Viewer'];
}

function defaultMimeTypes(): string[] {
  return ['application/pdf', 'text/pdf'];
}

function display(width: number, height: number, deviceScaleFactor: number, toolbarHeight = 40): DisplayProfile {
  return {
    screenWidth: width,
    screenHeight: height,
    availWidth: width,
    availHeight: height - toolbarHeight,
    windowWidth: width,
    windowHeight: height,
    deviceScaleFactor,
    colorDepth: 24,
    pixelDepth: 24,
  };
}

function graphics(family: string, webglVendor: string, webglRenderer: string): GraphicsProfile {
  return {
    family,
    webglVendor,
    webglRenderer,
    webglParameters: {
      VENDOR: 'WebKit',
      RENDERER: 'WebKit WebGL',
      VERSION: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
      SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)',
      MAX_TEXTURE_SIZE: 16384,
      MAX_CUBE_MAP_TEXTURE_SIZE: 16384,
      MAX_RENDERBUFFER_SIZE: 16384,
      MAX_VIEWPORT_DIMS: [16384, 16384],
      ALIASED_LINE_WIDTH_RANGE: [1, 1],
      ALIASED_POINT_SIZE_RANGE: [1, 1024],
      MAX_TEXTURE_IMAGE_UNITS: 16,
      MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
      MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
      MAX_VERTEX_ATTRIBS: 16,
    },
  };
}

function extractUserAgentOs(userAgent: string): string | undefined {
  return userAgent.match(/Mozilla\/5\.0 \(([^)]+)\)/)?.[1];
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
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
