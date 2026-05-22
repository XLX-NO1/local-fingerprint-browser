import type { Session } from 'electron';
import type { BrowserProfile } from '../../src/types';
import { buildAcceptLanguageHeader } from './embeddedFingerprint';
import { proxyToChromiumUrl } from './proxy';

type HeaderHandler = Parameters<Session['webRequest']['onBeforeSendHeaders']>[0];

const sessionState = new WeakMap<Session, { acceptLanguage: string; handlerRegistered: boolean }>();

export async function configureProfileSession(profileSession: Session, profile: BrowserProfile): Promise<void> {
  if (profile.proxy) {
    await profileSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: proxyToChromiumUrl(profile.proxy),
      proxyBypassRules: '<-loopback>',
    });
  } else {
    await profileSession.setProxy({ mode: 'direct' });
  }

  profileSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  const acceptLanguage = buildAcceptLanguageHeader(profile.fingerprint.languages);
  const previous = sessionState.get(profileSession);
  if (previous) {
    previous.acceptLanguage = acceptLanguage;
    return;
  }

  const state = { acceptLanguage, handlerRegistered: true };
  const handler: HeaderHandler = (details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        'Accept-Language': state.acceptLanguage,
      },
    });
  };
  sessionState.set(profileSession, state);
  profileSession.webRequest.onBeforeSendHeaders(handler);
}
