# Local Fingerprint Browser Design

## Goal

Build a lightweight local desktop fingerprint browser MVP. Users manage multiple browser environments from a terminal-pixel UI, bind a proxy to each environment, preserve independent login state per environment, and launch/stop Chromium directly from the app.

## Non-Goals

- No cloud sync, team permissions, billing, or remote browser pool.
- No Chromium fork in the first version.
- No platform-specific evasion claims.
- No TLS, JA3, HTTP/2, or kernel-level network fingerprint control in the first version.
- No automated account workflows.

## Product Shape

The app is a local console-style desktop tool:

- Left sidebar: groups, search, and live launch logs.
- Center: profile table with status, proxy, fingerprint mask, and launch/stop actions.
- Right inspector: selected profile details, fingerprint modules, and launch trace.
- Top bar: create profile, import, and settings.
- Bottom bar: local engine/storage status.

The visual language is terminal-pixel: dark background, green/cyan accents, square borders, monospace text, scanline texture, and compact operational panels.

## MVP Features

### Profile Management

- Create, edit, duplicate, delete profiles.
- Store profile metadata locally.
- Each profile owns a separate Chromium user data directory.
- Launch status is tracked in the app while the browser process is alive.

### Proxy Management

- Support HTTP, HTTPS, and SOCKS5 proxy URLs.
- Support username/password in the proxy URL.
- Bind one proxy to one profile.
- Test proxy reachability before launch.

### Independent Login State

- Each profile launches Chromium with its own `user-data-dir`.
- Cookies, localStorage, IndexedDB, cache, and extension storage stay isolated by profile directory.

### Browser Launch

- User starts/stops profiles from the UI.
- Electron main process launches Chromium/Chrome for Testing.
- App records process id, start time, and last error.
- The renderer never spawns browser processes directly.

### JS-Layer Fingerprint Masking

The first version focuses on page-observable JavaScript fingerprint surfaces:

- `navigator.userAgent`
- `navigator.platform`
- `navigator.languages`
- `navigator.hardwareConcurrency`
- `navigator.deviceMemory`
- `screen`
- `Intl.DateTimeFormat`
- `Date` timezone behavior where feasible
- Canvas read methods
- WebGL vendor and renderer
- AudioContext output perturbation
- Plugins and mimeTypes
- MediaDevices enumeration
- WebRTC policy through launch flags and injected API behavior

Fingerprint values are generated once per profile and kept stable across launches.

## Architecture

```text
Electron Renderer
  |
  | IPC
  v
Electron Main
  |
  |-- Profile Store
  |-- Proxy Tester
  |-- Fingerprint Generator
  |-- Browser Launcher
  |-- Preload Script Builder
  |
  v
Chromium Process
  |
  |-- isolated user-data-dir
  |-- bound proxy
  |-- extension
  |-- CDP preload script
```

## Data Model

### Profile

- `id`
- `name`
- `group`
- `notes`
- `proxyId`
- `fingerprintId`
- `userDataDir`
- `status`
- `pid`
- `lastLaunchAt`
- `createdAt`
- `updatedAt`

### ProxyConfig

- `id`
- `type`
- `host`
- `port`
- `username`
- `password`
- `lastCheckStatus`
- `lastCheckLatencyMs`
- `updatedAt`

### FingerprintConfig

- `id`
- `os`
- `browserVersion`
- `userAgent`
- `platform`
- `languages`
- `timezone`
- `screenWidth`
- `screenHeight`
- `windowWidth`
- `windowHeight`
- `hardwareConcurrency`
- `deviceMemory`
- `webglVendor`
- `webglRenderer`
- `canvasSeed`
- `audioSeed`
- `webrtcPolicy`
- `mediaDevices`
- `plugins`
- `mimeTypes`

## Storage

Use SQLite for durable local data. Store profile directories under an app data folder:

```text
app-data/
  database.sqlite
  profiles/
    <profile-id>/
      chromium-user-data/
```

For the first implementation, the app may ship seed sample profiles for UI development, but real profile CRUD must use the same store interface that production data will use.

## Launch Flow

1. Renderer asks main process to launch profile by id.
2. Main process loads profile, proxy, and fingerprint config.
3. Main process ensures profile user data directory exists.
4. Main process builds Chromium args:
   - `--user-data-dir=<profile-dir>`
   - `--proxy-server=<proxy-url>` when configured
   - `--lang=<primary-language>`
   - `--window-size=<width>,<height>`
   - WebRTC-related policy flags
   - extension loading flags
   - remote debugging port for CDP
5. Main process starts Chromium.
6. Main process connects to CDP and registers preload script for new documents.
7. Main process updates profile status.
8. Renderer receives status updates and shows launch trace.

## Error Handling

- Missing Chromium path: show setup prompt.
- Invalid proxy: block launch only when user enabled pre-launch proxy check; otherwise show warning.
- Process exits early: mark profile as stopped and record exit code.
- CDP attach fails: keep browser open, mark fingerprint injection as degraded.
- Profile directory creation fails: block launch and show filesystem error.

## Testing

Core behavior should be testable without launching a real browser:

- Profile CRUD store tests.
- Fingerprint generator stability tests.
- Chromium arg builder tests.
- Proxy URL parser tests.
- Launch state reducer tests.

Browser integration tests can be added later for:

- Launching a profile.
- Verifying separate user data dirs.
- Checking injected navigator/canvas/webgl values on a local test page.

## First Implementation Milestone

The first working milestone should include:

- Electron + React + TypeScript project.
- Terminal-pixel UI matching the approved mockup.
- Local profile list using persistent storage or a store abstraction.
- Create/edit/delete profile.
- UI launch/stop buttons.
- Browser launcher with isolated user data directory.
- Proxy and window/language args.
- Fingerprint config data model and initial preload script skeleton.

## Open Decisions Resolved

- UI style: terminal-pixel console.
- First version is local-only.
- Launch happens from UI, not user-facing command line.
- Deep fingerprint masking is included at JS layer.
- Chromium fork is deferred.
