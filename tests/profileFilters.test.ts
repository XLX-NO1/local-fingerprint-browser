import { describe, expect, it } from 'vitest';
import type { BrowserProfile } from '../src/types';
import { filterProfiles } from '../src/profileFilters';

describe('filterProfiles', () => {
  it('filters profiles by group and free text query', () => {
    const profiles = [
      makeProfile({ id: 'one', name: 'us-store-01', group: 'Store', proxyHost: '10.0.0.1' }),
      makeProfile({ id: 'two', name: 'jp-login-02', group: 'Login', proxyHost: 'proxy.jp.local' }),
      makeProfile({ id: 'three', name: 'us-login-03', group: 'Login', proxyHost: undefined }),
    ];

    expect(filterProfiles(profiles, { group: 'Login', query: 'jp proxy' }).map((profile) => profile.id)).toEqual(['two']);
  });

  it('matches proxy usernames in search without requiring password text', () => {
    const profiles = [
      makeProfile({ id: 'one', name: 'jp-login-02', group: 'Login', proxyHost: '127.0.0.1', proxyUsername: 'proxy-user' }),
    ];

    expect(filterProfiles(profiles, { group: 'ALL', query: 'jp proxy-user' }).map((profile) => profile.id)).toEqual(['one']);
  });

  it('supports built-in running and error group filters', () => {
    const profiles = [
      makeProfile({ id: 'idle', name: 'idle', group: 'Default', status: 'idle' }),
      makeProfile({ id: 'running', name: 'running', group: 'Default', status: 'running' }),
      makeProfile({ id: 'warning', name: 'warning', group: 'Default', status: 'warning' }),
      makeProfile({ id: 'error', name: 'error', group: 'Default', status: 'error' }),
    ];

    expect(filterProfiles(profiles, { group: 'RUNNING', query: '' }).map((profile) => profile.id)).toEqual(['running']);
    expect(filterProfiles(profiles, { group: 'ISSUES', query: '' }).map((profile) => profile.id)).toEqual(['warning', 'error']);
  });
});

function makeProfile(input: Partial<BrowserProfile> & { proxyHost?: string; proxyUsername?: string }): BrowserProfile {
  const now = '2026-05-22T00:00:00.000Z';
  return {
    id: input.id ?? 'profile',
    name: input.name ?? 'profile',
    group: input.group ?? 'Default',
    notes: input.notes ?? '',
    proxy: input.proxyHost
      ? {
          id: `proxy-${input.id}`,
          type: 'http',
          host: input.proxyHost,
          port: 8080,
          username: input.proxyUsername,
          updatedAt: now,
        }
      : undefined,
    fingerprint: {
      id: `fp-${input.id}`,
      os: 'windows',
      browserVersion: '126.0.0.0',
      userAgent: 'Mozilla/5.0 Chrome/126 Safari/537.36',
      platform: 'Win32',
      languages: ['en-US', 'en'],
      timezone: 'America/New_York',
      screenWidth: 1280,
      screenHeight: 800,
      windowWidth: 1280,
      windowHeight: 800,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webglVendor: 'Google Inc.',
      webglRenderer: 'ANGLE',
      canvasSeed: 1,
      audioSeed: 2,
      webrtcPolicy: 'proxy-only',
      mediaDevices: [],
      plugins: [],
      mimeTypes: [],
    },
    userDataDir: `/tmp/${input.id}`,
    status: input.status ?? 'idle',
    createdAt: now,
    updatedAt: now,
  };
}
