import { describe, expect, it, vi } from 'vitest';
import { configureProfileSession } from '../electron/services/embeddedSession';
import { generateFingerprint } from '../electron/services/fingerprint';
import type { BrowserProfile } from '../src/types';
import type { Session } from 'electron';

describe('configureProfileSession', () => {
  it('registers one reusable request header handler per session', async () => {
    const session = makeSession();
    const profile = makeProfile('profile-session-a');

    await configureProfileSession(session as unknown as Session, profile);
    await configureProfileSession(session as unknown as Session, {
      ...profile,
      fingerprint: {
        ...profile.fingerprint,
        languages: ['ja-JP', 'ja', 'en-US'],
      },
    });

    expect(session.setProxy).toHaveBeenCalledTimes(2);
    expect(session.setUserAgent).toHaveBeenLastCalledWith(profile.fingerprint.userAgent, 'ja-JP,ja;q=0.9,en-US;q=0.8');
    expect(session.webRequest.onBeforeSendHeaders).toHaveBeenCalledTimes(1);

    const handler = session.webRequest.onBeforeSendHeaders.mock.calls[0][0];
    const callback = vi.fn();
    handler({ requestHeaders: { Existing: '1' } }, callback);

    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        Existing: '1',
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8',
      },
    });
  });
});

function makeSession() {
  return {
    setProxy: vi.fn(async () => undefined),
    setUserAgent: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    webRequest: {
      onBeforeSendHeaders: vi.fn(),
    },
  };
}

function makeProfile(id: string): BrowserProfile {
  const now = new Date('2026-05-22T00:00:00.000Z').toISOString();
  return {
    id,
    name: 'Session Profile',
    group: 'Default',
    notes: '',
    fingerprint: generateFingerprint(id),
    userDataDir: `/tmp/${id}`,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}
