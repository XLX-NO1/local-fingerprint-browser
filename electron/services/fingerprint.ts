import type { FingerprintConfig } from '../../src/types';
import { generateLocalFingerprint } from '../../src/localFingerprint';

export function generateFingerprint(seed: string): FingerprintConfig {
  return generateLocalFingerprint(seed);
}

export function buildFingerprintPreloadScript(config: FingerprintConfig): string {
  const json = JSON.stringify(config);
  return `
(() => {
  const fp = ${json};
  const defineGetter = (target, key, value) => {
    try {
      Object.defineProperty(target, key, {
        get: () => value,
        configurable: true
      });
    } catch {}
  };

  defineGetter(Navigator.prototype, 'userAgent', fp.userAgent);
  defineGetter(Navigator.prototype, 'platform', fp.platform);
  defineGetter(Navigator.prototype, 'languages', fp.languages);
  defineGetter(Navigator.prototype, 'language', fp.languages[0]);
  defineGetter(Navigator.prototype, 'hardwareConcurrency', fp.hardwareConcurrency);
  defineGetter(Navigator.prototype, 'deviceMemory', fp.deviceMemory);
  defineGetter(Navigator.prototype, 'webdriver', undefined);
  defineGetter(Navigator.prototype, 'userAgentData', {
    brands: [
      { brand: 'Chromium', version: fp.browserVersion.split('.')[0] },
      { brand: 'Google Chrome', version: fp.browserVersion.split('.')[0] }
    ],
    mobile: false,
    platform: fp.os === 'macos' ? 'macOS' : fp.os === 'windows' ? 'Windows' : 'Linux',
    getHighEntropyValues: async (hints) => {
      const values = {
        architecture: 'x86',
        bitness: '64',
        model: '',
        platform: fp.os === 'macos' ? 'macOS' : fp.os === 'windows' ? 'Windows' : 'Linux',
        platformVersion: fp.os === 'windows' ? '10.0.0' : fp.os === 'macos' ? '13.6.1' : '6.5.0',
        uaFullVersion: fp.browserVersion,
        fullVersionList: [
          { brand: 'Chromium', version: fp.browserVersion },
          { brand: 'Google Chrome', version: fp.browserVersion }
        ]
      };
      return hints.reduce((acc, hint) => ({ ...acc, [hint]: values[hint] }), {});
    }
  });

  const makeArrayLike = (items, typeName) => {
    const array = items.map((name, index) => ({ name, filename: name, description: name, type: name, suffixes: '' }));
    Object.defineProperty(array, Symbol.toStringTag, { value: typeName });
    array.item = (index) => array[index] || null;
    array.namedItem = (name) => array.find((item) => item.name === name || item.type === name) || null;
    return array;
  };
  defineGetter(Navigator.prototype, 'plugins', makeArrayLike(fp.plugins, 'PluginArray'));
  defineGetter(Navigator.prototype, 'mimeTypes', makeArrayLike(fp.mimeTypes, 'MimeTypeArray'));

  defineGetter(Screen.prototype, 'width', fp.screenWidth);
  defineGetter(Screen.prototype, 'height', fp.screenHeight);
  defineGetter(Screen.prototype, 'availWidth', fp.screenWidth);
  defineGetter(Screen.prototype, 'availHeight', fp.screenHeight - 40);

  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
    return { ...originalResolvedOptions.call(this), timeZone: fp.timezone };
  };

  const patchCanvas = (prototype, methodName) => {
    const original = prototype && prototype[methodName];
    if (!original) return;
    prototype[methodName] = function patchedCanvas(...args) {
      const context = this.getContext && this.getContext('2d');
      if (context) {
        const shift = (fp.canvasSeed % 7) + 1;
        context.globalAlpha = 0.998;
        context.fillStyle = 'rgba(' + shift + ', ' + (shift * 2) + ', ' + (shift * 3) + ', 0.01)';
        context.fillRect(0, 0, 1, 1);
      }
      return original.apply(this, args);
    };
  };
  patchCanvas(HTMLCanvasElement.prototype, 'toDataURL');
  patchCanvas(HTMLCanvasElement.prototype, 'toBlob');
  if (typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype.getImageData) {
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function getImageData(...args) {
      const imageData = originalGetImageData.apply(this, args);
      if (imageData && imageData.data && imageData.data.length > 4) {
        const offset = fp.canvasSeed % 4;
        imageData.data[offset] = (imageData.data[offset] + 1) % 255;
      }
      return imageData;
    };
  }

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
    const context = originalGetContext.call(this, type, ...args);
    if (context && (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2')) {
      const originalGetParameter = context.getParameter.bind(context);
      context.getParameter = (parameter) => {
        if (parameter === 37445) return fp.webglVendor;
        if (parameter === 37446) return fp.webglRenderer;
        return originalGetParameter(parameter);
      };
    }
    return context;
  };

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices = async () => fp.mediaDevices.map((deviceId, index) => ({
      deviceId,
      groupId: 'group-' + index,
      kind: index === 0 ? 'audioinput' : 'audiooutput',
      label: ''
    }));
  }

  if (navigator.permissions && navigator.permissions.query) {
    const originalPermissionsQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (descriptor) => {
      if (descriptor && ['notifications', 'camera', 'microphone', 'geolocation'].includes(descriptor.name)) {
        return Promise.resolve({ state: 'prompt', onchange: null });
      }
      return originalPermissionsQuery(descriptor);
    };
  }

  if (typeof AudioBuffer !== 'undefined' && AudioBuffer.prototype.getChannelData) {
    const originalGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function getChannelData(channel) {
      const data = originalGetChannelData.call(this, channel);
      if (data && data.length > 0) {
        const index = fp.audioSeed % data.length;
        data[index] = data[index] + 0.0000001;
      }
      return data;
    };
  }

  if (fp.webrtcPolicy === 'disabled' || fp.webrtcPolicy === 'proxy-only') {
    const blockedPeerConnection = function RTCPeerConnection() {
      throw new Error('WebRTC disabled by profile policy');
    };
    try {
      Object.defineProperty(window, 'RTCPeerConnection', {
        value: blockedPeerConnection,
        configurable: true
      });
      Object.defineProperty(window, 'webkitRTCPeerConnection', {
        value: blockedPeerConnection,
        configurable: true
      });
    } catch {}
  }
})();`;
}
