import { describe, expect, it } from 'vitest';
import { FIXED_BROWSER_ZOOM, cssRectToBrowserViewBounds } from '../src/nativeBrowserView';

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

  it('uses one fixed browser zoom to avoid load-time layout jumping', () => {
    expect(FIXED_BROWSER_ZOOM).toBe(0.9);
  });

});
