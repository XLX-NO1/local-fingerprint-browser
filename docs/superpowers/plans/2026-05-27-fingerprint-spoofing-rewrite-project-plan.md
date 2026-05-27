# Fingerprint Spoofing Rewrite Project Plan

**Date:** 2026-05-27

**Scope:** Review the current project and plan a rewrite of the fingerprint spoofing layer without frontend implementation changes.

**Goal:** Replace the current monolithic fingerprint preload with a modular, coherent, testable spoofing layer that works for the existing Electron native BrowserView and standalone Chromium launch paths.

## Executive Summary

The project already has the right outer shape for a local fingerprint browser: profile persistence, per-profile browser partitions, proxy binding, CDP setup, native BrowserView display, external Chromium launch, and a local self-test page. The highest-value rewrite is not a new frontend. It is a backend/runtime cleanup that makes fingerprint spoofing modular, consistent across JavaScript and network-visible surfaces, and easier to verify.

The recommended path is a practical hybrid: keep the current Electron and Chrome architecture, rewrite the JS/CDP spoofing layer into small modules, and reserve interfaces for a future Chromium fork if deeper spoofing becomes necessary.

## Current Architecture Review

### Runtime Paths

- Standalone Chromium path: `electron/services/browserLauncher.ts` builds Chrome args, prepares the extension runtime, injects preload through CDP, navigates to the self-test page, and captures the report.
- Embedded BrowserView path: `electron/main.ts` creates one native `BrowserView`, configures the Electron session, writes an embedded preload, applies CDP commands through `webContents.debugger`, and loads the active tab URL.
- Fingerprint script path: `electron/services/fingerprint.ts` generates one large preload string that patches navigator, screen, timezone, canvas, WebGL, media devices, permissions, audio, and WebRTC.
- Profile data path: `src/types.ts` stores fingerprint values directly on `BrowserProfile.fingerprint`.
- Self-test path: `electron/services/selfTestPage.ts` produces a local HTML page that compares expected profile values with observed browser APIs and network geo checks.

### Strengths

- Profile isolation is already present through per-profile user data directories and Electron partitions.
- Proxy configuration and `Accept-Language` headers are applied at the session/request layer for embedded browsing.
- Fingerprint generation is stable by seed, which is essential for account-profile persistence.
- Self-test coverage exists and checks more than simple UA fields.
- Tests cover generator stability, BrowserView helpers, launcher args, self-test report parsing, and locale consistency.

### Main Risks

1. **UA Client Hints are inconsistent across JS and network headers.**
   `Network.setUserAgentOverride` currently sends `userAgent`, `acceptLanguage`, and `platform`, but no `userAgentMetadata`. Sites can compare `navigator.userAgentData` against request Client Hints and find mismatches.

2. **Canvas spoofing mutates the real canvas.**
   The current `toDataURL` and `toBlob` patch writes to the canvas before serialization. Repeated reads can accumulate changes and visible canvas output can be affected.

3. **WebRTC proxy-only mode behaves like a hard disable.**
   Throwing from `RTCPeerConnection` is easy to detect and breaks sites that need WebRTC. Proxy-only should preserve the API and filter host/server-reflexive candidates where possible.

4. **The spoofing code is too centralized.**
   A single string builder makes it hard to reason about each surface, test targeted behavior, or disable modules safely.

5. **Fingerprint coherence is implicit.**
   OS, UA, UA-CH, platform, WebGL, locale, timezone, screen size, and memory/CPU values should be generated and validated as one coherent device profile.

6. **Self-test can pass local API checks while missing common detection surfaces.**
   Current tests do not yet cover `window.chrome`, `navigator.connection`, ClientRects, font exposure/metrics, WebGL numeric parameters, stable per-profile noise, or request-level UA-CH metadata.

## Open Source Reference Notes

- `aitofy-dev/browser-profiles`: closest to the current approach. It uses pure JS/CDP injection and splits protections into WebRTC, Canvas, WebGL, Audio, Navigator, Screen, and Client Hints scripts. This is the most useful reference for modularization.
- `adryfish/fingerprint-chromium`: Chromium fork approach. It exposes command line fingerprint options for seed, platform, browser brand, language, timezone, WebRTC, fonts, audio, canvas, ClientRects, and GPU. This has a higher ceiling but a much larger maintenance burden.
- `daijro/camoufox`: engine-level Firefox approach. Useful ideas include avoiding main-world leakage, matching fonts to target OS, and deriving locale/timezone from proxy geography.
- `zhom/donutbrowser`: profile manager/orchestration approach. It confirms that a GUI manager can stay thin while specialized browser engines handle deep fingerprinting.

