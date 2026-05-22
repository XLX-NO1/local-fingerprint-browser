import { describe, expect, it } from 'vitest';
import { FIXED_BROWSER_ZOOM, MIN_NATIVE_WIDTH_FIT_ZOOM, computeWidthFitZoom, cssRectToBrowserViewBounds } from '../src/nativeBrowserView';

describe('native browser view bounds', () => {
  it('converts css viewport rectangles to native window bounds', () => {
    expect(cssRectToBrowserViewBounds({ x: 218.4, y: 106.5, width: 929.6, height: 628.1 }, 2)).toEqual({
      x: 437,
      y: 213,
      width: 1859,
      height: 1256,
    });
  });

  it('keeps browser view dimensions usable for tiny measured areas', () => {
    expect(cssRectToBrowserViewBounds({ x: 0, y: 0, width: 0.2, height: 0.2 })).toMatchObject({
      width: 1,
      height: 1,
    });
  });

  it('uses normal browser zoom so pages fill the BrowserView surface', () => {
    expect(FIXED_BROWSER_ZOOM).toBe(1);
  });

  it('keeps normal zoom when page content already fits the native browser width', () => {
    expect(computeWidthFitZoom({ x: 0, y: 0, width: 1000, height: 700 }, { width: 900, height: 1600 })).toBe(1);
  });

  it('shrinks wide page content to fit the native browser width', () => {
    expect(computeWidthFitZoom({ x: 0, y: 0, width: 1000, height: 700 }, { width: 1200, height: 1600 })).toBe(0.833);
  });

  it('keeps width fitting readable for very wide pages', () => {
    expect(MIN_NATIVE_WIDTH_FIT_ZOOM).toBe(0.5);
    expect(computeWidthFitZoom({ x: 0, y: 0, width: 1000, height: 700 }, { width: 3000, height: 1600 })).toBe(0.5);
  });

});
