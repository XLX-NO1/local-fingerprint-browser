import type { BrowserView } from 'electron';
import type { BrowserViewBounds } from '../../src/nativeBrowserView';
import type { BrowserPageHost, BrowserPageViewLike, BrowserPageWebContentsLike } from './browserPageView';

type BrowserViewLike = {
  webContents: BrowserPageWebContentsLike;
  setBounds(bounds: BrowserViewBounds): void;
  setAutoResize(options: { width: boolean; height: boolean }): void;
};

type BrowserViewHostLike = {
  addBrowserView(view: BrowserViewLike): void;
  removeBrowserView(view: BrowserViewLike): void;
};

export class BrowserViewPageView implements BrowserPageViewLike {
  constructor(readonly nativeView: BrowserViewLike | BrowserView) {}

  get webContents(): BrowserPageWebContentsLike {
    return this.nativeView.webContents;
  }

  setBounds(bounds: BrowserViewBounds): void {
    this.nativeView.setBounds(bounds);
  }

  setAutoResize(options: { width: boolean; height: boolean }): void {
    this.nativeView.setAutoResize(options);
  }

  destroy(): void {
    if (!this.webContents.isDestroyed()) {
      this.webContents.close();
    }
  }
}

export class BrowserViewPageHost implements BrowserPageHost {
  constructor(private readonly host: BrowserViewHostLike) {}

  addPageView(view: BrowserPageViewLike): void {
    this.host.addBrowserView((view as BrowserViewPageView).nativeView as BrowserViewLike);
  }

  removePageView(view: BrowserPageViewLike): void {
    this.host.removeBrowserView((view as BrowserViewPageView).nativeView as BrowserViewLike);
  }
}
