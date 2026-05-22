import type { FitSize } from './webviewFit';

export const FIXED_BROWSER_ZOOM = 1;
export const MIN_NATIVE_WIDTH_FIT_ZOOM = 0.5;

export type BrowserViewBounds = FitSize & {
  x: number;
  y: number;
};

export function cssRectToBrowserViewBounds(rect: BrowserViewBounds, scaleFactor = 1): BrowserViewBounds {
  return {
    x: Math.round(rect.x * scaleFactor),
    y: Math.round(rect.y * scaleFactor),
    width: Math.max(1, Math.round(rect.width * scaleFactor)),
    height: Math.max(1, Math.round(rect.height * scaleFactor)),
  };
}

export function computeWidthFitZoom(viewport: BrowserViewBounds, content: FitSize): number {
  if (viewport.width <= 0 || content.width <= 0) {
    return 1;
  }
  const zoom = Math.min(1, viewport.width / content.width);
  return Number(Math.max(MIN_NATIVE_WIDTH_FIT_ZOOM, zoom).toFixed(3));
}
