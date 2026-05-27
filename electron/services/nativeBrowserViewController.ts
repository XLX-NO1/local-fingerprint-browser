import type { BrowserNavigationState, BrowserProfile } from '../../src/types';
import type { BrowserViewBounds } from '../../src/nativeBrowserView';
import type { EmbeddedBrowserViewState } from './embeddedFingerprint';
import type { BrowserPageHost, BrowserPageViewLike, BrowserPageWebContentsLike } from './browserPageView';

export type NativeBrowserWebContentsLike = BrowserPageWebContentsLike;
export type NativeBrowserViewLike = BrowserPageViewLike;
export type NativeBrowserHost = BrowserPageHost;

export interface NativeBrowserViewControllerOptions {
  createView(profile: BrowserProfile): NativeBrowserViewLike;
  prepareProfileSession(profile: BrowserProfile): Promise<void>;
  shouldRecreateView(current: EmbeddedBrowserViewState, profile: BrowserProfile): boolean;
  viewState(profile: BrowserProfile): Required<EmbeddedBrowserViewState>;
  onViewCreated(view: NativeBrowserViewLike, profile: BrowserProfile): Promise<void>;
  toNativeBounds(bounds: BrowserViewBounds): BrowserViewBounds;
  isNavigationAbort(error: unknown): boolean;
}

export class NativeBrowserViewController {
  private readonly entries = new Map<string, NativeBrowserViewEntry>();
  private activeTabId: string | undefined;

  constructor(private readonly options: NativeBrowserViewControllerOptions) {}

  async show(host: NativeBrowserHost, profile: BrowserProfile, tabId: string, url: string, bounds: BrowserViewBounds): Promise<void> {
    await this.options.prepareProfileSession(profile);

    if (this.activeTabId && this.activeTabId !== tabId) {
      const active = this.entries.get(this.activeTabId);
      if (active?.attached) {
      host.removePageView(active.view);
        active.attached = false;
      }
    }

    let entry = this.entries.get(tabId);
    if (!entry || this.options.shouldRecreateView(entry.state, profile)) {
      if (entry) {
        this.disposeEntry(host, tabId, entry);
      }
      entry = await this.createEntry(profile);
      entry.navigationState = {
        ...entry.navigationState,
        profileId: profile.id,
        tabId,
      };
      this.entries.set(tabId, entry);
    }

    this.activeTabId = tabId;
    if (!entry.attached) {
      host.addPageView(entry.view);
      entry.attached = true;
    }

    this.resize(bounds);
    if (entry.view.webContents.getURL() !== url) {
      try {
        await entry.view.webContents.loadURL(url);
      } catch (error) {
        if (!this.options.isNavigationAbort(error)) {
          throw error;
        }
      }
    }
  }

  resize(bounds: BrowserViewBounds): void {
    const entry = this.currentEntry();
    if (!entry) {
      return;
    }
    entry.bounds = this.options.toNativeBounds(bounds);
    entry.view.setBounds(entry.bounds);
    entry.view.setAutoResize({ width: false, height: false });
  }

  hide(host: NativeBrowserHost): void {
    const entry = this.currentEntry();
    if (entry?.attached) {
      host.removePageView(entry.view);
      entry.attached = false;
    }
  }

  dispose(host: NativeBrowserHost): void {
    for (const [tabId, entry] of this.entries) {
      this.disposeEntry(host, tabId, entry);
    }
    this.activeTabId = undefined;
  }

  disposeTab(host: NativeBrowserHost, tabId: string): void {
    const entry = this.entries.get(tabId);
    if (entry) {
      this.disposeEntry(host, tabId, entry);
    }
  }

  disposeProfile(host: NativeBrowserHost, profileId: string): void {
    for (const [tabId, entry] of this.entries) {
      if (entry.profileId === profileId) {
        this.disposeEntry(host, tabId, entry);
      }
    }
  }

  detach(host: NativeBrowserHost): void {
    this.hide(host);
  }

  goBack(): void {
    const view = this.currentEntry()?.view;
    if (view?.webContents.canGoBack()) {
      view.webContents.goBack();
    }
  }

  goForward(): void {
    const view = this.currentEntry()?.view;
    if (view?.webContents.canGoForward()) {
      view.webContents.goForward();
    }
  }

  reload(): void {
    this.currentEntry()?.view.webContents.reload();
  }

  currentView(): NativeBrowserViewLike | undefined {
    return this.currentEntry()?.view;
  }

  currentProfileId(): string | undefined {
    return this.currentEntry()?.profileId;
  }

  currentTabId(): string | undefined {
    return this.activeTabId;
  }

  currentBounds(): BrowserViewBounds | undefined {
    return this.currentEntry()?.bounds;
  }

  isAttached(): boolean {
    return this.currentEntry()?.attached ?? false;
  }

  metadataForView(view: NativeBrowserViewLike): { profileId: string; tabId: string } | undefined {
    for (const [tabId, entry] of this.entries) {
      if (entry.view === view) {
        return { profileId: entry.profileId, tabId };
      }
    }
    return undefined;
  }

  navigationStateForTab(tabId: string): BrowserNavigationState | undefined {
    const entry = this.entries.get(tabId);
    if (!entry) {
      return undefined;
    }
    return { ...entry.navigationState };
  }

  currentNavigationState(): BrowserNavigationState | undefined {
    const entry = this.currentEntry();
    return entry ? { ...entry.navigationState } : undefined;
  }

  updateNavigationStateForView(view: NativeBrowserViewLike, patch: Partial<Omit<BrowserNavigationState, 'profileId' | 'tabId'>>): BrowserNavigationState | undefined {
    for (const [tabId, entry] of this.entries) {
      if (entry.view !== view) {
        continue;
      }
      entry.navigationState = {
        ...entry.navigationState,
        url: patch.url ?? view.webContents.getURL(),
        title: patch.title ?? view.webContents.getTitle(),
        canGoBack: patch.canGoBack ?? view.webContents.canGoBack(),
        canGoForward: patch.canGoForward ?? view.webContents.canGoForward(),
        ...patch,
        profileId: entry.profileId,
        tabId,
      };
      return { ...entry.navigationState };
    }
    return undefined;
  }

  private async createEntry(profile: BrowserProfile): Promise<NativeBrowserViewEntry> {
    const view = this.options.createView(profile);
    view.webContents.setUserAgent(profile.fingerprint.userAgent);
    await this.options.onViewCreated(view, profile);
    return {
      view,
      profileId: profile.id,
      state: this.options.viewState(profile),
      navigationState: this.navigationStateFromView(profile.id, '', view),
      attached: false,
    };
  }

  private disposeEntry(host: NativeBrowserHost, tabId: string, entry: NativeBrowserViewEntry): void {
    if (entry.attached) {
      host.removePageView(entry.view);
    }
    if (!entry.view.webContents.isDestroyed()) {
      entry.view.webContents.close();
    }
    this.entries.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = undefined;
    }
  }

  private currentEntry(): NativeBrowserViewEntry | undefined {
    return this.activeTabId ? this.entries.get(this.activeTabId) : undefined;
  }

  private navigationStateFromView(profileId: string, tabId: string, view: NativeBrowserViewLike): BrowserNavigationState {
    return {
      profileId,
      tabId,
      url: view.webContents.getURL(),
      title: view.webContents.getTitle(),
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward(),
      isLoading: false,
      crashed: false,
    };
  }
}

type NativeBrowserViewEntry = {
  view: NativeBrowserViewLike;
  profileId: string;
  state: EmbeddedBrowserViewState;
  navigationState: BrowserNavigationState;
  attached: boolean;
  bounds?: BrowserViewBounds;
};
