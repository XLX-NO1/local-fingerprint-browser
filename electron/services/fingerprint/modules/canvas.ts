export function buildCanvasModuleScript(): string {
  return `
  const cloneCanvasForRead = (canvas) => {
    try {
      const clone = document.createElement('canvas');
      clone.width = canvas.width;
      clone.height = canvas.height;
      const context = clone.getContext('2d');
      if (context) {
        context.drawImage(canvas, 0, 0);
        const shift = (fp.canvasSeed % 7) + 1;
        context.globalAlpha = 0.998;
        context.fillStyle = 'rgba(' + shift + ', ' + (shift * 2) + ', ' + (shift * 3) + ', 0.01)';
        context.fillRect(0, 0, 1, 1);
      }
      return clone;
    } catch {
      return canvas;
    }
  };
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  if (originalToDataURL) {
    HTMLCanvasElement.prototype.toDataURL = function patchedToDataURL(...args) {
      return originalToDataURL.apply(cloneCanvasForRead(this), args);
    };
  }
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  if (originalToBlob) {
    HTMLCanvasElement.prototype.toBlob = function patchedToBlob(...args) {
      return originalToBlob.apply(cloneCanvasForRead(this), args);
    };
  }
  if (typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype.getImageData) {
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function getImageData(...args) {
      const imageData = originalGetImageData.apply(this, args);
      if (imageData && imageData.data && imageData.data.length > 4) {
        const offset = fp.canvasSeed % 4;
        imageData.data[offset] = (imageData.data[offset] + 1) % 255;
      }
      return imageData;
    };
  }
`;
}
