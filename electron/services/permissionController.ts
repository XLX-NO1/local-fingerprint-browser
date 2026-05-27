import type { Session } from 'electron';

type PermissionSessionLike = Pick<Session, 'setPermissionRequestHandler'>;

const DENIED_PERMISSIONS = new Set([
  'notifications',
  'geolocation',
  'media',
  'mediaKeySystem',
  'midi',
  'midiSysex',
  'pointerLock',
  'fullscreen',
  'openExternal',
  'hid',
  'serial',
  'bluetooth',
  'clipboard-read',
  'clipboard-sanitized-write',
]);

export function permissionDecisionForRequest(permission: string): boolean {
  if (DENIED_PERMISSIONS.has(permission)) {
    return false;
  }
  return false;
}

export function configureProfilePermissions(profileSession: PermissionSessionLike): void {
  profileSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permissionDecisionForRequest(permission));
  });
}
