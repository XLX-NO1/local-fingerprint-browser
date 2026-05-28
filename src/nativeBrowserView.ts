import type { FitSize } from './webviewFit';

export type BrowserViewBounds = FitSize & {
  x: number;
  y: number;
  layoutVersion?: number;
};

export function cssRectToBrowserViewBounds(rect: BrowserViewBounds, scaleFactor = 1): BrowserViewBounds {
  return {
    x: Math.round(rect.x * scaleFactor),
    y: Math.round(rect.y * scaleFactor),
    width: Math.max(1, Math.round(rect.width * scaleFactor)),
    height: Math.max(1, Math.round(rect.height * scaleFactor)),
  };
}
