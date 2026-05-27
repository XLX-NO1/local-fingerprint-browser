export function buildTimezoneModuleScript(): string {
  return `
  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
    return { ...originalResolvedOptions.call(this), timeZone: fp.timezone };
  };
`;
}
