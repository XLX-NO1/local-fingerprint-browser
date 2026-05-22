import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('browser chrome UI', () => {
  const appSource = readFileSync('src/App.tsx', 'utf8');
  const styles = readFileSync('src/styles.css', 'utf8');

  it('submits the url bar with Enter instead of a separate open button', () => {
    expect(appSource).toContain('<form className="browser-toolbar"');
    expect(appSource).toContain('onSubmit=');
    expect(appSource).not.toContain('点击“打开网页”');
  });

  it('lets the embedded browser fill the available workspace height', () => {
    expect(styles).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(styles).toContain('grid-template-rows: minmax(0, 1fr);');
    expect(styles).toContain('flex: 1;');
    expect(styles).not.toContain('height: calc(100vh - 112px)');
  });

  it('does not reserve an extra management or title row above the webpage', () => {
    expect(appSource).not.toContain('className="workspace-bar"');
    expect(appSource).not.toContain('className="browser-panel-title"');
  });

  it('hides the native browser view while React modals are open', () => {
    expect(appSource).toContain('const isModalOpen = isEditorOpen || isSettingsOpen;');
    expect(appSource).toContain('if (isModalOpen) {');
    expect(appSource).toContain('hideNativeBrowserView');
  });

  it('exposes compact fingerprint actions in the inspector', () => {
    expect(appSource).toContain('regenerateFingerprint');
    expect(appSource).toContain('openFingerprintSelfTest');
    expect(appSource).toContain('重生成指纹');
    expect(appSource).toContain('指纹检测');
  });

  it('wires browser toolbar buttons to native navigation commands', () => {
    expect(appSource).toContain('goBackNativeBrowserView');
    expect(appSource).toContain('goForwardNativeBrowserView');
    expect(appSource).toContain('reloadNativeBrowserView');
    expect(appSource).not.toContain('<button type="button" disabled title="后退">');
    expect(appSource).not.toContain('<button type="button" disabled title="前进">');
  });

  it('does not overwrite the address bar while the user is editing it', () => {
    expect(appSource).toContain('isEditingUrl');
    expect(appSource).toContain('onFocus={() => setIsEditingUrl(true)}');
    expect(appSource).toContain('onBlur={() => setIsEditingUrl(false)}');
  });

  it('shows detailed device profile information in the inspector', () => {
    expect(appSource).toContain('device profile');
    expect(appSource).toContain('buildDeviceProfileRows');
    expect(appSource).toContain('deviceRows.map');
  });

  it('exposes editable fingerprint controls in the profile editor', () => {
    expect(appSource).toContain('指纹配置');
    expect(appSource).toContain('fingerprint-form-grid');
    expect(appSource).toContain('fingerprint.os');
    expect(appSource).toContain('fingerprint.languages');
    expect(appSource).toContain('fingerprint.timezone');
    expect(appSource).toContain('fingerprint.userAgent');
    expect(appSource).toContain('fingerprint.webglRenderer');
    expect(appSource).toContain('旧检测结果会在保存后清空');
  });

  it('lets users pick a profile color and shows it in the sidebar', () => {
    expect(appSource).toContain('PROFILE_COLORS');
    expect(appSource).toContain('颜色');
    expect(appSource).toContain('profile-color-dot');
    expect(styles).toContain('.profile-color-swatch');
  });

  it('surfaces runtime errors in the status bar', () => {
    expect(appSource).toContain('{error ?');
    expect(appSource).toContain('status-error');
    expect(styles).toContain('.status-error');
  });

  it('keeps native create-tab requests blank unless a url is provided', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');

    expect(mainSource).toContain("createBlankTab(profile, rawUrl || 'about:blank')");
    expect(mainSource).not.toContain("createBlankTab(profile, rawUrl || 'https://example.com')");
  });
});
