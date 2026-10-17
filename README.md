# PromptPilot

轻量级 AI 提示词优化与管理工具。将粗糙的需求一键优化为高质量提示词，并提供存储、搜索、分类、复用的完整闭环。

## 功能概览

- **提示词优化**：输入原始需求，AI 自动生成高质量提示词（支持标准/专业/精简/结构化/创意/直通 6 种模式）
- **多 Provider 支持**：Google Gemini + OpenAI 兼容中转 + CodeBuddy，开发者模式下右键快速切换
- **提示词库管理**：保存、编辑、删除、复制、收藏、归档
- **分类管理**：预设 2 大分类（通用、图像） + 自定义分类，按场景组织
- **搜索与筛选**：关键词搜索 + 多维筛选 + 排序 + 拖拽自定义排序
- **使用统计**：复制次数、优化次数、最近使用时间追踪
- **仪表盘**：快速入口 + 最近使用 + 收藏 + 统计摘要
- **桌面端双模式**：Tauri 2 驱动，Mini ↔ Full 自适应屏幕尺寸 SPA 无缝切换，`Alt+T` 全局呼出
- **跨页面数据同步**：提示词保存/收藏后，仪表盘和提示词库自动刷新
- **零闪烁模式切换**：Mini ↔ Full 模式切换时窗口先隐藏再显示，无残影无白屏
- **多模态优化**：支持图片上传，结合图片内容进行提示词优化（PNG/JPG/GIF，最大 20MB，最多 10 张）
- **图片反推提示词**：只上传图片（不输入文字）即可让 AI 反向推理出能复现该图片效果的提示词
- **自定义系统提示词**：在设置中追加自定义指令到每次 AI 优化请求的 system prompt 末尾
- **AI 流式输出**：AI 优化结果逐字生成（类似 ChatGPT 打字机效果），支持 Gemini / OpenAI / CodeBuddy 独立开关
- **沉浸式首页**：SNTH 风格品牌展示 + AI 动态词云 + 实时统计数据
- **暗色模式**：石墨风格暗色主题，支持亮色/暗色/跟随系统切换
- **Windows 11 Mica 材质**：浅色模式下启用 Mica 透明材质效果，窗口背景融合桌面壁纸色调（可在设置中开关和调节透明度）
- **Markdown 渲染**：AI 输出结果支持 Markdown 格式化展示
- **AI 输出分离展示**：优化结果自动分离为「优化思路」（可折叠）和「最终提示词」，复制/保存只操作最终提示词
- **视图拆分**：将包含多个视角的图片按网格拆分为多张独立图片，支持手动行列调节 + AI 智能识别 + 拖拽微调 + 批量保存
- **AI 图片生成**：支持 OpenAI DALL-E / Gemini 双 Provider 生成图片，自动保存到本地，提供图片库管理（默认关闭，需在开发者设置中启用）
- **Debug 面板**：开发模式下按 F8 打开，9 个 Tab 覆盖 IPC/错误/性能/DB 健康检查/词云

## 技术栈

| 层面 | 技术 |
|------|------|
| 构建工具 | Vite 6 |
| 前端框架 | React 19 + TypeScript 5 |
| 路由 | react-router-dom 7 |
| 样式 | Tailwind CSS v4 (CSS-first) + shadcn/ui v4 |
| Toast 通知 | sonner |
| Tooltip | @base-ui/react（毛玻璃风格） |
| 桌面端 | Tauri 2 (Rust 后端) |
| 数据库 | SQLite (rusqlite, Rust 端) |
| AI | Google Gemini + OpenAI 兼容 + CodeBuddy |

## 快速开始

### 1. 安装依赖

```bash
cd prompt-pilot
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 Gemini API Key：

```env
GEMINI_API_KEY="your-actual-key"
```

### 3. 启动开发（Tauri 桌面端）

```bash
# 推荐：Tauri 开发模式（自动启动 Vite dev server + Rust 后端）
cargo tauri dev

