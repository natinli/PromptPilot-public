import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Sun, Moon, Monitor, Sparkles, Minimize2, LogOut, Keyboard, Scissors } from "lucide-react";
import { useSettings, type ThemeMode, type CloseBehavior } from "@/hooks/useSettings";

export function GeneralSettings() {
  const {
    theme, setTheme,
    closeBehavior, setCloseBehavior,
    globalShortcut, setGlobalShortcut,
    showAnalysis, setShowAnalysis,
    micaEnabled, setMicaEnabled,
    micaOpacity, setMicaOpacity,
    viewSplitEnabled, setViewSplitEnabled,
  } = useSettings();
  const [isRecording, setIsRecording] = useState(false);
  const [shortcutSaving, setShortcutSaving] = useState(false);
  const [shortcutSaved, setShortcutSaved] = useState(false);
  const [shortcutError, setShortcutError] = useState("");

  // 主题 + Mica 同步逻辑
  useEffect(() => {
    const root = document.documentElement;
    const syncMicaRust = (shouldDisable: boolean) => {
      import("@tauri-apps/api/core").then(({ invoke }) => {
        invoke("set_mica_dark", { dark: shouldDisable }).catch(() => {});
      }).catch(() => {});
    };
    const syncBackground = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.style.setProperty("background", "oklch(0.25 0.006 270)", "important");
        document.body.style.setProperty("background", "oklch(0.25 0.006 270)", "important");
        document.documentElement.style.setProperty("--shell-bg", "transparent");
      } else if (micaEnabled) {
        const alpha = micaOpacity / 100;
        const bg = alpha <= 0 ? "transparent" : `rgba(255,255,255,${alpha})`;
        document.documentElement.style.setProperty("background", bg, "important");
        document.body.style.setProperty("background", bg, "important");
        document.documentElement.style.setProperty("--shell-bg", "transparent");
      } else {
        document.documentElement.style.setProperty("background", "oklch(1 0 0)", "important");
        document.body.style.setProperty("background", "oklch(1 0 0)", "important");
        document.documentElement.style.setProperty("--shell-bg", "#f3f3f3");
      }
    };
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      syncBackground(isDark);
      syncMicaRust(isDark || !micaEnabled);
    };
    if (theme === "dark") {
      applyTheme(true);
    } else if (theme === "light") {
      applyTheme(false);
    } else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(mq.matches);
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme, micaEnabled, micaOpacity]);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-6">
        <h4 className="text-base font-semibold text-foreground">常规设置</h4>
        <p className="text-sm text-foreground/50 mt-1">自定义应用的外观和行为</p>
      </div>

      {/* 主题切换 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-foreground/50" />
          <Label className="text-sm font-medium text-foreground/70">主题</Label>
        </div>
        <p className="text-xs text-foreground/45 -mt-1">选择应用的外观主题</p>

        <div className="flex items-center gap-2 mt-2">
          {([
            { value: "light" as ThemeMode, label: "浅色", icon: <Sun className="h-3.5 w-3.5" /> },
            { value: "dark" as ThemeMode, label: "深色", icon: <Moon className="h-3.5 w-3.5" /> },
            { value: "system" as ThemeMode, label: "跟随系统", icon: <Monitor className="h-3.5 w-3.5" /> },
          ]).map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-all cursor-pointer ${
                theme === option.value
                  ? "border-foreground/30 bg-foreground/[0.03] shadow-sm"
                  : "border-border/50 hover:border-foreground/15 bg-background"
              }`}
            >
              <span className={theme === option.value ? "text-foreground/70" : "text-foreground/30"}>{option.icon}</span>
              <span className={`text-[13px] font-medium ${
                theme === option.value ? "text-foreground" : "text-foreground/50"
              }`}>{option.label}</span>
            </button>
          ))}
        </div>

        {/* Mica 材质 */}
        {(() => {
          const isDarkNow = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
          return (
            <div className={`mt-3 space-y-2.5 rounded-lg border border-border/30 bg-foreground/[0.01] p-3.5 transition-opacity ${isDarkNow ? "opacity-40 pointer-events-none" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-foreground/40" />
                  <span className="text-xs font-medium text-foreground/60">Mica 材质</span>
                  <span className="text-[10px] text-foreground/35">仅浅色模式</span>
                </div>
                <button
                  onClick={() => setMicaEnabled(!micaEnabled)}
                  className={`relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors cursor-pointer ${
                    micaEnabled ? "bg-primary/80" : "bg-foreground/15"
                  }`}
                >
                  <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                    micaEnabled ? "translate-x-[16px]" : "translate-x-[2px]"
                  }`} />
                </button>
              </div>
              {micaEnabled && !isDarkNow && (
                <div className="flex items-center gap-3 pt-0.5">
                  <Label className="text-[11px] text-foreground/45 shrink-0">透明度</Label>
                  <input
                    type="range"
                    min={0}
                    max={85}
                    step={5}
                    value={micaOpacity}
                    onChange={(e) => setMicaOpacity(Number(e.target.value))}
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer bg-foreground/10 accent-primary/70"
                  />
                  <span className="text-[11px] text-foreground/35 tabular-nums w-8 text-right">{micaOpacity}%</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="h-px bg-border/40 my-6" />

      {/* 优化思路显示 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-foreground/50" />
          <Label className="text-sm font-medium text-foreground/70">优化思路</Label>
        </div>
        <p className="text-xs text-foreground/45 -mt-1">AI 优化结果中是否显示优化思路分析</p>

        <div className="flex items-center gap-2 mt-2">
          {([
            { value: true, label: "显示", desc: "在优化结果中展示可折叠的优化思路" },
            { value: false, label: "隐藏", desc: "只显示最终优化后的提示词" },
          ]).map((option) => (
            <button
              key={String(option.value)}
              onClick={() => setShowAnalysis(option.value)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-all cursor-pointer ${
                showAnalysis === option.value
                  ? "border-foreground/30 bg-foreground/[0.03] shadow-sm"
                  : "border-border/50 hover:border-foreground/15 bg-background"
              }`}
            >
              <span className={`text-[13px] font-medium ${
                showAnalysis === option.value ? "text-foreground" : "text-foreground/50"
              }`}>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-border/40 my-6" />

      {/* 窗口关闭行为 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Minimize2 className="h-4 w-4 text-foreground/50" />
          <Label className="text-sm font-medium text-foreground/70">关闭窗口时</Label>
        </div>
        <p className="text-xs text-foreground/45 -mt-1">点击窗口关闭按钮时的行为</p>

        <div className="flex items-center gap-2 mt-2">
          {([
            { value: "minimize" as CloseBehavior, label: "最小化到托盘", icon: <Minimize2 className="h-3.5 w-3.5" /> },
            { value: "quit" as CloseBehavior, label: "直接退出", icon: <LogOut className="h-3.5 w-3.5" /> },
          ]).map((option) => (
            <button
              key={option.value}
              onClick={() => setCloseBehavior(option.value)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-all cursor-pointer ${
                closeBehavior === option.value
                  ? "border-foreground/30 bg-foreground/[0.03] shadow-sm"
                  : "border-border/50 hover:border-foreground/15 bg-background"
              }`}
            >
              <span className={closeBehavior === option.value ? "text-foreground/70" : "text-foreground/30"}>{option.icon}</span>
              <span className={`text-[13px] font-medium ${
                closeBehavior === option.value ? "text-foreground" : "text-foreground/50"
              }`}>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-border/40 my-6" />

      {/* 全局快捷键 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-foreground/50" />
          <Label className="text-sm font-medium text-foreground/70">全局快捷键</Label>
          <div className="ml-auto">
            <button
              onClick={() => {
                const isCurrentlyEnabled = globalShortcut !== "none";
                if (isCurrentlyEnabled) {
                  setShortcutError("");
                  import("@tauri-apps/api/core").then(({ invoke }) => {
                    return invoke("update_global_shortcut", { shortcut: "none" });
                  }).then(() => {
                    setGlobalShortcut("none");
                  }).catch((err) => {
                    setShortcutError(`禁用快捷键失败：${String(err)}`);
                  });
                } else {
                  setShortcutError("");
                  const defaultShortcut = "Alt+T";
                  import("@tauri-apps/api/core").then(({ invoke }) => {
                    return invoke("update_global_shortcut", { shortcut: defaultShortcut });
                  }).then(() => {
                    setGlobalShortcut(defaultShortcut);
                  }).catch((err) => {
                    setShortcutError(`启用快捷键失败：${String(err)}`);
                  });
                }
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                globalShortcut !== "none"
                  ? "bg-primary/80"
                  : "bg-foreground/15"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${
                  globalShortcut !== "none" ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </button>
          </div>
        </div>
        <p className="text-xs text-foreground/45 -mt-1">在任何应用中快速呼出 PromptPilot</p>

        <div className={`flex items-center gap-3 mt-2 rounded-lg border border-border/50 bg-muted/20 px-4 py-3 transition-opacity ${globalShortcut === "none" ? "opacity-40 pointer-events-none" : ""}`}>
          <span className="text-[13px] text-foreground/60">显示/隐藏窗口</span>
          <div className="ml-auto flex items-center gap-2">
            {globalShortcut === "none" ? (
              <span className="text-[12px] text-foreground/35">已禁用</span>
            ) : isRecording ? (
              <div
                className="flex items-center gap-1.5 rounded-lg border-2 border-dashed border-foreground/30 bg-foreground/[0.03] px-3 py-1.5 animate-pulse"
                tabIndex={0}
                autoFocus
                onKeyDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    setIsRecording(false);
                    import("@tauri-apps/api/core").then(({ invoke }) => {
                      invoke("update_global_shortcut", { shortcut: globalShortcut });
                    });
                    return;
                  }
                  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

                  const parts: string[] = [];
                  if (e.ctrlKey) parts.push("Ctrl");
                  if (e.altKey) parts.push("Alt");
                  if (e.shiftKey) parts.push("Shift");
                  if (e.metaKey) parts.push("Super");

                  if (parts.length === 0) return;

                  let mainKey = e.key;
                  if (mainKey === " ") mainKey = "Space";
                  else if (mainKey.length === 1) mainKey = mainKey.toUpperCase();
                  else if (mainKey.startsWith("Arrow")) mainKey = mainKey.replace("Arrow", "");

                  parts.push(mainKey);
                  const newShortcut = parts.join("+");

                  setIsRecording(false);
                  setShortcutError("");
                  setShortcutSaving(true);

                  import("@tauri-apps/api/core").then(({ invoke }) => {
                    return invoke("update_global_shortcut", { shortcut: newShortcut });
                  }).then(() => {
                    setGlobalShortcut(newShortcut);
                    setShortcutSaved(true);
                    setTimeout(() => setShortcutSaved(false), 2000);
                  }).catch((err) => {
                    setShortcutError(`快捷键设置失败：${String(err)}`);
                  }).finally(() => {
                    setShortcutSaving(false);
                  });
                }}
                onBlur={() => {
                  setIsRecording(false);
                  import("@tauri-apps/api/core").then(({ invoke }) => {
                    invoke("update_global_shortcut", { shortcut: globalShortcut });
                  });
                }}
              >
                <span className="text-[12px] text-foreground/50">请按下新的快捷键组合...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  {globalShortcut.split("+").map((key, i) => (
                    <span key={i} className="contents">
                      {i > 0 && <span className="text-foreground/30 text-xs">+</span>}
                      <kbd className="inline-flex h-6 min-w-[28px] items-center justify-center rounded border border-border/60 bg-background px-1.5 text-[11px] font-mono font-semibold text-foreground/70 shadow-sm">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setShortcutError("");
                    import("@tauri-apps/api/core").then(({ invoke }) => {
                      return invoke("unregister_global_shortcut");
                    }).then(() => {
                      setIsRecording(true);
                    }).catch(() => {
                      setIsRecording(true);
                    });
                  }}
                  className="text-[11px] text-foreground/40 hover:text-foreground/60 transition-colors underline underline-offset-2 cursor-pointer"
                >
                  {shortcutSaving ? "保存中..." : shortcutSaved ? "✓ 已保存" : "修改"}
                </button>
              </>
            )}
          </div>
        </div>
        {shortcutError && (
          <p className="text-[11px] text-rose-500 mt-1">{shortcutError}</p>
        )}
      </div>

      <div className="h-px bg-border/40 my-6" />

      {/* 视图拆分功能开关 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-foreground/50" />
            <Label className="text-sm font-medium text-foreground/70">视图拆分</Label>
          </div>
          <button
            onClick={() => setViewSplitEnabled(!viewSplitEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
              viewSplitEnabled ? "bg-primary/80" : "bg-foreground/15"
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
              viewSplitEnabled ? "translate-x-[18px]" : "translate-x-[3px]"
            }`} />
          </button>
        </div>
        <p className="text-xs text-foreground/45 -mt-1">
          将图片按行列网格拆分为多个区域，方便对比和参考。开启后在侧边栏显示入口。
        </p>
      </div>

    </div>
  );
}
