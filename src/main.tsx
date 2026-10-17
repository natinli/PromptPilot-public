import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
import { clearPersistedImages } from "@/hooks/useOptimize";

// 图片仅在当前会话中有效：关闭应用后清除，刷新时保留。
// 利用 sessionStorage 区分"刷新"和"关闭应用"——sessionStorage 在刷新时保留，关闭时自动清除。
const SESSION_ALIVE_KEY = "promptpilot_session_alive";
if (!sessionStorage.getItem(SESSION_ALIVE_KEY)) {
  // 全新启动（关闭应用后重新打开），清除上次残留的图片数据
  clearPersistedImages();
}
// 标记当前会话存活（刷新时 sessionStorage 保留，关闭应用时自动清除）
sessionStorage.setItem(SESSION_ALIVE_KEY, "1");

// 主题初始化：在 React 渲染前同步应用主题，避免白色闪烁
{
  const SETTINGS_KEY = "promptpilot_settings";
  let isDark = false;
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    const theme = stored ? JSON.parse(stored).theme : "light";
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      isDark = true;
    } else if (theme === "system") {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
        isDark = true;
      }
    }
  } catch {
    // 默认亮色模式，无需添加 dark 类
  }
  // Mica 材质初始化：
  // 1. 读取用户设置中的 micaEnabled
  // 2. 如果用户从未设置过（首次安装），查询 Rust 端 is_mica_supported
  //    - Win11 → 自动开启 Mica 并写入 localStorage
  //    - Win10 → 保持关闭
  // 3. 根据最终状态同步 Rust 端 Mica 明暗
  let micaEnabled = false; // 默认关闭
  let userHasSetMica = false; // 用户是否手动设置过
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 检查用户是否明确设置过 micaEnabled（区分 undefined 和 false）
      if ("micaEnabled" in parsed) {
        micaEnabled = parsed.micaEnabled === true;
        userHasSetMica = true;
      }
    }
  } catch {}

  // 同步 Mica 状态到 Rust 端和 CSS 变量
  const applyMicaState = (enabled: boolean) => {
    const shouldDisable = isDark || !enabled;
    if (!isDark && !enabled) {
      document.documentElement.style.setProperty("--shell-bg", "#f3f3f3");
    } else {
      document.documentElement.style.setProperty("--shell-bg", "transparent");
    }
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("set_mica_dark", { dark: shouldDisable }).catch(() => {});
    }).catch(() => {});
  };

  if (userHasSetMica) {
    // 用户已手动设置过，直接使用其选择
    applyMicaState(micaEnabled);
  } else {
    // 首次安装，先按关闭状态渲染（避免闪烁），然后异步查询 Win11
    applyMicaState(false);
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<boolean>("is_mica_supported").then((supported) => {
        if (supported) {
          // Win11：自动开启 Mica，写入 localStorage
          try {
            const stored = localStorage.getItem(SETTINGS_KEY);
            const settings = stored ? JSON.parse(stored) : {};
            settings.micaEnabled = true;
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          } catch {}
          // 立即应用 Mica 效果
          applyMicaState(true);
          // 更新背景透明度（必须用 setProperty + important 覆盖 index.html 注入的 !important 样式）
          if (!isDark) {
            const alpha = 25 / 100; // 默认 micaOpacity=25
            const bg = `rgba(255,255,255,${alpha})`;
            document.documentElement.style.setProperty("background", bg, "important");
            document.body.style.setProperty("background", bg, "important");
          }
        } else {
          // Win10：写入 micaEnabled=false，后续不再查询
          try {
            const stored = localStorage.getItem(SETTINGS_KEY);
            const settings = stored ? JSON.parse(stored) : {};
            settings.micaEnabled = false;
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          } catch {}
        }
      }).catch(() => {});
    }).catch(() => {});
  }
}

// 生产环境禁用右键菜单（去掉浏览器默认的"检查"、"刷新"等调试选项）
// 开发者模式 + Debug 工具开启时不禁用，以便使用 DevTools
if (import.meta.env.PROD) {
  const contextMenuHandler = (e: MouseEvent) => {
    // 检查开发者模式与 Debug 工具是否开启（从 localStorage 实时读取）
    try {
      const stored = localStorage.getItem("promptpilot_settings");
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.devMode && settings.developerDebugToolsEnabled) return;
      }
    } catch {}
    e.preventDefault();
  };
  document.addEventListener("contextmenu", contextMenuHandler);
}

// 窗口 resize 期间禁用所有 CSS transition，防止无边框窗口拖拽调整大小时
// 元素因 transition 产生抖动/残影（Tauri WebView2 在 Windows 上的已知渲染问题）
{
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const html = document.documentElement;
  window.addEventListener("resize", () => {
    if (!html.classList.contains("is-resizing")) {
      html.classList.add("is-resizing");
    }
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      html.classList.remove("is-resizing");
      resizeTimer = null;
    }, 150);
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
