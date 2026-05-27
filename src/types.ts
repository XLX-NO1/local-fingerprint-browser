export type ProfileStatus = 'idle' | 'running' | 'warning' | 'error';

export type ProxyType = 'http' | 'https' | 'socks5';

export interface ProxyConfig {
  id: string;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  lastCheckStatus?: 'ok' | 'failed';
  lastCheckLatencyMs?: number;
  updatedAt: string;
}

export interface FingerprintConfig {
  id: string;
  os: 'windows' | 'macos' | 'linux';
  browserVersion: string;
  userAgent: string;
  platform: string;
  languages: string[];
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  webglVendor: string;
  webglRenderer: string;
  canvasSeed: number;
  audioSeed: number;
  webrtcPolicy: 'default' | 'proxy-only' | 'disabled';
  mediaDevices: string[];
  plugins: string[];
  mimeTypes: string[];
}

export interface BrowserProfile {
  id: string;
  name: string;
  group: string;
  notes: string;
  color?: string;
  proxy?: ProxyConfig;
  fingerprint: FingerprintConfig;
  userDataDir: string;
  status: ProfileStatus;
  pid?: number;
  lastLaunchAt?: string;
  lastError?: string;
  selfTestUrl?: string;
  selfTestSummary?: string;
  selfTestReport?: Record<string, unknown>;
  launchTrace?: string[];
  lastOpenedUrl?: string;
  tabs?: BrowserTab[];
  activeTabId?: string;
  bookmarks?: BrowserBookmark[];
  history?: ProfileHistoryEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserNavigationState {
  tabId: string;
  profileId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  crashed: boolean;
  lastError?: string;
}

export interface BrowserBookmark {
  id: string;
  title: string;
  url: string;
  createdAt: string;
}

export interface ProfileHistoryEvent {
  id: string;
  type: 'created' | 'updated' | 'duplicated' | 'launched' | 'stopped' | 'proxy-check' | 'error';
  message: string;
  createdAt: string;
}

export type CreateProfileInput = {
  name: string;
  group?: string;
  notes?: string;
  color?: string;
  proxyUrl?: string;
  fingerprint?: FingerprintConfig;
};

export type UpdateProfileInput = Partial<
  Pick<BrowserProfile, 'name' | 'group' | 'notes' | 'color' | 'proxy' | 'fingerprint' | 'status' | 'pid' | 'lastLaunchAt' | 'lastError' | 'selfTestUrl' | 'selfTestSummary' | 'selfTestReport' | 'launchTrace' | 'lastOpenedUrl' | 'tabs' | 'activeTabId' | 'bookmarks' | 'history'>
>;

export interface LaunchResult {
  profileId: string;
  pid: number;
  debugPort: number;
  selfTestUrl: string;
  selfTestSummary?: string;
  selfTestReport?: Record<string, unknown>;
  launchTrace: string[];
  automationStatus: 'attached' | 'degraded';
  automationError?: string;
}

export interface AppSettings {
  chromiumPath?: string;
  detectedChromiumPath?: string;
}

export interface AppApi {
  listProfiles(): Promise<BrowserProfile[]>;
  createProfile(input: CreateProfileInput): Promise<BrowserProfile>;
  updateProfile(id: string, input: UpdateProfileInput): Promise<BrowserProfile>;
  duplicateProfile(id: string): Promise<BrowserProfile>;
  deleteProfile(id: string): Promise<void>;
  regenerateProfileFingerprint(id: string): Promise<BrowserProfile>;
  openFingerprintSelfTest(id: string): Promise<BrowserProfile>;
  launchProfile(id: string): Promise<LaunchResult>;
  openProfileUrl(id: string, url: string): Promise<BrowserProfile>;
  createProfileTab(id: string, url?: string): Promise<BrowserProfile>;
  activateProfileTab(id: string, tabId: string): Promise<BrowserProfile>;
  closeProfileTab(id: string, tabId: string): Promise<BrowserProfile>;
  toggleProfileBookmark(id: string): Promise<BrowserProfile>;
  fitEmbeddedWebview(webContentsId: number, viewport: { width: number; height: number }): Promise<number>;
  showNativeBrowserView(profileId: string, tabId: string, url: string, bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  resizeNativeBrowserView(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  hideNativeBrowserView(): Promise<void>;
  getNativeBrowserNavigationState(profileId: string, tabId: string): Promise<BrowserNavigationState | undefined>;
  goBackNativeBrowserView(): Promise<void>;
  goForwardNativeBrowserView(): Promise<void>;
  reloadNativeBrowserView(): Promise<void>;
  onProfilesChanged(callback: () => void): () => void;
  stopProfile(id: string): Promise<void>;
  checkProfileProxy(id: string): Promise<BrowserProfile>;
  getSettings(): Promise<AppSettings>;
  updateSettings(input: AppSettings): Promise<AppSettings>;
}

declare global {
  interface Window {
    api: AppApi;
  }
}
