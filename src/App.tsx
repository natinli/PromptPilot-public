import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import React, { useEffect, useRef, useState } from "react";
import { LayoutShell } from "./components/layout/layout-shell";
import { ClientProviders } from "./components/providers";
import MiniPage from "./pages/MiniPage";
import DashboardPage from "./pages/DashboardPage";
import PromptsPage from "./pages/PromptsPage";
import PromptDetailPage from "./pages/PromptDetailPage";
import OptimizePage from "./pages/OptimizePage";
import HistoryPage from "./pages/HistoryPage";
import ViewSplitPage from "./pages/ViewSplitPage";
import ImageGenPage from "./pages/ImageGenPage";
import { useSettings } from "./hooks/useSettings";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Debug 面板 —— 开发模式或开发者模式下加载
import { DebugPanel } from "./components/debug/debug-panel";
import { pushRouteChange, pushPerfLog, getIsRecording } from "./components/debug/debug-store";
import { DebugErrorBoundary } from "./components/debug/error-boundary";


/**
 * 路由变化日志记录器（仅开发模式）
 * 监听路由变化并推送到 Debug 面板的「事件」Tab
 */
function RouteLogger() {
  const location = useLocation();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      pushRouteChange(prevPath.current, location.pathname, "navigate");
      prevPath.current = location.pathname;
    }
  }, [location.pathname]);

  return null;
}

/**
 * 性能录制包裹器（仅开发模式）
 * 使用 React.Profiler 捕获组件渲染性能数据
 */
function ProfiledRoute({ name, children }: { name: string; children: React.ReactNode }) {
  if (!import.meta.env.DEV) return <>{children}</>;

  const onRender = (
    id: string,
    phase: string,
    actualDuration: number,
    baseDuration: number,
  ) => {
    if (getIsRecording()) {
      pushPerfLog({
        componentName: id,
        phase,
        actualDuration,
        baseDuration,
      });
    }
  };

  return (
    <React.Profiler id={name} onRender={onRender}>
      {children}
    </React.Profiler>
  );
}

/**
 * 初始重定向组件
 * 启动时从 Rust 端查询上次保存的窗口模式，跳转到对应路由
 * - Full 模式 → /dashboard
 * - Mini 模式 → /mini（默认）
 */
function InitialRedirect() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    import("@/lib/tauri-api").then(({ getWindowMode }) => {
      getWindowMode().then((mode) => {
        navigate(mode === "full" ? "/dashboard" : "/mini", { replace: true });
      }).catch(() => {
        navigate("/mini", { replace: true });
      }).finally(() => setReady(true));
    }).catch(() => {
      navigate("/mini", { replace: true });
      setReady(true);
    });
  }, [navigate]);

  // 查询期间不渲染任何内容，避免闪过错误布局
  if (!ready) return null;
  return null;
}

/**
 * 图片生成路由守卫
 * 未在开发者设置中开启图片生成功能时，重定向到首页
 */
function ImageGenGuard() {
  const { imageGenEnabled } = useSettings();
  if (!imageGenEnabled) {
    return <Navigate to="/dashboard" replace />;
  }
  return <ProfiledRoute name="ImageGenPage"><ImageGenPage /></ProfiledRoute>;
}

/**
 * 应用根组件
 * LayoutShell 内含侧边栏 + 标题栏 + Outlet
 * Mini 模式由 LayoutShell 内部判断，直接渲染 Outlet
 */
export default function App() {
  return (
    <ClientProviders>
      <TooltipProvider delay={300}>
      <DebugErrorBoundary>
        <Routes>
          {/* LayoutShell 包裹所有路由，内部判断 Mini/Full 布局 */}
          <Route element={<LayoutShell />}>
            {/* MINI 模式 */}
            <Route path="/mini" element={<ProfiledRoute name="MiniPage"><MiniPage /></ProfiledRoute>} />

            {/* FULL 模式路由 */}
            <Route path="/dashboard" element={<ProfiledRoute name="DashboardPage"><DashboardPage /></ProfiledRoute>} />
            <Route path="/prompts" element={<ProfiledRoute name="PromptsPage"><PromptsPage /></ProfiledRoute>} />
            <Route path="/prompts/:id" element={<ProfiledRoute name="PromptDetailPage"><PromptDetailPage /></ProfiledRoute>} />
            <Route path="/optimize" element={<ProfiledRoute name="OptimizePage"><OptimizePage /></ProfiledRoute>} />
            <Route path="/history" element={<ProfiledRoute name="HistoryPage"><HistoryPage /></ProfiledRoute>} />
            <Route path="/view-split" element={<ProfiledRoute name="ViewSplitPage"><ViewSplitPage /></ProfiledRoute>} />
            <Route path="/image-gen" element={<ImageGenGuard />} />

            {/* 默认：强制进入 Mini 模式 */}
            <Route path="*" element={<InitialRedirect />} />
          </Route>
        </Routes>
      </DebugErrorBoundary>

      {/* Debug 面板 —— 开发模式或开发者模式下显示，按 F8 打开/关闭 */}
      <DebugLayer />

      {/* 全局 Toast 通知 */}
      <AppToaster />
      </TooltipProvider>
    </ClientProviders>
  );
}

/**
 * Debug 层：开发模式或开发者模式下渲染 RouteLogger + DebugPanel
 * 抽成子组件以便使用 useSettings hook（必须在 ClientProviders 内部）
 */
function DebugLayer() {
  const { devMode, developerDebugToolsEnabled } = useSettings();
  const enabled = import.meta.env.DEV || (devMode && developerDebugToolsEnabled);

  if (!enabled) return null;

  return (
    <>
      <RouteLogger />
      <DebugPanel />
    </>
  );
}

/** 全局 Toast 通知组件 — 根据当前主题自动切换 */
function AppToaster() {
  const { theme } = useSettings();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return <Toaster theme={isDark ? "dark" : "light"} position="bottom-center" duration={2000} />;
}
