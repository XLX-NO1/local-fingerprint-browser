import { describe, expect, it } from 'vitest';
import { navigationDecisionForUrl } from '../electron/services/navigationPolicy';

describe('navigationPolicy', () => {
  it('allows normal web and local self-test navigation', () => {
    expect(navigationDecisionForUrl('https://example.com/')).toEqual({ action: 'allow' });
    expect(navigationDecisionForUrl('http://example.com/')).toEqual({ action: 'allow' });
    expect(navigationDecisionForUrl('file:///tmp/profile/fingerprint-self-test.html')).toEqual({ action: 'allow' });
  });

  it('blocks external protocols instead of delegating to system apps', () => {
    expect(navigationDecisionForUrl('mailto:user@example.com')).toEqual({
      action: 'block',
      reason: 'Blocked external protocol: mailto',
    });
    expect(navigationDecisionForUrl('tel:+15551234567')).toEqual({
      action: 'block',
      reason: 'Blocked external protocol: tel',
    });
  });
});
