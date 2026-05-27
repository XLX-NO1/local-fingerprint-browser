export function buildPermissionsModuleScript(): string {
  return `
  if (navigator.permissions && navigator.permissions.query) {
    const originalPermissionsQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (descriptor) => {
      if (descriptor && ['notifications', 'camera', 'microphone', 'geolocation'].includes(descriptor.name)) {
        return Promise.resolve({ state: 'prompt', onchange: null });
      }
      return originalPermissionsQuery(descriptor);
    };
  }
`;
}
