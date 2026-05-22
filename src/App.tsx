import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrowserProfile, CreateProfileInput } from './types';
import { formatProxyInput, parseProxyInput } from './proxyInput';
import { filterProfiles, type ProfileGroupFilter } from './profileFilters';
import { buildSelfTestChecklist } from './selfTestReport';
import { profileAddressBarUrl } from './embeddedBrowser';
import { buildDeviceProfileRows } from './deviceProfile';
import { applyFingerprintOsPreset, fingerprintToForm, formToFingerprint, hasFingerprintFormChanges, type FingerprintFormState } from './fingerprintEditor';
import { generateLocalFingerprint } from './localFingerprint';
import { isFingerprintSelfTestUrl } from './selfTestDisplay';

const PROFILE_COLORS = ['#52ff9b', '#5ee7ff', '#ffd166', '#ff5d73', '#b58cff', '#ff9f43'];
const DEFAULT_PROFILE_COLOR = PROFILE_COLORS[0];
const DEFAULT_CREATE_FINGERPRINT = generateLocalFingerprint('create-profile-default');
const DEFAULT_FORM_FINGERPRINT = fingerprintToForm(DEFAULT_CREATE_FINGERPRINT);

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
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<ProfileGroupFilter>('ALL');
  const [openUrl, setOpenUrl] = useState('https://example.com');
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [proxyFormUrl, setProxyFormUrl] = useState('');
  const mainRef = useRef<HTMLElement | null>(null);
  const nativeBrowserFrameRef = useRef<HTMLDivElement | null>(null);
  const proxyInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<CreateProfileInput>({
    name: 'us-store-01',
    group: 'Default',
    notes: '',
    color: DEFAULT_PROFILE_COLOR,
    proxyUrl: '',
  });
  const [fingerprint, setFingerprint] = useState<FingerprintFormState>(DEFAULT_FORM_FINGERPRINT);

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
  }), []);

  useEffect(() => {
    if (!isEditingUrl) {
      setOpenUrl(profileAddressBarUrl(selected, 'https://example.com'));
    }
  }, [isEditingUrl, selected?.id, selected?.activeTabId, selected?.lastOpenedUrl, selected?.tabs]);

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

  const syncNativeBrowserView = useCallback(() => {
    const frame = nativeBrowserFrameRef.current;
    const main = mainRef.current;
    if (isSelfTestView || !frame || !main || !selected?.lastOpenedUrl || isModalOpen) {
      void window.api.hideNativeBrowserView?.();
      return;
    }
    const rect = frame.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const right = Math.min(rect.right, mainRect.right);
    const bottom = Math.min(rect.bottom, mainRect.bottom);
    const bounds = { x: rect.left, y: rect.top, width: Math.max(0, right - rect.left), height: Math.max(0, bottom - rect.top) };
    void window.api.showNativeBrowserView?.(selected.id, selected.lastOpenedUrl, bounds);
  }, [isModalOpen, isSelfTestView, selected?.id, selected?.lastOpenedUrl]);

  const scheduleNativeBrowserViewSync = useCallback(() => {
    syncNativeBrowserView();
    const frame = window.requestAnimationFrame(syncNativeBrowserView);
    const timer = window.setTimeout(syncNativeBrowserView, 80);
    const lateTimer = window.setTimeout(syncNativeBrowserView, 240);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearTimeout(lateTimer);
    };
  }, [syncNativeBrowserView]);

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
    const onResize = () => syncNativeBrowserView();
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
  }, [isModalOpen, isSelfTestView, scheduleNativeBrowserViewSync, selected?.lastOpenedUrl, syncNativeBrowserView]);

  async function loadSettings() {
    const settings = await window.api.getSettings();
    setChromiumPath(settings.chromiumPath ?? '');
    setDetectedChromiumPath(settings.detectedChromiumPath ?? '');
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

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const fingerprintChanged = hasFingerprintFormChanges(DEFAULT_CREATE_FINGERPRINT, fingerprint);
      const created = await window.api.createProfile({
        name: form.name,
        group: form.group,
        notes: form.notes,
        color: form.color,
        proxyUrl: form.proxyUrl?.trim() || undefined,
        ...(fingerprintChanged ? { fingerprint: formToFingerprint(DEFAULT_CREATE_FINGERPRINT, fingerprint) } : {}),
      });
      setIsEditorOpen(false);
      setEditingProfile(undefined);
      setSelectedId(created.id);
      setForm({ name: '', group: 'Default', notes: '', color: DEFAULT_PROFILE_COLOR, proxyUrl: '' });
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
      await window.api.updateSettings({ chromiumPath: chromiumPath.trim() || undefined });
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
    setFingerprint(profile ? fingerprintToForm(profile.fingerprint) : DEFAULT_FORM_FINGERPRINT);
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

  async function openWebsite(profile: BrowserProfile) {
    try {
      setError(undefined);
      const updated = await window.api.openProfileUrl(profile.id, openUrl);
      setSelectedId(updated.id);
      setOpenUrl(profileAddressBarUrl(updated, openUrl));
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
      await refreshProfiles();
    }
  }

  async function goBackNativeBrowserView() {
    try {
      await window.api.goBackNativeBrowserView();
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function goForwardNativeBrowserView() {
    try {
      await window.api.goForwardNativeBrowserView();
      await refreshProfiles();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function reloadNativeBrowserView(profile: BrowserProfile) {
    try {
      if (profile.lastOpenedUrl) {
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
      await window.api.deleteProfile(profile.id);
      setSelectedId(undefined);
      await refreshProfiles();
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
                    <button type="button" key={bookmark.id} onClick={() => { setSelectedId(profile.id); setOpenUrl(bookmark.url); void openWebsite(profile); }}>
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
          <button type="button" disabled={!selected?.lastOpenedUrl} onClick={() => void goBackNativeBrowserView()} title="后退">←</button>
          <button type="button" disabled={!selected?.lastOpenedUrl} onClick={() => void goForwardNativeBrowserView()} title="前进">→</button>
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
              isSelfTestView ? (
                <SelfTestReportView profile={selected} />
              ) : (
                <div className="native-browser-frame" ref={nativeBrowserFrameRef}>
                  <div className="native-browser-hint">CHROMIUM VIEW</div>
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

      <aside className="inspector">
        <button className="inspector-toggle" type="button" onClick={() => setIsInspectorCollapsed((value) => !value)}>
          {isInspectorCollapsed ? '<' : '>'}
        </button>
        {selected ? (
          <Inspector
            profile={selected}
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

function Inspector({
  profile,
  onRegenerateFingerprint,
  onOpenSelfTest,
}: {
  profile: BrowserProfile;
  onRegenerateFingerprint(profile: BrowserProfile): void;
  onOpenSelfTest(profile: BrowserProfile): void;
}) {
  const checklist = buildSelfTestChecklist(profile.selfTestReport);
  const network = profile.selfTestReport?.network as { publicIp?: string | null; error?: string | null; proxyConfigured?: boolean } | undefined;
  const webrtc = profile.selfTestReport?.webrtc as { candidateCount?: number; webrtcLeakRisk?: boolean; leakRisk?: boolean } | undefined;
  const deviceRows = buildDeviceProfileRows(profile.fingerprint);

  return (
    <div className="inspector-panels">
      <Panel panelId="selected-profile" title="selected profile" meta={profile.name} compact>
        <Kv label="user-data-dir" value={profile.userDataDir} />
        <Kv label="proxy" value={profile.proxy ? `${profile.proxy.type}://${profile.proxy.host}:${profile.proxy.port}` : 'direct'} />
        <Kv label="proxy check" value={profile.proxy?.lastCheckStatus ? `${profile.proxy.lastCheckStatus}${profile.proxy.lastCheckLatencyMs ? ` · ${profile.proxy.lastCheckLatencyMs}ms` : ''}` : 'not checked'} />
        <Kv label="timezone" value={profile.fingerprint.timezone} />
        <Kv label="language" value={profile.fingerprint.languages.join(',')} />
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
        {deviceRows.map((row) => (
          <Kv label={row.label} value={row.value} key={row.label} />
        ))}
      </Panel>
      <Panel panelId="self-test-report" title="self-test report" meta={profile.selfTestSummary ?? 'pending'}>
        {network ? <Kv label="exit ip" value={network.publicIp ? `${network.publicIp}${network.proxyConfigured ? ' · proxy' : ' · direct'}` : network.error ?? 'not detected'} /> : null}
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
        <SelfTestBox title="Canvas / Network" value={{ canvasHash: report?.canvasHash ?? 'pending', network: network ?? 'pending' }} />
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

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
