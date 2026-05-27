import type { FingerprintConfig } from '../../../src/types';
import { deriveUserAgentMetadata } from './model';
import { buildAudioModuleScript } from './modules/audio';
import { buildCanvasModuleScript } from './modules/canvas';
import { buildMediaDevicesModuleScript } from './modules/mediaDevices';
import { buildNavigatorModuleScript } from './modules/navigator';
import { buildPermissionsModuleScript } from './modules/permissions';
import { buildScreenModuleScript } from './modules/screen';
import { buildTimezoneModuleScript } from './modules/timezone';
import { buildWebGlModuleScript } from './modules/webgl';
import { buildWebRtcModuleScript } from './modules/webrtc';

export function buildFingerprintPreloadScript(config: FingerprintConfig): string {
  const json = JSON.stringify(config);
  const uaMetadata = JSON.stringify(deriveUserAgentMetadata(config));
  return `
(() => {
  const fp = ${json};
  const uaMetadata = ${uaMetadata};
  const defineGetter = (target, key, value) => {
    try {
      Object.defineProperty(target, key, {
        get: () => value,
        configurable: true
      });
    } catch {}
  };

${buildNavigatorModuleScript()}

  const makeArrayLike = (items, typeName) => {
    const array = items.map((name, index) => ({ name, filename: name, description: name, type: name, suffixes: '' }));
    Object.defineProperty(array, Symbol.toStringTag, { value: typeName });
    array.item = (index) => array[index] || null;
    array.namedItem = (name) => array.find((item) => item.name === name || item.type === name) || null;
    return array;
  };
  defineGetter(Navigator.prototype, 'plugins', makeArrayLike(fp.plugins, 'PluginArray'));
  defineGetter(Navigator.prototype, 'mimeTypes', makeArrayLike(fp.mimeTypes, 'MimeTypeArray'));

${buildScreenModuleScript()}
${buildTimezoneModuleScript()}
${buildCanvasModuleScript()}
${buildWebGlModuleScript()}
${buildMediaDevicesModuleScript()}
${buildPermissionsModuleScript()}
${buildAudioModuleScript()}
${buildWebRtcModuleScript()}
})();`;
}
