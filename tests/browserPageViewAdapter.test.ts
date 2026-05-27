import { describe, expect, it, vi } from 'vitest';
import { BrowserViewPageHost, BrowserViewPageView } from '../electron/services/browserViewPageView';
import { WebContentsViewPageHost, WebContentsViewPageView } from '../electron/services/webContentsViewPageView';
import type { BrowserPageViewLike } from '../electron/services/browserPageView';

describe('browser page view adapters', () => {
  it('wraps BrowserView with the shared page view interface', () => {
    const browserView = makeNativeView();
    const adapter = new BrowserViewPageView(browserView);

    adapter.setBounds({ x: 1, y: 2, width: 300, height: 200 });
    adapter.setAutoResize({ width: false, height: false });
    adapter.destroy();

    expect(adapter.webContents).toBe(browserView.webContents);
    expect(browserView.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 300, height: 200 });
    expect(browserView.setAutoResize).toHaveBeenCalledWith({ width: false, height: false });
    expect(browserView.webContents.close).toHaveBeenCalled();
    expect(adapter.nativeView).toBe(browserView);
  });

  it('does not close an already destroyed BrowserView webContents', () => {
    const browserView = makeNativeView();
    browserView.webContents.isDestroyed = vi.fn(() => true);
    const adapter = new BrowserViewPageView(browserView);

    adapter.destroy();

    expect(browserView.webContents.close).not.toHaveBeenCalled();
  });

  it('wraps WebContentsView with the shared page view interface', () => {
    const webContentsView = makeNativeView();
    const adapter = new WebContentsViewPageView(webContentsView);

    adapter.setBounds({ x: 1, y: 2, width: 300, height: 200 });
    adapter.setAutoResize({ width: false, height: false });
    adapter.destroy();

    expect(adapter.webContents).toBe(webContentsView.webContents);
    expect(webContentsView.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 300, height: 200 });
    expect(webContentsView.setAutoResize).not.toHaveBeenCalled();
    expect(webContentsView.webContents.close).toHaveBeenCalled();
    expect(adapter.nativeView).toBe(webContentsView);
  });

  it('adapts BrowserWindow hosts for BrowserView and WebContentsView APIs', () => {
    const browserPageView = new BrowserViewPageView(makeNativeView());
    const webContentsPageView = new WebContentsViewPageView(makeNativeView());
    const browserViewWindow = {
      addBrowserView: vi.fn(),
      removeBrowserView: vi.fn(),
    };
    const webContentsViewWindow = {
      contentView: {
        addChildView: vi.fn(),
        removeChildView: vi.fn(),
      },
    };

    new BrowserViewPageHost(browserViewWindow).addPageView(browserPageView);
    new BrowserViewPageHost(browserViewWindow).removePageView(browserPageView);
    new WebContentsViewPageHost(webContentsViewWindow).addPageView(webContentsPageView);
    new WebContentsViewPageHost(webContentsViewWindow).removePageView(webContentsPageView);

    expect(browserViewWindow.addBrowserView).toHaveBeenCalledWith(browserPageView.nativeView);
    expect(browserViewWindow.removeBrowserView).toHaveBeenCalledWith(browserPageView.nativeView);
    expect(webContentsViewWindow.contentView.addChildView).toHaveBeenCalledWith(webContentsPageView.nativeView);
    expect(webContentsViewWindow.contentView.removeChildView).toHaveBeenCalledWith(webContentsPageView.nativeView);
  });
});

function makeNativeView(): BrowserPageViewLike {
  return {
    webContents: {
      isDestroyed: vi.fn(() => false),
      getURL: vi.fn(() => 'about:blank'),
      getTitle: vi.fn(() => ''),
      loadURL: vi.fn(async () => undefined),
      close: vi.fn(),
      setUserAgent: vi.fn(),
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
    },
    setBounds: vi.fn(),
    setAutoResize: vi.fn() as unknown as BrowserPageViewLike['setAutoResize'],
  };
}
