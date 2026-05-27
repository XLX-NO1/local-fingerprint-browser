# 指纹浏览器交接文档

更新时间：2026-05-27

## 项目定位

这是一个本地 Electron 指纹浏览器 MVP，目标是做一个简单直观的多环境浏览器：

- 多用户环境，每个环境独立资料、标签页、收藏和登录状态。
- 支持代理配置和代理连通性检查。
- 支持基础指纹伪装扩展。
- 网页在软件内部打开，界面不依赖命令行启动。
- UI 风格为终端像素风，但交互尽量接近普通浏览器。

当前重点不是完整商业级反检测，而是先把环境、代理、标签、内嵌网页操作链路打通。

## 技术栈

- Electron 39
- React 19
- TypeScript
- Vite
- Vitest
- macOS 目录构建通过 `electron-builder`

主要脚本：

```bash
npm run dev
npm run typecheck
npm run test
npm run build
npm run dist
```

如果只想用当前 Vite dev server 打开 Electron，可用：

```bash
VITE_DEV_SERVER_URL=http://127.0.0.1:5173 ./node_modules/.bin/electron /Users/suweichao/项目/指纹浏览器
```

## 当前运行状态

当前代码状态：

- 当前分支：`codex/fingerprint-model-spec`
- 最新提交：以 `git log --oneline -1` 为准
- 工作区：提交后干净

最近一次验证：

- `npm run typecheck` 通过
- `npm run test` 通过，35 个测试文件，164 个测试
- `npm run build` 通过
- Electron 已能打开本地软件窗口

## 核心目录

- `src/App.tsx`：主 UI，环境列表、标签列表、地址栏、弹窗、内嵌浏览器占位区域。
- `src/styles.css`：终端像素风样式和布局。
- `src/types.ts`：主进程暴露给前端的 API 类型和核心数据结构。
- `src/browserWorkspace.ts`：纯函数管理标签页、收藏、active tab、URL 元数据。
- `src/embeddedBrowser.ts`：内嵌浏览器相关前端 helper，包括地址栏取 active tab URL。
- `src/nativeBrowserView.ts`：Electron BrowserView 坐标和固定缩放常量。
- `electron/main.ts`：Electron 主进程、IPC、原生 BrowserView 控制器装配、代理 session、标签事件拦截。
- `electron/services/nativeBrowserViewController.ts`：按 tab 管理原生 BrowserView 生命周期、显示/隐藏、尺寸、导航命令和销毁。
- `electron/preload.ts`：暴露安全 IPC API 到 renderer。
- `electron/services/profileStore.ts`：环境 JSON 持久化，数据位置在 Electron `userData/app-data`。
- `electron/services/browserLauncher.ts`：外部 Chromium/Chrome 启动能力，保留用于独立浏览器进程。
- `electron/services/fingerprint.ts`：生成环境指纹配置。
- `fingerprint-extension/content.js`：指纹伪装内容脚本。
- `tests/`：Vitest 覆盖主要业务逻辑和 UI 源码约束。

## 当前功能

环境：

- 创建、编辑、复制、删除环境。
- 每个环境有独立 `persist:profile-${profile.id}` session。
- 每个环境有独立标签列表、active tab、收藏、历史记录。

代理：

- 支持 `http`、`https`、`socks5` URL 解析。
- 内嵌 BrowserView 打开网页前会按 profile 配置 Electron session proxy。
- 可检查代理连通性。

内嵌浏览器：

- 使用 Electron 原生 `BrowserView`，不是 `<webview>`。
- 主进程通过 `NativeBrowserViewController` 按 tab 维护 BrowserView 实例，切换 tab 时隐藏/显示对应 view，避免重复 reload。
- 网页弹出的 `target="_blank"` / `window.open` 会被拦截为当前环境下的新内部标签。
- 网页内普通跳转会按触发事件的 view 回写对应 tab 的 URL 和 title。
- 前端通过 `profiles:changed` 事件刷新左侧标签和地址栏。

UI：

- 左侧：环境列表、每个环境下的标签。
- 中间：浏览器工具栏和网页区域。
- 右侧 inspector 可折叠。
- 地址栏按 Enter 打开，不再需要额外“打开”按钮。
- 打开新建/编辑/路径设置弹窗时会隐藏 BrowserView，避免原生网页层盖住 React 弹窗。

## 重要设计取舍

### BrowserView 层级

`BrowserView` 是原生层，不在 React DOM 树里。它会盖住 React modal。当前解决方式：

- `src/App.tsx` 有 `isModalOpen = isEditorOpen || isSettingsOpen`。
- 弹窗打开时调用 `window.api.hideNativeBrowserView()`。
- 主进程 `native-browser:hide` 只 `removeBrowserView`，不关闭 `webContents`。
- 弹窗关闭后 `showNativeBrowserView` 会把当前 tab 对应的 BrowserView 重新贴回窗口，减少网页状态丢失。

