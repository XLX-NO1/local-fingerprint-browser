export type BrowserPageViewMode = 'browser-view' | 'web-contents-view';

export function browserPageViewModeFromEnv(env: { USE_WEB_CONTENTS_VIEW?: string }): BrowserPageViewMode {
  const raw = env.USE_WEB_CONTENTS_VIEW?.trim().toLowerCase();
  return raw === '1' || raw === 'true' ? 'web-contents-view' : 'browser-view';
}