## Recommended Strategy

Use the existing Electron app and rewrite the spoofing runtime into three backend layers:

1. **Fingerprint model layer**
   Generate a coherent `FingerprintConfig` from a seed, OS family, browser version, locale/region, hardware profile, and spoofing module policy.

2. **Script module layer**
   Build preload source from small modules with explicit inputs and tests:
   `navigator`, `uaClientHints`, `screen`, `timezone`, `canvas`, `webgl`, `audio`, `webrtc`, `mediaDevices`, `permissions`, `chromeRuntime`, `networkInfo`, and `clientRects`.

3. **Application layer**
   Apply the same fingerprint through CDP, Electron session, embedded preload, external Chromium launch args, and self-test capture.

This keeps the next phase shippable while leaving a clean future migration path for a custom Chromium binary.

Detailed follow-up specifications:

- `docs/architecture/hardware-fingerprint-spec.md`: device classes, hardware constraints, derived values, validation rules, and fingerprint test requirements.
- `docs/architecture/usable-browser-roadmap.md`: path from the current embedded web container to a usable multi-profile browser with real tab runtime, WebContentsView migration, downloads, permissions, recovery, and health checks.

## Non-Goals

- No frontend redesign or UI implementation in this phase.
- No Chromium source fork in the first rewrite phase.
- No TLS, JA3, HTTP/2, WebGPU, or kernel-level network fingerprint spoofing.
- No claim of full anti-bot invisibility. The goal is consistency, stability, and measurable improvement.

## Target File Plan

### Create

- `electron/services/fingerprint/model.ts`
  Owns coherent device profile derivation and validation.

- `electron/services/fingerprint/modules.ts`
  Defines module names, defaults, and the module registry.

- `electron/services/fingerprint/scriptBuilder.ts`
  Combines enabled modules into one preload script.

- `electron/services/fingerprint/modules/*.ts`
  One file per spoofing surface.

- `electron/services/fingerprint/cdp.ts`
  Builds CDP commands, including UA metadata, locale, timezone, and device metrics.

- `tests/fingerprintModel.test.ts`
  Tests coherence rules and deterministic generation.

- `tests/fingerprintScriptModules.test.ts`
  Tests module composition and important script fragments.

- `tests/fingerprintCdp.test.ts`
  Tests CDP command shape, especially `userAgentMetadata`.

### Modify

- `electron/services/fingerprint.ts`
  Turn into a compatibility facade that exports `generateFingerprint` and `buildFingerprintPreloadScript` from the new modules.

- `electron/services/cdpClient.ts`
  Delegate fingerprint command construction to `electron/services/fingerprint/cdp.ts`.

- `electron/services/embeddedFingerprint.ts`
  Use the new script builder and keep embedded BrowserView injection behavior unchanged.

- `electron/services/browserLauncher.ts`
  Keep launch behavior, but consume the new CDP builder and add safer runtime state handling later.

- `electron/services/selfTestPage.ts`
  Extend checks after backend modules are stable.

- `src/types.ts`
  Add only backend-needed optional fields if required. Avoid frontend-facing churn unless the model absolutely needs it.

## Milestones

### Milestone 1: Baseline Review and Guardrails

- Freeze current backend behavior with focused tests.
- Add tests that expose the known gaps:
  - CDP UA override includes `userAgentMetadata`.
  - Canvas serialization does not permanently mutate canvas pixels.
  - `proxy-only` WebRTC does not replace the constructor with a throwing function.
  - Fingerprint generation rejects incoherent OS/UA/WebGL combinations.

**Exit criteria:** new tests fail for the current implementation and clearly describe the rewrite target.

### Milestone 2: Coherent Fingerprint Model

- Move generation into a model module.
- Make derived UA-CH values first-class, not duplicated in preload and self-test code.
- Add explicit OS, browser, locale, screen, hardware, WebGL, and module-policy sections.
- Keep `FingerprintConfig` backward-compatible for existing stored profiles.

**Exit criteria:** generated fingerprints are deterministic, coherent, and existing profiles can still load.

