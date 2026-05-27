import type { BrowserViewBounds } from '../../src/nativeBrowserView';

export interface BrowserPageWebContentsLike {
  isDestroyed(): boolean;
  getURL(): string;
  getTitle(): string;
  loadURL(url: string): Promise<void>;
  close(): void;
  setUserAgent(userAgent: string): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
}

export interface BrowserPageViewLike {
  webContents: BrowserPageWebContentsLike;
  setBounds(bounds: BrowserViewBounds): void;
  setAutoResize(options: { width: boolean; height: boolean }): void;
}

export interface BrowserPageHost {
  addPageView(view: BrowserPageViewLike): void;
  removePageView(view: BrowserPageViewLike): void;
}
