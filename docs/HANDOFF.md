# 指纹浏览器交接文档

更新时间：2026-05-27

## 当前结论

项目已经从“能打开网页的 Electron MVP”推进到一个可继续演进的本地指纹浏览器骨架：

- 内嵌网页原本走 Electron 原生 BrowserView 控制器，按 profile/tab 管理实例；但 2026-05-27 晚上发现 BrowserView 原生层会持续盖住右侧栏，当前工作区有未完成的 DOM `<webview>` 切换实验。
- 多环境、代理、标签、收藏、历史、下载、权限策略、证书策略、外部协议拦截、崩溃状态已经有核心链路。
- 硬件指纹 v2 模型已经落到 `electron/services/fingerprint/model.ts`，并通过 `fingerprintRuntime` 接入 CDP/Accept-Language/UA metadata。
- 还没有完成“真正可用浏览器”的全部收口：WebContentsView 已有实验开关，浏览器级冒烟已覆盖双路径，下载文件定位和用户可调 zoom 已补；网页承载层仍需要重新收口，确保网页只能出现在中间框内。

当前推荐下一步：先修网页承载层越界问题，不要继续在 BrowserView 上打补丁。用户明确要求网页必须单独隔离，只能在中间框中，右侧栏展开/收起时中间网页必须跟着缩放且绝不越界。

## 基本信息

- 工作目录：`/Users/suweichao/项目/指纹浏览器`
- 当前分支：`codex/fingerprint-model-spec`
- 当前版本：`package.json` 为 `1.0.14`
- 最新提交：以 `git log --oneline -1` 为准
- 当前工作区：有未提交实验改动，先看 `git status --short` 和下方“未提交工作区状态”
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

截至 `Release v1.0.14`：

- `npm run test` 通过：37 个测试文件，177 个测试
- `npm run build` 通过
- `npm run typecheck` 通过
- `npm run smoke:browser` 通过，覆盖 BrowserView 与 WebContentsView

2026-05-27 晚上未提交工作区额外跑过：

- `npm run test -- tests/browserChromeUi.test.ts`
- `npm run test -- tests/browserChromeUi.test.ts tests/profileStore.test.ts`
- `npm run test -- tests/browserChromeUi.test.ts tests/nativeBrowserView.test.ts tests/profileStore.test.ts`
- `npm run typecheck`

注意：这些只说明当前代码能编译和部分源码约束通过，不代表网页承载层视觉验收通过。截图验收仍显示 `<webview>` 高度/前台窗口干扰等问题没有完全收口。

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

### v1.0.11

完成 WebContentsView 实验开关。

- 新增 `browserPageViewModeFromEnv`
- 默认仍使用 `BrowserView`
- 设置 `USE_WEB_CONTENTS_VIEW=1` 或 `USE_WEB_CONTENTS_VIEW=true` 时使用 `WebContentsView`
- 主进程会按当前模式选择 `BrowserViewPageHost` 或 `WebContentsViewPageHost`
- native browser 事件处理改为绑定统一 page view adapter，避免 view adapter 与原生 view 对象不一致导致 tab metadata 无法回写

### v1.0.12

完成浏览器级 Electron 冒烟。

- 新增 `scripts/browserSmoke.ts`
- 新增 `npm run smoke:browser`
- 冒烟脚本启动本地 HTTP 服务器，并分别跑默认 BrowserView 与 `USE_WEB_CONTENTS_VIEW=1`
- 主进程新增 `ELECTRON_BROWSER_SMOKE=1` 自测模式
- 冒烟覆盖打开普通页面、target blank 转内部 tab、下载完成、本地自测页打开
- CDP 指纹注入增加超时降级，避免注入卡住导致网页无法打开

### v1.0.13

完成下载文件定位入口。

- `DownloadController` 新增 `showInFolderPath`
- 主进程新增 `downloads:show-in-folder` IPC
- 使用 `shell.showItemInFolder`，不直接执行下载文件
- preload 和 `AppApi` 暴露 `showDownloadInFolder`
- inspector 下载面板在非 progressing 且有保存路径时显示“定位”
- dev mock API 同步补齐该能力

### v1.0.14

完成浏览器 zoom 设置。

- `AppSettings` 增加 `browserZoomFactor`
- `SettingsStore` 规范化 zoom，仅接受 80%、90%、100%、110%、125%
- 默认 zoom 仍为 100%
- 设置弹窗增加“页面缩放”选择
- 主进程在 show、resize、dom-ready、did-stop-loading 和设置更新后应用固定 zoom
- 移除 native BrowserView 的动态宽度适配调用，避免页面加载或切 tab 后覆盖用户 zoom
- 保留 `<webview>` 历史 fit 逻辑，后续可单独清理

## 未提交工作区状态

截至 2026-05-27 晚上用户暂停前，`Release v1.0.14` 之后有未提交改动：

- `electron/main.ts`
  - 增加 `configureChromiumNetworkPrivacy()`，在 app ready 前追加 `disable-ipv6` 和 `force-webrtc-ip-handling-policy=disable_non_proxied_udp`。
  - 增加 native BrowserView bounds 的 `layoutVersion` 过期保护，尝试丢弃旧尺寸同步。
