import { describe, expect, it, vi } from 'vitest';
import { configureProfilePermissions, permissionDecisionForRequest } from '../electron/services/permissionController';

describe('permissionController', () => {
  it('denies sensitive browser permissions by default', () => {
    for (const permission of ['notifications', 'geolocation', 'media', 'midiSysex', 'hid', 'serial', 'bluetooth']) {
      expect(permissionDecisionForRequest(permission)).toBe(false);
    }
  });

  it('keeps ordinary clipboard permission requests on the safe default path', () => {
    expect(permissionDecisionForRequest('clipboard-read')).toBe(false);
    expect(permissionDecisionForRequest('clipboard-sanitized-write')).toBe(false);
  });

  it('registers the deny-by-default handler on an Electron session', () => {
    const session = { setPermissionRequestHandler: vi.fn() };

    configureProfilePermissions(session);
    const handler = session.setPermissionRequestHandler.mock.calls[0][0];
    const callback = vi.fn();
    handler({}, 'geolocation', callback);

    expect(callback).toHaveBeenCalledWith(false);
  });
});
