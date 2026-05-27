export function buildWebGlModuleScript(): string {
  return `
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
    const context = originalGetContext.call(this, type, ...args);
    if (context && (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2')) {
      const originalGetParameter = context.getParameter.bind(context);
      context.getParameter = (parameter) => {
        if (parameter === 37445) return fp.webglVendor;
        if (parameter === 37446) return fp.webglRenderer;
        return originalGetParameter(parameter);
      };
    }
    return context;
  };
`;
}
