import { describe, expect, it, vi } from 'vitest';
import { NativeBrowserViewController, type NativeBrowserHost, type NativeBrowserViewLike } from '../electron/services/nativeBrowserViewController';
import { generateFingerprint } from '../electron/services/fingerprint';
import type { BrowserProfile } from '../src/types';
import type { BrowserViewBounds } from '../src/nativeBrowserView';

describe('NativeBrowserViewController', () => {
  it('creates, attaches, sizes, and loads a native browser view', async () => {
    const view = makeView();
    const host = makeHost();
    const calls: string[] = [];
    const controller = new NativeBrowserViewController({
      createView: vi.fn(() => view),
      prepareProfileSession: vi.fn(async () => {
        calls.push('prepare');
      }),
      shouldRecreateView: vi.fn(() => false),
      viewState: vi.fn(() => ({ profileId: 'profile-a', fingerprintId: 'fp-a', proxyIdentity: 'direct' })),
      onViewCreated: vi.fn(async () => {
        calls.push('created');
      }),
      toNativeBounds: vi.fn((bounds) => ({ ...bounds, width: bounds.width * 2, height: bounds.height * 2 })),
      isNavigationAbort: vi.fn(() => false),
    });

    await controller.show(host, makeProfile('profile-a'), 'tab-a', 'https://example.com/', { x: 1, y: 2, width: 300, height: 200 });

    expect(calls).toEqual(['prepare', 'created']);
    expect(host.addBrowserView).toHaveBeenCalledWith(view);
    expect(view.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 600, height: 400 });
    expect(view.setAutoResize).toHaveBeenCalledWith({ width: false, height: false });
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://example.com/');
    expect(controller.currentView()).toBe(view);
    expect(controller.currentProfileId()).toBe('profile-a');
  });

  it('recreates the view when profile runtime identity changes', async () => {
    const first = makeView('https://old.example/');
    const second = makeView();
    const host = makeHost();
    const controller = new NativeBrowserViewController({
      createView: vi.fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second),
      prepareProfileSession: vi.fn(async () => undefined),
      shouldRecreateView: vi.fn((current, profile) => current.profileId !== profile.id),
      viewState: vi.fn((profile) => ({ profileId: profile.id, fingerprintId: profile.fingerprint.id, proxyIdentity: 'direct' })),
      onViewCreated: vi.fn(async () => undefined),
      toNativeBounds: vi.fn((bounds) => bounds),
      isNavigationAbort: vi.fn(() => false),
    });

    await controller.show(host, makeProfile('profile-a'), 'tab-a', 'https://a.example/', bounds());
    await controller.show(host, makeProfile('profile-b'), 'tab-a', 'https://b.example/', bounds());

    expect(host.removeBrowserView).toHaveBeenCalledWith(first);
    expect(first.webContents.close).toHaveBeenCalled();
    expect(host.addBrowserView).toHaveBeenCalledWith(second);
    expect(controller.currentView()).toBe(second);
    expect(controller.currentProfileId()).toBe('profile-b');
  });

  it('switches tabs by showing existing views without reloading them', async () => {
    const first = makeView('https://a.example/');
    const second = makeView('https://b.example/');
    const host = makeHost();
    const controller = new NativeBrowserViewController({
      createView: vi.fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second),
      prepareProfileSession: vi.fn(async () => undefined),
      shouldRecreateView: vi.fn(() => false),
      viewState: vi.fn((profile) => ({ profileId: profile.id, fingerprintId: profile.fingerprint.id, proxyIdentity: 'direct' })),
      onViewCreated: vi.fn(async () => undefined),
      toNativeBounds: vi.fn((input) => input),
      isNavigationAbort: vi.fn(() => false),
    });
    const profile = makeProfile('profile-a');

    await controller.show(host, profile, 'tab-a', 'https://a.example/', bounds());
    await controller.show(host, profile, 'tab-b', 'https://b.example/', bounds());
    await controller.show(host, profile, 'tab-a', 'https://a.example/', bounds());

    expect(host.removeBrowserView).toHaveBeenCalledWith(first);
    expect(host.removeBrowserView).toHaveBeenCalledWith(second);
    expect(host.addBrowserView).toHaveBeenLastCalledWith(first);
    expect(first.webContents.loadURL).not.toHaveBeenCalled();
    expect(second.webContents.loadURL).not.toHaveBeenCalled();
    expect(controller.currentView()).toBe(first);
    expect(controller.currentTabId()).toBe('tab-a');
  });

  it('hides without closing and exposes navigation controls', async () => {
    const view = makeView('https://example.com/');
    const host = makeHost();
    view.webContents.canGoBack = vi.fn(() => true);
    view.webContents.canGoForward = vi.fn(() => true);
    const controller = makeController(view);

    await controller.show(host, makeProfile('profile-a'), 'tab-a', 'https://example.com/', bounds());
    controller.hide(host);
    controller.goBack();
    controller.goForward();
    controller.reload();

    expect(host.removeBrowserView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).not.toHaveBeenCalled();
    expect(view.webContents.goBack).toHaveBeenCalled();
    expect(view.webContents.goForward).toHaveBeenCalled();
    expect(view.webContents.reload).toHaveBeenCalled();
  });

  it('disposes a closed tab view and can identify metadata for any view', async () => {
    const first = makeView('https://a.example/');
    const second = makeView('https://b.example/');
    const host = makeHost();
    const controller = new NativeBrowserViewController({
      createView: vi.fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second),
      prepareProfileSession: vi.fn(async () => undefined),
      shouldRecreateView: vi.fn(() => false),
      viewState: vi.fn((profile) => ({ profileId: profile.id, fingerprintId: profile.fingerprint.id, proxyIdentity: 'direct' })),
      onViewCreated: vi.fn(async () => undefined),
      toNativeBounds: vi.fn((input) => input),
      isNavigationAbort: vi.fn(() => false),
    });
    const profile = makeProfile('profile-a');

    await controller.show(host, profile, 'tab-a', 'https://a.example/', bounds());
    await controller.show(host, profile, 'tab-b', 'https://b.example/', bounds());
    controller.disposeTab(host, 'tab-a');

    expect(first.webContents.close).toHaveBeenCalled();
    expect(controller.metadataForView(second)).toEqual({ profileId: 'profile-a', tabId: 'tab-b' });
    expect(controller.metadataForView(first)).toBeUndefined();
  });

  it('disposes all views that belong to a profile', async () => {
    const first = makeView('https://a.example/');
    const second = makeView('https://b.example/');
    const host = makeHost();
    const controller = new NativeBrowserViewController({
      createView: vi.fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second),
      prepareProfileSession: vi.fn(async () => undefined),
      shouldRecreateView: vi.fn(() => false),
      viewState: vi.fn((profile) => ({ profileId: profile.id, fingerprintId: profile.fingerprint.id, proxyIdentity: 'direct' })),
      onViewCreated: vi.fn(async () => undefined),
      toNativeBounds: vi.fn((input) => input),
      isNavigationAbort: vi.fn(() => false),
    });

    await controller.show(host, makeProfile('profile-a'), 'tab-a', 'https://a.example/', bounds());
    await controller.show(host, makeProfile('profile-b'), 'tab-b', 'https://b.example/', bounds());
    controller.disposeProfile(host, 'profile-a');

    expect(first.webContents.close).toHaveBeenCalled();
    expect(second.webContents.close).not.toHaveBeenCalled();
    expect(controller.metadataForView(first)).toBeUndefined();
    expect(controller.metadataForView(second)).toEqual({ profileId: 'profile-b', tabId: 'tab-b' });
  });
});

