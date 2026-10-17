import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Cloud, Trash2, Check } from "lucide-react";
import { useSettings, type WordCloudMode } from "@/hooks/useSettings";

export function WordCloudSettings() {
  const { wordCloudMode, setWordCloudMode } = useSettings();
  const [cacheCleared, setCacheCleared] = useState(false);

  const handleClearWordCloudCache = () => {
    try {
      localStorage.removeItem("pp_dashboard_ai_words_v2");
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-6">
        <h4 className="text-base font-semibold text-foreground">首页词云</h4>
        <p className="text-sm text-foreground/50 mt-1">自定义首页右侧词云的数据来源和缓存</p>
      </div>

      {/* 词云模式 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-foreground/50" />
          <Label className="text-sm font-medium text-foreground/70">数据来源</Label>
        </div>
        <p className="text-xs text-foreground/45 -mt-1">选择首页右侧词云的数据来源</p>

        <div className="space-y-2 mt-2">
          {([
            { value: "smart" as WordCloudMode, label: "智能混合", desc: "AI 翻译你的提示词关键词 + 预设词补齐（推荐）" },
            { value: "user-only" as WordCloudMode, label: "仅我的提示词", desc: "只从你的提示词中提取和翻译关键词，不混入预设词" },
            { value: "preset-only" as WordCloudMode, label: "仅预设词汇", desc: "只使用 AI/Prompt 相关的预设英文词汇" },
          ]).map((option) => (
            <button
              key={option.value}
              onClick={() => setWordCloudMode(option.value)}
              className={`w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-all cursor-pointer ${
                wordCloudMode === option.value
                  ? "border-foreground/30 bg-foreground/[0.02] shadow-sm"
                  : "border-border/50 hover:border-foreground/15 bg-background"
              }`}
            >
              <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                wordCloudMode === option.value
                  ? "border-primary/80"
                  : "border-foreground/20"
              }`}>
                {wordCloudMode === option.value && (
                  <div className="h-2 w-2 rounded-full bg-primary/80" />
                )}
              </div>
              <div className="min-w-0">
                <div className={`text-[13px] font-semibold ${
                  wordCloudMode === option.value ? "text-foreground" : "text-foreground/55"
                }`}>{option.label}</div>
                <div className="text-[11px] text-foreground/40 mt-0.5 leading-relaxed">{option.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-border/40 my-6" />

      {/* 缓存管理 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-foreground/50" />
          <Label className="text-sm font-medium text-foreground/70">缓存管理</Label>
        </div>
        <p className="text-xs text-foreground/45 -mt-1">清除词云缓存后，下次打开首页将重新生成词云</p>

        {wordCloudMode === "preset-only" ? (
          <p className="text-xs text-foreground/35 mt-2">当前使用「仅预设词汇」模式，无需清除缓存</p>
        ) : (
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearWordCloudCache}
              disabled={cacheCleared}
              className="text-xs h-7 px-3"
            >
              {cacheCleared ? (
                <>
                  <Check className="h-3 w-3 mr-1.5" />
                  已清除
                </>
              ) : (
                <>
                  <Trash2 className="h-3 w-3 mr-1.5" />
                  清除词云缓存
                </>
              )}
            </Button>
            <span className="text-[11px] text-foreground/35">下次打开首页将重新生成词云</span>
          </div>
        )}
      </div>
    </div>
  );
}
