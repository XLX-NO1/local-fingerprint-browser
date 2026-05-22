import { describe, expect, it } from 'vitest';
import { embeddedBrowserUrl, embeddedPartitionForProfile, profileAddressBarUrl } from '../src/embeddedBrowser';
import type { BrowserProfile } from '../src/types';

describe('embedded browser helpers', () => {
  it('uses a persistent partition per profile', () => {
    expect(embeddedPartitionForProfile('abc')).toBe('persist:profile-abc');
  });

  it('uses the last opened url before falling back to the address bar value', () => {
    expect(embeddedBrowserUrl({ lastOpenedUrl: 'https://example.com/' } as BrowserProfile, 'https://fallback.test')).toBe('https://example.com/');
    expect(embeddedBrowserUrl({} as BrowserProfile, 'https://fallback.test')).toBe('https://fallback.test');
  });

  it('shows the active tab url in the address bar', () => {
    expect(profileAddressBarUrl({
      activeTabId: 'tab-2',
      lastOpenedUrl: 'https://fallback.test/',
      tabs: [
        { id: 'tab-1', title: 'One', url: 'https://one.test/', createdAt: '', updatedAt: '' },
        { id: 'tab-2', title: 'Two', url: 'https://two.test/', createdAt: '', updatedAt: '' },
      ],
    } as BrowserProfile, 'https://default.test')).toBe('https://two.test/');
  });
});