function makeController(view: NativeBrowserViewLike): NativeBrowserViewController {
  return new NativeBrowserViewController({
    createView: vi.fn(() => view),
    prepareProfileSession: vi.fn(async () => undefined),
    shouldRecreateView: vi.fn(() => false),
    viewState: vi.fn((profile) => ({ profileId: profile.id, fingerprintId: profile.fingerprint.id, proxyIdentity: 'direct' })),
    onViewCreated: vi.fn(async () => undefined),
    toNativeBounds: vi.fn((input) => input),
    isNavigationAbort: vi.fn(() => false),
  });
}

function makeHost(): NativeBrowserHost {
  return {
    addBrowserView: vi.fn(),
    removeBrowserView: vi.fn(),
  };
}

function makeView(url = 'about:blank'): NativeBrowserViewLike {
  return {
    webContents: {
      isDestroyed: vi.fn(() => false),
      getURL: vi.fn(() => url),
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
    setAutoResize: vi.fn(),
  };
}

function makeProfile(id: string): BrowserProfile {
  const now = new Date('2026-05-27T00:00:00.000Z').toISOString();
  return {
    id,
    name: id,
    group: 'Default',
    notes: '',
    fingerprint: generateFingerprint(id),
    userDataDir: `/tmp/${id}`,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}

function bounds(): BrowserViewBounds {
  return { x: 0, y: 0, width: 100, height: 100 };
}
