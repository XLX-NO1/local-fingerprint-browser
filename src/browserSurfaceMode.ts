import type { AppSettings } from './types';

export type BrowserSurfaceMode = 'loading' | 'dom' | 'native';

export function browserSurfaceModeFromSettings(settings: Pick<AppSettings, 'browserPageViewMode'>): Exclude<BrowserSurfaceMode, 'loading'> {
  return settings.browserPageViewMode === 'web-contents-view' ? 'native' : 'dom';
}

export function shouldUseDomSurface(mode: BrowserSurfaceMode): boolean {
  return mode === 'dom';
}

export function shouldUseNativeSurface(mode: BrowserSurfaceMode): boolean {
  return mode === 'native';
}
