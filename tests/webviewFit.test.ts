import { describe, expect, it } from 'vitest';
import { computeFitPageZoom, fitPageResult, measurePageScript } from '../src/webviewFit';

describe('webview fit zoom', () => {
  it('fits oversized page content into the visible browser viewport', () => {
    expect(computeFitPageZoom({ width: 930, height: 628 }, { width: 1200, height: 900 })).toBe(0.698);
  });

  it('does not enlarge pages above their natural size', () => {
    expect(computeFitPageZoom({ width: 1600, height: 1000 }, { width: 1000, height: 700 })).toBe(1);
  });

  it('returns a larger browser surface and matching scale for full-page fit', () => {
    expect(fitPageResult({ width: 930, height: 628 }, { width: 1200, height: 700 })).toEqual({
      width: 1440,
      height: 900,
      zoom: 0.646,
    });
  });

  it('guards against unusable measurements', () => {
    expect(computeFitPageZoom({ width: 0, height: 900 }, { width: 1000, height: 700 })).toBe(1);
  });

  it('provides a script that measures full document dimensions inside the webview', () => {
    expect(measurePageScript()).toContain('document.documentElement');
    expect(measurePageScript()).toContain('scrollWidth');
    expect(measurePageScript()).toContain('scrollHeight');
    expect(measurePageScript()).toContain('getBoundingClientRect');
    expect(measurePageScript()).toContain('elementBottom');
    expect(measurePageScript()).toContain('window.scrollTo(0, 0)');
  });
});
