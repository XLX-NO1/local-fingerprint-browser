# 指纹浏览器交接文档

更新时间：2026-05-27

## 当前结论

项目已经从“能打开网页的 Electron MVP”推进到一个可继续演进的本地指纹浏览器骨架：

- 内嵌网页已走 Electron 原生 BrowserView 控制器，按 profile/tab 管理实例。
- 多环境、代理、标签、收藏、历史、下载、权限策略、证书策略、外部协议拦截、崩溃状态已经有核心链路。
- 硬件指纹 v2 模型已经落到 `electron/services/fingerprint/model.ts`，并通过 `fingerprintRuntime` 接入 CDP/Accept-Language/UA metadata。
- 还没有完成“真正可用浏览器”的全部收口：WebContentsView 还未切默认，真实端到端冒烟仍需要补。

当前推荐下一步：补 WebContentsView 实机开关与浏览器级端到端冒烟。

## 基本信息

- 工作目录：`/Users/suweichao/项目/指纹浏览器`
- 当前分支：`codex/fingerprint-model-spec`
- 当前版本：`package.json` 为 `1.0.10`
- 最新提交：以 `git log --oneline -1` 为准
- 语言：和用户沟通用中文
- UI 方向：保持终端像素风，但交互要像正常浏览器

主要脚本：

```bash
npm run dev
npm run typecheck
npm run test
npm run build
npm run dist
```

如果 Vite 已在 `http://127.0.0.1:5173/` 跑着，只重启 Electron：

```bash
VITE_DEV_SERVER_URL=http://127.0.0.1:5173 ./node_modules/.bin/electron /Users/suweichao/项目/指纹浏览器
```

## 最近验证基线

截至 `Release v1.0.10`：

- `npm run test` 通过：37 个测试文件，174 个测试
- `npm run build` 通过
- `npm run typecheck` 通过

提交或宣布完成前必须重新跑：

```bash
npm run typecheck
npm run test
npm run build
```

## 已完成版本

### v1.0.7

完成浏览器视图 adapter 边界、下载管理和权限默认拒绝策略。

- 新增 `electron/services/browserPageView.ts`
- 新增 `electron/services/browserViewPageView.ts`
- 新增 `electron/services/webContentsViewPageView.ts`
- `NativeBrowserViewController` 改为依赖统一 `BrowserPageView` 接口
- 新增 `electron/services/downloadController.ts`
- 下载记录按 profile 归属，可在 inspector 查看和取消
- 新增 `electron/services/permissionController.ts`
- `embeddedSession` 接入 deny-by-default 权限处理

### v1.0.8

完成 tab runtime、崩溃展示和外部协议拦截。

- `BrowserTab` 增加 `canGoBack`、`canGoForward`、`isLoading`、`crashed`、`lastError`
- 主进程导航事件会写回 tab runtime 状态
- 活动 tab 崩溃时，前端显示“标签页已崩溃”和“重新载入”
- 新增 `electron/services/navigationPolicy.ts`
- native browser 层阻止 `mailto:`、`tel:` 等外部协议，并写入导航错误

### v1.0.9

完成证书默认阻止和硬件指纹 runtime 接入第一段。

- 证书错误在主窗口和 native BrowserView 中都默认阻止
- 新增 `electron/services/fingerprintRuntime.ts`
- flat `FingerprintConfig` 会归一化为 `HardwareFingerprintProfile`
- runtime 统一导出 legacy config、UA metadata、Accept-Language、CDP setup commands
- `embeddedFingerprint.buildEmbeddedCdpSetupCommands()` 已改为走 runtime CDP 命令
- `buildAcceptLanguage` 从 `fingerprint/model.ts` 导出，避免重复逻辑

### v1.0.10

完成硬件指纹 runtime 在自测页和 inspector 的展示收口。

- `selfTestPage` 通过 `buildFingerprintRuntimeProfile` 生成硬件 runtime
- 自测 report 新增 `hardwareRuntime`，包含 schema、device class、architecture、UA metadata 和 validation
- 删除自测 HTML 内重复的 UA hints 推导，改为读取 runtime derived values
- `summarizeSelfTestReport` 会统计硬件 runtime validation
- inspector 和自测页会展示硬件 runtime 摘要

## 核心目录

