import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrowserNavigationState, BrowserProfile, CreateProfileInput, DownloadRecord } from './types';
import { formatProxyInput, parseProxyInput } from './proxyInput';
import { filterProfiles, type ProfileGroupFilter } from './profileFilters';
import { buildSelfTestChecklist } from './selfTestReport';
import { embeddedPartitionForProfile, profileAddressBarUrl } from './embeddedBrowser';
import { buildDeviceProfileRows } from './deviceProfile';
import { applyFingerprintRegionPreset, applyFingerprintOsPreset, fingerprintToForm, formToFingerprint, hasFingerprintFormChanges, type FingerprintFormState } from './fingerprintEditor';
import { generateLocalFingerprint } from './localFingerprint';
import { isFingerprintSelfTestUrl } from './selfTestDisplay';
import { generateFingerprintForRegion, inferRegionFromFingerprint, REGION_PRESETS } from './fingerprintRegions';
import { browserSurfaceModeFromSettings, shouldUseDomSurface, shouldUseNativeSurface, type BrowserSurfaceMode } from './browserSurfaceMode';

const PROFILE_COLORS = ['#52ff9b', '#5ee7ff', '#ffd166', '#ff5d73', '#b58cff', '#ff9f43'];
const DEFAULT_PROFILE_COLOR = PROFILE_COLORS[0];
const DEFAULT_REGION = 'US';
const DEFAULT_CREATE_FINGERPRINT = generateFingerprintForRegion(DEFAULT_REGION, 'create-profile-default');
const DEFAULT_FORM_FINGERPRINT = fingerprintToForm(DEFAULT_CREATE_FINGERPRINT);
const BROWSER_ZOOM_OPTIONS = [
  { label: '80%', value: 0.8 },
  { label: '90%', value: 0.9 },
  { label: '100%', value: 1 },
  { label: '110%', value: 1.1 },
  { label: '125%', value: 1.25 },
];