### 网页缩放

用户不想页面加载后跳来跳去，所以目前不再动态测宽缩放。

当前固定值在 `src/nativeBrowserView.ts`：

```ts
export const FIXED_BROWSER_ZOOM = 1;
```

主进程 `resetNativeBrowserZoom()` 在 `dom-ready`、`did-finish-load`、`did-stop-loading` 和 resize 时设置固定缩放。

如果后续觉得网页太小或太大，优先改这个常量。不要恢复“按完整页面高度缩放”，那会让网页像缩略图，不符合用户现在要的正常浏览器体验。

### 标签页模型

标签页已有独立 BrowserView runtime。当前仍使用 Electron `BrowserView`，但控制器会为不同 tab 缓存不同 view，切换 tab 不再强制把同一个页面 reload 到另一个 URL。

相关函数：

- `openTabInProfile`：在 active tab 打开 URL。
- `createBlankTab`：创建新 tab。
- `openUrlInNewTab`：网页弹窗转内部新 tab。
- `activateTabInProfile`：切换 active tab。
- `updateTabMetadataInProfile`：网页导航和 title 更新回触发事件的 tab，不改变当前 active tab。

后续仍建议迁移到 `WebContentsView`，但当前 BrowserView 控制器已经是后续 adapter 的边界。

## 当前已知问题和取舍

- 后退/前进/刷新已接到当前 tab 的 BrowserView webContents，按钮状态由主进程导航 runtime 控制。
- 地址栏有编辑中状态，用户输入时不会被 profile refresh 覆盖。
- 多 tab 已有独立 BrowserView 缓存，但仍未迁移到 Electron 推荐的 `WebContentsView`。
- 当前弹窗仍需要 hide/show 原生 BrowserView，WebContentsView 迁移后再处理层级。
- 当前指纹伪装主要是 JS/content layer，距离商业级深度伪装还有差距。
- 打包目录 `release/` 和构建目录 `dist/`、`dist-electron/` 已存在，开发时注意不要误以为它们是源代码。

## 后续建议

### 总体路线

接下来目标不是继续堆 UI，而是把现在能用的 BrowserView 浏览能力收拢成真正浏览器内核：

1. 先把“tab runtime + navigation state”补完整，让主进程知道每个 tab 的加载、前进、后退、崩溃、错误状态。
2. 再加 `WebContentsView` adapter，替换 deprecated `BrowserView`。
3. 然后补浏览器必备能力：下载、权限、证书/外部协议、崩溃恢复。
4. 最后把硬件指纹 v2 模型接入 runtime、自测和 UI，减少伪装值漂移。

### 下一阶段 1：导航状态和 tab runtime

状态：已开始实现。`NativeBrowserViewController` 已保存每个 tab 的 `BrowserNavigationState`，主进程已监听加载、导航、失败、崩溃事件，前端后退/前进按钮已改为读取 `canGoBack/canGoForward`。

目标：前端不再用 `selected?.lastOpenedUrl` 粗略判断按钮状态，而是由主进程返回当前 tab 的真实状态。

要改的文件：

- `src/types.ts`：新增 `BrowserTabRuntime`、`BrowserNavigationState`，扩展 `AppApi`。
- `electron/services/nativeBrowserViewController.ts`：保存每个 tab 的 runtime 状态。
- `electron/main.ts`：监听 webContents 事件并通过 IPC 或 `profiles:changed` 更新 UI。
- `src/App.tsx`：后退/前进/刷新按钮改为读 runtime 状态。
- `tests/nativeBrowserViewController.test.ts`：补导航状态事件测试。
- `tests/browserChromeUi.test.ts`：补按钮 disabled 来源测试。

建议数据结构：

```ts
export interface BrowserNavigationState {
  tabId: string;
  profileId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  crashed: boolean;
  lastError?: string;
}
```

事件来源：

- `did-start-loading`：`isLoading = true`
- `did-stop-loading`：`isLoading = false`
- `did-navigate` / `did-navigate-in-page`：更新 URL、history 状态
- `page-title-updated`：更新 title
- `did-fail-load`：写入 `lastError`
- `render-process-gone`：`crashed = true`

验收标准：

- 后退按钮只在当前 tab `canGoBack` 为 true 时可点。
- 前进按钮只在当前 tab `canGoForward` 为 true 时可点。
- reload 只刷新当前 tab 的 webContents。
- 隐藏 tab 的导航事件只更新它自己的 metadata，不切换 active tab。

### 下一阶段 2：WebContentsView adapter

状态：adapter 边界已落地。新增 `browserPageView.ts`、`browserViewPageView.ts`、`webContentsViewPageView.ts`，控制器已依赖统一 `BrowserPageView` 接口；默认仍使用 BrowserView。

