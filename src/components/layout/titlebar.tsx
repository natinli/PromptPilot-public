

import { Minus, Square, X } from "lucide-react";
import * as api from "@/lib/tauri-api";
import { useSettings } from "@/hooks/useSettings";
import appIcon from "@/assets/app-icon-about.png";

/**
 * DesktopTitlebar - 完整版模式下的自定义标题栏
 *
 * 包含：Logo、窗口控制按钮（最小化/最大化/关闭）
 * Tauri 环境始终渲染
 */
export function DesktopTitlebar() {
  const { devMode, developerDebugToolsEnabled, closeBehavior } = useSettings();
  const debugEnabled = import.meta.env.DEV || (devMode && developerDebugToolsEnabled);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex h-9 items-center justify-between dark:bg-background select-none"
      data-tauri-drag-region
    >
      {/* 左侧：Logo（开发模式或开发者模式下双击土豆图标打开 Debug 面板） */}
      <div className="flex items-center gap-1 px-4" data-tauri-drag-region>
        <img
          src={appIcon}
          alt="logo"
          className="h-[22px] w-[22px]"
          draggable={false}
          onDoubleClick={debugEnabled ? () => window.dispatchEvent(new Event("toggle-debug-panel")) : undefined}
        />
        <span className="text-xs font-semibold text-foreground/70 tracking-wide" data-tauri-drag-region>
          PromptPilot
        </span>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="flex items-center">
        {/* 最小化 */}
        <button
          onClick={() => api.windowMinimize()}
          className="flex h-9 w-10 items-center justify-center text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/70"
          title="最小化"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        {/* 最大化/还原 */}
        <button
          onClick={() => api.windowMaximize()}
          className="flex h-9 w-10 items-center justify-center text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/70"
          title="最大化"
        >
          <Square className="h-3 w-3" />
        </button>

        {/* 关闭（隐藏到托盘） */}
        <button
          onClick={() => api.windowClose(closeBehavior)}
          className="flex h-9 w-10 items-center justify-center text-foreground/55 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
          title="关闭"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
