import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
  Copy,
  Check,
  RotateCcw,
  ChevronDown,
  Save,
  Clock,
  ImagePlus,
  X,
  ArrowUp,
  ChevronRight,
} from "lucide-react";
import { SavePromptDialog } from "@/components/prompt/save-prompt-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { baseModes, rawMode, languages, geminiModelList } from "@/constants/optimize-modes";
import { useOptimize } from "@/hooks/useOptimize";
import * as api from "@/lib/tauri-api";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { OptimizationLog } from "@/lib/tauri-api";
import { markdownToPlainText, parseAiOutput, parseUTCDate } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettings";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";





export default function OptimizePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/35" />
      </div>
    }>
      <OptimizePageInner />
    </Suspense>
  );
}

/** 共享持久化 key — 与 MiniPageClassic 使用同一个 key 实现状态互通 */
const PERSIST_KEY = "mini";

function OptimizePageInner() {
  const [searchParams] = useSearchParams();
  const { showAnalysis, aiProvider, setAiProvider, openaiModel, setOpenaiModel, codebuddyModel, setCodebuddyModel, devMode, geminiModel, setGeminiModel, developerRawModeEnabled, developerGeminiModelSelectorEnabled } = useSettings();

  // 开发者模式下显示直通模式
  const modes = devMode && developerRawModeEnabled ? [...baseModes, rawMode] : baseModes;

  // 加载历史记录（前置声明，供 onOptimizeSuccess 回调使用）
  const fetchHistoryRef = useRef<() => void>(() => {});

  // ★ P0-3: 复用 useOptimize Hook，消除重复的状态管理和业务逻辑
  const {
    input: requirement, setInput: setRequirement,
    mode, setMode,
    language, setLanguage,
    isOptimizing,
    result: resultText,
    parsedResult,
    fullResult,
    error,
    copied,
    handleOptimize,
    handleCopy,
    handleKeyDown,
    isConfigured: _isConfigured,
    images,
    addImages,
    removeImage,
    clearImages,
    imageError,
  } = useOptimize({
    defaultOutputFormat: "markdown",
    persistKey: PERSIST_KEY,
    onOptimizeSuccess: () => {
      setAnalysisExpanded(false);
      fetchHistoryRef.current();
    },
  });

  // URL 参数 ?q= 覆盖 input
  const queryParam = searchParams.get("q");
  useEffect(() => {
    if (queryParam && queryParam.trim()) {
      setRequirement(queryParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dialogCopied, setDialogCopied] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);

  const [showModeSelect, setShowModeSelect] = useState(false);
  const [showLangSelect, setShowLangSelect] = useState(false);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [providerMenuPos, setProviderMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const modeRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const providerMenuRef = useRef<HTMLDivElement>(null);

  // 从 localStorage 读取已缓存的模型列表（设置页获取后存储）
  const [cachedModelList, setCachedModelList] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("pp_openai_model_list");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [cachedCodebuddyModelList, setCachedCodebuddyModelList] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("pp_codebuddy_model_list");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  // 监听模型列表变化（storage 事件处理跨窗口，自定义事件处理同窗口）
  useEffect(() => {
    const handler = () => {
      try {
        const stored = localStorage.getItem("pp_openai_model_list");
        setCachedModelList(stored ? JSON.parse(stored) : []);
        const codebuddyStored = localStorage.getItem("pp_codebuddy_model_list");
        setCachedCodebuddyModelList(codebuddyStored ? JSON.parse(codebuddyStored) : []);
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", handler);
    window.addEventListener("pp_openai_model_list_updated", handler);
    window.addEventListener("pp_codebuddy_model_list_updated", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("pp_openai_model_list_updated", handler);
      window.removeEventListener("pp_codebuddy_model_list_updated", handler);
    };
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [contentToSave, setContentToSave] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 历史优化记录
  const [history, setHistory] = useState<OptimizationLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState<OptimizationLog | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const historyScrollRef = useRef<HTMLDivElement>(null);

  // 图片悬停预览
  const [hoveredImage, setHoveredImage] = useState<{ url: string; x: number; y: number } | null>(null);

  // 加载历史记录（首次）
  const SIDEBAR_PAGE_SIZE = 30;
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryHasMore(true);
    try {
      const logs = await api.getOptimizationLogsPaged(SIDEBAR_PAGE_SIZE, 0, "success", undefined);
      setHistory(logs);
      if (logs.length < SIDEBAR_PAGE_SIZE) setHistoryHasMore(false);
    } catch (e) {
      console.error("Failed to load history:", e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // 绑定 ref 供 onOptimizeSuccess 回调使用
  useEffect(() => {
    fetchHistoryRef.current = fetchHistory;
  }, [fetchHistory]);

  // 加载更多历史记录
  const loadMoreHistory = useCallback(async () => {
    if (historyLoadingMore || !historyHasMore) return;
    setHistoryLoadingMore(true);
    try {
      const logs = await api.getOptimizationLogsPaged(SIDEBAR_PAGE_SIZE, history.length, "success", undefined);
      if (logs.length < SIDEBAR_PAGE_SIZE) setHistoryHasMore(false);
      if (logs.length > 0) {
        setHistory(prev => [...prev, ...logs]);
      }
    } catch (e) {
      console.error("Failed to load more history:", e);
    } finally {
      setHistoryLoadingMore(false);
    }
  }, [historyLoadingMore, historyHasMore, history.length]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // 侧边栏滚动加载更多
  useEffect(() => {
    const el = historyScrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
        loadMoreHistory();
      }
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [loadMoreHistory]);

  // 按日期分组
  const groupHistoryByDate = useCallback((items: OptimizationLog[]) => {
    const groups: { label: string; dateKey: string; items: OptimizationLog[] }[] = [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;

    const groupMap = new Map<string, OptimizationLog[]>();
    const dateKeys: string[] = [];

    for (const item of items) {
      const d = parseUTCDate(item.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
        dateKeys.push(key);
      }
      groupMap.get(key)!.push(item);
    }

    for (const key of dateKeys) {
      let label: string;
      if (key === todayStr) {
        label = "今天";
      } else if (key === yesterdayStr) {
        label = "昨天";
      } else {
        const parts = key.split("-");
        label = `${parseInt(parts[1]) + 1}/${parts[2]}`;
      }
      groups.push({ label, dateKey: key, items: groupMap.get(key)! });
    }
    return groups;
  }, []);

  const historyGroups = groupHistoryByDate(history);

  // 自动触发优化（URL 参数 ?q=）
  const autoOptimizeTriggered = useRef(false);
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q.trim() && !autoOptimizeTriggered.current) {
      autoOptimizeTriggered.current = true;
      handleOptimize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) setShowModeSelect(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLangSelect(false);
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setShowModelSelect(false);
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)) setShowProviderMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentMode = modes.find((m) => m.value === mode)!;
  const currentLang = languages.find((l) => l.value === language)!;

  // ★ P0-3: handleOptimize / handleCopy / handleKeyDown 已由 useOptimize Hook 提供

  const handleSave = (content: string) => {
    setContentToSave(content);
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
        content: contentToSave,
        rawRequirement: requirement,
        optimizedByModel: fullResult?.model,
        categoryId: data.categoryId,
        sourceType: "optimized",
      });
      setSaveDialogOpen(false);
      setSaveError(null);
      window.dispatchEvent(new CustomEvent("prompts-updated", {
        detail: { source: "optimize-page", mutatedData: ["prompts", "categories", "stats"] },
      }));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex gap-6 pt-6 h-full overflow-hidden">
    {/* 主区域 */}
<div ref={mainScrollRef} className="flex-1 min-w-0 overflow-y-auto pr-1 pb-6">
      <div className="space-y-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground/65 pl-4">提示词优化</h1>
        </div>
      </div>

      <div className="space-y-6">
      {/* Input area - 支持拖拽图片 */}
      <div
        className={`rounded-2xl border bg-background/60 overflow-visible transition-all duration-300 ease-out ${
          isDragOver
            ? "border-foreground/40 bg-foreground/5 shadow-lg shadow-black/[0.03]"
            : "border-border/50 hover:border-border hover:shadow-lg hover:shadow-black/[0.03] dark:hover:shadow-black/[0.15]"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isOptimizing) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          if (isOptimizing) return;
          const files = e.dataTransfer.files;
          if (files.length > 0) await addImages(files);
        }}
      >
        <textarea
          ref={textareaRef}
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const imageFiles: File[] = [];
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.startsWith("image/")) {
                const file = items[i].getAsFile();
                if (file) imageFiles.push(file);
              }
            }
            if (imageFiles.length > 0) {
              e.preventDefault();
              addImages(imageFiles);
            }
          }}
          placeholder={isDragOver ? "松开鼠标即可上传图片..." : "在这里输入你想要优化的内容，支持粘贴/拖拽图片……"}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/65 focus:outline-none min-h-[140px]"
          disabled={isOptimizing}
        />

        {/* 图片预览 - 内嵌在输入框卡片内 */}
        {images.length > 0 && (
          <div className="flex items-start gap-2 flex-wrap px-4 pb-2">
            {images.map((img, index) => (
              <div
                key={index}
                className="relative group rounded-lg overflow-hidden border border-border/50 bg-muted/20"
                style={{ width: 60, height: 60 }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredImage({ url: img.previewUrl, x: rect.left, y: rect.bottom + 8 });
                }}
                onMouseLeave={() => setHoveredImage(null)}
              >
                <img
                  src={img.previewUrl}
                  alt={img.fileName}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); setHoveredImage(null); removeImage(index); }}
                  className="absolute top-0 right-0 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  title={`移除 ${img.fileName}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length > 1 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={() => { setHoveredImage(null); clearImages(); }}
                      disabled={isOptimizing}
                      className="flex h-5 w-5 items-center justify-center self-center rounded-full bg-foreground/8 text-foreground/40 hover:bg-rose-500/15 hover:text-rose-500 transition-colors"
                    />
                  }
                >
                  <X className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>清除所有图片</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
        {imageError && (
          <p className="text-[11px] text-rose-500 px-4 pb-2">{imageError}</p>
        )}

        {/* 图片悬停预览大图浮层 */}
        {hoveredImage && createPortal(
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              left: hoveredImage.x,
              top: hoveredImage.y,
            }}
          >
            <div className="rounded-xl border border-border/60 bg-background shadow-2xl overflow-hidden">
              <img
                src={hoveredImage.url}
                alt="预览"
                className="max-w-[320px] max-h-[320px] object-contain"
              />
            </div>
          </div>,
          document.body
        )}

        {/* 底栏：图片按钮 + 字数统计 */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              id="optimize-image-upload"
              name="optimize-image-upload"
              aria-label="上传图片"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={async (e) => {
                if (e.target.files) await addImages(e.target.files);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="hidden"
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => !isOptimizing && fileInputRef.current?.click()}
                    disabled={isOptimizing}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-foreground/45 transition-colors hover:bg-muted hover:text-foreground/60 disabled:opacity-40"
                  />
                }
              >
                <ImagePlus className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>上传参考图片（最多10张）</TooltipContent>
            </Tooltip>
            {images.length > 0 && (
              <span className="text-[10px] text-foreground/40">{images.length}/10</span>
            )}
          </div>

          {/* Mode dropdown */}
          <div className="relative" ref={modeRef}>
            <button
              onClick={() => { setShowModeSelect(!showModeSelect); setShowLangSelect(false); }}
              className="flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/70"
            >
              <span style={{ fontSize: '1em' }}>{currentMode.emoji}</span>
              <span>{currentMode.label}</span>
              <ChevronDown className="h-3 w-3 opacity-40" />
            </button>
            {showModeSelect && (
<div className="absolute left-0 top-full z-50 mt-1 w-[110px] rounded-lg border border-border bg-background p-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                {modes.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => { setMode(m.value); setShowModeSelect(false); }}
                    className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                      mode === m.value ? "bg-foreground/5 font-medium text-foreground" : "text-foreground/60 hover:bg-muted"
                    }`}
                  >
                    <span className="text-sm">{m.emoji}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Language dropdown */}
          <div className="relative" ref={langRef}>
            <button
              onClick={() => { setShowLangSelect(!showLangSelect); setShowModeSelect(false); }}
              className="flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/70"
            >
              <span>{currentLang.label}</span>
              <ChevronDown className="h-3 w-3 opacity-40" />
            </button>
            {showLangSelect && (
<div className="absolute left-0 top-full z-50 mt-1 w-[86px] rounded-lg border border-border bg-background p-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                {languages.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => { setLanguage(l.value); setShowLangSelect(false); }}
                    className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                      language === l.value ? "bg-foreground/5 font-medium text-foreground" : "text-foreground/60 hover:bg-muted"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 右键 Provider 切换菜单（开发者模式下可用） */}
          {showProviderMenu && devMode && (
            <div
              ref={providerMenuRef}
className="fixed z-[100] w-[130px] rounded-lg border border-border bg-background p-1 shadow-lg animate-in fade-in zoom-in-95 duration-150"
              style={{ left: providerMenuPos.x, top: providerMenuPos.y }}
            >
              <div className="px-2.5 py-1.5 text-[10px] font-medium text-foreground/40 uppercase tracking-wider">切换 Provider</div>
              <button
                onClick={() => { setAiProvider("gemini"); setShowProviderMenu(false); }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors ${
                  aiProvider === "gemini" ? "bg-foreground/5 font-medium text-foreground" : "text-foreground/60 hover:bg-muted"
                }`}
              >
                <span>🔮</span>
                <span>Gemini</span>
                {aiProvider === "gemini" && <span className="ml-auto text-[10px] text-foreground/40">✓</span>}
              </button>
              <button
                onClick={() => { setAiProvider("openai_compat"); setShowProviderMenu(false); }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors ${
                  aiProvider === "openai_compat" ? "bg-foreground/5 font-medium text-foreground" : "text-foreground/60 hover:bg-muted"
                }`}
              >
                <span>🔗</span>
<span>OpenAI</span>
                {aiProvider === "openai_compat" && <span className="ml-auto text-[10px] text-foreground/40">✓</span>}
              </button>
              <button
                onClick={() => { setAiProvider("codebuddy"); setShowProviderMenu(false); }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors ${
                  aiProvider === "codebuddy" ? "bg-foreground/5 font-medium text-foreground" : "text-foreground/60 hover:bg-muted"
                }`}
              >
                <span>⚡</span>
                <span>CodeBuddy</span>
                {aiProvider === "codebuddy" && <span className="ml-auto text-[10px] text-foreground/40">✓</span>}
              </button>
            </div>
          )}

          {/* Model selector — CodeBuddy/OpenAI，或 Gemini 开发者模式下显示 */}
          {(aiProvider === "openai_compat" || aiProvider === "codebuddy" || (aiProvider === "gemini" && devMode && developerGeminiModelSelectorEnabled)) && (
            <div className="relative" ref={modelRef}>
              <button
                onClick={() => { setShowModelSelect(!showModelSelect); setShowModeSelect(false); setShowLangSelect(false); }}
                onContextMenu={(e) => {
                  if (!devMode) return;
                  e.preventDefault();
                  setShowProviderMenu(true);
                  setProviderMenuPos({ x: e.clientX, y: e.clientY });
                  setShowModelSelect(false);
                  setShowModeSelect(false);
                  setShowLangSelect(false);
                }}
                className="flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/70"
              >
                <span className="max-w-[120px] truncate">
                  {aiProvider === "gemini"
                    ? (geminiModel || "默认模型")
                    : aiProvider === "openai_compat"
                      ? (openaiModel || "选择模型")
                      : (codebuddyModel || "选择模型")}
                </span>
                <ChevronDown className="h-3 w-3 opacity-40" />
              </button>
              {showModelSelect && (
                <div className="absolute left-0 top-full z-50 mt-1 w-[220px] overflow-hidden rounded-lg border border-border bg-background shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="max-h-[400px] overflow-y-auto p-1">
                  {aiProvider === "gemini" ? (
                    <>
                      {/* 默认模型选项 */}
                      <button
                        onClick={() => { setGeminiModel(""); setShowModelSelect(false); }}
                        className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
                          !geminiModel ? "bg-foreground/5 text-foreground/70" : "text-foreground/60 hover:bg-muted"
                        }`}
                      >
                        <span className="truncate">默认模型</span>
                      </button>
                      {geminiModelList.map((m) => (
                        <button
                          key={m}
                          onClick={() => { setGeminiModel(m); setShowModelSelect(false); }}
                          className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
                            geminiModel === m ? "bg-foreground/5 text-foreground/70" : "text-foreground/60 hover:bg-muted"
                          }`}
                        >
                          <span className="truncate">{m}</span>
                        </button>
                      ))}
                    </>
                  ) : (aiProvider === "openai_compat" ? cachedModelList : cachedCodebuddyModelList).length > 0 ? (
                    (aiProvider === "openai_compat" ? cachedModelList : cachedCodebuddyModelList).map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          if (aiProvider === "openai_compat") setOpenaiModel(m);
                          else setCodebuddyModel(m);
                          setShowModelSelect(false);
                        }}
                        className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
                          (aiProvider === "openai_compat" ? openaiModel : codebuddyModel) === m
                            ? "bg-foreground/5 text-foreground/70"
                            : "text-foreground/60 hover:bg-muted"
                        }`}
                      >
                        <span className="truncate">{m}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-2.5 py-3 text-xs text-foreground/40 text-center">
                      请先在设置中获取模型列表
                    </div>
                  )}
                </div>
                </div>
              )}
            </div>
          )}

          <div className="flex-1" />

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={handleOptimize}
                  disabled={isOptimizing || (!requirement.trim() && images.length === 0)}
                  className="flex items-center justify-center h-8 w-8 rounded-full border border-foreground/25 bg-muted text-foreground transition-all duration-200 hover:bg-foreground hover:text-background hover:border-foreground disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-muted disabled:hover:text-foreground disabled:hover:border-foreground/25"
                />
              }
            >
              {isOptimizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </TooltipTrigger>
            <TooltipContent>{isOptimizing ? "优化中..." : "发送优化"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Error */}
      {(error || saveError) && (
        <div className="rounded-lg bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">{error || saveError}</div>
      )}

      {/* Result */}
      {resultText && parsedResult && (() => {
        return (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/60">优化结果</span>
            {fullResult?.model && (
              <span className="text-sm text-foreground/40">
                {fullResult.model}
                {fullResult.usage?.input_tokens != null && (
                  <> · {fullResult.usage.input_tokens} in / {fullResult.usage.output_tokens} out</>
                )}
              </span>
            )}
          </div>

          {/* 优化思路（可折叠，受设置开关控制） */}
          {showAnalysis && parsedResult.analysis && (
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
                  <MarkdownRenderer content={parsedResult.analysis} className="markdown-body-full text-foreground/60" />
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-border/50 bg-background/60 p-5 transition-all duration-300 ease-out hover:border-border hover:shadow-lg hover:shadow-black/[0.03] dark:hover:shadow-black/[0.15]">
            <MarkdownRenderer content={parsedResult.prompt} className="markdown-body-full" />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "已复制" : "复制"}
            </button>



            <button
              onClick={() => handleSave(resultText || parsedResult.prompt)}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Save className="h-4 w-4" />
              保存到提示词库
            </button>

            <div className="flex-1" />

            <button
              onClick={handleOptimize}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
              重新优化
            </button>
          </div>
        </div>
        );
      })()}

      <SavePromptDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveConfirm}
        saving={isSaving}
      />
      </div>
    </div>

    {/* 右侧面板：历史优化记录 */}
    <div className="hidden lg:flex w-72 shrink-0 flex-col rounded-2xl border border-border/50 bg-background/60 transition-all duration-300 ease-out hover:border-border hover:shadow-lg hover:shadow-black/[0.03] dark:hover:shadow-black/[0.15]" style={{ maxHeight: '700px', marginTop: '5%' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Clock className="h-4 w-4 text-foreground/55" />
        <span className="text-xs font-medium text-foreground/60">历史优化记录</span>
        {history.length > 0 && (
          <span className="text-[10px] text-foreground/35 ml-auto">{history.length} 条</span>
        )}
      </div>
      <div ref={historyScrollRef} className="flex-1 overflow-y-auto px-2 min-h-0">
        {historyLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-foreground/35" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-foreground/35">
            <Clock className="h-6 w-6 mb-2 text-foreground/15" />
            <p className="text-xs">暂无优化记录</p>
          </div>
        ) : (
          <>
            {historyGroups.map((group) => (
              <div key={group.dateKey}>
                <div className="sticky top-0 z-10 flex items-center gap-2 pt-2 pb-1.5 -mx-2 px-4 bg-background justify-center">
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="text-[10px] font-medium text-foreground/50 shrink-0">{group.label}</span>
                  <div className="h-px flex-1 bg-border/50" />
                </div>
                {group.items.map((item) => {
                  const modeInfo = modes.find((m) => m.value === item.mode);
                  const timeStr = parseUTCDate(item.created_at).toLocaleString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={item.id}
                    className="rounded-lg px-3 py-2.5 mb-1 transition-all duration-200 hover:bg-muted/50 hover:translate-x-0.5 cursor-pointer select-none group"
                      onClick={() => {
                        setSelectedHistory(item);
                        setHistoryDialogOpen(true);
                      }}
                      title="点击查看详情"
                    >
                      <p className="truncate text-xs font-medium text-foreground/70 group-hover:text-foreground/90">
                        {item.input_text.length > 50 ? item.input_text.slice(0, 50) + "..." : item.input_text}
                      </p>
                      <p className="truncate text-[10px] text-foreground/45 mt-0.5">
                        {item.output_text ? (() => { const p = markdownToPlainText(parseAiOutput(item.output_text).prompt); return p.length > 80 ? p.slice(0, 80) + "..." : p; })() : ""}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-foreground/45">
                          {modeInfo ? `${modeInfo.emoji} ${modeInfo.label}` : item.mode}
                        </span>
                        <span className="text-[10px] text-foreground/35">·</span>
                        <span className="text-[10px] text-foreground/45">{timeStr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {/* 加载更多指示器 */}
            {historyLoadingMore && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/35" />
                <span className="ml-1.5 text-[10px] text-foreground/35">加载更多...</span>
              </div>
            )}
            {!historyHasMore && history.length > 0 && (
              <div className="text-center py-2 text-[10px] text-foreground/25">
                已加载全部
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {/* 历史记录详情弹窗 */}
    <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
      <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>优化记录详情</DialogTitle>
          {selectedHistory && (
            <DialogDescription>
              {(() => {
                const m = modes.find((x) => x.value === selectedHistory.mode);
                return m ? `${m.emoji} ${m.label}模式` : selectedHistory.mode;
              })()}
              {" · "}
              {selectedHistory.model_name}
              {selectedHistory.token_in != null && (
                <> · {selectedHistory.token_in} in / {selectedHistory.token_out} out</>
              )}
              {" · "}
              {parseUTCDate(selectedHistory.created_at).toLocaleString("zh-CN")}
            </DialogDescription>
          )}
        </DialogHeader>
        {selectedHistory && (
          <div className="flex-1 overflow-y-auto space-y-4 mt-2">
            <div>
              <span className="text-xs font-medium text-foreground/65 block mb-1.5">原始输入</span>
              <div className="rounded-lg bg-muted/40 p-3 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                {selectedHistory.input_text}
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-foreground/65 block mb-1.5">优化结果</span>
              {(() => {
                const parsed = selectedHistory.output_text ? parseAiOutput(selectedHistory.output_text) : null;
                return parsed ? (
                  <>
                    {showAnalysis && parsed.analysis && (
                      <details className="rounded-lg border border-border/30 bg-muted/20 overflow-hidden mb-2">
                        <summary className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground/50 hover:text-foreground/70 transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 [[open]>&]:rotate-90" />
                          <span>💡 优化思路</span>
                        </summary>
                        <div className="px-3 pb-2.5 border-t border-border/20 text-sm text-foreground/55">
                          <MarkdownRenderer content={parsed.analysis} className="markdown-body-full text-foreground/55" />
                        </div>
                      </details>
                    )}
                    <div className="rounded-lg bg-muted/40 p-3 max-h-[40vh] overflow-y-auto">
                      <MarkdownRenderer content={parsed.prompt} className="markdown-body-full" />
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <span className="text-sm leading-relaxed text-foreground/80">无输出</span>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-1.5 pt-2 border-t border-border/50">
              <button
                onClick={async () => {
                  if (selectedHistory.output_text) {
                    const parsed = parseAiOutput(selectedHistory.output_text);
                    await navigator.clipboard.writeText(markdownToPlainText(parsed.prompt));
                    setDialogCopied(true);
                    setTimeout(() => setDialogCopied(false), 2000);
                  }
                }}
                disabled={!selectedHistory.output_text}
                className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {dialogCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {dialogCopied ? "已复制" : "复制"}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  if (selectedHistory.output_text) {
                    handleSave(selectedHistory.output_text);
                  }
                }}
                disabled={!selectedHistory.output_text}
                className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" />
                收藏到提示词库
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </div>
  );
}