### Milestone 3: Modular Preload Builder

- Split the monolithic script into small modules.
- Ensure each module is deterministic per profile seed.
- Add safer wrappers for native functions and reduce obvious own-property/toString leaks where practical.
- Preserve the Cloudflare challenge skip behavior for embedded injection.

**Exit criteria:** existing fingerprint tests pass through the facade and new module tests verify module boundaries.

### Milestone 4: CDP and Session Consistency

- Add `userAgentMetadata` to `Network.setUserAgentOverride`.
- Keep JS `navigator.userAgentData` and request Client Hints aligned.
- Keep Electron session `Accept-Language` aligned with the fingerprint.
- Make timezone and locale setup shared by standalone and embedded paths.

**Exit criteria:** self-test reports JS UA, UA-CH, locale, timezone, and runtime version consistency from shared derived values.

### Milestone 5: Safer Surface Implementations

- Replace canvas mutation with copy/read-time noise.
- Expand WebGL coverage to common numeric parameters and WebGL2 where supported.
- Replace hard WebRTC disabling with candidate filtering for proxy-only mode and hard disable only for explicit disabled mode.
- Add `window.chrome`, `navigator.connection`, battery, ClientRects, and media devices modules behind explicit module policy.

**Exit criteria:** local self-test and unit tests verify core surfaces; WebRTC compatibility is not broken for proxy-only mode.

### Milestone 6: Self-Test Upgrade

- Add self-test sections for new modules.
- Report severity as `ok`, `warning`, or `risk`.
- Separate local JS consistency from external network geo checks so API outages do not look like spoofing failures.

**Exit criteria:** self-test gives actionable results instead of one blended score.

### Milestone 7: Release Hardening

- Run full typecheck, full unit tests, and Electron launch smoke.
- Document known limits:
  - JS/CDP injection can be detected by advanced scripts.
  - Network/TLS fingerprints are out of scope.
  - Engine-level spoofing requires a custom browser build.

**Exit criteria:** release notes describe what improved, what remains detectable, and how to verify locally.

## Acceptance Criteria

- No frontend implementation files are changed for the rewrite foundation.
- Existing profile data still loads without migration failure.
- `npm run typecheck` passes.
- `npm run test` passes.
- Fingerprint generation stays stable for the same seed.
- JS `navigator.userAgentData` and CDP request metadata derive from the same model.
- Canvas spoofing is deterministic per profile and does not permanently alter canvas content.
- WebRTC `proxy-only` keeps the API available while reducing IP leak risk.
- Embedded BrowserView and standalone Chromium share the same fingerprint builder.
- Self-test output separates browser API mismatches, runtime version mismatches, proxy geo mismatches, and external API failures.

## Suggested Execution Order

1. Write failing tests for CDP UA metadata, canvas mutation, WebRTC proxy-only behavior, and model coherence.
2. Introduce the fingerprint model module while preserving old exports.
3. Move preload script generation into modules without changing behavior.
4. Fix CDP UA metadata using the shared model.
5. Replace canvas, WebRTC, and WebGL implementations one module at a time.
6. Extend self-test after each module lands.
7. Run full verification and document known limits.

## Review Findings to Track

- `electron/services/cdpClient.ts`: `Network.setUserAgentOverride` lacks `userAgentMetadata`.
- `electron/services/fingerprint.ts`: preload generation is monolithic and hard to test per surface.
- `electron/services/fingerprint.ts`: canvas `toDataURL` and `toBlob` mutate the original canvas before serialization.
- `electron/services/fingerprint.ts`: WebRTC proxy-only mode throws from `RTCPeerConnection`.
- `electron/services/fingerprint.ts`: WebGL only covers vendor/renderer and does not cover common numeric parameters.
- `electron/services/selfTestPage.ts`: UA-CH derivation is duplicated instead of shared with the runtime model.
- `electron/services/browserLauncher.ts`: deterministic debug port allocation can collide with an existing process and does not prevent duplicate launches for the same profile.

## Verification Performed During Review

- `npm run typecheck`: passed.
- `npm run test -- tests/fingerprint.test.ts tests/embeddedFingerprint.test.ts tests/browserLauncher.test.ts tests/selfTestPage.test.ts tests/selfTestReport.test.ts tests/localFingerprintConsistency.test.ts`: 6 files passed, 24 tests passed.
