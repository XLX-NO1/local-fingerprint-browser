# Hardware Fingerprint Specification

**Date:** 2026-05-27

**Status:** Draft for implementation.

**Purpose:** Define a coherent hardware fingerprint model for profile generation, runtime spoofing, and self-test validation.

## Goals

- Generate realistic desktop browser fingerprints from device templates instead of independent random fields.
- Keep OS, browser version, UA, UA Client Hints, WebGL, screen, locale, timezone, and hardware values internally consistent.
- Make all derived runtime values come from one model so CDP commands, preload scripts, headers, and self-test expectations cannot drift.
- Preserve existing stored profiles by supporting a compatibility layer from the current flat `FingerprintConfig`.

## Non-Goals

- This spec does not cover TLS, JA3, HTTP/2, DNS, WebGPU, installed native software, or kernel-level fingerprints.
- This spec does not claim full anti-bot invisibility. JS/CDP spoofing remains detectable by sufficiently advanced checks.
- This spec does not require a Chromium fork in the first implementation phase.

## Model Overview

The new model should treat a fingerprint as a generated device profile with derived browser-exposed values.

```ts
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
```

The existing `FingerprintConfig` can remain as the public compatibility shape while the runtime internally creates `HardwareFingerprintProfile`.

## Device Profiles

Allowed device classes:

```ts
export type DeviceClass =
  | 'windows_desktop'
  | 'windows_laptop'
  | 'mac_intel'
  | 'mac_apple_silicon'
  | 'linux_desktop';
```

Each device class constrains platform, architecture, CPU, memory, GPU, display, and UA tokens.

### Windows Desktop

- `os`: `windows`
- `navigator.platform`: `Win32`
- UA OS token: `Windows NT 10.0; Win64; x64` or `Windows NT 11.0; Win64; x64`
- UA-CH platform: `Windows`
- UA-CH architecture: `x86`
- CPU cores: `4`, `6`, `8`, `12`, `16`
- deviceMemory GB: `4`, `8`, `16`, `32`
- GPU families: `intel_uhd`, `intel_iris`, `nvidia_gtx`, `nvidia_rtx`, `amd_radeon`
- DPR: usually `1`

### Windows Laptop

- Same OS and UA constraints as Windows desktop.
- CPU cores: `4`, `6`, `8`, `10`, `12`
- deviceMemory GB: `4`, `8`, `16`, `32`
- GPU families: `intel_uhd`, `intel_iris`, `nvidia_laptop`, `amd_radeon_mobile`
- DPR: `1` or `1.25` only if the window/display model supports it consistently.

### Mac Intel

- `os`: `macos`
- `navigator.platform`: `MacIntel`
- UA OS tokens: `Macintosh; Intel Mac OS X 13_6_1`, `14_4_1`, or similar Intel-plausible versions.
- UA-CH platform: `macOS`
- UA-CH architecture: `x86`
- CPU cores: `4`, `6`, `8`, `10`
- deviceMemory GB: `8`, `16`, `32`
- GPU families: `intel_uhd`, `amd_radeon_pro`
- DPR: `1` or `2`

### Mac Apple Silicon

- `os`: `macos`
- `navigator.platform`: compatibility value `MacARM64` in the current app, with an implementation note that real Chrome often exposes `MacIntel`.
- UA OS tokens: modern macOS versions only.
- UA-CH platform: `macOS`
- UA-CH architecture: `arm`
- CPU cores: `8`, `10`, `12`, `16`
- deviceMemory GB: `8`, `16`, `24`, `32`, `64`
- GPU families: `apple_m1`, `apple_m2`, `apple_m3`, `apple_m4`, `apple_m5`
- DPR: `2`

### Linux Desktop

- `os`: `linux`
- `navigator.platform`: `Linux x86_64`
- UA OS token: `X11; Linux x86_64`
- UA-CH platform: `Linux`
- UA-CH architecture: `x86`
- CPU cores: `4`, `6`, `8`, `12`, `16`
- deviceMemory GB: `4`, `8`, `16`, `32`
- GPU families: `intel_mesa`, `amd_mesa`, `nvidia_linux`
- DPR: `1`

## Browser Profile

```ts
export interface BrowserProfileSpec {
  family: 'chrome' | 'chromium';
  version: string;
  majorVersion: string;
  brandOrderSeed: number;
}
```

Rules:

- `userAgent` and UA-CH full versions must use the same version.
- `browserVersion` must match the app's bundled or selected Chromium runtime unless the user explicitly chooses a compatible external Chrome.
- UA-CH should be derived once and used by both JS patches and CDP `Network.setUserAgentOverride.userAgentMetadata`.
- Brand lists should include a realistic GREASE brand, `Chromium`, and `Google Chrome` when the UA claims Chrome.

## Locale Profile

```ts
export interface LocaleProfile {
  regionCode: 'US' | 'JP' | 'DE' | 'CN' | 'GB' | 'FR' | 'SG' | 'HK';
  languages: string[];
  timezone: string;
  acceptLanguage: string;
}
```

Rules:

- `languages[0]`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, `Accept-Language`, and proxy geo should be checked together.
- Region presets may be manually selected, but a proxy geo mismatch should be surfaced as a warning or risk in self-test.
- If proxy geo is unknown, the profile remains usable but should show a warning, not a hard failure.

## Display Profile

