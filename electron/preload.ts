import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi, AppSettings, BrowserProfile, CreateProfileInput, LaunchResult, UpdateProfileInput } from '../src/types';

const api: AppApi = {
  listProfiles: () => ipcRenderer.invoke('profiles:list') as Promise<BrowserProfile[]>,
  createProfile: (input: CreateProfileInput) => ipcRenderer.invoke('profiles:create', input) as Promise<BrowserProfile>,
  updateProfile: (id: string, input: UpdateProfileInput) => ipcRenderer.invoke('profiles:update', id, input) as Promise<BrowserProfile>,
  duplicateProfile: (id: string) => ipcRenderer.invoke('profiles:duplicate', id) as Promise<BrowserProfile>,
  deleteProfile: (id: string) => ipcRenderer.invoke('profiles:delete', id) as Promise<void>,
  regenerateProfileFingerprint: (id: string) => ipcRenderer.invoke('profiles:regenerate-fingerprint', id) as Promise<BrowserProfile>,
  openFingerprintSelfTest: (id: string) => ipcRenderer.invoke('profiles:open-self-test', id) as Promise<BrowserProfile>,
  launchProfile: (id: string) => ipcRenderer.invoke('profiles:launch', id) as Promise<LaunchResult>,
  openProfileUrl: (id: string, url: string) => ipcRenderer.invoke('profiles:open-url', id, url) as Promise<BrowserProfile>,
  createProfileTab: (id: string, url?: string) => ipcRenderer.invoke('profiles:create-tab', id, url) as Promise<BrowserProfile>,
  activateProfileTab: (id: string, tabId: string) => ipcRenderer.invoke('profiles:activate-tab', id, tabId) as Promise<BrowserProfile>,
  closeProfileTab: (id: string, tabId: string) => ipcRenderer.invoke('profiles:close-tab', id, tabId) as Promise<BrowserProfile>,
  toggleProfileBookmark: (id: string) => ipcRenderer.invoke('profiles:toggle-bookmark', id) as Promise<BrowserProfile>,
  fitEmbeddedWebview: (webContentsId: number, viewport: { width: number; height: number }) => ipcRenderer.invoke('webview:fit-page', webContentsId, viewport) as Promise<number>,
  showNativeBrowserView: (profileId: string, url: string, bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('native-browser:show', profileId, url, bounds) as Promise<void>,
  resizeNativeBrowserView: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('native-browser:resize', bounds) as Promise<void>,
  hideNativeBrowserView: () => ipcRenderer.invoke('native-browser:hide') as Promise<void>,
  goBackNativeBrowserView: () => ipcRenderer.invoke('native-browser:go-back') as Promise<void>,
  goForwardNativeBrowserView: () => ipcRenderer.invoke('native-browser:go-forward') as Promise<void>,
  reloadNativeBrowserView: () => ipcRenderer.invoke('native-browser:reload') as Promise<void>,
  onProfilesChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('profiles:changed', listener);
    return () => ipcRenderer.off('profiles:changed', listener);
  },
  stopProfile: (id: string) => ipcRenderer.invoke('profiles:stop', id) as Promise<void>,
  checkProfileProxy: (id: string) => ipcRenderer.invoke('profiles:check-proxy', id) as Promise<BrowserProfile>,
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
  updateSettings: (input: AppSettings) => ipcRenderer.invoke('settings:update', input) as Promise<AppSettings>,
};

contextBridge.exposeInMainWorld('api', api);
