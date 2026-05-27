import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import type { BrowserProfile } from '../../src/types';
import { buildLocaleConsistencyReport } from '../../src/fingerprintLocaleConsistency';
import { DEFAULT_CHROMIUM_VERSION } from '../../src/chromiumVersion';
import { buildFingerprintRuntimeProfile } from './fingerprintRuntime';
import { validateHardwareFingerprintProfile } from './fingerprint/model';

export interface SelfTestPage {
  filePath: string;
  fileUrl: string;
}

export async function prepareSelfTestPage(profile: BrowserProfile): Promise<SelfTestPage> {
  await mkdir(profile.userDataDir, { recursive: true });
  const filePath = join(profile.userDataDir, 'fingerprint-self-test.html');
  await writeFile(filePath, buildSelfTestHtml(profile), 'utf8');
  const fileUrl = pathToFileURL(filePath);
  fileUrl.searchParams.set('run', Date.now().toString(36));
  return {
    filePath,
    fileUrl: fileUrl.toString(),
  };
}

function buildSelfTestHtml(profile: BrowserProfile): string {
  const fingerprintRuntime = buildFingerprintRuntimeProfile({ id: profile.id, fingerprint: profile.fingerprint });
  const hardwareFingerprintProfile = fingerprintRuntime.profile;
  const hardwareRuntime = {
    schemaVersion: hardwareFingerprintProfile.schemaVersion,
    deviceClass: hardwareFingerprintProfile.device.deviceClass,
    os: hardwareFingerprintProfile.device.os,
    architecture: hardwareFingerprintProfile.hardware.architecture,
    browserVersion: hardwareFingerprintProfile.browser.version,
    acceptLanguage: fingerprintRuntime.acceptLanguage,
    userAgentMetadata: fingerprintRuntime.userAgentMetadata,
    validation: validateHardwareFingerprintProfile(hardwareFingerprintProfile),
  };
  const expected = JSON.stringify(
    {
      profileId: profile.id,
      profileName: profile.name,
      schemaVersion: hardwareRuntime.schemaVersion,
      deviceClass: hardwareRuntime.deviceClass,
      architecture: hardwareRuntime.architecture,
      browserVersion: hardwareRuntime.browserVersion,
      acceptLanguage: hardwareRuntime.acceptLanguage,
      userAgentMetadata: hardwareRuntime.userAgentMetadata,
      userAgent: profile.fingerprint.userAgent,
      platform: profile.fingerprint.platform,
      languages: profile.fingerprint.languages,
      timezone: profile.fingerprint.timezone,
      screen: `${profile.fingerprint.screenWidth}x${profile.fingerprint.screenHeight}`,
      hardwareConcurrency: profile.fingerprint.hardwareConcurrency,
      deviceMemory: profile.fingerprint.deviceMemory,
      plugins: profile.fingerprint.plugins,
      mimeTypes: profile.fingerprint.mimeTypes,
      webglVendor: profile.fingerprint.webglVendor,
      webglRenderer: profile.fingerprint.webglRenderer,
    },
    null,
    2,
  );

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fingerprint Self Test - ${escapeHtml(profile.name)}</title>
  <style>
    :root { color-scheme: dark; --bg:#080c0a; --line:#244536; --text:#d6ffe9; --muted:#83aa94; --green:#52ff9b; --cyan:#5ee7ff; --red:#ff5d73; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: auto; min-height: 0; overflow: auto; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 11px; letter-spacing: 0; }
    main { width: 820px; max-width: calc(100vw - 24px); margin: 0; padding: 12px; display: grid; grid-template-rows: auto auto; overflow: hidden; }
    h1 { color: var(--green); font-size: 18px; margin: 0 0 3px; }
    .sub { color: var(--muted); margin-bottom: 8px; font-size: 10px; }
    .grid { min-height: 0; display: grid; grid-template-columns: repeat(2, 400px); grid-template-rows: repeat(2, 300px); gap: 8px; }
    section { border: 1px solid var(--line); padding: 8px; background: #0d1511; min-width: 0; min-height: 0; overflow: auto; }
    h2 { color: var(--cyan); font-size: 11px; margin: 0 0 8px; text-transform: uppercase; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.42; margin: 0; color: var(--text); font-size: 10px; }
    .ok { color: var(--green); }
    .bad { color: var(--red); }
    @media (max-width: 760px) {
      .grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-auto-rows: minmax(300px, auto); }
      section { min-height: 300px; }
    }
  </style>
</head>
<body>
  <main>
    <h1>FINGERPRINT SELF TEST</h1>
    <div class="sub">Profile: ${escapeHtml(profile.name)} · ${escapeHtml(profile.id)}</div>
    <div class="grid">
      <section><h2>Expected Profile</h2><pre id="expected"></pre></section>
      <section><h2>Observed Browser</h2><pre id="observed"></pre></section>
      <section><h2>Canvas</h2><pre id="canvas"></pre></section>
      <section><h2>WebGL</h2><pre id="webgl"></pre></section>
    </div>
  </main>
  <script>
    window.__LOCAL_FINGERPRINT_SELF_TEST__ = true;
    const expected = ${expected};
    const profileFingerprint = ${JSON.stringify(profile.fingerprint)};
    const hardwareFingerprintProfile = ${JSON.stringify(hardwareFingerprintProfile)};
    const hardwareRuntime = ${JSON.stringify(hardwareRuntime)};
    const expectedChromiumVersion = ${JSON.stringify(DEFAULT_CHROMIUM_VERSION)};
    const initialLocaleConsistency = ${JSON.stringify(buildLocaleConsistencyReport({
      fingerprint: profile.fingerprint,
      network: { proxyConfigured: Boolean(profile.proxy), publicIp: null },
    }))};
    const detectPublicIp = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/', {
          cache: 'no-store',
          signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) {
          throw new Error('ipapi check returned ' + response.status);
        }
        const payload = await response.json();
        return {
          publicIp: payload.ip || null,
          countryCode: payload.country_code || null,
          countryName: payload.country_name || null,
          region: payload.region || null,
          city: payload.city || null,
          timezone: payload.timezone || null,
          error: null
        };
      } catch (geoError) {}
      try {
        const response = await fetch('https://ipinfo.io/json', {
          cache: 'no-store',
          signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) {
          throw new Error('ipinfo check returned ' + response.status);
        }
        const payload = await response.json();
        return {
          publicIp: payload.ip || null,
          countryCode: payload.country || null,
          countryName: payload.country || null,
          region: payload.region || null,
          city: payload.city || null,
          timezone: payload.timezone || null,
          error: null
        };
      } catch (geoFallbackError) {}
      try {
        const response = await fetch('https://api.ipify.org?format=json', {
          cache: 'no-store',
          signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) {
          throw new Error('ip check returned ' + response.status);
        }
        const payload = await response.json();
        return { publicIp: payload.ip || null, error: null };
      } catch (error) {
        return { publicIp: null, error: error instanceof Error ? error.message : String(error) };
      }
    };

    const errorToString = (error) => error instanceof Error ? error.message : String(error);

    const countryFromTimezone = (timezone) => ({
      'America/New_York': 'US',
      'America/Los_Angeles': 'US',
      'America/Chicago': 'US',
      'Asia/Tokyo': 'JP',
      'Europe/Berlin': 'DE',
      'Europe/Paris': 'FR',
      'Europe/London': 'GB',
      'Asia/Shanghai': 'CN',
      'Asia/Hong_Kong': 'HK',
      'Asia/Singapore': 'SG',
      UTC: 'US'
    })[timezone] || timezone.split('/')[0]?.toUpperCase();
    const countryFromLanguage = (language) => ({
      'en-US': 'US',
      'en-GB': 'GB',
      'ja-JP': 'JP',
      'de-DE': 'DE',
      'fr-FR': 'FR',
      'zh-CN': 'CN',
      'zh-HK': 'HK',
      'zh-TW': 'TW'
    })[language] || language.split('-')[1]?.toUpperCase();
    const buildLocaleConsistency = (network) => {
      const timezoneCountry = countryFromTimezone(profileFingerprint.timezone);
      const languageCountry = countryFromLanguage(profileFingerprint.languages[0]);
      const networkCountry = network.countryCode || null;
      const checks = [];
      if (!networkCountry) {
        checks.push({
          key: 'proxyGeo',
          label: network.proxyConfigured ? 'proxy country detected' : 'network country detected',
          passed: false,
          expected: timezoneCountry || languageCountry || 'known country',
          observed: network.publicIp ? 'country unavailable' : 'ip unavailable',
          severity: 'warning'
        });
        checks.push({
          key: 'timezoneLanguage',
          label: 'timezone matches language',
          passed: Boolean(timezoneCountry && languageCountry) && timezoneCountry === languageCountry,
          expected: timezoneCountry || 'unknown',
          observed: languageCountry || 'unknown',
          severity: timezoneCountry === languageCountry ? undefined : 'warning'
        });
      } else {
        checks.push({
          key: 'timezoneCountry',
          label: 'timezone matches country',
          passed: timezoneCountry === networkCountry,
          expected: timezoneCountry || 'unknown',
          observed: networkCountry,
          severity: timezoneCountry === networkCountry ? undefined : 'risk'
        });
        checks.push({
          key: 'languageCountry',
          label: 'language matches country',
          passed: languageCountry === networkCountry,
          expected: languageCountry || 'unknown',
          observed: networkCountry,
          severity: languageCountry === networkCountry ? undefined : 'risk'
        });
      }
      checks.push({
        key: 'networkTimezone',
        label: 'network timezone matches profile',
        passed: network.timezone ? network.timezone === profileFingerprint.timezone : !network.proxyConfigured,
        expected: profileFingerprint.timezone,
        observed: network.timezone || (network.proxyConfigured ? 'unavailable' : 'not checked in direct mode'),
        severity: network.timezone === profileFingerprint.timezone ? undefined : network.timezone ? 'risk' : 'warning'
      });
      const passed = checks.filter((check) => check.passed).length;
      const hasRisk = checks.some((check) => !check.passed && check.severity === 'risk');
      return {
        score: Math.round((passed / checks.length) * 100),
        status: hasRisk ? 'risk' : passed === checks.length ? 'ok' : 'warning',
        summary: passed + '/' + checks.length + ' locale checks ok',
        checks
      };
    };

    const renderReport = ({ expected, observed, canvasHash, webgl, matched, network, webrtc, localeConsistency, runtimeConsistency, hardwareRuntime, complete }) => {
      const finalLocaleConsistency = localeConsistency || initialLocaleConsistency;
      window.__LOCAL_FINGERPRINT_SELF_TEST_RESULT__ = { expected, observed, canvasHash, webgl, matched, network, webrtc, localeConsistency: finalLocaleConsistency, runtimeConsistency, hardwareRuntime, complete };
      const checks = [
        ...Object.values(matched),
        !webrtc.leakRisk,
        runtimeConsistency ? runtimeConsistency.browserVersionMatchesRuntime : true,
        hardwareRuntime ? Boolean(hardwareRuntime.validation?.valid) : true,
        ...(finalLocaleConsistency?.checks || []).map((check) => check.passed)
      ];
      if (network.proxyConfigured) {
        checks.push(Boolean(network.publicIp));
      }
      document.title = 'Fingerprint Self Test - ' + checks.filter(Boolean).length + '/' + checks.length;

      document.getElementById('expected').textContent = JSON.stringify(expected, null, 2);
      document.getElementById('observed').textContent = JSON.stringify(observed, null, 2);
      document.getElementById('canvas').textContent = 'canvas.toDataURL prefix:\\n' + canvasHash + '\\n\\nnetwork:\\n' + JSON.stringify(network, null, 2) + '\\n\\nlocaleConsistency:\\n' + JSON.stringify(finalLocaleConsistency, null, 2);
      document.getElementById('webgl').textContent = 'getParameter result:\\n' + JSON.stringify(webgl, null, 2) + '\\n\\nwebrtc:\\n' + JSON.stringify(webrtc, null, 2);
    };

    const detectWebRtcCandidates = async () => {
      if (typeof RTCPeerConnection === 'undefined') {
        return { supported: false, candidateCount: 0, candidates: [], leakRisk: false };
      }
      const candidates = [];
      let connection;
      try {
        connection = new RTCPeerConnection({ iceServers: [] });
        connection.createDataChannel('local-test');
        connection.onicecandidate = (event) => {
          if (event.candidate && event.candidate.candidate) {
            candidates.push(event.candidate.candidate);
          }
        };
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await new Promise((resolve) => setTimeout(resolve, 900));
      } catch (error) {
        candidates.push('error:' + (error instanceof Error ? error.message : String(error)));
      } finally {
        if (connection) {
          connection.close();
        }
      }
      const webrtcLeakRisk = candidates.some((candidate) => / typ host | typ srflx /.test(candidate));
      return { supported: true, candidateCount: candidates.length, candidates, leakRisk: webrtcLeakRisk, webrtcLeakRisk };
    };

    const observe = async () => {
      let canvasHash = 'unavailable';
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 180;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = '16px Arial';
          ctx.fillText('fingerprint-self-test', 2, 2);
        }
        canvasHash = canvas.toDataURL().slice(0, 96);
      } catch (error) {
        canvasHash = 'error:' + errorToString(error);
      }

      let webgl = { vendor: 'unavailable', renderer: 'unavailable' };
      try {
        const webglCanvas = document.createElement('canvas');
        const gl = webglCanvas.getContext('webgl') || webglCanvas.getContext('experimental-webgl');
        const debugInfo = gl && gl.getExtension('WEBGL_debug_renderer_info');
        webgl = gl ? {
          vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
        } : webgl;
      } catch (error) {
        webgl = { vendor: 'error', renderer: errorToString(error) };
      }

      let uaClientHints = null;
      try {
        uaClientHints = navigator.userAgentData ? await navigator.userAgentData.getHighEntropyValues([
          'architecture',
          'bitness',
          'model',
          'platform',
          'platformVersion',
          'uaFullVersion',
          'fullVersionList'
        ]) : null;
      } catch (error) {
        uaClientHints = { error: errorToString(error) };
      }

      const permissionStates = {};
      if (navigator.permissions && navigator.permissions.query) {
        for (const permissionName of ['notifications', 'camera', 'microphone', 'geolocation']) {
          try {
            const result = await navigator.permissions.query({ name: permissionName });
            permissionStates[permissionName] = result.state;
          } catch (error) {
            permissionStates[permissionName] = 'error:' + errorToString(error);
          }
        }
      }

      let mediaDevices = [];
      try {
        mediaDevices = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices
          ? await navigator.mediaDevices.enumerateDevices()
          : [];
      } catch (error) {
        mediaDevices = ['error:' + errorToString(error)];
      }

      const observedChromeVersion = navigator.userAgent.match(/Chrome\\/([^\\s]+)/)?.[1] || 'unknown';
      const observedUaClientVersion = uaClientHints?.uaFullVersion || uaClientHints?.fullVersionList?.[0]?.version || 'unknown';
      const expectedUaHints = hardwareRuntime.userAgentMetadata;
      const uaClientHintsConsistency = {
        expected: expectedUaHints,
        observed: uaClientHints || {},
        platformMatchesProfile: uaClientHints ? uaClientHints.platform === expectedUaHints.platform : false,
        architectureMatchesProfile: uaClientHints ? uaClientHints.architecture === expectedUaHints.architecture : false,
        platformVersionMatchesProfile: uaClientHints ? uaClientHints.platformVersion === expectedUaHints.platformVersion : false,
        fullVersionMatchesProfile: observedUaClientVersion === profileFingerprint.browserVersion
      };
      const runtimeConsistency = {
        expectedChromiumVersion,
        profileBrowserVersion: profileFingerprint.browserVersion,
        observedChromeVersion,
        observedUaClientVersion,
        browserVersionMatchesRuntime: profileFingerprint.browserVersion === expectedChromiumVersion && observedChromeVersion === expectedChromiumVersion,
        uaClientHintsConsistency
      };

      const observed = {
        'navigator.userAgent': navigator.userAgent,
        'navigator.platform': navigator.platform,
        'navigator.languages': navigator.languages,
        'navigator.userAgentData': uaClientHints,
        'navigator.hardwareConcurrency': navigator.hardwareConcurrency,
        'navigator.deviceMemory': navigator.deviceMemory,
        'navigator.plugins': Array.from(navigator.plugins || []).map((plugin) => plugin.name),
        'navigator.mimeTypes': Array.from(navigator.mimeTypes || []).map((mimeType) => mimeType.type),
        'navigator.permissions.query': permissionStates,
        'navigator.mediaDevices.enumerateDevices': mediaDevices.map((device) => typeof device === 'string' ? device : { kind: device.kind, deviceId: device.deviceId, groupId: device.groupId }),
        'Intl timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        'screen': screen.width + 'x' + screen.height,
        'screen.colorDepth': screen.colorDepth,
        'screen.pixelDepth': screen.pixelDepth,
        'window.outerWidth': window.outerWidth,
        'window.outerHeight': window.outerHeight,
        'window.innerWidth': window.innerWidth,
        'window.innerHeight': window.innerHeight,
        'devicePixelRatio': window.devicePixelRatio
      };
      const matched = {
        userAgent: observed['navigator.userAgent'] === expected.userAgent,
        platform: observed['navigator.platform'] === expected.platform,
        languages: JSON.stringify(observed['navigator.languages']) === JSON.stringify(expected.languages),
        timezone: observed['Intl timezone'] === expected.timezone,
        screen: observed.screen === expected.screen,
        hardwareConcurrency: observed['navigator.hardwareConcurrency'] === expected.hardwareConcurrency,
        deviceMemory: observed['navigator.deviceMemory'] === expected.deviceMemory,
        plugins: JSON.stringify(observed['navigator.plugins']) === JSON.stringify(expected.plugins),
        mimeTypes: JSON.stringify(observed['navigator.mimeTypes']) === JSON.stringify(expected.mimeTypes),
        webglVendor: webgl.vendor === expected.webglVendor,
        webglRenderer: webgl.renderer === expected.webglRenderer
      };
      const baseReport = {
        expected,
        observed,
        canvasHash,
        webgl,
        matched,
        network: { proxyConfigured: ${profile.proxy ? 'true' : 'false'}, publicIp: null, error: 'checking' },
        webrtc: { supported: false, candidateCount: 0, candidates: [], leakRisk: false, webrtcLeakRisk: false },
        localeConsistency: initialLocaleConsistency,
        runtimeConsistency,
        hardwareRuntime: {
          ...hardwareRuntime,
          profile: hardwareFingerprintProfile
        },
        complete: false
      };
      renderReport(baseReport);

      const [networkResult, webrtc] = await Promise.all([
        detectPublicIp(),
        detectWebRtcCandidates()
      ]);
      renderReport({
        ...baseReport,
        network: {
          proxyConfigured: ${profile.proxy ? 'true' : 'false'},
          ...networkResult
        },
        webrtc,
        runtimeConsistency,
        localeConsistency: buildLocaleConsistency({
          proxyConfigured: ${profile.proxy ? 'true' : 'false'},
          ...networkResult
        }),
        hardwareRuntime: {
          ...hardwareRuntime,
          profile: hardwareFingerprintProfile
        },
        complete: true
      });
    };
    observe().catch((error) => {
      const observed = {
        error: 'observe failed: ' + errorToString(error),
        'navigator.userAgent': navigator.userAgent,
        'navigator.platform': navigator.platform,
        'navigator.languages': navigator.languages
      };
      renderReport({
        expected,
        observed,
        canvasHash: 'error',
        webgl: { vendor: 'error', renderer: errorToString(error) },
        matched: {
          userAgent: observed['navigator.userAgent'] === expected.userAgent,
          platform: observed['navigator.platform'] === expected.platform,
          languages: JSON.stringify(observed['navigator.languages']) === JSON.stringify(expected.languages),
          timezone: false,
          screen: false,
          hardwareConcurrency: false,
          deviceMemory: false,
          plugins: false,
          mimeTypes: false,
          webglVendor: false,
          webglRenderer: false
        },
        network: { proxyConfigured: ${profile.proxy ? 'true' : 'false'}, publicIp: null, error: 'observe failed' },
        webrtc: { supported: false, candidateCount: 0, candidates: [], leakRisk: false, webrtcLeakRisk: false },
        localeConsistency: initialLocaleConsistency,
        runtimeConsistency: {
          expectedChromiumVersion,
          profileBrowserVersion: profileFingerprint.browserVersion,
          observedChromeVersion: 'error',
          observedUaClientVersion: 'error',
          browserVersionMatchesRuntime: false,
          uaClientHintsConsistency: {
            expected: hardwareRuntime.userAgentMetadata,
            observed: {},
            platformMatchesProfile: false,
            architectureMatchesProfile: false,
            platformVersionMatchesProfile: false,
            fullVersionMatchesProfile: false
          }
        },
        hardwareRuntime: {
          ...hardwareRuntime,
          profile: hardwareFingerprintProfile
        },
        complete: true
      });
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
