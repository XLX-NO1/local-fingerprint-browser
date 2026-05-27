# Usable Browser Roadmap

**Date:** 2026-05-27

**Status:** In implementation.

**Purpose:** Define how the project moves from a profile-based web container to a browser that is reliable enough for daily multi-profile use.

## Goal

Build a local desktop browser that can manage isolated profiles, load modern websites reliably, preserve account sessions, apply coherent fingerprint/runtime policy, and provide normal browser operations such as tabs, navigation, downloads, popups, permissions, and recovery.

## Product Definition

A profile is a complete browsing environment:

- isolated storage partition
- proxy configuration
- hardware fingerprint profile
- tabs and navigation state
- cookies/cache/localStorage
- permissions policy
- bookmarks/history metadata
- self-test and health status

A browser window is an operator surface over one or more profiles. The loaded web page must behave like a normal browser page, not like a brittle preview panel.

## Current State

The app already provides:

- local profile storage
- per-profile proxy configuration
- per-profile fingerprint config
- embedded native BrowserView browsing
- external Chromium launch
- tab metadata in the data model
- main-process native BrowserView controller
- one cached BrowserView per active tab runtime
- self-test generation and capture
- basic back, forward, reload IPC handlers

Known limitations:

- `BrowserView` is deprecated in modern Electron and should be replaced by `WebContentsView`.
- The app still uses deprecated `BrowserView`; a controller boundary now keeps per-tab views and prepares for a `WebContentsView` adapter.
- BrowserView can cover React modals, forcing hide/show workarounds.
- Tab history, scroll position, and process state are preserved for cached tab views, but lifecycle is not yet a full browser engine with suspension/recovery.
- Downloads, popups, certificate errors, permission prompts, context menu, and crash recovery are not yet browser-grade.

## Architecture Direction

Move toward a main-process browser engine with explicit controllers:

```text
React UI
  |
  | typed IPC
  v
BrowserController
  |-- ProfileController
  |-- TabController
  |-- ViewController
  |-- NavigationController
  |-- DownloadController
  |-- PermissionController
  |-- FingerprintRuntime
  |-- HealthCheckController
```

The renderer remains a control surface. Main process owns webContents, sessions, proxy, fingerprint injection, downloads, permissions, and navigation.

## View Layer Plan

### Phase 1: Stabilize Current BrowserView Path

- Keep one BrowserView while fingerprint runtime is rewritten.
- Stop adding new frontend-dependent behavior to the current BrowserView path.
- Isolate current BrowserView logic behind a `ViewController` interface.

### Phase 2: Add WebContentsView Adapter

Create a view abstraction:

```ts
export interface BrowserPageView {
  readonly tabId: string;
  readonly webContentsId: number;
  loadURL(url: string): Promise<void>;
  setBounds(bounds: BrowserViewBounds): void;
  show(): void;
  hide(): void;
  destroy(): void;
}
```

Implementation targets:

- `BrowserViewPageView` for current compatibility.
- `WebContentsViewPageView` for the new path.

### Phase 3: Switch Default To WebContentsView

- Use WebContentsView for new sessions after parity tests pass.
- Keep BrowserView only as a temporary fallback.
- Remove modal hide/show workarounds once layering is controlled by the new view hierarchy.

## Tab Model

Current tab metadata should evolve into live tab state:

```ts
export interface BrowserTabRuntime {
  id: string;
  profileId: string;
  webContentsId: number;
  url: string;
  title: string;
  favicon?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  crashed: boolean;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}
```

Rules:

- One visible active tab per active profile.
- Each open tab should have its own webContents unless explicitly suspended.
- Switching tabs should show/hide views, not reload URLs.
- Closing a tab destroys its webContents after state is persisted.
- Suspended tabs keep metadata and can reload on demand.

## Navigation Requirements

The browser must support:

- address bar navigation
- back and forward
- reload and stop loading
- title updates
- URL updates after redirects
- favicon capture
- new-window and `target=_blank` handling
- external protocol handling
- blocked navigation reporting
- per-tab loading/error state

Main process events to use:

- `did-start-loading`
- `did-stop-loading`
- `did-navigate`
- `did-navigate-in-page`
- `page-title-updated`
- `page-favicon-updated`
- `render-process-gone`
- `did-fail-load`
- `setWindowOpenHandler`

## Session Requirements

Each profile session must own:

- cookies
- localStorage and IndexedDB
- cache
- proxy rules
- proxy auth
- Accept-Language header
- permission policy
- download path policy

Rules:

- A profile with a proxy must not silently fall back to direct network access when the proxy fails.
- Proxy auth should be attached once per session/view and updated when proxy identity changes.
- Profile reset should clear storage, cache, cookies, and runtime view state.
- Profile clone should copy cookies and storage only if the user chooses a clone-with-data operation.

## Fingerprint Runtime Requirements

The browser runtime must consume the hardware fingerprint model from `docs/architecture/hardware-fingerprint-spec.md`.

Required application points:

