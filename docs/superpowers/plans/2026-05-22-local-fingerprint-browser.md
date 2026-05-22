# Local Fingerprint Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Electron desktop MVP for managing isolated Chromium profiles with proxy binding, UI launch/stop controls, and a JS-layer fingerprint masking skeleton.

**Architecture:** Electron main owns persistence, browser process management, and fingerprint preload generation. React renderer owns the terminal-pixel UI and talks to main through a typed IPC bridge. Profile state is stored locally and each launched profile uses a dedicated Chromium user data directory.

**Tech Stack:** Electron, Vite, React, TypeScript, Vitest, local JSON store for MVP persistence, Node child process launcher, Chrome/Chromium.

---

## File Structure

- `package.json`: scripts and dependencies.
- `vite.config.ts`: renderer build config.
- `vitest.config.ts`: unit test config.
- `tsconfig.json`, `tsconfig.node.json`: TypeScript configuration.
- `electron/main.ts`: Electron app lifecycle, IPC registration, window creation.
- `electron/preload.ts`: safe renderer IPC bridge.
- `electron/services/profileStore.ts`: local profile persistence.
- `electron/services/browserLauncher.ts`: Chromium path detection, arg builder, launch/stop state.
- `electron/services/fingerprint.ts`: default fingerprint generation and preload script builder.
- `electron/services/proxy.ts`: proxy URL parsing and validation helpers.
- `src/App.tsx`: main renderer screen.
- `src/main.tsx`: React bootstrap.
- `src/styles.css`: terminal-pixel visual system.
- `src/types.ts`: shared renderer-facing types.
- `tests/*.test.ts`: unit tests for store, launcher args, proxy parsing, fingerprint stability.
- `fingerprint-extension/manifest.json`: MV3 extension skeleton.
- `fingerprint-extension/content.js`: early document fingerprint bridge skeleton.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `.gitignore`

- [ ] Create a Vite + React + Electron TypeScript scaffold with scripts:
  - `npm run dev`
  - `npm run build`
  - `npm run test`
  - `npm run typecheck`
- [ ] Configure Electron build output to `dist-electron`.
- [ ] Configure renderer output to `dist`.
- [ ] Add `.superpowers/`, `node_modules/`, `dist/`, `dist-electron/`, and local app data paths to `.gitignore`.
- [ ] Run `npm install`.
- [ ] Run `npm run typecheck`; expected result after only scaffold may fail until source files exist.

## Task 2: Shared Types and Store Tests

**Files:**
- Create: `src/types.ts`
- Create: `electron/services/profileStore.ts`
- Create: `tests/profileStore.test.ts`

- [ ] Write tests for profile store behavior:
  - creates a profile with stable id and timestamps
  - lists profiles after creation
  - updates profile fields without losing fingerprint config
  - deletes a profile
- [ ] Run `npm run test -- tests/profileStore.test.ts`; expected failure because implementation is missing.
- [ ] Implement `ProfileStore` with JSON persistence in an injected data directory.
- [ ] Run the profile store test and verify it passes.

## Task 3: Proxy and Fingerprint Core

**Files:**
- Create: `electron/services/proxy.ts`
- Create: `electron/services/fingerprint.ts`
- Create: `tests/proxy.test.ts`
- Create: `tests/fingerprint.test.ts`

- [ ] Write proxy parser tests for HTTP, HTTPS, SOCKS5, auth, and invalid URLs.
- [ ] Write fingerprint tests proving generated values are stable for the same seed and different for different seeds.
- [ ] Run targeted tests and verify they fail.
- [ ] Implement proxy parser and fingerprint generator.
- [ ] Implement `buildFingerprintPreloadScript(config)`.
- [ ] Run targeted tests and verify they pass.

## Task 4: Browser Launcher Core

**Files:**
- Create: `electron/services/browserLauncher.ts`
- Create: `tests/browserLauncher.test.ts`

- [ ] Write tests for Chromium arg building:
  - includes `--user-data-dir`
  - includes `--proxy-server` when proxy exists
  - includes `--lang`
  - includes `--window-size`
  - includes extension loading args
  - includes WebRTC policy args
- [ ] Run launcher tests and verify they fail.
- [ ] Implement pure `buildChromiumArgs(profile, paths)` first.
- [ ] Implement launch/stop class around `child_process.spawn`.
- [ ] Run launcher tests and verify they pass.

## Task 5: Electron Main and Preload Bridge

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Modify: `src/types.ts`

- [ ] Implement BrowserWindow creation.
- [ ] Register IPC handlers:
  - `profiles:list`
  - `profiles:create`
  - `profiles:update`
  - `profiles:delete`
  - `profiles:launch`
  - `profiles:stop`
- [ ] Expose `window.api` in preload with typed methods.
- [ ] Ensure renderer has no direct Node access.
- [ ] Run `npm run typecheck`.

## Task 6: Terminal-Pixel Renderer UI

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Modify: `index.html`

- [ ] Implement the approved terminal-pixel layout:
  - top bar
  - group sidebar
  - profile table
  - right inspector
  - bottom status bar
- [ ] Wire list/create/delete/update/launch/stop to `window.api`.
- [ ] Add a compact profile editor panel or modal.
- [ ] Add visible states for running, idle, warning, and launch errors.
- [ ] Run `npm run typecheck`.

## Task 7: Fingerprint Extension Skeleton

**Files:**
- Create: `fingerprint-extension/manifest.json`
- Create: `fingerprint-extension/content.js`
- Modify: `electron/services/browserLauncher.ts`

- [ ] Add MV3 extension manifest.
- [ ] Add content script that injects a page script from profile fingerprint config where available.
- [ ] Ensure launcher loads the unpacked extension directory.
- [ ] Keep the extension skeleton small; do not claim full coverage yet.
- [ ] Run launcher tests and typecheck.

## Task 8: End-to-End Local Verification

**Files:**
- Modify as needed based on verification findings.

- [ ] Run `npm run test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Start the app with `npm run dev`.
- [ ] Verify the UI loads.
- [ ] Create a profile from the UI.
- [ ] Launch a browser from the UI if a Chromium/Chrome path is available.
- [ ] Confirm the profile receives its own user data directory.
- [ ] Record any unsupported local machine requirement in the final notes.

## Self-Review

- Spec coverage: profile management, proxy binding, independent login state, UI launch, terminal-pixel UI, and JS-layer fingerprint skeleton are covered.
- Scope: cloud sync, team, Chromium fork, TLS/JA3, and automation tasks are intentionally excluded.
- Risk: full fingerprint effectiveness cannot be verified without browser integration tests and external test sites; first implementation exposes a skeleton and stable config model.