- `src/App.tsx`
  - 删除 profile 前后主动 `hideNativeBrowserView()`，避免旧网页层残留。
  - 右侧 inspector 展开/收起时先 hide native BrowserView，再延迟同步。
  - 尝试默认使用 DOM `<webview>` (`USE_DOM_EMBEDDED_WEBVIEW = true`) 取代原生 BrowserView 显示层。
  - 为 native bounds 增加 `layoutVersion`。
- `src/styles.css`
  - 新增 `.embedded-webview`，尝试让 DOM `<webview>` 绝对定位填满 `.native-browser-frame`。
- `src/types.ts`、`src/nativeBrowserView.ts`
  - native bounds 增加可选 `layoutVersion`。
- `src/webview.d.ts`
  - 为 `<webview>` 类型补 `canGoBack`、`canGoForward`、`goBack`、`goForward`、`reload`。
- `electron/services/profileStore.ts`
  - 对损坏的 `profiles.json` 做恢复：备份为 `profiles.json.corrupt` 并返回空 profiles。
- `tests/browserChromeUi.test.ts`、`tests/profileStore.test.ts`
  - 增加对应源码约束测试。

这些改动是“处理中状态”，不要直接当完成版提交。尤其是 DOM `<webview>` 切换只是应急方向，明天需要做完整验收和清理：

- 导航状态、地址栏、tab URL/title 回写可能还不完整。
- `target="_blank"` 内部标签、下载、权限、证书、指纹注入、自测页采集都要重新确认。
- DOM `<webview>` 不会自动复用现有 `NativeBrowserViewController` 的所有事件链路。
- 需要决定是彻底切 DOM `<webview>`，还是改用真正可裁剪/层级可控的 WebContentsView 方案。

## 核心目录

- `src/App.tsx`：主 UI，环境列表、标签栏、地址栏、inspector、自测报告、下载面板、崩溃态。
- `src/styles.css`：终端像素风样式和布局。
- `src/types.ts`：renderer 可见的数据结构与 preload API 类型。
- `src/browserWorkspace.ts`：profile/tab/bookmark/history 的纯函数状态更新。
- `src/embeddedBrowser.ts`：内嵌浏览器前端 helper。
- `src/nativeBrowserView.ts`：BrowserView 坐标转换。
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

- 当前默认仍是 `BrowserView`，但已经通过 `BrowserPageView` adapter 隔离，并可用 `USE_WEB_CONTENTS_VIEW=1` 切到实验 `WebContentsView`。
- 按 tab 缓存 view，切换 tab 不会把同一个 view 反复 reload。
- `target="_blank"` / `window.open` 会转为当前 profile 的内部新标签。
- 网页内导航会回写触发 view 对应 tab 的 URL/title/runtime。
- 后退、前进、刷新走 native webContents 命令。
- 外部协议默认阻止，证书错误默认阻止。
- 页面崩溃会写入 tab runtime，并在 UI 显示可 reload 的崩溃态。
- 设置里可选固定页面 zoom：80%、90%、100%、110%、125%，默认 100%，切 tab 和 reload 后保持一致。

下载：

- `DownloadController` 跟踪 profile-scoped 下载。
- inspector 展示下载列表。
- 用户可以取消下载。
- 下载完成或失败后可以通过“定位”在文件夹中显示保存路径。

权限：

- notification、geolocation、camera、microphone、MIDI/HID/serial/Bluetooth 等敏感权限默认拒绝。
- clipboard 保持更接近浏览器默认 user gesture 行为。

指纹：

- 已有硬件指纹 v2 模型，约束 OS、UA、UA-CH、platform、WebGL、CPU、memory、screen。
- 旧 `FingerprintConfig` 仍保留，用于 UI 编辑器和兼容旧数据。
- runtime 现在是统一出口，自测页和 inspector 已能展示这个 runtime profile。

## 重要设计取舍

### BrowserView 原生层

`BrowserView` 不在 React DOM 树里，会盖住 React 弹窗和右侧栏。此前解决方式：

- `src/App.tsx` 通过 `isModalOpen` 判断弹窗打开状态。
- 弹窗打开时调用 `hideNativeBrowserView()`。
- 主进程 `native-browser:hide` 只移除 view，不关闭 webContents。
- 弹窗关闭后再显示当前 active tab 对应 view。

WebContentsView adapter 已经有基础，后续切默认后可重新评估层级问题。

2026-05-27 晚上实测结论：

- BrowserView 即使按中间框计算 bounds，也可能在 inspector 展开后继续保持旧宽度，盖住右侧栏。
- 前端定时同步、hide 后 show、bounds 内缩、layoutVersion 丢旧请求都不足以从根上满足“只能在中间框内”的要求。
- 用户已经明确不接受继续在 BrowserView 上修边界。
- 下一步应把网页承载层作为 P0：网页必须作为中间框受控内容存在，框变大/变小，网页跟着变，不能覆盖任何 React UI。

