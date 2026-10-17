import { Star, Copy, Check } from "lucide-react";
import { cn, markdownToPlainText, parseAiOutput, parseUTCDate } from "@/lib/utils";
import type { Prompt } from "@/lib/tauri-api";
import { useSettings } from "@/hooks/useSettings";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface Props {
  prompt: Prompt;
  categoryName: string | null;
  isCopied: boolean;
  onOpen: (prompt: Prompt) => void;
  onToggleFavorite: (
    e: React.MouseEvent,
    id: string,
    favorite: boolean
  ) => void;
  onCopy: (e: React.MouseEvent, prompt: Prompt) => void;
}

export default function PromptCard({
  prompt,
  categoryName,
  isCopied,
  onOpen,
  onToggleFavorite,
  onCopy,
}: Props) {
  const { showAnalysis } = useSettings();
  const parsed = parseAiOutput(prompt.content);
  // 如果设置为隐藏优化思路，只显示最终提示词；否则显示完整内容
  const previewText = showAnalysis ? prompt.content : parsed.prompt;

  return (
    <div
      onClick={() => onOpen(prompt)}
      className="group relative rounded-2xl border border-border/50 bg-background/60 p-5 cursor-pointer transition-all duration-300 ease-out hover:border-border hover:bg-background/90 hover:shadow-lg hover:shadow-black/[0.03] dark:hover:shadow-black/[0.15] hover:-translate-y-1"
    >
      {/* 顶部装饰线 — 收藏时高亮 */}
      <div
        className={cn(
          "absolute top-0 left-4 right-4 h-px transition-all duration-300",
          prompt.is_favorite
            ? "bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"
            : "bg-gradient-to-r from-transparent via-border/0 to-transparent group-hover:via-primary/20"
        )}
      />

      {/* 标题行 */}
      <div className="flex items-start gap-2 mb-3">
        <h3 className="text-sm font-semibold text-foreground/75 line-clamp-1 flex-1 min-w-0 group-hover:text-foreground transition-colors duration-200">
          {prompt.title}
        </h3>

      </div>

      {/* 内容预览 */}
      <p className="text-xs text-foreground/45 line-clamp-3 leading-[1.7] mb-4 group-hover:text-foreground/55 transition-colors duration-200">
        {markdownToPlainText(previewText)}
      </p>

      {/* 底部：分类 + 日期 */}
      <div className="flex items-center gap-2">
        {categoryName && (
          <span className="inline-flex items-center text-[10px] font-medium text-foreground/45 transition-colors duration-200 group-hover:text-foreground/60">
            {categoryName}
          </span>
        )}
        <span className="text-[10px] text-foreground/35 tabular-nums ml-auto group-hover:text-foreground/45 transition-colors duration-200">
          {prompt.usage_count > 0 && `${prompt.usage_count}次 · `}
          {parseUTCDate(prompt.updated_at).toLocaleDateString("zh-CN", {
            month: "numeric",
            day: "numeric",
          })}
        </span>
      </div>

      {/* 悬停操作按钮组 */}
      <div className="absolute top-3 right-3 flex items-center gap-1 transition-all duration-200">
        {/* 收藏 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) =>
                onToggleFavorite(e, prompt.id, !prompt.is_favorite)
              }
              className={cn(
                "p-1.5 rounded-lg backdrop-blur-sm border transition-all duration-200",
                prompt.is_favorite
                  ? "bg-amber-50/90 border-amber-200/50 text-amber-500 hover:bg-amber-100/90 dark:bg-amber-400/10 dark:border-amber-400/20"
                  : "bg-background/90 border-border/40 text-foreground/40 hover:text-amber-500 hover:border-amber-300/40 hover:bg-amber-50/80 dark:hover:bg-amber-400/10"
              )}
            >
              <Star
                className={cn(
                  "h-3 w-3",
                  prompt.is_favorite && "fill-amber-400 text-amber-400"
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>{prompt.is_favorite ? "取消收藏" : "收藏"}</TooltipContent>
        </Tooltip>

        {/* 复制 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => onCopy(e, prompt)}
              className="p-1.5 rounded-lg bg-background/90 backdrop-blur-sm border border-border/40 text-foreground/40 hover:text-foreground/60 hover:border-foreground/15 hover:bg-muted/60 transition-all duration-200"
            >
              {isCopied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>复制内容</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
