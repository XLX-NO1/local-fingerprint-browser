export function buildScreenModuleScript(): string {
  return `
  defineGetter(Screen.prototype, 'width', fp.screenWidth);
  defineGetter(Screen.prototype, 'height', fp.screenHeight);
  defineGetter(Screen.prototype, 'availWidth', fp.screenWidth);
  defineGetter(Screen.prototype, 'availHeight', fp.screenHeight - 40);
`;
}