- `src/App.tsx`：主 UI，环境列表、标签栏、地址栏、inspector、自测报告、下载面板、崩溃态。
- `src/styles.css`：终端像素风样式和布局。
- `src/types.ts`：renderer 可见的数据结构与 preload API 类型。
- `src/browserWorkspace.ts`：profile/tab/bookmark/history 的纯函数状态更新。
- `src/embeddedBrowser.ts`：内嵌浏览器前端 helper。
- `src/nativeBrowserView.ts`：BrowserView 坐标与缩放常量。
- `src/fingerprintEditor.ts`：指纹编辑表单和 legacy config 映射。
- `src/deviceProfile.ts`：inspector 设备信息展示行。
- `src/selfTestReport.ts`：自测结果转换为 UI checklist。
- `electron/main.ts`：主进程、IPC、BrowserView 装配、session/proxy/权限/证书/导航策略接入。
- `electron/preload.ts`：安全 IPC API 暴露。
- `electron/services/nativeBrowserViewController.ts`：按 profile/tab 管理原生页面 view 生命周期。
- `electron/services/profileStore.ts`：profile JSON 持久化。
- `electron/services/embeddedSession.ts`：profile session header/proxy/权限配置。
- `electron/services/embeddedFingerprint.ts`：BrowserView preload、CDP 注入和指纹 runtime 接入。
- `electron/services/fingerprint/model.ts`：硬件指纹 v2 数据模型、生成、归一化、校验、legacy 兼容导出。
- `electron/services/fingerprintRuntime.ts`：运行时唯一出口，负责把旧 config 转为可注入的统一 runtime profile。
- `electron/services/selfTestPage.ts`：本地指纹自测页面生成。
- `electron/services/selfTestResult.ts`：native 自测结果提取和摘要。
- `docs/architecture/hardware-fingerprint-spec.md`：硬件指纹规范。
- `docs/architecture/usable-browser-roadmap.md`：可用浏览器路线。

## 当前功能

环境：

- 创建、编辑、复制、删除环境。
- 每个环境使用独立 `persist:profile-${profile.id}` session。
- 每个环境有独立标签、active tab、收藏、历史、下载记录。
- 启动时会把陈旧 running profile reconcile 为 warning。

代理：

- 支持 `http`、`https`、`socks5` 代理 URL。
- 支持代理认证，密码不会明文保存在 profile 数据里。
- 内嵌 BrowserView 打开网页前会按 profile 配置 Electron session proxy。
- 可检查代理连通性。

浏览器内核：

- 当前默认仍是 `BrowserView`，但已经通过 `BrowserPageView` adapter 隔离。
- 按 tab 缓存 view，切换 tab 不会把同一个 view 反复 reload。
- `target="_blank"` / `window.open` 会转为当前 profile 的内部新标签。
- 网页内导航会回写触发 view 对应 tab 的 URL/title/runtime。
- 后退、前进、刷新走 native webContents 命令。
- 外部协议默认阻止，证书错误默认阻止。
- 页面崩溃会写入 tab runtime，并在 UI 显示可 reload 的崩溃态。

下载：

- `DownloadController` 跟踪 profile-scoped 下载。
- inspector 展示下载列表。
- 用户可以取消下载。
- 当前还未做“打开文件/显示到文件夹”的完整系统集成验收。

权限：

- notification、geolocation、camera、microphone、MIDI/HID/serial/Bluetooth 等敏感权限默认拒绝。
- clipboard 保持更接近浏览器默认 user gesture 行为。

指纹：

- 已有硬件指纹 v2 模型，约束 OS、UA、UA-CH、platform、WebGL、CPU、memory、screen。
- 旧 `FingerprintConfig` 仍保留，用于 UI 编辑器和兼容旧数据。
- runtime 现在是统一出口，自测页和 inspector 已能展示这个 runtime profile。

## 重要设计取舍

### BrowserView 原生层

`BrowserView` 不在 React DOM 树里，会盖住 React 弹窗。当前解决方式：

- `src/App.tsx` 通过 `isModalOpen` 判断弹窗打开状态。
- 弹窗打开时调用 `hideNativeBrowserView()`。
- 主进程 `native-browser:hide` 只移除 view，不关闭 webContents。
- 弹窗关闭后再显示当前 active tab 对应 view。

WebContentsView adapter 已经有基础，后续切默认后可重新评估层级问题。

### 网页缩放

用户明确不想页面加载后跳动，也不想整页缩成一屏。当前固定：