### 网页缩放

用户明确不想页面加载后跳动，也不想整页缩成一屏。当前通过 app setting 保存固定 zoom，允许值为 80%、90%、100%、110%、125%，默认 100%。

不要恢复旧的“按完整页面高度缩放”。native BrowserView 也不要再按内容宽度动态改 zoom，否则会覆盖用户设置。

### 指纹模型

不要在各处重复推导 UA-CH、Accept-Language、WebGL 等字段。后续新增运行时能力应优先走：

- `normalizeFingerprintConfig`
- `buildFingerprintRuntimeProfile`
- `buildFingerprintRuntimeCdpCommands`
- `validateHardwareFingerprintProfile`

目标是所有注入、自测、UI 都读同一份 derived values。

## 现在最应该做的事

### 1. 网页承载层隔离重构

原因：用户明确要求“中间网页单独隔离，只在中间框中，框放大缩小都必须不越界”。当前 BrowserView 原生层不能可靠满足这个要求。

建议改动：

- `src/App.tsx`
  - 先把未完成 DOM `<webview>` 方向整理干净，确保 `.native-browser-frame` 是唯一承载容器。
  - 网页元素必须 `position: absolute; inset: 0` 或等价方式填满中间框，并受 `overflow: hidden` 限制。
  - inspector 展开/收起、窗口 resize、左侧栏内容变化时网页必须随中间框变化。
  - 如果 DOM `<webview>` 保留为默认，需要补齐 tab URL/title 回写、内部新标签、下载、权限和指纹注入链路。
- `electron/main.ts`
  - 若保留 BrowserView 作为备用，默认不要显示 BrowserView。
  - 若切 WebContentsView，必须验证它不会盖住 React inspector。
- `tests/browserChromeUi.test.ts`
  - 更新测试语义：不再只断言 BrowserView bounds，而是断言默认网页承载层在 DOM 中、受 `.native-browser-frame` 裁剪。
  - 保留“弹窗/删除 profile 时隐藏原生层”的兼容测试。
- 新增或扩展浏览器冒烟/截图验收
  - 用 Playwright/截图或 Electron smoke 覆盖右侧栏展开前后。
  - 验收截图必须能看出网页没有覆盖 inspector。
  - 同一页面在右侧栏展开/收起后，网页宽度必须明显变化。

验收标准：

- 网页不覆盖右侧栏、顶部栏、左侧栏、底部状态栏、弹窗。
- 右侧栏从 34px 展开到 260px 时，中间网页宽度跟着缩小。
- 右侧栏收起时，中间网页宽度跟着放大。
- 新建/编辑/设置/代理弹窗出现时网页层不可盖住弹窗。
- 删除用户后旧网页不会残留。
- 至少手动截图验收一次，并把结果写进交接或提交说明。

### 2. 下载失败原因展示

原因：下载已经能跟踪、取消、定位文件，但失败、被中断、保存路径不可用时，用户需要更明确的原因和下一步动作。

建议改动：

- `electron/services/downloadController.ts`
  - 规范 interrupted/cancelled/completed 的错误字段。
  - 记录 Electron download item 的错误状态和路径不可用原因。
- `src/App.tsx`
  - 下载面板展示失败原因。
  - “定位”不可用时给出清晰 UI 状态，不只写全局 error。
- `tests/downloadController.test.ts`
  - 覆盖 interrupted error、缺失保存路径、取消后的展示数据。
- `tests/browserChromeUi.test.ts`
  - 补下载失败原因 UI 约束。

验收标准：

- interrupted 下载能展示错误原因。
- 用户取消和真实中断能区分。
- 保存路径不可用时 UI 不显示无效定位动作。

## 中期路线

1. 网页承载层隔离重构，解决右侧栏遮挡和中间框缩放。
2. 下载增加失败原因展示。
3. 代理失败和证书失败在 UI 中做更明确的错误入口。
4. 清理旧 `<webview>` fit 相关遗留代码：`src/webviewFit.ts` 和对应测试目前主要是历史保护。
5. 为真实网站登录、Cookie 隔离、localStorage/sessionStorage 隔离补端到端验收。
6. 评估何时把 `USE_WEB_CONTENTS_VIEW=1` 从实验开关推进到默认路径，或完全移除 BrowserView 默认路径。

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

1. `Fix embedded browser containment`
2. `Recover corrupted profile database`
3. `Disable IPv6 for embedded Chromium`
4. `Show download failure reasons`

## 快速接手命令

```bash
git status --short
git log --oneline -5
npm run typecheck
npm run test
npm run build
```

如果只做当前 P0 网页承载层，先跑相关测试：

```bash
npm run test -- tests/browserChromeUi.test.ts tests/profileStore.test.ts
npm run typecheck
```

启动前如果 5173 被旧 Vite 占用：

```bash
lsof -ti tcp:5173
kill <pid>
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
- 网页必须只显示在中间框内；右侧栏展开/收起时，中间网页必须跟随中间框缩放，不能越界。
- 不要继续让用户反复验证 BrowserView 边界问题；先由开发者截图确认。