目标：为 Electron 新版视图层做迁移，减少 BrowserView 层级问题。

要改的文件：

- 新增 `electron/services/browserPageView.ts`：定义统一 view adapter 接口。
- 新增 `electron/services/browserViewPageView.ts`：把当前 BrowserView 包起来。
- 新增 `electron/services/webContentsViewPageView.ts`：实现 WebContentsView 版本。
- 修改 `electron/services/nativeBrowserViewController.ts`：依赖接口，不直接假设 BrowserView。
- 修改 `electron/main.ts`：选择 adapter，先默认 BrowserView，WebContentsView 走实验开关。
- 新增 `tests/browserPageViewAdapter.test.ts`：同一组契约跑两个 adapter 的 fake 实现。

接口建议：

```ts
export interface BrowserPageView {
  readonly webContents: Electron.WebContents;
  setBounds(bounds: BrowserViewBounds): void;
  setAutoResize(options: { width: boolean; height: boolean }): void;
  destroy(): void;
}

export interface BrowserPageHost {
  addPageView(view: BrowserPageView): void;
  removePageView(view: BrowserPageView): void;
}
```

验收标准：

- 当前 BrowserView 行为不退化。
- WebContentsView adapter 可以通过单元测试创建、显示、隐藏、销毁。
- React modal 不再需要长期依赖 hide/show workaround 后，再考虑切默认。

### 下一阶段 3：下载管理

状态：核心已落地。新增 `DownloadController`、下载 IPC、profile-scoped 下载列表和 inspector 下载面板；下载可取消。

目标：下载不再静默落到系统默认行为，而是 profile-scoped、可见、可取消。

要改的文件：

- 新增 `electron/services/downloadController.ts`
- 修改 `src/types.ts`：新增 `DownloadRecord`
- 修改 `electron/main.ts`：监听 `session.on('will-download')`
- 修改 `electron/preload.ts`：暴露下载列表、取消、打开文件 API
- 修改 `src/App.tsx`：增加下载区域或 inspector 下载面板
- 新增 `tests/downloadController.test.ts`

数据结构建议：

```ts
export interface DownloadRecord {
  id: string;
  profileId: string;
  tabId?: string;
  url: string;
  filename: string;
  savePath: string;
  status: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  receivedBytes: number;
  totalBytes?: number;
  error?: string;
}
```

验收标准：

- 每个下载记录能关联 profile。
- 下载进度可更新。
- 用户可以取消下载。
- 不自动执行下载文件。

### 下一阶段 4：权限、外部协议和证书策略

状态：权限默认拒绝策略已落地。新增 `permissionController` 并接入 `embeddedSession`。外部协议和证书错误策略仍需继续补。

目标：把敏感能力默认收紧，避免网页突破 profile 边界。

要改的文件：

- 新增 `electron/services/permissionController.ts`
- 修改 `electron/services/embeddedSession.ts`
- 修改 `electron/main.ts`
- 修改 `src/types.ts`
- 新增 `tests/permissionController.test.ts`

初始策略：

- notification：默认 deny，后续可 profile 配置。
- geolocation：默认 deny。
- camera/microphone：默认 deny。
- MIDI/HID/serial/Bluetooth：默认 deny。
- clipboard：只保留浏览器默认 user gesture 行为。
- `mailto:`、`tel:`、自定义协议：先阻止，并写入 launchTrace。
- 证书错误：默认阻止，不自动忽略。

验收标准：

- 测试能证明敏感权限默认被拒绝。
- 外部协议不会绕过当前 profile 跑到系统应用。
- 证书错误不会静默继续。

### 下一阶段 5：崩溃恢复和启动 reconcile

目标：页面崩溃、应用重启后状态可解释，不让用户误以为环境仍正常。

要改的文件：

- `electron/services/nativeBrowserViewController.ts`
- `electron/services/profileStore.ts`
- `electron/main.ts`
- `src/types.ts`
- `src/App.tsx`
- `tests/nativeBrowserViewController.test.ts`
- 新增 `tests/profileRecovery.test.ts`

要做的事：

- 监听 `render-process-gone`，给 tab 标记 `crashed = true`。
- reload 崩溃 tab 时清掉 crashed 状态。
- app 启动时清理 stale running profile 状态。
- profile status 和 tab crash state 分开，不要把整个 profile 直接标死。

验收标准：

- tab 崩溃后 UI 有明确状态。
- 点击 reload 只重载崩溃 tab。
- 重启 app 后不会保留假的 running/pid。

### 下一阶段 6：硬件指纹 v2 runtime 接入

目标：把 `docs/architecture/hardware-fingerprint-spec.md` 里的硬件模型真正接到运行时，而不是只停留在文档。

已有基础：

