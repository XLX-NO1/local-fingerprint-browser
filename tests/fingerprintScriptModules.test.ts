import { describe, expect, it } from 'vitest';
import { buildNavigatorModuleScript } from '../electron/services/fingerprint/modules/navigator';
import { buildScreenModuleScript } from '../electron/services/fingerprint/modules/screen';
import { buildTimezoneModuleScript } from '../electron/services/fingerprint/modules/timezone';
import { buildCanvasModuleScript } from '../electron/services/fingerprint/modules/canvas';
import { buildWebRtcModuleScript } from '../electron/services/fingerprint/modules/webrtc';
import { buildWebGlModuleScript } from '../electron/services/fingerprint/modules/webgl';
import { buildAudioModuleScript } from '../electron/services/fingerprint/modules/audio';
import { buildMediaDevicesModuleScript } from '../electron/services/fingerprint/modules/mediaDevices';
import { buildPermissionsModuleScript } from '../electron/services/fingerprint/modules/permissions';
import { deriveUserAgentMetadata } from '../electron/services/fingerprint/model';
import { generateFingerprint } from '../electron/services/fingerprint';

describe('fingerprint script modules', () => {
  it('builds a navigator module that only owns navigator and UA client hints surfaces', () => {
    const fingerprint = generateFingerprint('navigator-module-profile');
    const metadata = deriveUserAgentMetadata(fingerprint);
    const script = buildNavigatorModuleScript();

    expect(script).toContain("defineGetter(Navigator.prototype, 'userAgent', fp.userAgent)");
    expect(script).toContain("defineGetter(Navigator.prototype, 'userAgentData'");
    expect(script).toContain('brands: uaMetadata.brands');
    expect(script).toContain('architecture: uaMetadata.architecture');
    expect(script).not.toContain('Screen.prototype');
    expect(script).not.toContain('HTMLCanvasElement');
    expect(script).not.toContain('RTCPeerConnection');
    expect(JSON.stringify(metadata)).toContain(fingerprint.browserVersion);
  });

  it('builds a screen module that only owns screen dimensions', () => {
    const script = buildScreenModuleScript();

    expect(script).toContain("defineGetter(Screen.prototype, 'width', fp.screenWidth)");
    expect(script).toContain("defineGetter(Screen.prototype, 'height', fp.screenHeight)");
    expect(script).toContain("defineGetter(Screen.prototype, 'availHeight', fp.screenHeight - 40)");
    expect(script).not.toContain('Navigator.prototype');
    expect(script).not.toContain('Intl.DateTimeFormat');
  });

  it('builds a timezone module that only owns Intl timezone reporting', () => {
    const script = buildTimezoneModuleScript();

    expect(script).toContain('Intl.DateTimeFormat.prototype.resolvedOptions');
    expect(script).toContain('timeZone: fp.timezone');
    expect(script).not.toContain('Navigator.prototype');
    expect(script).not.toContain('Screen.prototype');
  });

  it('builds a canvas module that avoids mutating the source canvas during serialization', () => {
    const script = buildCanvasModuleScript();

    expect(script).toContain('cloneCanvasForRead');
    expect(script).toContain("const clone = document.createElement('canvas')");
    expect(script).toContain('context.drawImage(canvas, 0, 0)');
    expect(script).toContain('return originalToDataURL.apply(cloneCanvasForRead(this), args)');
    expect(script).toContain('return originalToBlob.apply(cloneCanvasForRead(this), args)');
  });

  it('builds a WebRTC module that preserves RTCPeerConnection for proxy-only policy', () => {
    const script = buildWebRtcModuleScript();

    expect(script).toContain("if (fp.webrtcPolicy === 'disabled')");
    expect(script).toContain("if (fp.webrtcPolicy === 'proxy-only')");
    expect(script).toContain('filterCandidateEvent');
    expect(script).not.toContain('WebRTC disabled by profile policy');
    expect(script).not.toContain('throw new Error');
  });

  it('builds WebGL, audio, media device, and permissions modules with separate ownership', () => {
    expect(buildWebGlModuleScript()).toContain('HTMLCanvasElement.prototype.getContext');
    expect(buildWebGlModuleScript()).toContain('parameter === 37445');
    expect(buildAudioModuleScript()).toContain('AudioBuffer.prototype.getChannelData');
    expect(buildMediaDevicesModuleScript()).toContain('navigator.mediaDevices.enumerateDevices');
    expect(buildPermissionsModuleScript()).toContain('navigator.permissions.query');
    expect(buildPermissionsModuleScript()).toContain("'notifications', 'camera', 'microphone', 'geolocation'");
  });
});
