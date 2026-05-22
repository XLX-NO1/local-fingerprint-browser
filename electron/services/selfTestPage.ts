import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import type { BrowserProfile } from '../../src/types';

export interface SelfTestPage {
  filePath: string;
  fileUrl: string;
}

export async function prepareSelfTestPage(profile: BrowserProfile): Promise<SelfTestPage> {
  await mkdir(profile.userDataDir, { recursive: true });
  const filePath = join(profile.userDataDir, 'fingerprint-self-test.html');
  await writeFile(filePath, buildSelfTestHtml(profile), 'utf8');
  return {
    filePath,
    fileUrl: pathToFileURL(filePath).toString(),
  };
}

function buildSelfTestHtml(profile: BrowserProfile): string {
  const expected = JSON.stringify(
    {
      profileId: profile.id,
      profileName: profile.name,
      userAgent: profile.fingerprint.userAgent,
      platform: profile.fingerprint.platform,
      languages: profile.fingerprint.languages,
      timezone: profile.fingerprint.timezone,
      screen: `${profile.fingerprint.screenWidth}x${profile.fingerprint.screenHeight}`,
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
    body { margin: 0; background: var(--bg); color: var(--text); font-family: "SFMono-Regular", Menlo, Consolas, monospace; letter-spacing: 0; }
    main { max-width: 1120px; margin: 0 auto; padding: 28px; }
    h1 { color: var(--green); font-size: 22px; margin: 0 0 6px; }
    .sub { color: var(--muted); margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    section { border: 1px solid var(--line); padding: 14px; background: #0d1511; }
    h2 { color: var(--cyan); font-size: 13px; margin: 0 0 12px; text-transform: uppercase; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; margin: 0; color: var(--text); }
    .ok { color: var(--green); }
    .bad { color: var(--red); }
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
    const detectPublicIp = async () => {
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

    const renderReport = ({ expected, observed, canvasHash, webgl, matched, network, webrtc }) => {
      window.__LOCAL_FINGERPRINT_SELF_TEST_RESULT__ = { expected, observed, canvasHash, webgl, matched, network, webrtc };
      const checks = [
        ...Object.values(matched),
        !webrtc.leakRisk
      ];
      if (network.proxyConfigured) {
        checks.push(Boolean(network.publicIp));
      }
      document.title = 'Fingerprint Self Test - ' + checks.filter(Boolean).length + '/' + checks.length;

      document.getElementById('expected').textContent = JSON.stringify(expected, null, 2);
      document.getElementById('observed').textContent = JSON.stringify(observed, null, 2);
      document.getElementById('canvas').textContent = 'canvas.toDataURL prefix:\\n' + canvasHash + '\\n\\nnetwork:\\n' + JSON.stringify(network, null, 2);
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

      const observed = {
        'navigator.userAgent': navigator.userAgent,
        'navigator.platform': navigator.platform,
        'navigator.languages': navigator.languages,
        'navigator.hardwareConcurrency': navigator.hardwareConcurrency,
        'navigator.deviceMemory': navigator.deviceMemory,
        'Intl timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        'screen': screen.width + 'x' + screen.height,
        'devicePixelRatio': window.devicePixelRatio
      };
      const matched = {
        userAgent: observed['navigator.userAgent'] === expected.userAgent,
        platform: observed['navigator.platform'] === expected.platform,
        languages: JSON.stringify(observed['navigator.languages']) === JSON.stringify(expected.languages),
        timezone: observed['Intl timezone'] === expected.timezone,
        screen: observed.screen === expected.screen,
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
        webrtc: { supported: false, candidateCount: 0, candidates: [], leakRisk: false, webrtcLeakRisk: false }
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
        webrtc
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
          webglVendor: false,
          webglRenderer: false
        },
        network: { proxyConfigured: ${profile.proxy ? 'true' : 'false'}, publicIp: null, error: 'observe failed' },
        webrtc: { supported: false, candidateCount: 0, candidates: [], leakRisk: false, webrtcLeakRisk: false }
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
