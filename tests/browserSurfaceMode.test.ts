import { describe, expect, it } from 'vitest';
import { browserSurfaceModeFromSettings, shouldUseDomSurface, shouldUseNativeSurface } from '../src/browserSurfaceMode';

describe('browser surface mode', () => {
  it('uses DOM webview by default and native surface for WebContentsView mode', () => {
    expect(browserSurfaceModeFromSettings({})).toBe('dom');
    expect(browserSurfaceModeFromSettings({ browserPageViewMode: 'browser-view' })).toBe('dom');
    expect(browserSurfaceModeFromSettings({ browserPageViewMode: 'web-contents-view' })).toBe('native');
  });

  it('keeps loading separate from DOM and native surfaces', () => {
    expect(shouldUseDomSurface('loading')).toBe(false);
    expect(shouldUseNativeSurface('loading')).toBe(false);
    expect(shouldUseDomSurface('dom')).toBe(true);
    expect(shouldUseNativeSurface('native')).toBe(true);
  });
});
