import { useRef } from "react";
import { Sparkles, HardDrive, Zap, FolderSync } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";
import appIconAbout from "@/assets/app-icon-about.png";

declare const __APP_VERSION__: string;

export function AboutSection() {
  const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0";
  const { devMode, setDevMode } = useSettings();

  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleIconClick = () => {
    clickCountRef.current++;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      const next = !devMode;
      setDevMode(next);
      try { localStorage.setItem("pp_debug_show_button", String(next)); } catch {}
      if (next) {
        toast.success("开发者模式已开启");
      } else {
        toast("开发者模式已关闭");
      }
      return;
    }

    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 2000);
  };

  const features = [
    { icon: <Sparkles className="h-4 w-4" />, title: "智能优化", desc: "AI 驱动的提示词优化引擎" },
    { icon: <HardDrive className="h-4 w-4" />, title: "本地存储", desc: "数据安全存储在本地设备" },
    { icon: <Zap className="h-4 w-4" />, title: "快捷呼出", desc: "全局快捷键随时唤起" },
    { icon: <FolderSync className="h-4 w-4" />, title: "导入导出", desc: "轻松备份与迁移数据" },
  ];

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex flex-col items-center text-center">
        <div className="mt-4 mb-6">
          <img
            src={appIconAbout}
            alt="PromptPilot"
            className="h-24 w-24 mx-auto rounded-2xl shadow-lg cursor-pointer select-none"
            onClick={handleIconClick}
          />
          <h2 className="mt-4 text-xl font-bold text-foreground tracking-tight">
            PromptPilot
          </h2>
          <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-foreground/[0.06] text-xs font-mono text-foreground/50">
            v{APP_VERSION}
          </span>
          <p className="mt-3 text-sm text-foreground/55 max-w-[280px] mx-auto leading-relaxed">
            桌面端 AI 提示词优化与管理工具
          </p>
          {devMode && (
            <div className="mt-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium animate-in fade-in zoom-in-95 duration-200">
              🛠 开发者模式已开启
            </div>
          )}
        </div>

        <div className="w-full max-w-[420px] grid grid-cols-2 gap-2.5 mb-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/20 px-3.5 py-3 text-left"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-foreground/50">
                {f.icon}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground/75">{f.title}</div>
                <div className="text-[10px] text-foreground/40 leading-tight mt-0.5">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="w-12 h-px bg-border/60 mb-5" />

        <div className="space-y-1.5">
          <p className="text-xs text-foreground/45">
            开发者：<span className="font-medium text-foreground/60">natinli</span>
          </p>
          <p className="text-[11px] text-foreground/30">
            © {new Date().getFullYear()} PromptPilot. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
