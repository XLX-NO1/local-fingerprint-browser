import type { BrowserBookmark, BrowserProfile, BrowserTab } from './types';
import { normalizeOpenUrl } from './urlInput';

export function openTabInProfile(profile: BrowserProfile, rawUrl: string): BrowserProfile {
  const url = normalizeOpenUrl(rawUrl);
  const now = new Date().toISOString();
  const existing = (profile.tabs ?? []).find((tab) => tab.id === profile.activeTabId);
  const tab: BrowserTab = existing
    ? { ...existing, url, title: titleFromUrl(url), updatedAt: now }
    : { id: createId('tab'), url, title: titleFromUrl(url), createdAt: now, updatedAt: now };
  const tabs = existing
    ? (profile.tabs ?? []).map((item) => (item.id === tab.id ? tab : item))
    : [...(profile.tabs ?? []), tab];

  return {
    ...profile,
    tabs,
    activeTabId: tab.id,
    lastOpenedUrl: url,
  };
}

export function createBlankTab(profile: BrowserProfile, rawUrl = 'about:blank'): BrowserProfile {
  const url = normalizeOpenUrl(rawUrl);
  const now = new Date().toISOString();
  const tab: BrowserTab = {
    id: createId('tab'),
    url,
    title: titleFromUrl(url),
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...profile,
    tabs: [...(profile.tabs ?? []), tab],
    activeTabId: tab.id,
    lastOpenedUrl: url,
  };
}

export function openUrlInNewTab(profile: BrowserProfile, rawUrl: string, title?: string): BrowserProfile {
  const url = normalizeOpenUrl(rawUrl);
  const now = new Date().toISOString();
  const tab: BrowserTab = {
    id: createId('tab'),
    url,
    title: title || titleFromUrl(url),
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...profile,
    tabs: [...(profile.tabs ?? []), tab],
    activeTabId: tab.id,
    lastOpenedUrl: url,
  };
}

export function updateActiveTabMetadata(profile: BrowserProfile, input: { url?: string; title?: string }): BrowserProfile {
  const active = activeTab(profile);
  if (!active) {
    return input.url ? openTabInProfile(profile, input.url) : profile;
  }
  const normalizedUrl = input.url ? normalizeOpenUrl(input.url) : active.url;
  const now = new Date().toISOString();
  const updatedTab: BrowserTab = {
    ...active,
    url: normalizedUrl,
    title: input.title || active.title || titleFromUrl(normalizedUrl),
    updatedAt: now,
  };
  return {
    ...profile,
    tabs: (profile.tabs ?? []).map((tab) => (tab.id === active.id ? updatedTab : tab)),
    activeTabId: updatedTab.id,
    lastOpenedUrl: normalizedUrl,
  };
}

export function updateTabMetadataInProfile(profile: BrowserProfile, tabId: string, input: { url?: string; title?: string }): BrowserProfile {
  const tab = (profile.tabs ?? []).find((item) => item.id === tabId);
  if (!tab) {
    return profile;
  }
  const normalizedUrl = input.url ? normalizeOpenUrl(input.url) : tab.url;
  const updatedTab: BrowserTab = {
    ...tab,
    url: normalizedUrl,
    title: input.title || tab.title || titleFromUrl(normalizedUrl),
    updatedAt: new Date().toISOString(),
  };
  const isActive = profile.activeTabId === tabId;
  return {
    ...profile,
    tabs: (profile.tabs ?? []).map((item) => (item.id === tabId ? updatedTab : item)),
    lastOpenedUrl: isActive ? normalizedUrl : profile.lastOpenedUrl,
  };
}

export function closeTabInProfile(profile: BrowserProfile, tabId: string): BrowserProfile {
  const tabs = (profile.tabs ?? []).filter((tab) => tab.id !== tabId);
  const activeTab = tabs.at(-1);
  return {
    ...profile,
    tabs,
    activeTabId: activeTab?.id,
    lastOpenedUrl: activeTab?.url,
  };
}

export function activateTabInProfile(profile: BrowserProfile, tabId: string): BrowserProfile {
  const tab = (profile.tabs ?? []).find((item) => item.id === tabId);
  if (!tab) {
    return profile;
  }
  return {
    ...profile,
    activeTabId: tab.id,
    lastOpenedUrl: tab.url,
  };
}

export function toggleBookmarkInProfile(profile: BrowserProfile): BrowserProfile {
  const activeTab = (profile.tabs ?? []).find((tab) => tab.id === profile.activeTabId);
  const url = activeTab?.url ?? profile.lastOpenedUrl;
  if (!url) {
    return profile;
  }
  const bookmarks = profile.bookmarks ?? [];
  const existing = bookmarks.find((bookmark) => bookmark.url === url);
  if (existing) {
    return {
      ...profile,
      bookmarks: bookmarks.filter((bookmark) => bookmark.id !== existing.id),
    };
  }
  const bookmark: BrowserBookmark = {
    id: createId('bookmark'),
    title: activeTab?.title ?? titleFromUrl(url),
    url,
    createdAt: new Date().toISOString(),
  };
  return {
    ...profile,
    bookmarks: [...bookmarks, bookmark],
  };
}

export function activeTab(profile: BrowserProfile): BrowserTab | undefined {
  return (profile.tabs ?? []).find((tab) => tab.id === profile.activeTabId) ?? profile.tabs?.[0];
}

function titleFromUrl(url: string): string {
  if (url === 'about:blank') {
    return 'blank';
  }
  const parsed = new URL(url);
  if (parsed.protocol === 'file:' && parsed.pathname.endsWith('/fingerprint-self-test.html')) {
    return 'Fingerprint Self Test';
  }
  if (parsed.protocol === 'file:') {
    return decodeURIComponent(parsed.pathname.split('/').pop() || 'file');
  }
  return parsed.hostname;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
