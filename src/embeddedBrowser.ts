import type { BrowserProfile } from './types';

export function embeddedPartitionForProfile(profileId: string): string {
  return `persist:profile-${profileId}`;
}

export function embeddedBrowserUrl(profile: BrowserProfile, fallbackUrl: string): string {
  return profile.lastOpenedUrl ?? fallbackUrl;
}

export function profileAddressBarUrl(profile: BrowserProfile | undefined, fallbackUrl: string): string {
  if (!profile) {
    return fallbackUrl;
  }
  const activeTab = (profile.tabs ?? []).find((tab) => tab.id === profile.activeTabId);
  return activeTab?.url ?? profile.lastOpenedUrl ?? fallbackUrl;
}
