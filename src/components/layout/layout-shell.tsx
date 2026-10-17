import { useLocation, Link, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Home,
  Sparkles,
  Library,
  Clock,
  Minimize2,
  Settings,
  Scissors,
  ImageIcon,
} from "lucide-react";
import { DesktopTitlebar } from "@/components/layout/titlebar";
import { useWindowMode } from "@/hooks/useWindowMode";
import { useApiKey } from "@/components/settings/api-key-provider";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

// 页面缓存（Keep-Alive）：避免切换路由时组件卸载重建导致闪烁
import DashboardPage from "@/pages/DashboardPage";
import PromptsPage from "@/pages/PromptsPage";
import OptimizePage from "@/pages/OptimizePage";
import HistoryPage from "@/pages/HistoryPage";
import ViewSplitPage from "@/pages/ViewSplitPage";
import ImageGenPage from "@/pages/ImageGenPage";

// 需要缓存的页面路径列表
const CACHED_PAGES = [
  { path: "/dashboard", component: DashboardPage },
  { path: "/prompts", component: PromptsPage },
  { path: "/optimize", component: OptimizePage },
  { path: "/history", component: HistoryPage },
  { path: "/view-split", component: ViewSplitPage },
  { path: "/image-gen", component: ImageGenPage },
] as const;

const navItems = [
  { href: "/dashboard", label: "首页", icon: Home },
  { href: "/optimize", label: "优化", icon: Sparkles },
  { href: "/image-gen", label: "图片生成", icon: ImageIcon },
  { href: "/history", label: "历史记录", icon: Clock },
  { href: "/prompts", label: "提示词库", icon: Library },
  { href: "/view-split", label: "视图拆分", icon: Scissors },
];

export function LayoutShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMini = pathname.startsWith("/mini");
  const { switchToMini, isTauri } = useWindowMode();
  const { openSettings, isConfigured, initialized: apiKeyInitialized } = useApiKey();
  const { viewSplitEnabled, imageGenEnabled } = useSettings();

  // Ctrl+N 快捷键：跳转到优化页面（新建提示词）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        navigate("/optimize");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  // Keep-Alive 缓存管理：LRU 淘汰策略，最多保留 MAX_CACHED 个已访问页面
  // 使用有序数组记录访问顺序（最近访问的在最前面），超出上限时淘汰尾部（最久未访问的）
  const MAX_CACHED = 3;
  const [visitedOrder, setVisitedOrder] = useState<string[]>([]);
  const visitedPaths = new Set(visitedOrder);

  // 根据 viewSplitEnabled / imageGenEnabled 过滤实际可渲染的缓存页面
  const activeCachedPages = CACHED_PAGES.filter(
    (p) => (p.path !== "/view-split" || viewSplitEnabled) &&
           (p.path !== "/image-gen" || imageGenEnabled)
  );

  // 当前路径是否命中缓存页面
  const isCachedPage = activeCachedPages.some((p) => pathname === p.path);

  // 页面切换过渡动画：pathname 变化时给激活页面重新触发 fade-in
  const pageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevPathRef = useRef(pathname);
  const setPageRef = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(path, el);
    else pageRefs.current.delete(path);
  }, []);

  useEffect(() => {
    if (prevPathRef.current !== pathname && isCachedPage) {
      const el = pageRefs.current.get(pathname);
      if (el) {
        el.style.animation = "none";
        // force reflow
        void el.offsetHeight;
        el.style.animation = "";
      }
    }
    prevPathRef.current = pathname;
  }, [pathname, isCachedPage]);

  useEffect(() => {
    if (isCachedPage) {
      setVisitedOrder((prev) => {
        // 将当前路径移到最前面（LRU：最近访问的优先保留）
        const filtered = prev.filter((p) => p !== pathname);
        const next = [pathname, ...filtered];
        // 超出上限时淘汰尾部（最久未访问的页面）
        if (next.length > MAX_CACHED) {
          return next.slice(0, MAX_CACHED);
        }
        return next;
      });
    }
  }, [pathname, isCachedPage]);

  // Mini mode 或未知路由（如初始路径 /）：只渲染 Outlet，不渲染 full 布局
  // 未知路由时 Outlet 会渲染 InitialRedirect → Navigate to "/mini"，完成重定向
  // 这样避免了在重定向前闪过一帧 full 布局（侧边栏 + 标题栏）
  const isKnownFullRoute = activeCachedPages.some((p) => pathname === p.path) || pathname.startsWith("/prompts/");
  if (isMini || !isKnownFullRoute) {
    return <Outlet />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden dark:bg-background" style={{ background: 'var(--shell-bg, #f3f3f3)' }}>
      {/* Tauri 自定义标题栏 */}
      {isTauri && <DesktopTitlebar />}
      {/* 标题栏占位（因为标题栏现在是 fixed 定位） */}
      {isTauri && <div className="h-9 shrink-0" />}

      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 — 独立背景色，无右侧边框 */}
        <aside className="w-56 shrink-0 flex flex-col">
          {/* 导航菜单 */}
          <nav className="flex-1 px-3 py-2 space-y-0.5">
            {navItems
              .filter((item) => (item.href !== "/view-split" || viewSplitEnabled) &&
                                (item.href !== "/image-gen" || imageGenEnabled))
              .map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-foreground/5 text-foreground"
                      : "text-foreground/60 hover:bg-foreground/[0.03] hover:text-foreground/70"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4",
                      isActive
                        ? "text-foreground/70"
                        : "text-foreground/45"
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* 底部：设置 + 切换到 Mini 版 */}
          <div className="px-3 py-3 space-y-0.5">
            <button
              onClick={openSettings}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-foreground/50 transition-colors hover:bg-foreground/[0.03] hover:text-foreground/60"
            >
              <Settings className="h-3.5 w-3.5" />
              设置
              {apiKeyInitialized && !isConfigured && (
                <span className="ml-auto h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>
            {isTauri && (
              <button
                onClick={switchToMini}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-foreground/50 transition-colors hover:bg-foreground/[0.03] hover:text-foreground/60"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                切换到 Mini 版
              </button>
            )}
          </div>
        </aside>

        {/* 主内容区 — 左上圆角形成弧形分界线 */}
        <main className="flex-1 min-h-0 flex flex-col bg-white dark:bg-[oklch(0.29_0.008_270)] rounded-tl-2xl shadow-sm dark:shadow-none overflow-hidden">
          {/* 缓存页面：用 CSS display 控制显隐，避免组件卸载重建 */}
          {activeCachedPages.map(({ path, component: PageComponent }) => {
            const isActive = pathname === path;
            const visited = visitedPaths.has(path);
            if (!visited) return null;
            return (
              <div
                key={path}
                ref={(el) => setPageRef(path, el)}
                className="flex-1 min-h-0 overflow-y-auto px-6 pb-6"
                style={{
                  display: isActive ? "flex" : "none",
                  flexDirection: "column",
                  animation: isActive ? "page-fade-in 120ms ease-out" : "none",
                }}
              >
                <PageComponent />
              </div>
            );
          })}
          {/* 非缓存页面（如 /prompts/:id）仍走 Outlet */}
          {!isCachedPage && <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6"><Outlet /></div>}
        </main>
      </div>
    </div>
  );
}
