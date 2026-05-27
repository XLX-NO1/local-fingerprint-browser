import type { WebContentsView } from 'electron';
import type { BrowserViewBounds } from '../../src/nativeBrowserView';
import type { BrowserPageHost, BrowserPageViewLike, BrowserPageWebContentsLike } from './browserPageView';

type WebContentsViewLike = {
  webContents: BrowserPageWebContentsLike;
  setBounds(bounds: BrowserViewBounds): void;
};

type WebContentsViewHostLike = {
  contentView: {
    addChildView(view: WebContentsViewLike): void;
    removeChildView(view: WebContentsViewLike): void;
  };
};

export class WebContentsViewPageView implements BrowserPageViewLike {
  constructor(readonly nativeView: WebContentsViewLike | WebContentsView) {}

  get webContents(): BrowserPageWebContentsLike {
    return this.nativeView.webContents;
  }

  setBounds(bounds: BrowserViewBounds): void {
    this.nativeView.setBounds(bounds);
  }

  setAutoResize(_options: { width: boolean; height: boolean }): void {
    // WebContentsView is resized by explicitly setting bounds on layout changes.
  }

  destroy(): void {
    if (!this.webContents.isDestroyed()) {
      this.webContents.close();
    }
  }
}

export class WebContentsViewPageHost implements BrowserPageHost {
  constructor(private readonly host: WebContentsViewHostLike) {}

  addPageView(view: BrowserPageViewLike): void {
    this.host.contentView.addChildView((view as WebContentsViewPageView).nativeView as WebContentsViewLike);
  }

  removePageView(view: BrowserPageViewLike): void {
    this.host.contentView.removeChildView((view as WebContentsViewPageView).nativeView as WebContentsViewLike);
  }
}
