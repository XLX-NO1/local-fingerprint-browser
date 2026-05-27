import type { AppApi, BrowserProfile, CreateProfileInput, DownloadRecord, LaunchResult, ProfileHistoryEvent, UpdateProfileInput } from './types';
import { parseProxyInput } from './proxyInput';
import { activateTabInProfile, closeTabInProfile, createBlankTab, openTabInProfile, toggleBookmarkInProfile } from './browserWorkspace';

export function installDevApi(): void {
  if (window.api) {
    return;
  }

  let profiles: BrowserProfile[] = [];
  let chromiumPath = '';
  const downloads: DownloadRecord[] = [];

  const api: AppApi = {
    async listProfiles() {
      return profiles;
    },
    async createProfile(input: CreateProfileInput) {
      const now = new Date().toISOString();
      const id = `dev-${Date.now().toString(36)}`;
      const profile: BrowserProfile = {
        id,
        name: input.name,
        group: input.group ?? 'Default',
        notes: input.notes ?? '',
        color: input.color ?? '#52ff9b',
        userDataDir: `/dev/profiles/${id}/chromium-user-data`,
        status: 'idle',
        history: [history('created', 'profile created')],
        createdAt: now,
        updatedAt: now,
        proxy: input.proxyUrl ? parseProxyInput(input.proxyUrl) : undefined,
        fingerprint: {
          id: `fp-${id}`,
          os: 'windows',
          browserVersion: '126.0.0.0',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
          platform: 'Win32',
          languages: ['en-US', 'en'],
          timezone: 'America/New_York',
          screenWidth: 1280,
          screenHeight: 800,
          windowWidth: 1280,
          windowHeight: 800,
          hardwareConcurrency: 8,
          deviceMemory: 8,
          webglVendor: 'Google Inc. (NVIDIA)',
          webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)',
          canvasSeed: 128001,
          audioSeed: 88001,
          webrtcPolicy: 'proxy-only',
          mediaDevices: ['default-audio-input', 'default-audio-output'],
          plugins: ['Chrome PDF Viewer'],
          mimeTypes: ['application/pdf'],
        },
      };
      profiles = [...profiles, profile];
      return profile;
    },
    async updateProfile(id: string, input: UpdateProfileInput) {
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) {
        throw new Error(`Profile not found: ${id}`);
      }
      const updated = { ...existing, ...input, history: [...(existing.history ?? []), history('updated', 'profile settings updated')].slice(-40), updatedAt: new Date().toISOString() };
      profiles = profiles.map((profile) => (profile.id === id ? updated : profile));
      return updated;
    },
    async duplicateProfile(id: string) {
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) {
        throw new Error(`Profile not found: ${id}`);
      }
      const now = new Date().toISOString();
      const duplicated = {
        ...existing,
        id: `dev-${Date.now().toString(36)}`,
        name: `${existing.name} copy`,
        userDataDir: `/dev/profiles/${id}-copy/chromium-user-data`,
        status: 'idle' as const,
        pid: undefined,
        lastError: undefined,
        selfTestSummary: undefined,
        selfTestReport: undefined,
        launchTrace: undefined,
        history: [history('duplicated', `duplicated from ${existing.name}`)],
        createdAt: now,
        updatedAt: now,
      };
      profiles = [...profiles, duplicated];
      return duplicated;
    },
    async deleteProfile(id: string) {
      profiles = profiles.filter((profile) => profile.id !== id);
    },
    async regenerateProfileFingerprint(id: string) {
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) throw new Error(`Profile not found: ${id}`);
      return api.updateProfile(id, {
        fingerprint: {
          ...existing.fingerprint,
          id: `fp-${Date.now().toString(36)}`,
          canvasSeed: Math.floor(Math.random() * 1_000_000),
          audioSeed: Math.floor(Math.random() * 1_000_000),
          webrtcPolicy: 'proxy-only',
        },
        selfTestUrl: undefined,
        selfTestSummary: undefined,
        selfTestReport: undefined,
        launchTrace: [...(existing.launchTrace ?? []), 'fingerprint regenerated'].slice(-12),
      });
    },
    async openFingerprintSelfTest(id: string) {
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) throw new Error(`Profile not found: ${id}`);
      const selfTestUrl = `file:///dev/profiles/${id}/fingerprint-self-test.html`;
      const workspace = openTabInProfile(existing, selfTestUrl);
      return api.updateProfile(id, {
        tabs: workspace.tabs,
        activeTabId: workspace.activeTabId,
        lastOpenedUrl: workspace.lastOpenedUrl,
        selfTestUrl,
        selfTestSummary: undefined,
        selfTestReport: undefined,
        launchTrace: [...(existing.launchTrace ?? []), 'embedded self-test opened'].slice(-12),
      });
    },
    async launchProfile(id: string): Promise<LaunchResult> {
      const pid = Math.floor(4000 + Math.random() * 1000);
      const selfTestUrl = `file:///dev/profiles/${id}/fingerprint-self-test.html`;
      const selfTestSummary = '8/8 checks ok';
      const selfTestReport = {
        matched: { userAgent: true, platform: true, languages: true, timezone: true, screen: true, webglVendor: true, webglRenderer: true },
        network: { proxyConfigured: Boolean(profiles.find((profile) => profile.id === id)?.proxy), publicIp: '203.0.113.10', error: null },
        webrtc: { candidateCount: 0, leakRisk: false, webrtcLeakRisk: false },
      };
      const launchTrace = ['profile directory ready', 'extension runtime prepared', 'self-test page prepared', `chromium process started: ${pid}`, 'cdp preload and self-test commands completed'];
      await api.updateProfile(id, { status: 'running', pid, lastLaunchAt: new Date().toISOString(), selfTestUrl, selfTestSummary, selfTestReport, launchTrace });
      await api.updateProfile(id, { history: [...(profiles.find((profile) => profile.id === id)?.history ?? []), history('launched', `browser launched pid ${pid}`)].slice(-40) });
      return { profileId: id, pid, debugPort: 41234, selfTestUrl, selfTestSummary, selfTestReport, launchTrace, automationStatus: 'attached' };
    },
    async openProfileUrl(id: string, url: string) {
      const targetUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) throw new Error(`Profile not found: ${id}`);
      if (existing.status !== 'running') {
        await api.launchProfile(id);
      }
      const workspace = openTabInProfile(profiles.find((profile) => profile.id === id) ?? existing, targetUrl);
      return api.updateProfile(id, {
        status: 'running',
        tabs: workspace.tabs,
        activeTabId: workspace.activeTabId,
        lastOpenedUrl: workspace.lastOpenedUrl,
        launchTrace: [...(profiles.find((profile) => profile.id === id)?.launchTrace ?? []), `opened ${targetUrl}`].slice(-12),
      });
    },
    async createProfileTab(id: string, url = 'about:blank') {
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) throw new Error(`Profile not found: ${id}`);
      return api.updateProfile(id, createBlankTab(existing, url));
    },
    async activateProfileTab(id: string, tabId: string) {
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) throw new Error(`Profile not found: ${id}`);
      return api.updateProfile(id, activateTabInProfile(existing, tabId));
    },
    async closeProfileTab(id: string, tabId: string) {
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) throw new Error(`Profile not found: ${id}`);
      return api.updateProfile(id, closeTabInProfile(existing, tabId));
    },
    async toggleProfileBookmark(id: string) {
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) throw new Error(`Profile not found: ${id}`);
      return api.updateProfile(id, toggleBookmarkInProfile(existing));
    },
    async fitEmbeddedWebview() {
      return 1;
    },
    async showNativeBrowserView() {},
    async resizeNativeBrowserView() {},
    async hideNativeBrowserView() {},
    async getNativeBrowserNavigationState() {
      return undefined;
    },
    async listDownloads(profileId?: string) {
      return profileId ? downloads.filter((download) => download.profileId === profileId) : downloads;
    },
    async cancelDownload(id: string) {
      const download = downloads.find((item) => item.id === id);
      if (!download) {
        return false;
      }
      download.status = 'cancelled';
      return true;
    },
    async goBackNativeBrowserView() {},
    async goForwardNativeBrowserView() {},
    async reloadNativeBrowserView() {},
    onProfilesChanged() {
      return () => {};
    },
    async stopProfile(id: string) {
      await api.updateProfile(id, { status: 'idle', pid: undefined });
      await api.updateProfile(id, { history: [...(profiles.find((profile) => profile.id === id)?.history ?? []), history('stopped', 'browser stopped from UI')].slice(-40) });
    },
    async checkProfileProxy(id: string) {
      const existing = profiles.find((profile) => profile.id === id);
      if (!existing) throw new Error(`Profile not found: ${id}`);
      const updatedProxy = existing.proxy
        ? { ...existing.proxy, lastCheckStatus: 'ok' as const, lastCheckLatencyMs: 42, updatedAt: new Date().toISOString() }
        : undefined;
      return api.updateProfile(id, {
        proxy: updatedProxy,
        lastError: updatedProxy ? undefined : 'No proxy configured',
        history: [...(existing.history ?? []), history('proxy-check', updatedProxy ? 'proxy reachable in 42ms' : 'No proxy configured')].slice(-40),
      });
    },
    async getSettings() {
      return { chromiumPath, detectedChromiumPath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' };
    },
    async updateSettings(input) {
      chromiumPath = input.chromiumPath ?? '';
      return { chromiumPath };
    },
  };

  window.api = api;
}

function history(type: ProfileHistoryEvent['type'], message: string): ProfileHistoryEvent {
  return {
    id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    createdAt: new Date().toISOString(),
  };
}
