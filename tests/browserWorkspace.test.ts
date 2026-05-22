import { describe, expect, it } from 'vitest';
import type { BrowserProfile } from '../src/types';
import {
  activateTabInProfile,
  closeTabInProfile,
  createBlankTab,
  openTabInProfile,
  openUrlInNewTab,
  toggleBookmarkInProfile,
  updateActiveTabMetadata,
} from '../src/browserWorkspace';

describe('browser workspace model', () => {
  it('opens urls in the active tab for a profile', () => {
    const profile = createBlankTab(makeProfile(), 'example.com');
    const updated = openTabInProfile(profile, 'openai.com');

    expect(updated.tabs).toHaveLength(1);
    expect(updated.lastOpenedUrl).toBe('https://openai.com/');
    expect(updated.tabs?.[0]).toMatchObject({ title: 'openai.com', url: 'https://openai.com/' });
  });

  it('creates, activates, and closes tabs per profile', () => {
    const first = createBlankTab(makeProfile(), 'example.com');
    const second = createBlankTab(first, 'openai.com');
    const firstTabId = second.tabs?.[0].id ?? '';

    const activated = activateTabInProfile(second, firstTabId);
    const closed = closeTabInProfile(activated, firstTabId);

    expect(second.tabs).toHaveLength(2);
    expect(activated.lastOpenedUrl).toBe('https://example.com/');
    expect(closed.tabs).toHaveLength(1);
    expect(closed.lastOpenedUrl).toBe('https://openai.com/');
  });

  it('creates new user tabs as blank pages by default', () => {
    const profile = createBlankTab(makeProfile());

    expect(profile.lastOpenedUrl).toBe('about:blank');
    expect(profile.tabs?.[0]).toMatchObject({ title: 'blank', url: 'about:blank' });
  });

  it('creates blank tabs when the native create-tab IPC does not provide a url', () => {
    const profile = createBlankTab(makeProfile(), undefined);

    expect(profile.lastOpenedUrl).toBe('about:blank');
  });

  it('toggles bookmarks for the active tab', () => {
    const profile = createBlankTab(makeProfile(), 'example.com');
    const bookmarked = toggleBookmarkInProfile(profile);
    const removed = toggleBookmarkInProfile(bookmarked);

    expect(bookmarked.bookmarks).toMatchObject([{ title: 'example.com', url: 'https://example.com/' }]);
    expect(removed.bookmarks).toEqual([]);
  });

  it('opens target blank urls as a new active tab instead of replacing the current tab', () => {
    const profile = createBlankTab(makeProfile(), 'example.com');
    const updated = openUrlInNewTab(profile, 'https://news.baidu.com/');

    expect(updated.tabs).toHaveLength(2);
    expect(updated.activeTabId).toBe(updated.tabs?.[1].id);
    expect(updated.lastOpenedUrl).toBe('https://news.baidu.com/');
    expect(updated.tabs?.[0].url).toBe('https://example.com/');
  });

  it('updates active tab metadata after in-page browser navigation', () => {
    const profile = createBlankTab(makeProfile(), 'example.com');
    const updated = updateActiveTabMetadata(profile, {
      url: 'https://example.com/docs',
      title: 'Docs',
    });

    expect(updated.tabs).toHaveLength(1);
    expect(updated.lastOpenedUrl).toBe('https://example.com/docs');
    expect(updated.tabs?.[0]).toMatchObject({ title: 'Docs', url: 'https://example.com/docs' });
  });

  it('opens the local fingerprint self-test page in the active tab', () => {
    const updated = openTabInProfile(makeProfile(), 'file:///tmp/profile/fingerprint-self-test.html?run=abc');

    expect(updated.lastOpenedUrl).toBe('file:///tmp/profile/fingerprint-self-test.html?run=abc');
    expect(updated.tabs?.[0]).toMatchObject({ title: 'Fingerprint Self Test', url: 'file:///tmp/profile/fingerprint-self-test.html?run=abc' });
  });
});

function makeProfile(): BrowserProfile {
  return {
    id: 'profile-a',
    name: 'User A',
    group: 'Default',
    notes: '',
    fingerprint: {
      id: 'fp-a',
      os: 'windows',
      browserVersion: '126.0.0.0',
      userAgent: 'ua',
      platform: 'Win32',
      languages: ['en-US'],
      timezone: 'UTC',
      screenWidth: 1280,
      screenHeight: 800,
      windowWidth: 1280,
      windowHeight: 800,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webglVendor: 'vendor',
      webglRenderer: 'renderer',
      canvasSeed: 1,
      audioSeed: 2,
      webrtcPolicy: 'proxy-only',
      mediaDevices: [],
      plugins: [],
      mimeTypes: [],
    },
    userDataDir: '/tmp/profile-a',
    status: 'idle',
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
  };
}
