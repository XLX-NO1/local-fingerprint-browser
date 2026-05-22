import type { BrowserProfile } from './types';

export type ProfileGroupFilter = 'ALL' | 'RUNNING' | 'ISSUES' | string;

export interface ProfileFilterOptions {
  group: ProfileGroupFilter;
  query: string;
}

export function filterProfiles(profiles: BrowserProfile[], options: ProfileFilterOptions): BrowserProfile[] {
  const queryTokens = options.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return profiles.filter((profile) => {
    if (!matchesGroup(profile, options.group)) {
      return false;
    }

    if (queryTokens.length === 0) {
      return true;
    }

    const haystack = [
      profile.name,
      profile.group,
      profile.notes,
      profile.status,
      profile.proxy?.type,
      profile.proxy?.host,
      profile.proxy?.port.toString(),
      profile.proxy?.username,
      profile.proxy?.lastCheckStatus,
      profile.fingerprint.platform,
      profile.fingerprint.timezone,
      ...profile.fingerprint.languages,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return queryTokens.every((token) => haystack.includes(token));
  });
}

function matchesGroup(profile: BrowserProfile, group: ProfileGroupFilter): boolean {
  if (group === 'ALL') {
    return true;
  }
  if (group === 'RUNNING') {
    return profile.status === 'running';
  }
  if (group === 'ISSUES') {
    return profile.status === 'warning' || profile.status === 'error';
  }
  return profile.group === group;
}