- Electron session request headers.
- CDP user agent, UA metadata, locale, timezone, and device metrics.
- Preload script modules.
- Browser window or view bounds.
- Self-test expected values.

Rules:

- Standalone Chromium and embedded browsing must share the same fingerprint builder.
- Fingerprint changes require recreating or reinjecting affected tab views.
- Active pages should be clearly marked stale if a profile fingerprint changes while a tab is open.

## Downloads

Requirements:

- Intercept download start.
- Store download item state: filename, URL, received bytes, total bytes, status, save path.
- Allow cancel, retry, and open downloaded file.
- Keep downloads profile-scoped.
- Prevent untrusted automatic execution.

Suggested controller:

```ts
export interface DownloadRecord {
  id: string;
  profileId: string;
  tabId?: string;
  url: string;
  filename: string;
  savePath: string;
  status: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  receivedBytes: number;
  totalBytes?: number;
  error?: string;
}
```

## Permissions

Initial safe policy:

- notifications: prompt or deny by profile setting
- geolocation: deny unless explicitly allowed
- camera/microphone: deny unless explicitly allowed
- MIDI, HID, serial, Bluetooth: deny
- clipboard: allow normal user gesture behavior

Permissions should be persisted per profile and origin later.

## Popups And New Windows

Rules:

- `target=_blank` opens a new tab in the same profile.
- JavaScript popups open as tabs unless a modal popup mode is explicitly required.
- External protocols should be blocked or delegated through a confirmation path.
- No popup should escape the profile partition.

## Crash And Recovery

Requirements:

- Detect renderer crash through `render-process-gone`.
- Mark tab as crashed.
- Keep last URL and title.
- Offer reload for the tab.
- Keep profile status separate from tab crash state.
- Reconcile running/stale state on app startup.

## Browser Health Model

Each profile should surface a health summary:

```ts
export interface ProfileHealth {
  fingerprint: 'ok' | 'warning' | 'risk';
  proxy: 'ok' | 'warning' | 'risk';
  runtime: 'ok' | 'warning' | 'risk';
  storage: 'ok' | 'warning' | 'risk';
  lastCheckedAt?: string;
  messages: string[];
}
```

Self-test should feed this model, but external IP API failures should not automatically mark the fingerprint as broken.

## Implementation Milestones

### Milestone 1: View Controller Boundary

- Extract current BrowserView operations from `electron/main.ts` into a controller module.
- Preserve existing behavior.
- Add tests for view recreation when profile, fingerprint, or proxy identity changes.

Status: implemented in `electron/services/nativeBrowserViewController.ts`; controller tests cover create/attach/resize/load, profile identity recreation, tab switching, closed tab disposal, and view metadata lookup.

### Milestone 2: Real Tab Runtime

- Add main-process tab runtime state.
- Keep one webContents per active tab.
- Update metadata from webContents events.
- Preserve tab state when switching tabs.

Status: partially implemented for cached BrowserView tabs. Remaining work: expose navigation state to the renderer, handle suspended tabs, and add crash/error state.

### Milestone 3: WebContentsView Migration

- Add WebContentsView adapter.
- Run the same navigation and tab tests against both adapters.
- Switch default adapter after parity.

### Milestone 4: Navigation And Popups

- Implement new-window handling.
- Add title, URL, favicon, loading, and navigation state events.
- Make back/forward buttons state-driven.

### Milestone 5: Downloads And Permissions

- Implement download tracking.
- Add profile-scoped permission handling.
- Add safe defaults for sensitive permissions.

### Milestone 6: Recovery And Health

- Add crash recovery.
- Add profile health model.
- Integrate self-test results into health state.

### Milestone 7: Release Hardening

- Full typecheck and unit tests.
- Smoke test profile creation, proxy binding, tab navigation, self-test, download, crash reload, and app restart.
- Document remaining limits.

## Acceptance Criteria

- Profile tabs no longer reload just because another tab was selected.
- Back/forward/reload reflect the active tab's actual webContents state.
- Popups open inside the same profile as tabs.
- Downloads are visible, cancellable, and profile-scoped.
- Proxy failures do not silently degrade to direct browsing.
- Fingerprint runtime is applied consistently to embedded and standalone browsing.
- App restart reconciles stale running profiles and crashed tabs.
- Browser UI can be layered above web content without hiding the page view as a workaround after WebContentsView migration.

## Testing Strategy

- Unit-test controllers with fake view adapters.
- Unit-test session configuration for proxy, headers, and permissions.
- Unit-test tab runtime event reducers.
- Add an Electron smoke test for creating a profile, opening a local page, navigating, opening a popup, downloading a local file, and reloading after a simulated crash where practical.
- Keep frontend tests focused on rendering state from typed API data; browser behavior should be owned by main-process tests.

## Implementation Notes

- Keep frontend changes out of the first controller extraction where possible.
- Do not mix fingerprint runtime rewrite with WebContentsView migration in the same commit.
- Avoid storing Electron objects directly in persisted profile records.
- Treat `webContentsId` as runtime state only.
- Add small controller modules instead of growing `electron/main.ts`.
