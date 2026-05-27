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

最近一次验证：

- `npm run typecheck` 通过
- `npm run test` 通过，32 个测试文件，152 个测试
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

- 后退/前进/刷新已接到当前 tab 的 BrowserView webContents。
- 地址栏有编辑中状态，用户输入时不会被 profile refresh 覆盖。
- 多 tab 已有独立 BrowserView 缓存，但仍未迁移到 Electron 推荐的 `WebContentsView`。
- 当前弹窗仍需要 hide/show 原生 BrowserView，WebContentsView 迁移后再处理层级。
- 当前指纹伪装主要是 JS/content layer，距离商业级深度伪装还有差距。
- 打包目录 `release/` 和构建目录 `dist/`、`dist-electron/` 已存在，开发时注意不要误以为它们是源代码。

## 后续建议

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
- 网页不要加载后动态缩放跳动，当前用固定 0.9 缩放。