export default function App() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProxyEditorOpen, setIsProxyEditorOpen] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(true);
  const [editingProfile, setEditingProfile] = useState<BrowserProfile>();
  const [proxyEditingProfile, setProxyEditingProfile] = useState<BrowserProfile>();
  const [chromiumPath, setChromiumPath] = useState('');
  const [detectedChromiumPath, setDetectedChromiumPath] = useState('');
  const [browserZoomFactor, setBrowserZoomFactor] = useState(1);
  const [disableIpv6, setDisableIpv6] = useState(true);
  const [browserSurfaceMode, setBrowserSurfaceMode] = useState<BrowserSurfaceMode>('loading');
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<ProfileGroupFilter>('ALL');
  const [openUrl, setOpenUrl] = useState('https://example.com');
  const [navigationState, setNavigationState] = useState<BrowserNavigationState>();
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [proxyFormUrl, setProxyFormUrl] = useState('');
  const [selectedRegion, setSelectedRegion] = useState(DEFAULT_REGION);
  const mainRef = useRef<HTMLElement | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const nativeBrowserFrameRef = useRef<HTMLDivElement | null>(null);
  const embeddedWebviewRef = useRef<JSX.ElectronWebviewElement | null>(null);
  const nativeBrowserSyncTimersRef = useRef<{ frame?: number; timer?: number; lateTimer?: number }>({});
  const nativeBrowserLayoutVersionRef = useRef(0);
  const proxyInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<CreateProfileInput>({
    name: 'us-store-01',
    group: 'Default',
    notes: '',
    color: DEFAULT_PROFILE_COLOR,
    proxyUrl: '',
  });
  const [fingerprint, setFingerprint] = useState<FingerprintFormState>(DEFAULT_FORM_FINGERPRINT);
  const [preparedEmbeddedProfileId, setPreparedEmbeddedProfileId] = useState<string>();

  const selected = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? profiles[0],
    [profiles, selectedId],
  );
  const sortedProfiles = useMemo(
    () =>
      [...profiles].sort((left, right) => {
        const leftTime = Date.parse(left.lastLaunchAt ?? left.updatedAt);
        const rightTime = Date.parse(right.lastLaunchAt ?? right.updatedAt);
        return rightTime - leftTime;
      }),
    [profiles],
  );
  const visibleProfiles = useMemo(
    () => filterProfiles(sortedProfiles, { group: activeGroup, query }),
    [activeGroup, query, sortedProfiles],
  );
  const isSelfTestView = isFingerprintSelfTestUrl(selected?.lastOpenedUrl);
  const isModalOpen = isEditorOpen || isSettingsOpen || isProxyEditorOpen;
  const selectedTabId = selected?.activeTabId ?? selected?.id;
  const selectedTab = selected?.tabs?.find((tab) => tab.id === selected.activeTabId) ?? selected?.tabs?.[0];
  const activeTabCrashed = Boolean(navigationState?.crashed || selectedTab?.crashed);
  const activeTabError = navigationState?.lastError ?? selectedTab?.lastError;
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const profile of profiles) {
      counts.set(profile.group, (counts.get(profile.group) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [profiles]);

  useEffect(() => {
    void refreshProfiles();
    void loadSettings();
  }, []);

  useEffect(() => window.api.onProfilesChanged(() => {
    void refreshProfiles();
    void refreshDownloads(selected?.id);
  }), [selected?.id]);

  useEffect(() => {
    if (!isEditingUrl) {
      setOpenUrl(profileAddressBarUrl(selected, 'https://example.com'));
    }
  }, [isEditingUrl, selected?.id, selected?.activeTabId, selected?.lastOpenedUrl, selected?.tabs]);

  useEffect(() => {
    if (!selected?.id || !selectedTabId) {
      setNavigationState(undefined);
      return undefined;
    }
    if (browserSurfaceMode === 'loading') {
      setNavigationState(undefined);
      return undefined;
    }
    if (shouldUseDomSurface(browserSurfaceMode)) {
      if (selectedTab) {
        setNavigationState({
          profileId: selected.id,
          tabId: selectedTab.id,
          url: selectedTab.url,
          title: selectedTab.title,
          canGoBack: selectedTab.canGoBack ?? false,
          canGoForward: selectedTab.canGoForward ?? false,
          isLoading: selectedTab.isLoading ?? false,
          crashed: selectedTab.crashed ?? false,
          lastError: selectedTab.lastError,
        });
      } else {
        setNavigationState(undefined);
      }
      return undefined;
    }
    let cancelled = false;
    void window.api.getNativeBrowserNavigationState?.(selected.id, selectedTabId)
      .then((state) => {
        if (!cancelled) {
          setNavigationState(state);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNavigationState(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selectedTabId, selected?.lastOpenedUrl, selected?.tabs, selectedTab, browserSurfaceMode]);

  useEffect(() => {
    if (!shouldUseDomSurface(browserSurfaceMode) || !selected?.id || isSelfTestView) {
      setPreparedEmbeddedProfileId(undefined);
      return undefined;
    }
    let cancelled = false;
    setPreparedEmbeddedProfileId(undefined);
    void window.api.prepareEmbeddedWebview(selected.id)
      .then(() => {
        if (!cancelled) {
          setPreparedEmbeddedProfileId(selected.id);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(toMessage(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [browserSurfaceMode, isSelfTestView, selected?.fingerprint.id, selected?.id, selected?.proxy?.id]);

  useEffect(() => {
    if (!shouldUseDomSurface(browserSurfaceMode) || !selected?.id || !selectedTabId || preparedEmbeddedProfileId !== selected.id) {
      return undefined;
    }
    const webview = embeddedWebviewRef.current;
    if (!webview) {
      return undefined;
    }

    let metadataTimer: number | undefined;
    const safeWebviewCall = <T,>(read: () => T, fallback: T): T => {
      try {
        return read();
      } catch {
        return fallback;
      }
    };
    const readNavigationState = (overrides: Partial<BrowserNavigationState> = {}) => ({
      url: overrides.url ?? safeWebviewCall(() => webview.getURL(), selected.lastOpenedUrl ?? 'about:blank'),
      title: overrides.title ?? safeWebviewCall(() => webview.getTitle(), selectedTab?.title ?? selected.lastOpenedUrl ?? 'about:blank'),
      canGoBack: overrides.canGoBack ?? safeWebviewCall(() => webview.canGoBack(), false),
      canGoForward: overrides.canGoForward ?? safeWebviewCall(() => webview.canGoForward(), false),
      isLoading: overrides.isLoading ?? false,
      crashed: overrides.crashed ?? false,
      lastError: overrides.lastError,
    });
    const persistNavigationState = (overrides: Partial<BrowserNavigationState> = {}) => {
      const next = readNavigationState(overrides);
      setNavigationState({
        profileId: selected.id,
        tabId: selectedTabId,
        ...next,
      });
      if (!isEditingUrl) {
        setOpenUrl(next.url);
      }
      if (metadataTimer !== undefined) {
        window.clearTimeout(metadataTimer);
      }
      metadataTimer = window.setTimeout(() => {
        void window.api.updateEmbeddedWebviewNavigation(selected.id, selectedTabId, next).catch((caught) => setError(toMessage(caught)));
      }, 80);
    };
    const persistNow = (overrides: Partial<BrowserNavigationState> = {}) => {
      const next = readNavigationState(overrides);
      setNavigationState({
        profileId: selected.id,
        tabId: selectedTabId,
        ...next,
      });
      if (!isEditingUrl) {
        setOpenUrl(next.url);
      }
      void window.api.updateEmbeddedWebviewNavigation(selected.id, selectedTabId, next).catch((caught) => setError(toMessage(caught)));
    };
    const onStartLoading = () => persistNavigationState({ isLoading: true, crashed: false, lastError: undefined });
    const onStopLoading = () => persistNavigationState({ isLoading: false });
    const onNavigate = () => persistNavigationState();
    const onTitle = () => persistNavigationState();
    const onFailLoad = (event: Event) => {
      const details = event as Event & { errorDescription?: string; validatedURL?: string; isMainFrame?: boolean };
      if (details.isMainFrame === false) {
        return;
      }
      persistNow({
        url: details.validatedURL || safeWebviewCall(() => webview.getURL(), selected.lastOpenedUrl ?? 'about:blank'),
        isLoading: false,
        lastError: details.errorDescription,
      });
    };
    const onCrashed = () => persistNow({ crashed: true, isLoading: false, lastError: 'Embedded webview crashed.' });

    webview.addEventListener('did-start-loading', onStartLoading);
    webview.addEventListener('did-stop-loading', onStopLoading);
    webview.addEventListener('did-navigate', onNavigate);
    webview.addEventListener('did-navigate-in-page', onNavigate);
    webview.addEventListener('page-title-updated', onTitle);
    webview.addEventListener('did-fail-load', onFailLoad);
    webview.addEventListener('crashed', onCrashed);
    webview.addEventListener('dom-ready', onNavigate);

    return () => {
      if (metadataTimer !== undefined) {
        window.clearTimeout(metadataTimer);
      }
      webview.removeEventListener('did-start-loading', onStartLoading);
      webview.removeEventListener('did-stop-loading', onStopLoading);
      webview.removeEventListener('did-navigate', onNavigate);
      webview.removeEventListener('did-navigate-in-page', onNavigate);
      webview.removeEventListener('page-title-updated', onTitle);
      webview.removeEventListener('did-fail-load', onFailLoad);
      webview.removeEventListener('crashed', onCrashed);
      webview.removeEventListener('dom-ready', onNavigate);
    };
  }, [browserSurfaceMode, isEditingUrl, preparedEmbeddedProfileId, selected?.id, selected?.lastOpenedUrl, selectedTab?.title, selectedTabId]);

  useEffect(() => {
    void refreshDownloads(selected?.id);
  }, [selected?.id]);

  useEffect(() => {
    if (!isProxyEditorOpen) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      proxyInputRef.current?.focus();
      proxyInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isProxyEditorOpen]);

  const syncNativeBrowserView = useCallback((layoutVersion = nativeBrowserLayoutVersionRef.current) => {
    const frame = nativeBrowserFrameRef.current;
    const main = mainRef.current;
    const inspector = inspectorRef.current;
    const tabId = selectedTabId;
    if (!shouldUseNativeSurface(browserSurfaceMode) || isSelfTestView || !frame || !main || !selected?.lastOpenedUrl || !tabId || isModalOpen) {
      void window.api.hideNativeBrowserView?.();
      return;
    }
    const rect = frame.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const inspectorRect = inspector?.getBoundingClientRect();
    const inspectorLeft = inspectorRect && inspectorRect.width > 0 ? inspectorRect.left : mainRect.right;
    const frameWidth = frame.clientWidth;
    const frameHeight = frame.clientHeight;
    const visibleWidth = Math.min(frameWidth, mainRect.right - rect.left, inspectorLeft - rect.left);
    const bottom = Math.min(rect.bottom, mainRect.bottom);
    const visibleHeight = Math.min(frameHeight, bottom - rect.top);
    const bounds = {
      x: rect.left + 1,
      y: rect.top + 1,
      width: Math.max(0, visibleWidth - 2),
      height: Math.max(0, visibleHeight - 2),
      layoutVersion,
    };
    void window.api.showNativeBrowserView?.(selected.id, tabId, selected.lastOpenedUrl, bounds);
  }, [browserSurfaceMode, isInspectorCollapsed, isModalOpen, isSelfTestView, selected?.id, selected?.lastOpenedUrl, selectedTabId]);

  const clearScheduledNativeBrowserViewSync = useCallback(() => {
    const timers = nativeBrowserSyncTimersRef.current;
    if (timers.frame !== undefined) {
      window.cancelAnimationFrame(timers.frame);
    }
    if (timers.timer !== undefined) {
      window.clearTimeout(timers.timer);
    }
    if (timers.lateTimer !== undefined) {
      window.clearTimeout(timers.lateTimer);
    }
    nativeBrowserSyncTimersRef.current = {};
  }, []);

  const scheduleNativeBrowserViewSync = useCallback(() => {
    clearScheduledNativeBrowserViewSync();
    const layoutVersion = nativeBrowserLayoutVersionRef.current + 1;
    nativeBrowserLayoutVersionRef.current = layoutVersion;
    syncNativeBrowserView(layoutVersion);
    nativeBrowserSyncTimersRef.current = {
      frame: window.requestAnimationFrame(() => syncNativeBrowserView(layoutVersion)),
      timer: window.setTimeout(() => syncNativeBrowserView(layoutVersion), 80),
      lateTimer: window.setTimeout(() => syncNativeBrowserView(layoutVersion), 240),
    };
    return clearScheduledNativeBrowserViewSync;
  }, [clearScheduledNativeBrowserViewSync, syncNativeBrowserView]);

  function toggleInspector() {
    clearScheduledNativeBrowserViewSync();
    void window.api.hideNativeBrowserView?.();
    setIsInspectorCollapsed((value) => !value);
    window.setTimeout(scheduleNativeBrowserViewSync, 260);
  }

  useEffect(() => {
    if (isModalOpen) {
      void window.api.hideNativeBrowserView?.();
      return;
    }
    return scheduleNativeBrowserViewSync();
  }, [isModalOpen, scheduleNativeBrowserViewSync]);

  useEffect(() => {
    if (isSelfTestView || !selected?.lastOpenedUrl || isModalOpen) {
      void window.api.hideNativeBrowserView?.();
      return undefined;
    }
    return scheduleNativeBrowserViewSync();
  }, [isInspectorCollapsed, isModalOpen, isSelfTestView, scheduleNativeBrowserViewSync, selected?.activeTabId, selected?.fingerprint.id, selected?.lastOpenedUrl]);

  useEffect(() => {
    if (isSelfTestView || !selected?.lastOpenedUrl || isModalOpen) {
      void window.api.hideNativeBrowserView?.();
      return undefined;
    }
    const frame = nativeBrowserFrameRef.current;
    if (!frame) {
      return undefined;
    }
    const onResize = () => {
      scheduleNativeBrowserViewSync();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(frame);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    const cancelScheduledSync = scheduleNativeBrowserViewSync();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      cancelScheduledSync();
    };
  }, [isInspectorCollapsed, isModalOpen, isSelfTestView, scheduleNativeBrowserViewSync, selected?.lastOpenedUrl, syncNativeBrowserView]);

  async function loadSettings() {
    const settings = await window.api.getSettings();
    setChromiumPath(settings.chromiumPath ?? '');
    setDetectedChromiumPath(settings.detectedChromiumPath ?? '');
    setBrowserZoomFactor(settings.browserZoomFactor ?? 1);
    setDisableIpv6(settings.disableIpv6 ?? true);
    setBrowserSurfaceMode(browserSurfaceModeFromSettings(settings));
    setError(settings.startupWarning);
  }

  async function refreshProfiles() {
    try {
      const list = await window.api.listProfiles();
      setProfiles(list);
      setSelectedId((current) => current ?? list[0]?.id);
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function refreshDownloads(profileId?: string) {
    try {
      setDownloads(await window.api.listDownloads(profileId));
    } catch {
      setDownloads([]);
    }
  }

  async function cancelDownload(id: string) {
    try {
      await window.api.cancelDownload(id);
      await refreshDownloads(selected?.id);
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function showDownloadInFolder(id: string) {
    try {
      const shown = await window.api.showDownloadInFolder(id);
      if (!shown) {
        setError('下载文件路径不可用');
      }
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await window.api.createProfile({
        name: form.name,
        group: form.group,
        notes: form.notes,
        color: form.color,
        proxyUrl: form.proxyUrl?.trim() || undefined,
        fingerprint: formToFingerprint(DEFAULT_CREATE_FINGERPRINT, fingerprint),
      });
      setIsEditorOpen(false);
      setEditingProfile(undefined);
      setSelectedId(created.id);
      setForm({ name: '', group: 'Default', notes: '', color: DEFAULT_PROFILE_COLOR, proxyUrl: '' });
      setSelectedRegion(DEFAULT_REGION);
      setFingerprint(DEFAULT_FORM_FINGERPRINT);
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProfile) {
      await createProfile(event);
      return;
    }
    try {
      const nextProxy = parseProxyInput(form.proxyUrl ?? '');
      const fingerprintChanged = hasFingerprintFormChanges(editingProfile.fingerprint, fingerprint);
      await window.api.updateProfile(editingProfile.id, {
        name: form.name,
        group: form.group || 'Default',
        notes: form.notes || '',
        color: form.color || DEFAULT_PROFILE_COLOR,
        proxy: nextProxy,
        ...(fingerprintChanged ? {
          fingerprint: formToFingerprint(editingProfile.fingerprint, fingerprint),
          selfTestUrl: undefined,
          selfTestSummary: undefined,
          selfTestReport: undefined,
          launchTrace: [...(editingProfile.launchTrace ?? []), 'fingerprint customized'].slice(-12),
        } : {}),
      });
      setIsEditorOpen(false);
      setEditingProfile(undefined);
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function saveSettings() {
    try {
      await window.api.updateSettings({ chromiumPath: chromiumPath.trim() || undefined, browserZoomFactor, disableIpv6 });
      setError(undefined);
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  function openEditor(profile?: BrowserProfile) {
    setEditingProfile(profile);
    setForm({
      name: profile?.name ?? 'us-store-01',
      group: profile?.group ?? 'Default',
      notes: profile?.notes ?? '',
      color: profile?.color ?? DEFAULT_PROFILE_COLOR,
      proxyUrl: formatProxyInput(profile?.proxy),
    });
    const nextFingerprint = profile ? fingerprintToForm(profile.fingerprint) : DEFAULT_FORM_FINGERPRINT;
    setFingerprint(nextFingerprint);
    setSelectedRegion(profile ? inferRegionFromFingerprint(profile.fingerprint) : DEFAULT_REGION);
    setIsEditorOpen(true);
  }

  function openProxyEditor(profile: BrowserProfile) {
    setProxyEditingProfile(profile);
    setProxyFormUrl(formatProxyInput(profile.proxy));
    setIsProxyEditorOpen(true);
  }

  async function saveProxyProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proxyEditingProfile) {
      return;
    }
    try {
      const nextProxy = parseProxyInput(proxyFormUrl);
      await window.api.updateProfile(proxyEditingProfile.id, {
        proxy: nextProxy,
        selfTestUrl: undefined,
        selfTestSummary: undefined,
        selfTestReport: undefined,
        launchTrace: [...(proxyEditingProfile.launchTrace ?? []), nextProxy ? 'proxy updated' : 'proxy cleared'].slice(-12),
      });
      setIsProxyEditorOpen(false);
      setProxyEditingProfile(undefined);
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function openWebsite(profile: BrowserProfile, explicitUrl = openUrl) {
    try {
      setError(undefined);
      const updated = await window.api.openProfileUrl(profile.id, explicitUrl);
      setSelectedId(updated.id);
      setOpenUrl(profileAddressBarUrl(updated, explicitUrl));
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
      await refreshProfiles();
    }
  }

  async function goBackNativeBrowserView() {
    try {
      const embeddedWebview = embeddedWebviewRef.current;
      if (shouldUseDomSurface(browserSurfaceMode) && embeddedWebview) {
        try {
          if (embeddedWebview.canGoBack()) {
            embeddedWebview.goBack();
          }
        } catch {
          // The webview navigation API throws before dom-ready.
        }
        return;
      }
      await window.api.goBackNativeBrowserView();
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function goForwardNativeBrowserView() {
    try {
      const embeddedWebview = embeddedWebviewRef.current;
      if (shouldUseDomSurface(browserSurfaceMode) && embeddedWebview) {
        try {
          if (embeddedWebview.canGoForward()) {
            embeddedWebview.goForward();
          }
        } catch {
          // The webview navigation API throws before dom-ready.
        }
        return;
      }
      await window.api.goForwardNativeBrowserView();
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function reloadNativeBrowserView(profile: BrowserProfile) {
    try {
      if (profile.lastOpenedUrl) {
        if (shouldUseDomSurface(browserSurfaceMode)) {
          try {
            embeddedWebviewRef.current?.reload();
          } catch {
            return;
          }
          return;
        }
        await window.api.reloadNativeBrowserView();
      } else {
        await openWebsite(profile);
      }
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function createTab(profile: BrowserProfile) {
    try {
      const updated = await window.api.createProfileTab(profile.id);
      setSelectedId(updated.id);
      setOpenUrl(profileAddressBarUrl(updated, 'about:blank'));
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function activateTab(profile: BrowserProfile, tabId: string) {
    try {
      const updated = await window.api.activateProfileTab(profile.id, tabId);
      setSelectedId(updated.id);
      setOpenUrl(profileAddressBarUrl(updated, openUrl));
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function closeTab(profile: BrowserProfile, tabId: string) {
    try {
      const updated = await window.api.closeProfileTab(profile.id, tabId);
      setSelectedId(updated.id);
      setOpenUrl(profileAddressBarUrl(updated, 'https://example.com'));
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function toggleBookmark(profile: BrowserProfile) {
    try {
      await window.api.toggleProfileBookmark(profile.id);
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function remove(profile: BrowserProfile) {
    try {
      await window.api.hideNativeBrowserView?.();
      await window.api.deleteProfile(profile.id);
      setSelectedId(undefined);
      await refreshProfiles();
      await window.api.hideNativeBrowserView?.();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function duplicate(profile: BrowserProfile) {
    try {
      const copied = await window.api.duplicateProfile(profile.id);
      setSelectedId(copied.id);
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function checkProxy(profile: BrowserProfile) {
    try {
      await window.api.checkProfileProxy(profile.id);
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function regenerateFingerprint(profile: BrowserProfile) {
    try {
      await window.api.hideNativeBrowserView?.();
      const updated = await window.api.regenerateProfileFingerprint(profile.id);
      setSelectedId(updated.id);
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function openFingerprintSelfTest(profile: BrowserProfile) {
    try {
      const updated = await window.api.openFingerprintSelfTest(profile.id);
      setSelectedId(updated.id);
      setOpenUrl(profileAddressBarUrl(updated, openUrl));
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  return (
    <div className={`app-shell ${isInspectorCollapsed ? 'inspector-collapsed' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div>
            <div className="title">FINGERPRINT://LOCAL-CONSOLE</div>
            <div className="prompt">root@profiles: 多环境 / 代理 / 指纹伪装 / 独立登录态</div>
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={() => setIsSettingsOpen(true)}>
            路径
          </button>
          <button type="button" onClick={() => void refreshProfiles()}>
            刷新
          </button>
          <button className="primary" type="button" onClick={() => openEditor()}>
            + 新建环境
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <p className="section-label">/ users</p>
        <label className="search-label">
          <span>/ search</span>
          <input className="search" value={query} placeholder="$ name proxy group..." onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="sidebar-filters">
          <button type="button" className={activeGroup === 'ALL' ? 'active' : ''} onClick={() => setActiveGroup('ALL')}>ALL {profiles.length}</button>
          <button type="button" className={activeGroup === 'RUNNING' ? 'active' : ''} onClick={() => setActiveGroup('RUNNING')}>RUN {profiles.filter((profile) => profile.status === 'running').length}</button>
          <button type="button" className={activeGroup === 'ISSUES' ? 'active' : ''} onClick={() => setActiveGroup('ISSUES')}>ERR {profiles.filter((profile) => profile.status === 'error' || profile.status === 'warning').length}</button>
        </div>
        {groupCounts.length > 1 ? (
          <div className="group-strip">
            {groupCounts.map(([group, count]) => (
              <button key={group} type="button" className={activeGroup === group ? 'active' : ''} onClick={() => setActiveGroup(group)}>{group} {count}</button>
            ))}
          </div>
        ) : null}

        <div className="user-list">
          {visibleProfiles.length === 0 ? (
            <div className="side-empty">暂无用户环境</div>
          ) : visibleProfiles.map((profile) => (
            <div className={`user-card ${profile.id === selected?.id ? 'active' : ''}`} key={profile.id} style={{ '--profile-color': profile.color ?? DEFAULT_PROFILE_COLOR } as React.CSSProperties}>
              <button type="button" className="user-main" onClick={() => setSelectedId(profile.id)}>
                <i className="profile-color-dot" aria-hidden="true" />
                <span>
                  <strong>{profile.name}</strong>
                  <small>{profile.proxy ? `${profile.proxy.type}://${profile.proxy.host}:${profile.proxy.port}` : 'direct'} · {profile.group}</small>
                </span>
                <em>{profile.tabs?.length ?? 0}</em>
              </button>
              {profile.id === selected?.id ? (
                <div className="user-actions">
                  <button type="button" onClick={() => openEditor(profile)}>编辑</button>
                  <button type="button" onClick={() => void duplicate(profile)}>复制</button>
                  <button type="button" onClick={() => openProxyEditor(profile)}>设置代理</button>
                  <button type="button" onClick={() => void remove(profile)}>删除</button>
                </div>
              ) : null}
              {profile.tabs && profile.tabs.length > 0 ? (
                <div className="side-tabs">
                  {profile.tabs.map((tab) => (
                    <button type="button" className={tab.id === profile.activeTabId ? 'active' : ''} key={tab.id} onClick={() => void activateTab(profile, tab.id)}>
                      <span>{tab.title}</span>
                      <i onClick={(event) => { event.stopPropagation(); void closeTab(profile, tab.id); }}>x</i>
                    </button>
                  ))}
                </div>
              ) : null}
              {profile.bookmarks && profile.bookmarks.length > 0 ? (
                <div className="side-bookmarks">
                  <div>/ bookmarks</div>
                  {profile.bookmarks.map((bookmark) => (
                    <button type="button" key={bookmark.id} onClick={() => { setSelectedId(profile.id); setOpenUrl(bookmark.url); void openWebsite(profile, bookmark.url); }}>
                      {bookmark.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </aside>

      <main className="main" ref={mainRef}>
        <form className="browser-toolbar" onSubmit={(event) => { event.preventDefault(); if (selected) void openWebsite(selected); }}>
          <button type="button" disabled={!navigationState?.canGoBack} onClick={() => void goBackNativeBrowserView()} title="后退">←</button>
          <button type="button" disabled={!navigationState?.canGoForward} onClick={() => void goForwardNativeBrowserView()} title="前进">→</button>
          <button type="button" disabled={!selected} onClick={() => selected && void reloadNativeBrowserView(selected)} title="刷新">↻</button>
          <label className="urlbar">
            <span>{selected ? selected.name : '$ open'}</span>
            <input
              value={openUrl}
              placeholder="https://example.com"
              onFocus={() => setIsEditingUrl(true)}
              onBlur={() => setIsEditingUrl(false)}
              onChange={(event) => setOpenUrl(event.target.value)}
            />
          </label>
          <button type="button" disabled={!selected} onClick={() => selected && void toggleBookmark(selected)} title="收藏">☆</button>
          <button type="button" disabled={!selected} onClick={() => selected && void createTab(selected)} title="新标签">＋</button>
        </form>

        <section className="browser-panel full-browser">
          {selected ? (
            selected.lastOpenedUrl ? (
              activeTabCrashed ? (
                <div className="browser-empty crashed-tab">
                  <div className="empty-title">标签页已崩溃</div>
                  <div className="empty-sub">{activeTabError ?? '页面进程已退出，可以尝试重新载入。'}</div>
                  <button type="button" onClick={() => void reloadNativeBrowserView(selected)}>重新载入</button>
                </div>
              ) : isSelfTestView ? (
                <SelfTestReportView profile={selected} />
              ) : (
                <div className="native-browser-frame" ref={nativeBrowserFrameRef}>
                  {browserSurfaceMode === 'loading' ? (
                    <div className="native-browser-hint">PREPARING BROWSER MODE</div>
                  ) : shouldUseDomSurface(browserSurfaceMode) && preparedEmbeddedProfileId !== selected.id ? (
                    <div className="native-browser-hint">PREPARING WEBVIEW</div>
                  ) : shouldUseDomSurface(browserSurfaceMode) ? (
                    <webview
                      className="embedded-webview"
                      key={`${selected.id}:${selectedTabId}:${selected.fingerprint.id}:${selected.proxy?.id ?? 'direct'}`}
                      ref={embeddedWebviewRef}
                      src={selected.lastOpenedUrl}
                      partition={embeddedPartitionForProfile(selected.id)}
                      useragent={selected.fingerprint.userAgent}
                      style={{ width: '100%', height: '100%' }}
                      allowpopups
                    />
                  ) : (
                    <div className="native-browser-hint">CHROMIUM VIEW</div>
                  )}
                </div>
              )
            ) : (
              <div className="browser-empty">
                <div className="empty-title">内嵌浏览器待命</div>
                <div className="empty-sub">选择环境后，在上方输入网址并按回车。</div>
              </div>
            )
          ) : (
            <div className="browser-empty">
              <div className="empty-title">先创建一个环境</div>
              <div className="empty-sub">每个环境都会拥有独立的网页登录状态。</div>
            </div>
          )}
        </section>
      </main>

      <aside className="inspector" ref={inspectorRef}>
        <button className="inspector-toggle" type="button" onClick={toggleInspector}>
          {isInspectorCollapsed ? '<' : '>'}
        </button>
        {selected ? (
              <Inspector
                profile={selected}
                downloads={downloads}
                onCancelDownload={cancelDownload}
                onShowDownloadInFolder={showDownloadInFolder}
                onRegenerateFingerprint={regenerateFingerprint}
                onOpenSelfTest={openFingerprintSelfTest}
              />
        ) : <EmptyInspector />}
      </aside>

      <footer className="statusbar">
        <div className={error ? 'status-error' : ''}>
          {error ? `ERROR: ${error}` : 'MODE: LOCAL ONLY · ENGINE: CHROMIUM · STORAGE: JSON-MVP'}
        </div>
        <button className="status-action" type="button" onClick={() => setIsSettingsOpen(true)}>BROWSER_PATH</button>
        <div>UI_THEME=terminal_pixel · SAFE_PROFILE_ISOLATION=on</div>
      </footer>

      {isEditorOpen ? (
        <div className="modal-backdrop">
          <form className="profile-modal" onSubmit={(event) => void saveProfile(event)}>
            <div className="modal-title">{editingProfile ? 'edit profile' : 'create profile'}</div>
            <label>
              环境名称
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              分组
              <input value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })} />
            </label>
            <div className="profile-color-field">
              <div>颜色</div>
              <div className="profile-color-swatches">
                {PROFILE_COLORS.map((color) => (
                  <button
                    type="button"
                    className={`profile-color-swatch ${form.color === color ? 'active' : ''}`}
                    key={color}
                    style={{ '--swatch-color': color } as React.CSSProperties}
                    onClick={() => setForm({ ...form, color })}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <label>
              国家 / 地区
              <select value={selectedRegion} onChange={(event) => {
                const countryCode = event.target.value;
                setSelectedRegion(countryCode);
                setFingerprint(applyFingerprintRegionPreset(fingerprint, countryCode));
              }}>
                {REGION_PRESETS.map((preset) => (
                  <option value={preset.countryCode} key={preset.countryCode}>{preset.countryCode} · {preset.label}</option>
                ))}
              </select>
            </label>
            <label>
              代理 URL
              <input ref={proxyInputRef} placeholder="socks5://127.0.0.1:1080" value={form.proxyUrl} onChange={(event) => setForm({ ...form, proxyUrl: event.target.value })} />
            </label>
            <label>
              备注
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
            <FingerprintEditor
              fingerprint={fingerprint}
              onChange={setFingerprint}
              meta={editingProfile ? '旧检测结果会在保存后清空' : '不修改则创建随机指纹'}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setIsEditorOpen(false)}>
                取消
              </button>
              <button className="primary" type="submit">
                {editingProfile ? '保存' : '创建'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isProxyEditorOpen ? (
        <div className="modal-backdrop">
          <form className="proxy-modal" onSubmit={(event) => void saveProxyProfile(event)}>
            <div className="modal-title">PROXY SETTINGS</div>
            <div className="trace">profile: {proxyEditingProfile?.name ?? 'unknown'}</div>
            <label>
              代理 URL
              <input ref={proxyInputRef} placeholder="socks5://127.0.0.1:1080" value={proxyFormUrl} onChange={(event) => setProxyFormUrl(event.target.value)} />
            </label>
            <div className="trace">留空保存为直连。支持 http://、https://、socks5://，带账号密码也可以。</div>
            <div className="modal-actions">
              <button type="button" onClick={() => { setIsProxyEditorOpen(false); setProxyEditingProfile(undefined); }}>
                取消
              </button>
              <button className="primary" type="submit">
                保存代理
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div className="modal-backdrop">
          <div className="profile-modal">
            <div className="modal-title">browser path</div>
            <label>
              Chrome / Chromium 路径
              <input className="path-input" placeholder="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" value={chromiumPath} onChange={(event) => setChromiumPath(event.target.value)} />
            </label>
	            <label>
	              页面缩放
	              <select value={browserZoomFactor} onChange={(event) => setBrowserZoomFactor(Number(event.target.value))}>
	                {BROWSER_ZOOM_OPTIONS.map((option) => (
	                  <option value={option.value} key={option.value}>{option.label}</option>
	                ))}
	              </select>
	            </label>
	            <label className="checkbox-row">
	              <input type="checkbox" checked={disableIpv6} onChange={(event) => setDisableIpv6(event.target.checked)} />
	              禁用 IPv6
	            </label>
	            <div className="trace">detected: {detectedChromiumPath || 'not found'}</div>
            <div className="modal-actions">
              <button type="button" onClick={() => setIsSettingsOpen(false)}>
                取消
              </button>
              <button className="primary" type="button" onClick={() => { void saveSettings(); setIsSettingsOpen(false); }}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type HardwareRuntimeReport = {
  schemaVersion?: number;
  deviceClass?: string;
  architecture?: string;
  browserVersion?: string;
  acceptLanguage?: string;
  userAgentMetadata?: {
    platform?: string;
    architecture?: string;
    platformVersion?: string;
    uaFullVersion?: string;
  };
  validation?: {
    valid?: boolean;
    errors?: string[];
    warnings?: string[];
  };
};

function Inspector({
  profile,
  downloads,
  onCancelDownload,
  onShowDownloadInFolder,
  onRegenerateFingerprint,
  onOpenSelfTest,
}: {
  profile: BrowserProfile;
  downloads: DownloadRecord[];
  onCancelDownload(id: string): void;
  onShowDownloadInFolder(id: string): void;
  onRegenerateFingerprint(profile: BrowserProfile): void;
  onOpenSelfTest(profile: BrowserProfile): void;
}) {
  const checklist = buildSelfTestChecklist(profile.selfTestReport);
  const network = profile.selfTestReport?.network as { publicIp?: string | null; error?: string | null; proxyConfigured?: boolean; countryCode?: string | null; countryName?: string | null; timezone?: string | null } | undefined;
  const webrtc = profile.selfTestReport?.webrtc as { candidateCount?: number; webrtcLeakRisk?: boolean; leakRisk?: boolean } | undefined;
  const localeConsistency = profile.selfTestReport?.localeConsistency as { score?: number; status?: string; summary?: string } | undefined;
  const runtimeConsistency = profile.selfTestReport?.runtimeConsistency as { expectedChromiumVersion?: string; profileBrowserVersion?: string; browserVersionMatchesRuntime?: boolean } | undefined;
  const hardwareRuntime = profile.selfTestReport?.hardwareRuntime as HardwareRuntimeReport | undefined;
  const hardwareRuntimeSummary = summarizeHardwareRuntime(hardwareRuntime);
  const deviceRows = buildDeviceProfileRows(profile.fingerprint);

  return (
    <div className="inspector-panels">
      <Panel panelId="selected-profile" title="selected profile" meta={profile.name} compact>
        <Kv label="user-data-dir" value={profile.userDataDir} />
        <Kv label="proxy" value={profile.proxy ? `${profile.proxy.type}://${profile.proxy.host}:${profile.proxy.port}` : 'direct'} />
        <Kv label="proxy check" value={profile.proxy?.lastCheckStatus ? `${profile.proxy.lastCheckStatus}${profile.proxy.lastCheckLatencyMs ? ` · ${profile.proxy.lastCheckLatencyMs}ms` : ''}` : 'not checked'} />
        <Kv label="timezone" value={profile.fingerprint.timezone} />
        <Kv label="language" value={profile.fingerprint.languages.join(',')} />
        <Kv label="locale score" value={localeConsistency ? `${localeConsistency.score ?? 0}% · ${localeConsistency.status ?? 'unknown'}` : 'not tested'} />
        <Kv label="runtime" value={runtimeConsistency ? `${runtimeConsistency.browserVersionMatchesRuntime ? 'ok' : 'mismatch'} · ${runtimeConsistency.profileBrowserVersion ?? 'unknown'}` : 'not tested'} />
        <Kv label="hardware runtime" value={hardwareRuntimeSummary} />
        <Kv label="webrtc" value={profile.fingerprint.webrtcPolicy} />
        <Kv label="automation" value={profile.lastError ? 'degraded' : profile.status === 'running' ? 'attached' : 'waiting'} />
        <Kv label="last url" value={profile.lastOpenedUrl ?? 'not opened'} />
        <Kv label="self-test" value={profile.selfTestUrl ? 'prepared' : 'not launched'} />
        <Kv label="test result" value={profile.selfTestSummary ?? 'pending'} />
        {profile.lastError ? <div className="trace error-trace">{profile.lastError}</div> : null}
      </Panel>
      <Panel panelId="fingerprint-mask" title="fingerprint mask" meta="L2+" compact>
        <Kv label="consistency" value="JS layer configured" />
        <Kv label="network ip" value={profile.proxy ? 'proxy exit ip' : 'direct ip'} />
        <div className="bar"><i /></div>
        <div className="panel-actions">
          <button type="button" onClick={() => onRegenerateFingerprint(profile)}>重生成指纹</button>
          <button type="button" onClick={() => onOpenSelfTest(profile)}>指纹检测</button>
        </div>
        <div className="chips">
          {['Navigator', 'Canvas', 'WebGL', 'Audio', 'Fonts', 'Plugins', 'Media', 'Geo'].map((chip) => (
            <span className={`chip ${chip !== 'Fonts' ? 'on' : ''}`} key={chip}>{chip}</span>
          ))}
        </div>
      </Panel>
      <Panel panelId="device-profile" title="device profile" meta={profile.fingerprint.id} compact>
        {hardwareRuntime ? (
          <>
            <Kv label="schema" value={`v${hardwareRuntime.schemaVersion ?? 'unknown'} · ${hardwareRuntime.validation?.valid ? 'valid' : 'check'}`} />
            <Kv label="device class" value={hardwareRuntime.deviceClass ?? 'unknown'} />
            <Kv label="architecture" value={hardwareRuntime.architecture ?? 'unknown'} />
            <Kv label="UA metadata" value={formatUserAgentMetadata(hardwareRuntime.userAgentMetadata)} />
          </>
        ) : null}
        {deviceRows.map((row) => (
          <Kv label={row.label} value={row.value} key={row.label} />
        ))}
      </Panel>
      <Panel panelId="downloads" title="downloads" meta={downloads.length ? `${downloads.length}` : 'none'} compact initialCollapsed>
        {downloads.length > 0 ? downloads.map((download) => (
          <div className="download-row" key={download.id}>
            <div>
              <strong>{download.filename}</strong>
              <span>{download.status} · {formatDownloadSize(download.receivedBytes)}{download.totalBytes ? ` / ${formatDownloadSize(download.totalBytes)}` : ''}</span>
            </div>
            {download.status === 'progressing' ? (
              <button type="button" onClick={() => onCancelDownload(download.id)}>取消</button>
            ) : null}
            {download.status !== 'progressing' && download.savePath ? (
              <button type="button" onClick={() => onShowDownloadInFolder(download.id)}>定位</button>
            ) : null}
          </div>
        )) : <div className="trace">no downloads for this profile</div>}
      </Panel>
      <Panel panelId="self-test-report" title="self-test report" meta={profile.selfTestSummary ?? 'pending'}>
        {network ? <Kv label="exit ip" value={network.publicIp ? `${network.publicIp}${network.proxyConfigured ? ' · proxy' : ' · direct'}` : network.error ?? 'not detected'} /> : null}
        {network ? <Kv label="exit region" value={[network.countryCode, network.countryName, network.timezone].filter(Boolean).join(' · ') || 'not detected'} /> : null}
        {localeConsistency ? <Kv label="locale" value={localeConsistency.summary ?? `${localeConsistency.score ?? 0}%`} /> : null}
        {webrtc ? <Kv label="webrtc" value={`${webrtc.candidateCount ?? 0} candidates · ${(webrtc.webrtcLeakRisk ?? webrtc.leakRisk) ? 'risk' : 'ok'}`} /> : null}
        <div className="chips">
          {checklist.length > 0
            ? checklist.map((item) => (
                <span className={`chip ${item.passed ? 'on' : 'bad'}`} key={item.key}>{item.label}</span>
              ))
            : <span className="chip">pending</span>}
        </div>
      </Panel>
      <Panel panelId="launch-trace" title="launch trace" meta="local" initialCollapsed>
        {(profile.launchTrace && profile.launchTrace.length > 0 ? profile.launchTrace : ['isolated browser dir pending', 'proxy arg builder ready', 'fingerprint extension path ready']).map((line) => (
          <div className="trace" key={line}>{line.startsWith('cdp degraded') ? '△' : '✓'} {line}</div>
        ))}
      </Panel>
      <Panel panelId="history" title="history" meta={`${profile.history?.length ?? 0} events`} initialCollapsed>
        {(profile.history && profile.history.length > 0 ? profile.history.slice(-6).reverse() : [{ id: 'empty', type: 'created', message: 'no history yet', createdAt: '' }]).map((event) => (
          <div className="trace" key={event.id}>[{event.type}] {event.message}</div>
        ))}
      </Panel>
    </div>
  );
}

function SelfTestReportView({ profile }: { profile: BrowserProfile }) {
  const report = profile.selfTestReport;
  const expected = report?.expected as Record<string, unknown> | undefined;
  const observed = report?.observed as Record<string, unknown> | undefined;
  const webgl = report?.webgl as Record<string, unknown> | undefined;
  const network = report?.network as Record<string, unknown> | undefined;
  const webrtc = report?.webrtc as Record<string, unknown> | undefined;
  const localeConsistency = report?.localeConsistency as Record<string, unknown> | undefined;
  const runtimeConsistency = report?.runtimeConsistency as Record<string, unknown> | undefined;
  const hardwareRuntime = report?.hardwareRuntime as Record<string, unknown> | undefined;

  return (
    <div className="self-test-view">
      <div className="self-test-head">
        <div>
          <h1>FINGERPRINT SELF TEST</h1>
          <div className="trace">profile: {profile.name} · {profile.selfTestSummary ?? 'running in hidden engine'}</div>
        </div>
        <div className={profile.selfTestSummary ? 'self-test-status ok' : 'self-test-status'}>
          {profile.selfTestSummary ?? 'PENDING'}
        </div>
      </div>
      <div className="self-test-grid">
        <SelfTestBox title="Expected Profile" value={expected ?? expectedFromProfile(profile)} />
        <SelfTestBox title="Observed Browser" value={observed ?? { status: 'waiting for hidden Chromium capture' }} />
        <SelfTestBox title="Network / Locale" value={{ network: network ?? 'pending', localeConsistency: localeConsistency ?? 'pending', runtimeConsistency: runtimeConsistency ?? 'pending' }} />
        <SelfTestBox title="Hardware Runtime" value={hardwareRuntime ?? { status: 'pending' }} />
        <SelfTestBox title="Canvas" value={{ canvasHash: report?.canvasHash ?? 'pending' }} />
        <SelfTestBox title="WebGL / WebRTC" value={{ webgl: webgl ?? 'pending', webrtc: webrtc ?? 'pending' }} />
      </div>
    </div>
  );
}

function SelfTestBox({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="self-test-box">
      <h2>{title}</h2>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function expectedFromProfile(profile: BrowserProfile): Record<string, unknown> {
  return {
    profileId: profile.id,
    profileName: profile.name,
    userAgent: profile.fingerprint.userAgent,
    platform: profile.fingerprint.platform,
    languages: profile.fingerprint.languages,
    timezone: profile.fingerprint.timezone,
    screen: `${profile.fingerprint.screenWidth}x${profile.fingerprint.screenHeight}`,
    hardwareConcurrency: profile.fingerprint.hardwareConcurrency,
    deviceMemory: profile.fingerprint.deviceMemory,
    plugins: profile.fingerprint.plugins,
    mimeTypes: profile.fingerprint.mimeTypes,
    webglVendor: profile.fingerprint.webglVendor,
    webglRenderer: profile.fingerprint.webglRenderer,
  };
}

function FingerprintEditor({
  fingerprint,
  onChange,
  meta,
}: {
  fingerprint: FingerprintFormState;
  onChange(next: FingerprintFormState): void;
  meta: string;
}) {
  return (
    <section className="fingerprint-editor">
      <div className="modal-subtitle">
        <span>指纹配置</span>
        <small>{meta}</small>
      </div>
      <div className="fingerprint-form-grid">
        <label>
          操作系统
          <select value={fingerprint.os} onChange={(event) => onChange(applyFingerprintOsPreset(fingerprint, event.target.value as FingerprintFormState['os']))}>
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
            <option value="linux">Linux</option>
          </select>
        </label>
        <label>
          浏览器版本
          <input value={fingerprint.browserVersion} onChange={(event) => onChange({ ...fingerprint, browserVersion: event.target.value })} />
        </label>
        <label className="wide-field">
          User-Agent
          <textarea value={fingerprint.userAgent} onChange={(event) => onChange({ ...fingerprint, userAgent: event.target.value })} />
        </label>
        <label>
          Platform
          <input value={fingerprint.platform} onChange={(event) => onChange({ ...fingerprint, platform: event.target.value })} />
        </label>
        <label>
          语言
          <input value={fingerprint.languages} onChange={(event) => onChange({ ...fingerprint, languages: event.target.value })} />
        </label>
        <label>
          时区
          <input value={fingerprint.timezone} onChange={(event) => onChange({ ...fingerprint, timezone: event.target.value })} />
        </label>
        <label>
          WebRTC
          <select value={fingerprint.webrtcPolicy} onChange={(event) => onChange({ ...fingerprint, webrtcPolicy: event.target.value as FingerprintFormState['webrtcPolicy'] })}>
            <option value="proxy-only">proxy-only</option>
            <option value="disabled">disabled</option>
            <option value="default">default</option>
          </select>
        </label>
        <label>
          屏幕宽
          <input inputMode="numeric" value={fingerprint.screenWidth} onChange={(event) => onChange({ ...fingerprint, screenWidth: event.target.value })} />
        </label>
        <label>
          屏幕高
          <input inputMode="numeric" value={fingerprint.screenHeight} onChange={(event) => onChange({ ...fingerprint, screenHeight: event.target.value })} />
        </label>
        <label>
          窗口宽
          <input inputMode="numeric" value={fingerprint.windowWidth} onChange={(event) => onChange({ ...fingerprint, windowWidth: event.target.value })} />
        </label>
        <label>
          窗口高
          <input inputMode="numeric" value={fingerprint.windowHeight} onChange={(event) => onChange({ ...fingerprint, windowHeight: event.target.value })} />
        </label>
        <label>
          CPU 核心
          <input inputMode="numeric" value={fingerprint.hardwareConcurrency} onChange={(event) => onChange({ ...fingerprint, hardwareConcurrency: event.target.value })} />
        </label>
        <label>
          内存 GB
          <input inputMode="numeric" value={fingerprint.deviceMemory} onChange={(event) => onChange({ ...fingerprint, deviceMemory: event.target.value })} />
        </label>
        <label>
          WebGL Vendor
          <input value={fingerprint.webglVendor} onChange={(event) => onChange({ ...fingerprint, webglVendor: event.target.value })} />
        </label>
        <label>
          WebGL Renderer
          <input value={fingerprint.webglRenderer} onChange={(event) => onChange({ ...fingerprint, webglRenderer: event.target.value })} />
        </label>
        <label>
          Plugins
          <input value={fingerprint.plugins} onChange={(event) => onChange({ ...fingerprint, plugins: event.target.value })} />
        </label>
        <label>
          MIME Types
          <input value={fingerprint.mimeTypes} onChange={(event) => onChange({ ...fingerprint, mimeTypes: event.target.value })} />
        </label>
      </div>
    </section>
  );
}

function EmptyInspector() {
  return (
    <div className="inspector-panels">
      <Panel panelId="empty-profile" title="selected profile" meta="none">
        <div className="trace">创建或选择一个环境后，这里会显示代理、指纹和启动状态。</div>
      </Panel>
    </div>
  );
}

function Panel({
  panelId,
  title,
  meta,
  children,
  compact = false,
  initialCollapsed = false,
}: {
  panelId: string;
  title: string;
  meta: string;
  children: React.ReactNode;
  compact?: boolean;
  initialCollapsed?: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    setIsCollapsed(initialCollapsed);
  }, [initialCollapsed, panelId]);

  return (
    <section className={`panel ${compact ? 'compact' : ''} ${isCollapsed ? 'collapsed' : ''}`} data-panel-id={panelId}>
      <button
        className="panel-title panel-title-button"
        type="button"
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((value) => !value)}
      >
        <span>{isCollapsed ? '+' : '-' } {title}</span>
        <span>{meta}</span>
      </button>
      {!isCollapsed ? <div className="panel-body">{children}</div> : null}
    </section>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <div>{label}</div>
      <div title={value}>{value}</div>
    </div>
  );
}

function formatDownloadSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function summarizeHardwareRuntime(hardwareRuntime?: HardwareRuntimeReport): string {
  if (!hardwareRuntime) {
    return 'not tested';
  }
  const schemaVersion = hardwareRuntime.schemaVersion ? `v${hardwareRuntime.schemaVersion}` : 'v?';
  const deviceClass = hardwareRuntime.deviceClass ?? 'unknown device';
  const status = hardwareRuntime.validation?.valid ? 'valid' : 'check';
  return `${schemaVersion} · ${deviceClass} · ${status}`;
}

function formatUserAgentMetadata(userAgentMetadata?: HardwareRuntimeReport['userAgentMetadata']): string {
  if (!userAgentMetadata) {
    return 'not tested';
  }
  return [
    userAgentMetadata.platform,
    userAgentMetadata.architecture,
    userAgentMetadata.platformVersion,
    userAgentMetadata.uaFullVersion,
  ].filter(Boolean).join(' · ') || 'unknown';
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
