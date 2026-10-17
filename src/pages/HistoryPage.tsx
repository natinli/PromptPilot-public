import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Clock,
  Loader2,
  Copy,
  Check,
  Search,
  Save,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { SavePromptDialog } from "@/components/prompt/save-prompt-dialog";
import * as api from "@/lib/tauri-api";
import type { OptimizationLog } from "@/lib/tauri-api";
import type { OptimizeMode } from "@/types/ai";
import { cn, markdownToPlainText, parseAiOutput, parseUTCDate } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { useSettings } from "@/hooks/useSettings";

// 优化模式定义（与 OptimizePage 一致）
const modes: { value: OptimizeMode; label: string; emoji: string }[] = [
  { value: "standard", label: "标准", emoji: "⚡" },
  { value: "professional", label: "专业", emoji: "🎯" },
  { value: "concise", label: "精简", emoji: "✂️" },
  { value: "structured", label: "结构化", emoji: "📋" },
  { value: "creative", label: "创意", emoji: "🎨" },
];

const PAGE_SIZE = 50; // 每页加载条数

export default function HistoryPage() {
  const [history, setHistory] = useState<OptimizationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [showModeSelect, setShowModeSelect] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);
  const modeRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 选中的记录
  const [selectedHistory, setSelectedHistory] = useState<OptimizationLog | null>(null);
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const { showAnalysis } = useSettings();

  // 保存到提示词库弹窗
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savingContent, setSavingContent] = useState("");
  const [savingInput, setSavingInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 首次加载（重置）
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setHasMore(true);
    try {
      const logs = await api.getOptimizationLogsPaged(PAGE_SIZE, 0, "success", "raw");
      setHistory(logs);
      if (logs.length < PAGE_SIZE) setHasMore(false);
    } catch (e) {
      console.error("Failed to load history:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载更多
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const logs = await api.getOptimizationLogsPaged(PAGE_SIZE, history.length, "success", "raw");
      if (logs.length < PAGE_SIZE) setHasMore(false);
      if (logs.length > 0) {
        setHistory(prev => [...prev, ...logs]);
      }
    } catch (e) {
      console.error("Failed to load more history:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, history.length]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // 滚动到底部自动加载更多
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      // 距离底部 200px 时触发加载
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
        loadMore();
      }
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [loadMore]);

  // 监听优化完成事件，自动刷新历史记录并选中最新
  useEffect(() => {
    const handleOptimizationCompleted = () => {
      shouldSelectLatest.current = true;
      fetchHistory();
    };
    window.addEventListener("optimization-completed", handleOptimizationCompleted);
    return () => window.removeEventListener("optimization-completed", handleOptimizationCompleted);
  }, [fetchHistory]);

  // 点击外部关闭模式下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setShowModeSelect(false);
      }
    };
    if (showModeSelect) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModeSelect]);

  // 选中记录
  const selectItem = useCallback((item: OptimizationLog) => {
    setSelectedHistory(item);
    setCopiedInput(false);
    setCopiedOutput(false);
  }, []);

  // 过滤和排序（后端已过滤 status=success & mode!=raw）
  const filtered = useMemo(() => {
    let result = [...history];

    if (searchText.trim()) {
      const keyword = searchText.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.input_text.toLowerCase().includes(keyword) ||
          (item.output_text && item.output_text.toLowerCase().includes(keyword))
      );
    }

    if (modeFilter !== "all") {
      result = result.filter((item) => item.mode === modeFilter);
    }

    if (!sortNewest) {
      result.reverse();
    }

    return result;
  }, [history, searchText, modeFilter, sortNewest]);

  // 按日期分组
  const groups = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;

    const groupMap = new Map<string, OptimizationLog[]>();
    const dateKeys: string[] = [];

    for (const item of filtered) {
      const d = parseUTCDate(item.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
        dateKeys.push(key);
      }
      groupMap.get(key)!.push(item);
    }

    return dateKeys.map((key) => {
      let label: string;
      if (key === todayStr) {
        label = "今天";
      } else if (key === yesterdayStr) {
        label = "昨天";
      } else {
        const parts = key.split("-");
        label = `${parseInt(parts[1]) + 1}月${parts[2]}日`;
      }
      return { label, dateKey: key, items: groupMap.get(key)! };
    });
  }, [filtered]);

  // 数据加载完成后自动选中第一条（最新）记录
  // 使用 ref 追踪是否需要选中最新记录
  const shouldSelectLatest = useRef(true);

  useEffect(() => {
    if (!loading && filtered.length > 0 && shouldSelectLatest.current) {
      setSelectedHistory(filtered[0]);
      shouldSelectLatest.current = false;
    }
  }, [loading, filtered]);

  const handleCopyInput = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedInput(true);
    toast.success("已复制");
    setTimeout(() => setCopiedInput(false), 2000);
  };

  const handleCopyOutput = async (text: string) => {
    // 优先复制解析后的最终提示词部分
    const parsed = parseAiOutput(text);
    const plainText = markdownToPlainText(parsed.prompt);
    await navigator.clipboard.writeText(plainText);
    setCopiedOutput(true);
    toast.success("已复制");
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  const handleSave = (content: string, input: string) => {
    setSavingContent(content);
    setSavingInput(input);
    setSaveDialogOpen(true);
  };

  const handleSaveConfirm = async (data: {
    title: string;
    categoryId?: string;
  }) => {
    setIsSaving(true);
    try {
      await api.createPrompt({
        title: data.title,
        content: savingContent,
        rawRequirement: savingInput,
        categoryId: data.categoryId,
        sourceType: "optimized",
      });
      setSaveDialogOpen(false);
      window.dispatchEvent(new CustomEvent("prompts-updated", {
        detail: { source: "history-page", mutatedData: ["prompts", "categories", "stats"] },
      }));
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const getModeInfo = (mode: string) => {
    const m = modes.find((x) => x.value === mode);
    return m ? { emoji: m.emoji, label: m.label } : { emoji: "⚡", label: mode };
  };

  // 统计信息（后端已过滤，直接统计）
  const stats = useMemo(() => {
    const total = history.length;
    const totalTokens = history.reduce(
      (acc, h) => acc + (h.token_in ?? 0) + (h.token_out ?? 0),
      0
    );
    return { total, totalTokens, hasMore };
  }, [history, hasMore]);

  return (
    <div className="flex flex-col pt-6 pb-6 h-full">
      {/* 标题 + 统计 */}
      <div className="shrink-0 space-y-4 mb-5 pl-4">
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground/65">历史记录</h1>
            <div className="flex items-center gap-4 text-xs text-foreground/55">
              <span>共 <strong className="text-foreground/70">{stats.total}{stats.hasMore ? "+" : ""}</strong> 次</span>
              <span>Token {stats.totalTokens > 1000 ? `${(stats.totalTokens / 1000).toFixed(1)}k` : stats.totalTokens}</span>
            </div>
          </div>
        </div>

        {/* 搜索和筛选栏 */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 group/search">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40 transition-colors group-focus-within/search:text-foreground/65" />
            <input
              id="history-search"
              name="history-search"
              type="text"
              aria-label="搜索历史记录"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索输入内容或优化结果..."
              className="w-full rounded-xl border border-border/60 bg-background/80 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/35 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 hover:border-border"
            />
          </div>

          <div className="relative" ref={modeRef}>
            <button
              onClick={() => setShowModeSelect(!showModeSelect)}
              className="flex items-center gap-1.5 rounded-xl border border-border/50 px-3.5 py-2.5 text-sm text-foreground/70 transition-all duration-200 hover:bg-muted hover:border-border hover:shadow-sm cursor-pointer"
            >
              <span>{modeFilter === "all" ? "" : modes.find(m => m.value === modeFilter)?.emoji}</span>
              <span>{modeFilter === "all" ? "全部模式" : modes.find(m => m.value === modeFilter)?.label}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-40" />
            </button>
            {showModeSelect && (
              <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-border bg-background p-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => { setModeFilter("all"); setShowModeSelect(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    modeFilter === "all"
                      ? "bg-foreground/5 font-medium text-foreground"
                      : "text-foreground/60 hover:bg-muted"
                  )}
                >
                  全部模式
                </button>
                {modes.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => { setModeFilter(m.value); setShowModeSelect(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      modeFilter === m.value
                        ? "bg-foreground/5 font-medium text-foreground"
                        : "text-foreground/60 hover:bg-muted"
                    )}
                  >
                    <span>{m.emoji}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setSortNewest(!sortNewest)}
            className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-2 text-sm text-foreground/65 hover:text-foreground/70 hover:bg-muted/30 hover:border-border hover:shadow-sm transition-all duration-200"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortNewest ? "最新" : "最早"}
          </button>
        </div>
      </div>

      {/* ========== 左右分栏主体 ========== */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* ====== 左侧：记录列表 ====== */}
        <div className="shrink-0 w-[387px] rounded-2xl border border-border/50 bg-background/60 overflow-hidden flex flex-col transition-all duration-300 ease-out hover:border-border hover:shadow-lg hover:shadow-black/[0.03] dark:hover:shadow-black/[0.15]">
          <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-5 w-5 animate-spin text-foreground/45" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-foreground/45">
                <Clock className="h-10 w-10 mb-3 text-foreground/15" />
                <p className="text-sm">
                  {history.length === 0 ? "暂无优化记录" : "没有匹配的记录"}
                </p>
                {history.length === 0 && (
                  <Link
                    to="/optimize"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    去优化页面开始
                  </Link>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {groups.map((group) => (
                  <div key={group.dateKey}>
                    {/* 日期分组标题 */}
                    <div className="sticky top-0 z-10 px-4 py-1.5 bg-background/80 dark:bg-card/80 backdrop-blur-md border-b border-border/20 rounded-t-2xl">
                      <span className="text-[11px] font-medium text-foreground/55">
                        {group.label}
                      </span>
                      <span className="text-[11px] text-foreground/40 ml-2">
                        {group.items.length} 条
                      </span>
                    </div>

                    {/* 记录行 */}
                    {group.items.map((item) => {
                      const modeInfo = getModeInfo(item.mode);
                      const isSelected = selectedHistory?.id === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => selectItem(item)}
                          className={cn(
                            "relative w-full text-left flex items-center gap-3 px-4 py-2.5 transition-all duration-250 ease-out group",
                            isSelected
                              ? "bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent shadow-[inset_0_1px_0_0_rgba(var(--primary-rgb,59,130,246),0.08),inset_0_-1px_0_0_rgba(var(--primary-rgb,59,130,246),0.05)]"
                              : "hover:bg-muted/40 hover:translate-x-0.5"
                          )}
                        >
                          {/* 选中指示条 */}
                          <span className={cn(
                            "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-250 ease-out",
                            isSelected
                              ? "h-[60%] bg-primary opacity-100"
                              : "h-0 bg-primary opacity-0 group-hover:h-[30%] group-hover:opacity-40"
                          )} />

                          {/* 输入内容（主体） */}
                          <p className={cn(
                            "text-sm line-clamp-1 flex-1 min-w-0 transition-colors duration-200",
                            isSelected ? "text-foreground font-medium" : "text-foreground/70 group-hover:text-foreground/90"
                          )}>
                            {item.input_text || "📷 图片反推提示词"}
                          </p>

                          {/* 模式标签 */}
                          <span className={cn(
                            "shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors duration-200",
                            isSelected
                              ? "bg-primary/10 text-primary/70"
                              : "bg-foreground/[0.03] text-foreground/60"
                          )}>
                            <span>{modeInfo.emoji}</span>
                          </span>

                          {/* 时间 */}
                          <span className={cn(
                            "shrink-0 text-[11px] tabular-nums transition-colors duration-200",
                            isSelected ? "text-foreground/65" : "text-foreground/45"
                          )}>
                            {parseUTCDate(item.created_at).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {/* 加载更多指示器 */}
                {loadingMore && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
                    <span className="ml-2 text-xs text-foreground/40">加载更多...</span>
                  </div>
                )}
                {!hasMore && filtered.length > 0 && (
                  <div className="text-center py-3 text-xs text-foreground/30">
                    已加载全部记录
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ====== 右侧：详情面板 ====== */}
        <div className="flex-1 min-w-0 rounded-2xl border border-border/50 bg-background/60 flex flex-col overflow-hidden transition-all duration-300 ease-out hover:border-border hover:shadow-lg hover:shadow-black/[0.03] dark:hover:shadow-black/[0.15]">
          {!selectedHistory ? (
            <div className="flex-1 flex flex-col items-center justify-center text-foreground/40">
              <Clock className="h-10 w-10 mb-3 text-foreground/10" />
              <p className="text-sm">选择一条记录查看详情</p>
            </div>
          ) : (
            <>
            {/* 内容区：上下排列（参照图片布局） */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* 原始提示词 —— 紧凑自适应，不超过30% */}
              <div className="shrink-0 max-h-[30%] flex flex-col border-b border-border/40">
                <div className="shrink-0 flex items-center justify-between px-5 py-2 bg-muted/5 rounded-t-2xl">
                  <span className="text-xs font-medium text-foreground/60">📝 原始提示词</span>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[11px] text-foreground/50">
                      {getModeInfo(selectedHistory.mode).emoji} {getModeInfo(selectedHistory.mode).label}
                    </span>
                    <span className="text-foreground/10">·</span>
                    <span className="text-[11px] text-foreground/50 truncate max-w-[160px]" title={selectedHistory.model_name}>
                      {(() => {
                        let name = selectedHistory.model_name || "";
                        if (name.toLowerCase() === "gemini-3.1-flash-lite-preview") name = "gemini-3.1-flash-lite";
                        return name;
                      })()}
                    </span>
                    {(selectedHistory.token_in != null || selectedHistory.token_out != null) && (
                      <>
                        <span className="text-foreground/10">·</span>
                        <span className="text-[11px] text-foreground/45 tabular-nums">
                          {selectedHistory.token_in ?? '-'} in / {selectedHistory.token_out ?? '-'} out
                        </span>
                      </>
                    )}
                    <span className="text-foreground/10">·</span>
                    <span className="text-[11px] text-foreground/45 tabular-nums">
                      {parseUTCDate(selectedHistory.created_at).toLocaleString("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span className="text-foreground/10">|</span>
                    <button
                      onClick={() => handleCopyInput(selectedHistory.input_text)}
                      className="flex items-center gap-1 text-[11px] text-foreground/45 hover:text-foreground/60 transition-colors"
                    >
                      {copiedInput ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedInput ? "已复制" : "复制"}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3">
                  <div className="text-sm leading-relaxed text-foreground/60 whitespace-pre-wrap">
                    {selectedHistory.input_text || "📷 图片反推提示词（仅上传图片，无文字输入）"}
                  </div>
                </div>
              </div>

              {/* 优化后提示词
              {/* 优化后提示词 —— 占据剩余全部空间 */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="shrink-0 flex items-center px-5 py-2 bg-muted/5">
                  <span className="text-xs font-medium text-foreground/60">✨ 优化后提示词</span>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3">
                  {selectedHistory.output_text ? (() => {
                    const parsed = parseAiOutput(selectedHistory.output_text);
                    return (
                      <div className="space-y-3">
                        {/* 优化思路（可折叠，受设置开关控制） */}
                        {showAnalysis && parsed.analysis && (
                          <div className="rounded-xl border border-border/30 bg-muted/20 overflow-hidden transition-all duration-200">
                            <button
                              onClick={() => setAnalysisExpanded(!analysisExpanded)}
                              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-foreground/50 hover:text-foreground/70 transition-colors"
                            >
                              <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${analysisExpanded ? 'rotate-90' : ''}`} />
                              <span>💡 优化思路</span>
                            </button>
                            {analysisExpanded && (
                              <div className="px-4 pb-3 border-t border-border/20">
                                <MarkdownRenderer content={parsed.analysis} className="markdown-body-full text-foreground/60" />
                              </div>
                            )}
                          </div>
                        )}
                        {/* 最终提示词 */}
                        <MarkdownRenderer content={parsed.prompt} className="markdown-body-full" />

                        {/* 复制 & 收藏按钮 —— 内容下方 */}
                        <div className="flex items-center gap-2 pt-3 border-t border-border/30">
                          <button
                            onClick={() => handleCopyOutput(selectedHistory.output_text!)}
                            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/80"
                          >
                            {copiedOutput ? (
                              <Check className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            {copiedOutput ? "已复制" : "复制"}
                          </button>
                          <button
                            onClick={() => {
                              handleSave(selectedHistory.output_text!, selectedHistory.input_text);
                            }}
                            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/80"
                          >
                            <Save className="h-4 w-4" />
                            收藏到提示词库
                          </button>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="text-sm leading-relaxed text-foreground/70">无输出</div>
                  )}
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {/* 保存到提示词库弹窗 */}
      <SavePromptDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveConfirm}
        saving={isSaving}
      />
    </div>
  );
}