- `electron/services/fingerprint/model.ts`
- `electron/services/fingerprint/modules.ts`
- `electron/services/fingerprint/scriptBuilder.ts`
- `electron/services/fingerprint/*`
- `docs/architecture/hardware-fingerprint-spec.md`

下一步要做：

- 增加 `HardwareFingerprintProfile` 内部模型，保留旧 `FingerprintConfig` 兼容出口。
- 用 device class 约束 OS、UA、UA-CH、platform、WebGL、CPU、memory、screen。
- 让 CDP、session header、preload script、自测页面都从同一 derived values 读取。
- 指纹变化时，调用 `disposeNativeBrowserProfileViews(profileId)` 清理该 profile 的所有 live view。
- UI 编辑器先保留旧字段，但保存时走兼容转换。

验收标准：

- 同一个 seed 生成稳定。
- Windows/Mac/Linux 字段内部一致。
- UA Client Hints 和 UA 字符串一致。
- WebGL renderer 与 platform/device class 不冲突。
- 自测页面能显示 v2 derived values。

### 下一阶段 7：前端体验收口

目标：让用户感觉这是浏览器，不是测试面板。

要改的文件：

- `src/App.tsx`
- `src/styles.css`
- `src/types.ts`
- `tests/browserChromeUi.test.ts`

建议顺序：

1. 工具栏按钮用 runtime state 控制 disabled。
2. 增加 loading 状态，页面加载中显示轻量指示。
3. 增加 crash/error 状态视图。
4. inspector 展示当前 tab URL、title、loading、history、proxy、fingerprint health。
5. 下载面板放在 inspector 或底部抽屉，不要做营销式 landing 页面。

验收标准：

- 主要按钮状态和当前 tab 一致。
- 加载、失败、崩溃都有可见状态。
- 弹窗不被网页盖住。
- 页面文字不溢出按钮和 panel。

### 做事顺序建议

优先级高：

1. 增加 WebContentsView adapter，逐步替换 deprecated BrowserView。
2. 增加下载、权限、证书错误、崩溃恢复等浏览器级能力。
3. 让前端根据主进程导航状态控制后退/前进按钮 disabled 状态。
4. 增加用户环境详情页，代理、指纹、书签、历史更直观。

优先级中：

1. 固定缩放做成 UI 设置，例如 80%、90%、100%。
2. 新标签默认打开空白页或首页，不一定沿用地址栏当前 URL。
3. 书签展示独立区域更清楚。
4. 代理失败时在 UI 明确标红，而不是只在 inspector。

优先级低：

1. 整理旧 `<webview>` fit 相关代码。当前 `webview:fit-page` 和 `src/webviewFit.ts` 还保留着，主要是历史遗留和测试覆盖。
2. 清理构建产物，建立 git 仓库并加 `.gitignore`。
3. 增加 e2e 自动化测试，目前主要是单元测试和源码约束测试。

## 开发规则

- 每个阶段先写测试，再改实现。
- 每个可独立验收的阶段单独提交。
- 不要把指纹模型重写、WebContentsView 迁移、下载权限一次性混在一个提交里。
- 不要回退 `NativeBrowserViewController`，它是后续浏览器内核边界。
- 不要恢复动态整页缩放；网页应像正常浏览器，必要时只做宽度适配或用户可选 zoom。
- 不要直接在持久化 profile 里保存 Electron 对象，只保存 id、状态、URL、title、错误信息。
- 当前构建产物 `dist/`、`dist-electron/`、`release/` 已存在，改源码时不要把它们当主逻辑。

## 建议提交拆分

1. `Add navigation runtime state`
2. `Add browser page view adapter boundary`
3. `Add experimental WebContentsView adapter`
4. `Add profile scoped download controller`
5. `Add permission and external protocol policy`
6. `Add tab crash recovery state`
7. `Wire hardware fingerprint v2 runtime`
8. `Surface browser health in inspector`

## 常用验证

完整验证：

```bash
npm run typecheck
npm run test
npm run build
```

启动开发：

```bash
npm run dev
```

如果 Vite 已经在 `http://127.0.0.1:5173/` 跑着，只重启 Electron：

```bash
pkill -f '/Users/suweichao/项目/指纹浏览器/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron' || true
VITE_DEV_SERVER_URL=http://127.0.0.1:5173 ./node_modules/.bin/electron /Users/suweichao/项目/指纹浏览器
```

## 最近用户明确要求

- 页面语言用中文沟通。
- UI 保持终端像素风。
- 网页要像正常浏览器一样，不要整页缩成一屏。
- 点击网页链接新窗口必须进入内部标签页，不要弹独立窗口。
- 标签切换时地址栏要跟着变。
- 新建环境弹窗不能被网页挡住。
- 网页不要加载后动态缩放跳动，当前用固定 1 倍缩放。