```ts
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
```

Rules:

- `availWidth` must be less than or equal to `screenWidth`.
- `availHeight` must be less than or equal to `screenHeight`.
- `windowWidth` and `windowHeight` must fit within the screen bounds.
- Mac retina profiles should use DPR `2`; normal desktop profiles should usually use DPR `1`.
- CDP device metrics, JS `screen`, JS `devicePixelRatio`, and BrowserView bounds should not contradict each other.

## Hardware Profile

```ts
export interface HardwareProfile {
  cpuCores: number;
  memoryGb: number;
  architecture: 'x86' | 'arm';
}
```

Rules:

- `navigator.hardwareConcurrency` comes from `cpuCores`.
- `navigator.deviceMemory` comes from `memoryGb`, but only values commonly exposed by Chromium should be used.
- Architecture must match device class and UA-CH architecture.

## Graphics Profile

```ts
export interface GraphicsProfile {
  family: string;
  webglVendor: string;
  webglRenderer: string;
  webglParameters: Record<string, number | string | number[]>;
}
```

Minimum WebGL parameters to derive per GPU family:

- `UNMASKED_VENDOR_WEBGL`
- `UNMASKED_RENDERER_WEBGL`
- `VENDOR`
- `RENDERER`
- `VERSION`
- `SHADING_LANGUAGE_VERSION`
- `MAX_TEXTURE_SIZE`
- `MAX_CUBE_MAP_TEXTURE_SIZE`
- `MAX_RENDERBUFFER_SIZE`
- `MAX_VIEWPORT_DIMS`
- `ALIASED_LINE_WIDTH_RANGE`
- `ALIASED_POINT_SIZE_RANGE`
- `MAX_TEXTURE_IMAGE_UNITS`
- `MAX_VERTEX_TEXTURE_IMAGE_UNITS`
- `MAX_COMBINED_TEXTURE_IMAGE_UNITS`
- `MAX_VERTEX_ATTRIBS`

Rules:

- Apple Silicon must not produce NVIDIA, AMD, Intel Mesa, or Direct3D renderers.
- Windows profiles should use Direct3D-style ANGLE renderers.
- Linux profiles should use Mesa/OpenGL-style renderers.
- WebGL2 should receive compatible values when available.

## Capability Policy

```ts
export interface CapabilityPolicy {
  canvas: 'real' | 'noise';
  audio: 'real' | 'noise';
  webgl: 'real' | 'metadata' | 'noise';
  webrtc: 'real' | 'proxy-only' | 'disabled';
  clientRects: 'real' | 'noise';
  fonts: 'system-family';
  mediaDevices: 'default-profile';
  permissions: 'prompt-default';
  chromeRuntime: 'chrome-compatible';
  networkInfo: 'desktop-4g-compatible';
}
```

Rules:

- `proxy-only` WebRTC must preserve `RTCPeerConnection` and filter unsafe candidates instead of throwing at constructor time.
- `disabled` WebRTC may block or stub the API, but self-test should label this as high compatibility risk.
- Canvas and audio noise must be deterministic per profile and read operation, not a fresh random value on every call.
- Canvas spoofing must not permanently mutate the visible canvas.

## Noise Profile

```ts
export interface NoiseProfile {
  canvasSeed: number;
  audioSeed: number;
  webglSeed: number;
  clientRectsSeed: number;
}
```

Rules:

- Seeds are generated from the profile seed.
- Noise must be stable across launches for the same profile.
- Noise should differ between profiles.
- Noise values should be small enough to avoid visible breakage.

## Derived Values

```ts
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
```

Rules:

- Preload scripts, CDP commands, Electron session headers, and self-test expectations must consume this object or functions derived from it.
- The same derivation function must be used by runtime and tests.

## Compatibility With Existing FingerprintConfig

Existing flat profiles should be upgraded in memory:

```ts
export function normalizeFingerprintConfig(config: FingerprintConfig): HardwareFingerprintProfile
```

The first implementation may keep saving the flat config. A later migration can persist the versioned model once the UI has been adjusted.

## Validation Rules

The model validator must reject or warn on:

- Windows UA with macOS platform.
- Apple Silicon GPU with x86 architecture.
- NVIDIA/AMD Direct3D renderer on macOS.
- Mesa renderer on Windows.
- Locale timezone country and primary language country mismatch, unless explicitly allowed.
- Window dimensions larger than screen dimensions.
- Browser major version mismatch between UA and UA-CH.
- `proxy-only` WebRTC paired with constructor-throwing implementation.

## Test Requirements

- Same seed generates identical profile.
- Different seeds generate different noise seeds.
- Every device class produces valid OS, UA, UA-CH, GPU, CPU, memory, and display combinations.
- Invalid mixed profiles are rejected by validation.
- CDP `Network.setUserAgentOverride` receives `userAgentMetadata` matching JS `navigator.userAgentData`.
- Canvas read noise is stable and does not alter subsequent normal canvas reads.
- WebRTC proxy-only preserves constructor availability.

## Implementation Notes

- Start with the existing `FingerprintConfig` facade to avoid breaking renderer code.
- Put new model code under `electron/services/fingerprint/`.
- Keep generators deterministic and pure.
- Avoid network lookups during fingerprint generation. Proxy geo should be an input or later validation signal.
- Keep all constants in typed preset tables so new devices can be added safely.

