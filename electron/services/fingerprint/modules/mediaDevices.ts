export function buildMediaDevicesModuleScript(): string {
  return `
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices = async () => fp.mediaDevices.map((deviceId, index) => ({
      deviceId,
      groupId: 'group-' + index,
      kind: index === 0 ? 'audioinput' : 'audiooutput',
      label: ''
    }));
  }
`;
}
