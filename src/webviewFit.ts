export type FitSize = {
  width: number;
  height: number;
};

export type FitPageResult = FitSize & {
  zoom: number;
};

const MIN_FIT_ZOOM = 0.02;
const MAX_FIT_ZOOM = 1;
export const MIN_BROWSER_SURFACE_WIDTH = 1440;
export const MIN_BROWSER_SURFACE_HEIGHT = 900;

export function computeFitPageZoom(viewport: FitSize, content: FitSize): number {
  if (viewport.width <= 0 || viewport.height <= 0 || content.width <= 0 || content.height <= 0) {
    return 1;
  }

  const zoom = Math.min(viewport.width / content.width, viewport.height / content.height, MAX_FIT_ZOOM);
  return Number(Math.max(MIN_FIT_ZOOM, zoom).toFixed(3));
}

export function fitPageResult(viewport: FitSize, content: FitSize): FitPageResult {
  const width = Math.max(viewport.width, content.width, MIN_BROWSER_SURFACE_WIDTH);
  const height = Math.max(viewport.height, content.height, MIN_BROWSER_SURFACE_HEIGHT);
  return {
    width,
    height,
    zoom: computeFitPageZoom(viewport, { width, height }),
  };
}

export function measurePageScript(): string {
  return `(() => {
    window.scrollTo(0, 0);
    const body = document.body;
    const doc = document.documentElement;
    let elementRight = 0;
    let elementBottom = 0;
    for (const element of Array.from(document.body ? document.body.querySelectorAll('*') : [])) {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      elementRight = Math.max(elementRight, rect.right + window.scrollX);
      elementBottom = Math.max(elementBottom, rect.bottom + window.scrollY);
    }
    return {
      width: Math.max(
        body ? body.scrollWidth : 0,
        body ? body.offsetWidth : 0,
        doc ? doc.clientWidth : 0,
        doc ? doc.scrollWidth : 0,
        doc ? doc.offsetWidth : 0,
        elementRight
      ),
      height: Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        doc ? doc.clientHeight : 0,
        doc ? doc.scrollHeight : 0,
        doc ? doc.offsetHeight : 0,
        elementBottom
      )
    };
  })()`;
}
