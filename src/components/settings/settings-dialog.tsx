import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useApiKey } from "./api-key-provider";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Settings2, Key, Database, Cloud, Info, Code } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

// 拆分后的子组件
import { GeneralSettings } from "./general-settings";
import { WordCloudSettings } from "./wordcloud-settings";
import { ApiKeySettings } from "./apikey-settings";
import { DataManagement } from "./data-management";
import { DeveloperSettings } from "./developer-settings";
import { AboutSection } from "./about-section";
import { MiniApiKeyDialog } from "./mini-apikey-dialog";

type SettingsTab = "general" | "wordcloud" | "apikey" | "data" | "developer" | "about";

export function SettingsDialog() {
  const { settingsOpen, closeSettings, isConfigured } = useApiKey();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { devMode } = useSettings();
  const { pathname } = useLocation();
  const isMini = pathname.startsWith("/mini");

  // 仅在弹窗打开瞬间决定默认 Tab
  useEffect(() => {
    if (settingsOpen) {
      setActiveTab(isConfigured ? "general" : "apikey");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  // 关闭开发者模式时，如果当前停留在开发者设置 Tab，自动切回常规
  useEffect(() => {
    if (!devMode && activeTab === "developer") {
      setActiveTab("general");
    }
  }, [devMode, activeTab]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeSettings();
    }
  };

  // Mini 模式下：渲染简洁的 API Key 输入弹窗
  if (isMini) {
    return <MiniApiKeyDialog open={settingsOpen} onOpenChange={handleOpenChange} />;
  }

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode; show?: boolean; badge?: boolean }[] = [
    { key: "general", label: "常规", icon: <Settings2 className="h-4 w-4" /> },
    { key: "wordcloud", label: "首页词云", icon: <Cloud className="h-4 w-4" /> },
    { key: "apikey", label: "API 配置", icon: <Key className="h-4 w-4" />, badge: !isConfigured },
    { key: "data", label: "数据管理", icon: <Database className="h-4 w-4" /> },
    { key: "developer", label: "开发者设置", icon: <Code className="h-4 w-4" />, show: devMode },
  ];

  return (
    <Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[870px] p-0 gap-0 overflow-hidden">
        <div className="flex h-[630px]">
          {/* 左侧 Tab 导航 */}
          <div className="w-[160px] shrink-0 border-r border-border/50 bg-muted/30 p-3 flex flex-col gap-1">
            <div className="px-2 py-1.5 mb-2">
              <h3 className="text-sm font-semibold text-foreground/80">设置</h3>
            </div>
            {tabs.map((tab) => {
              if (tab.show === false) return null;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left ${
                    activeTab === tab.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-foreground/55 hover:bg-background/50 hover:text-foreground/70"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.badge && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })}

            <div className="flex-1" />

            <button
              onClick={() => setActiveTab("about")}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left ${
                activeTab === "about"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/55 hover:bg-background/50 hover:text-foreground/70"
              }`}
            >
              <Info className="h-4 w-4" />
              关于
            </button>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 flex flex-col min-w-0">
            {activeTab === "general" && <GeneralSettings />}
            {activeTab === "wordcloud" && <WordCloudSettings />}
            {activeTab === "apikey" && <ApiKeySettings />}
            {activeTab === "data" && <DataManagement />}
            {activeTab === "developer" && <DeveloperSettings />}
            {activeTab === "about" && <AboutSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
