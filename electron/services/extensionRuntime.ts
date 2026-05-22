import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserProfile } from '../../src/types';

const runtimeExtensionDirName = 'local-fingerprint-extension';
const copiedExtensionFiles = ['manifest.json', 'content.js'] as const;

interface RuntimeProfileConfig {
  id: string;
  name: string;
  group: string;
  fingerprint: BrowserProfile['fingerprint'];
}

export async function prepareExtensionRuntime(
  profile: BrowserProfile,
  sourceExtensionDir: string,
): Promise<string> {
  const runtimeExtensionDir = join(profile.userDataDir, runtimeExtensionDirName);

  await mkdir(runtimeExtensionDir, { recursive: true });
  await Promise.all(
    copiedExtensionFiles.map((fileName) =>
      copyFile(join(sourceExtensionDir, fileName), join(runtimeExtensionDir, fileName)),
    ),
  );
  await writeFile(join(runtimeExtensionDir, 'profile-config.js'), buildProfileConfigScript(profile), 'utf8');
  await writeFile(join(runtimeExtensionDir, 'proxy-auth.js'), buildProxyAuthScript(profile), 'utf8');

  return runtimeExtensionDir;
}

function buildProxyAuthScript(profile: BrowserProfile): string {
  const credentials =
    profile.proxy?.username && profile.proxy.password
      ? {
          username: profile.proxy.username,
          password: profile.proxy.password,
        }
      : null;

  return `const LOCAL_PROXY_CREDENTIALS = ${JSON.stringify(credentials)};

if (typeof chrome !== 'undefined' && chrome.webRequest && chrome.webRequest.onAuthRequired) {
  chrome.webRequest.onAuthRequired.addListener(
    () => LOCAL_PROXY_CREDENTIALS ? { authCredentials: LOCAL_PROXY_CREDENTIALS } : {},
    { urls: ['<all_urls>'] },
    ['blocking']
  );
}
`;
}

function buildProfileConfigScript(profile: BrowserProfile): string {
  const config: RuntimeProfileConfig = {
    id: profile.id,
    name: profile.name,
    group: profile.group,
    fingerprint: profile.fingerprint,
  };

  return `window.__LOCAL_FINGERPRINT_PROFILE__ = ${JSON.stringify(config)};\n`;
}