```ts
export const FIXED_BROWSER_ZOOM = 1;
```

不要恢复旧的“按完整页面高度缩放”。如需调整，优先做用户可选 zoom 或简单宽度适配。

### 指纹模型

不要在各处重复推导 UA-CH、Accept-Language、WebGL 等字段。后续新增运行时能力应优先走：

- `normalizeFingerprintConfig`
- `buildFingerprintRuntimeProfile`
- `buildFingerprintRuntimeCdpCommands`
- `validateHardwareFingerprintProfile`

目标是所有注入、自测、UI 都读同一份 derived values。

## 现在最应该做的事

### 1. WebContentsView 实机开关

原因：adapter 已有，但默认仍是 BrowserView。Electron 新版本推荐 WebContentsView，真正可用浏览器需要逐步切过去。

建议改动：

- `electron/main.ts`
  - 增加实验开关，例如环境变量或 app setting：`USE_WEB_CONTENTS_VIEW=1`
  - 创建 controller 时根据开关选择 `createWebContentsViewPageView` 或 `createBrowserViewPageView`
- `tests/browserPageViewAdapter.test.ts`
  - 已有基础契约，可补选择逻辑测试
- 手工验收
  - 打开 dev server，测试创建 tab、切 tab、弹窗、下载、自测页、崩溃态

验收标准：

- 默认 BrowserView 不退化
- 开启 WebContentsView 后主路径能打开网页
- modal 层级问题至少不比 BrowserView 更差

### 2. 浏览器级端到端冒烟

原因：目前测试以单元和源码约束为主，缺少真实 Electron 行为冒烟。

建议脚本：

- 启动 Vite dev server
- 启动 Electron
- 创建 profile
- 打开本地自测页
- 打开普通 http 页面
- 点击 target blank 链接，确认进入内部 tab
- 触发下载，确认下载记录出现

可选位置：

- `scripts/smoke-electron.mjs`
- 或扩展现有 `smoke` 相关测试/脚本

## 中期路线

1. WebContentsView 增加实机开关并完成手工冒烟。
2. 下载增加打开文件/显示文件夹/失败原因展示。
3. profile 设置中增加浏览器 zoom 选项，不恢复动态整页缩放。
4. 代理失败和证书失败在 UI 中做更明确的错误入口。
5. 清理旧 `<webview>` fit 相关遗留代码：`src/webviewFit.ts` 和对应测试目前主要是历史保护。
6. 为真实网站登录、Cookie 隔离、localStorage/sessionStorage 隔离补端到端验收。

## 开发规则

- 每个阶段先写测试，再改实现。
- 每个可独立验收的阶段单独提交。
- 不要把指纹模型、自测 UI、WebContentsView 迁移、下载体验一次性混在一个大提交里。
- 不要回退 `NativeBrowserViewController`，它是后续浏览器内核边界。
- 不要把 Electron 对象放进持久化 profile，只保存 id、状态、URL、title、错误信息。
- 不要恢复动态整页缩放。
- 改前端后要检查文字不溢出、不遮挡，inspector 保持可折叠。
- 构建产物 `dist/`、`dist-electron/`、`release/` 已存在，开发时不要把它们当源代码。

## 建议提交拆分

后续从这里继续时，推荐按下面顺序提交：

1. `Add WebContentsView runtime switch`
2. `Add Electron browser smoke test`
3. `Improve download file actions`

## 快速接手命令

```bash
git status --short
git log --oneline -5
npm run typecheck
npm run test
npm run build
```

如果只做当前下一步的硬件 runtime 展示，先跑定向测试：

```bash
npm run test -- tests/selfTestPage.test.ts tests/selfTestReport.test.ts tests/browserChromeUi.test.ts tests/fingerprintRuntime.test.ts
```

## 用户明确要求

- 用中文沟通。
- 可以改前端，但要完整做好。
- 指纹伪装要参考同类开源项目思路，重点是硬件指纹规范化。
- 目标是做成真正能用的浏览器，不只是测试壳。
- 网页要像正常浏览器，不要整页缩成一屏。
- 点击网页新窗口必须进入内部标签页，不要弹独立窗口。
- 标签切换时地址栏要跟着变。
- 新建/编辑弹窗不能被网页挡住。
- 网页不要加载后动态缩放跳动，当前固定 1 倍缩放。