# 或仅启动前端（无桌面端功能）
npm run dev
```

Tauri 开发模式下前端运行在 [http://localhost:1420](http://localhost:1420)。

## 常用命令

| 命令 | 说明 |
|------|------|
| `cargo tauri dev` | 启动 Tauri 桌面端开发模式（含 Vite dev server） |
| `npm run dev` | 仅启动 Vite 前端开发服务器 (port 1420) |
| `npm run build` | Vite 前端生产构建（输出到 dist/） |
| `cargo tauri build` | Tauri 完整打包（生成 NSIS 安装包） |
| `npm run lint` | ESLint 检查 |
| `npm test` | 运行全部前端测试（Vitest） |
| `npm run test:watch` | 测试监听模式（开发推荐） |
| `npm run test:coverage` | 测试覆盖率报告 |

## 项目结构

```
prompt-pilot/
├── AGENTS.md                      # AI 协作规则与文档回写门禁
├── DESIGN.md                      # UI 视觉与交互设计唯一真源
├── CHANGELOG.md                   # Unreleased + 已发布版本历史（版本号真源）
├── docs/                          # 分层项目文档，详见 docs/README.md
│   ├── README.md                  # 文档目录与职责地图
│   ├── session-log.md             # 会话记录
│   ├── todo.md                    # 当前待办
│   ├── architecture/              # 架构文档
│   ├── development/              # 开发/构建/测试/排障
│   ├── reference/                # API/数据库/Provider 参考
│   ├── product/                  # 用户指南与快速上手
│   ├── history/                  # 发布历史与旧 PRD
│   ├── reviews/                  # 审查报告与执行结果
│   └── generated/                # HTML/DOCX 派生交付物
├── scripts/
│   ├── release-version.cjs        # CHANGELOG check / prepare 发布流程
│   └── sync-version.cjs           # 版本号同步工具
├── src-tauri/                     # Tauri 2 桌面端 (Rust)
│   ├── src/
│   │   ├── lib.rs                 # 应用入口 + 所有 Tauri Command 注册
│   │   ├── main.rs                # Rust 入口
│   │   ├── tray.rs                # 系统托盘 + 全局快捷键
│   │   ├── window/                # 窗口模块（mode.rs 窗口模式管理）
│   │   ├── db/                    # SQLite 数据库（rusqlite）
│   │   │   ├── connection.rs      # 数据库连接管理
│   │   │   ├── migration.rs       # 数据库迁移
│   │   │   ├── models.rs          # 数据模型
│   │   │   └── queries.rs         # 查询逻辑
│   │   ├── commands/              # Tauri Command 业务逻辑
│   │   │   ├── apikey.rs          # API Key 安全存储（Base64 编码）
│   │   │   ├── categories.rs      # 分类管理
│   │   │   ├── import_export.rs   # 导入导出
│   │   │   ├── images.rs          # AI 图片生成业务逻辑
│   │   │   ├── optimize.rs        # AI 优化
│   │   │   ├── prompts.rs         # 提示词 CRUD
│   │   │   └── stats.rs           # 统计数据
│   │   └── ai/                    # AI 提供者（Gemini + OpenAI 兼容 + CodeBuddy）
│   │       ├── gemini.rs          # Gemini API 调用
│   │       ├── openai_compat.rs   # OpenAI 兼容 Provider
│   │       ├── codebuddy.rs        # CodeBuddy Provider（固定后端端点 + 模型目录）
│   │       ├── image_gen.rs       # AI 图片生成 Provider（OpenAI DALL-E + Gemini）
│   │       ├── system_prompts.rs  # 系统提示词模板
│   │       └── types.rs           # AI 类型定义
│   ├── migrations/                # SQL 迁移脚本（5 个版本）
│   ├── tauri.conf.json            # Tauri 配置（窗口/托盘/打包）
│   └── Cargo.toml                 # Rust 依赖管理
├── src/                           # 前端源码 (Vite + React SPA)
│   ├── App.tsx                    # 根组件（路由 + TooltipProvider + Toaster）
│   ├── main.tsx                   # Vite 入口
│   ├── pages/                     # 页面组件
│   │   ├── DashboardPage.tsx      # 首页（沉浸式品牌展示 + AI 动态词云）
│   │   ├── MiniPage.tsx           # 迷你模式入口（路由分发）
│   │   ├── MiniPageClassic.tsx    # 迷你模式 - 经典风格
│   │   ├── OptimizePage.tsx       # 优化页
│   │   ├── HistoryPage.tsx        # 优化历史记录
│   │   ├── ViewSplitPage.tsx      # 视图拆分页面
│   │   ├── ImageGenPage.tsx       # AI 图片生成页面
│   │   ├── PromptsPage.tsx        # 提示词库入口
│   │   ├── PromptDetailPage.tsx   # 提示词详情
│   │   └── prompts/               # 提示词库子模块（组件 + hooks）
│   ├── hooks/
│   │   ├── useWindowMode.ts       # ★ SPA 模式切换 Hook
│   │   ├── useOptimize.ts         # ★ 提示词优化核心逻辑 Hook
│   │   └── useSettings.ts         # 设置管理 Hook
│   ├── __tests__/                 # Vitest 自动化测试
│   ├── components/
│   │   ├── debug/                 # Debug 面板（F8 打开，9 Tab 可视化调试）
│   │   │   ├── debug-panel.tsx    # Debug 面板组件
│   │   │   ├── debug-store.ts     # Debug 数据存储层
│   │   │   └── error-boundary.tsx # React Error Boundary
│   │   ├── layout/                # 布局组件（LayoutShell + Sidebar + Titlebar）
│   │   ├── prompt/                # 业务组件
│   │   ├── settings/              # 设置组件（拆分为 7 个子模块）
│   │   │   ├── settings-dialog.tsx    # 设置对话框主壳（Tab 导航）
│   │   │   ├── general-settings.tsx   # 常规设置（主题/Mica/快捷键/关闭行为）
│   │   │   ├── apikey-settings.tsx    # API Key 设置（Gemini + OpenAI 兼容 + CodeBuddy）
│   │   │   ├── data-management.tsx    # 数据管理（导入/导出/清除）
│   │   │   ├── about-section.tsx      # 关于面板
│   │   │   └── api-key-provider.tsx   # API Key 管理（安全存储 + 自动迁移）
│   │   ├── ui/                    # shadcn/ui 基础组件（含 tooltip 毛玻璃风格）
│   │   └── providers.tsx          # 全局 Provider
│   ├── lib/
│   │   ├── tauri-api.ts           # Tauri Commands API 前端封装（invokeWithLog 包装）
│   │   ├── utils.ts               # 工具函数（parseAiOutput、markdownToPlainText 等）
│   │   ├── utils/                 # 工具函数子目录
│   │   │   └── error-handler.ts   # 全局错误处理
│   │   └── validations/           # 输入校验（optimize、prompt）
│   ├── styles/
│   │   └── globals.css            # 全局样式 + Tailwind v4 + shadcn 主题
│   └── types/
│       └── ai.ts                  # 优化模式类型定义
├── build.bat                      # 一键打包脚本（版本同步 + Tauri 打包 + 整理产物）
├── dev.bat                        # 一键启动开发环境脚本
├── index.html                     # Vite SPA 入口 HTML
├── vite.config.ts                 # Vite 配置
├── AGENTS.md                      # AI 助手上下文指南
└── package.json
```

## 注意事项

1. **Vite + React SPA**：本项目使用 Vite 构建，react-router-dom 客户端路由，不是 Next.js
2. **Tailwind v4**：无 `tailwind.config.ts`，配置在 `src/styles/globals.css` 的 `@theme` 块中
3. **Tauri 进程**：开发模式下如需重启，先关闭当前 Tauri 窗口
4. **全局快捷键**：`Alt+T` 被 Tauri 注册为全局快捷键（可在设置中自定义或禁用）
5. **路径别名**：`@/*` → `./src/*`
6. **SPA 模式切换**：Mini ↔ Full 采用 SPA 路由跳转（非多窗口），配合 `hide/show` 实现零残影切换
7. **模式切换**：`layout-shell.tsx` 通过 `<Outlet />` 渲染当前路由页面，Mini/Full 切换时通过 Tauri 窗口 hide/show 实现零残影
8. **窗口关闭行为**：点击关闭按钮只是隐藏窗口（最小化到托盘），不是退出应用（可在设置中改为直接退出）
9. **数据库**：SQLite 由 Rust 端 rusqlite 直接管理（无 Prisma），迁移脚本在 `src-tauri/migrations/`
10. **API 调用**：前端通过 `@tauri-apps/api` 的 `invoke()` 调用 Rust Commands（无 HTTP API 路由）
11. **Debug 面板**：开发模式下按 F8 打开，包含 IPC/Rust/测试/错误/状态/事件/AI·性能/DB健康/词云 9 个 Tab
12. **Toast 通知**：使用 `sonner`，`App.tsx` 已挂载 `<Toaster>`，直接 `toast.success()` / `toast.error()` 调用
13. **Tooltip**：使用 `@base-ui/react`（毛玻璃风格），`App.tsx` 已挂载 `<TooltipProvider>`。`absolute` 定位的内嵌按钮用原生 `title`
14. **快捷键**：`Ctrl+N` 跳转优化页、`Ctrl+S` 保存编辑、`Alt+T` 全局呼出/隐藏

## 相关文档

| 文档 | 说明 |
|------|------|
| [`AGENTS.md`](./AGENTS.md) | AI 助手核心规则（精简版） |
| [`DESIGN.md`](./DESIGN.md) | UI 视觉、交互、组件和设计文档回写规则 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 开发中 Unreleased、发布版本历史与版本号真源 |
| [`docs/README.md`](./docs/README.md) | 文档目录、职责矩阵和阅读顺序 |
| [`docs/session-log.md`](./docs/session-log.md) | 会话上下文与协作记录 |
| [`docs/architecture/overview.md`](./docs/architecture/overview.md) | 项目结构、双模式、事件同步、API、Debug |
| [`docs/development/setup.md`](./docs/development/setup.md) | 开发环境搭建 |
| [`docs/development/build.md`](./docs/development/build.md) | 打包与发布 |
| [`docs/development/testing.md`](./docs/development/testing.md) | 测试策略与运行指南 |
| [`docs/development/troubleshooting.md`](./docs/development/troubleshooting.md) | 常见问题排查 |
| [`docs/reference/api.md`](./docs/reference/api.md) | Tauri Commands API |
| [`docs/reference/database.md`](./docs/reference/database.md) | SQLite 数据库 Schema |
| [`docs/reference/ai-integration.md`](./docs/reference/ai-integration.md) | AI Provider 接入 |
| [`docs/product/user-guide.md`](./docs/product/user-guide.md) | 完整产品使用文档 |
| [`docs/product/quick-start.md`](./docs/product/quick-start.md) | 3 分钟快速上手 |
| [`docs/history/prompt-tool-development.md`](./docs/history/prompt-tool-development.md) | 历史开发设计资料 |
| [`docs/reviews/review-log.md`](./docs/reviews/review-log.md) | 代码审查与改进结果 |

## 版本历史

开发中的用户可见变更记录在 [`CHANGELOG.md`](./CHANGELOG.md) 顶部的 `Unreleased` 段；下表只保留已冻结的发布版本。

| 版本 | 日期 | 简介 |
|------|------|------|
| v0.1.0 | 2026-03-20 | 🎉 首个版本，Electron + Next.js 架构 |
| v0.2.0 | 2026-03-20 | 🔄 架构迁移到 Tauri 2 + Vite + React SPA |
| v0.2.1 | 2026-03-23 | 🔐 API Key 安全存储 + 前端测试框架 |
| v0.2.2 | 2026-03-26 | 🖼️ 图片上传多模态优化 + 全局快捷键 |
| v0.2.3 | 2026-03-26 | ⚙️ 设置弹窗改版 + 数据管理 |
| v0.2.4 | 2026-03-26 | 🥔 应用图标更新 + UI 优化 |
| v0.2.5 | 2026-03-26 | 📦 版本号自动化管理 |
| v0.2.6 | 2026-03-27 | 🔧 Debug 面板 + IPC 日志系统 |
| v0.2.7 | 2026-03-27 | 🏠 沉浸式首页 + AI 动态词云 |
| v0.2.8 | 2026-03-27 | 📤 Raw 直通模式 + 词云翻译修复 |
| v0.2.9 | 2026-03-30 | 🌙 开发者模式 + 暗色主题 + 快捷键可配置 |
| v0.3.0 | 2026-04-01 | 💡 AI 输出分离展示 + 优化思路开关 + 图片预览 |
| v0.3.1 | 2026-04-03 | ✨ Windows 11 Mica 材质效果 + 文档全面审查 |
| v0.3.2 | 2026-04-10 | 🔧 版本号统一改造 + 视图拆分功能 |
| v0.3.3 | 2026-04-14 | 🖼️ 视图拆分 + 图片持久化 + 多 Provider 支持 + 开发者设置 |
| v0.3.4 | 2026-04-16 | 🔧 OpenAI 兼容 GPT 新模型修复 |
| **v0.3.5** | **2026-04-22** | **⚡ AI 流式输出 + 自定义系统提示词 + 图片反推提示词 + 启动模式修复** |
| **v0.3.6** | **2026-04-27** | **🎨 AI 图片生成 + Toast 通知系统 + Tooltip 覆盖 + 页面切换动画 + 功能开关控制** |
| **v0.3.7** | **2026-05-14** | **🔧 AI Provider 与设置页体验优化** |
| **v0.3.8** | **2026-05-20** | **🔧 Mini 弹窗、Gemini 模型与流式输出体验优化** |
