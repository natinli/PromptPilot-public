/**
 * MiniPageClassic — 经典样式的 Mini 版
 * 输入区在上方，结果在下方，底部有完整版入口。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Loader2, Copy, Check, RotateCcw, ArrowUpRight, ChevronDown, ImagePlus, X, ArrowUp, ChevronRight, Save } from "lucide-react";
import { baseModes, rawMode, languages, geminiModelList } from "@/constants/optimize-modes";
import { useWindowMode } from "@/hooks/useWindowMode";
import { useOptimize } from "@/hooks/useOptimize";
import * as api from "@/lib/tauri-api";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import appIcon from "@/assets/app-icon-about.png";
import { useSettings } from "@/hooks/useSettings";
import { SavePromptDialog } from "@/components/prompt/save-prompt-dialog";

export default function MiniPageClassic() {
  const { devMode, maxImageSizeMB, maxImageCount, showAnalysis, aiProvider, setAiProvider, openaiModel, setOpenaiModel, codebuddyModel, setCodebuddyModel, geminiModel, setGeminiModel, developerRawModeEnabled, developerGeminiModelSelectorEnabled, developerDebugToolsEnabled, closeBehavior } = useSettings();
  const debugEnabled = import.meta.env.DEV || (devMode && developerDebugToolsEnabled);

  // 开发者模式下显示直通模式
  const modes = devMode && developerRawModeEnabled ? [...baseModes, rawMode] : baseModes;
  const {
    input, setInput,
    mode, setMode,
    language, setLanguage,
    isOptimizing,
    result,
    parsedResult,
    error,
    copied,
    handleOptimize,
    handleCopy,
    images,
    addImages,
    removeImage,
    clearImages,
    imageError,
  } = useOptimize({ defaultOutputFormat: "markdown", maxImageSizeMB, maxImageCount, persistKey: "mini" });

  const [analysisExpanded, setAnalysisExpanded] = useState(false);

  const [showModeSelect, setShowModeSelect] = useState(false);
  const [showLangSelect, setShowLangSelect] = useState(false);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [providerMenuPos, setProviderMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const providerMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 从 localStorage 读取已缓存的模型列表
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
  const { switchToFull, isSwitching: isModeSwitching } = useWindowMode();
  const [hoveredThumb, setHoveredThumb] = useState<number | null>(null);
  const [thumbRect, setThumbRect] = useState<DOMRect | null>(null);
  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 保存到提示词库
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [contentToSave, setContentToSave] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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
        rawRequirement: input,
        categoryId: data.categoryId,
        sourceType: "optimized",
      });
      setSaveDialogOpen(false);
      window.dispatchEvent(new CustomEvent("prompts-updated", {
        detail: { source: "mini-page-classic", mutatedData: ["prompts", "categories", "stats"] },
      }));
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const handleThumbEnter = useCallback((idx: number) => {
    cancelHide();
    const el = thumbRefs.current[idx];
    if (el) {
      setThumbRect(el.getBoundingClientRect());
      setHoveredThumb(idx);
    }
  }, [cancelHide]);

  const handleThumbLeave = useCallback(() => {
    hideTimer.current = setTimeout(() => {
      setHoveredThumb(null);
      setThumbRect(null);
    }, 100);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setShowModeSelect(false);
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setShowLangSelect(false);
      }
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setShowModelSelect(false);
      }
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)) {
        setShowProviderMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openFullVersion = () => {
    switchToFull();
  };

  // Enter 发送，Ctrl+Enter 换行
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      if (!isOptimizing && input.trim()) handleOptimize();
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const textarea = e.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = input.substring(0, start) + "\n" + input.substring(end);
      setInput(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      });
    }
  }, [input, isOptimizing, handleOptimize, setInput]);

  const currentMode = modes.find((m) => m.value === mode)!;
  const currentLang = languages.find((l) => l.value === language) || languages[0];

  return (
    <div className="flex flex-col h-screen overflow-hidden dark:bg-background">
      {/* 标题栏 — fixed 定位脱离 flex 流，避免 resize 时重排晃动 */}
      <div
        className="fixed top-0 left-0 right-0 z-50 flex h-9 items-center justify-between px-4 dark:bg-background"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-1" data-tauri-drag-region>
          <img
            src={appIcon}
            alt="logo"
            className="h-[22px] w-[22px]"
            draggable={false}
onDoubleClick={debugEnabled ? () => window.dispatchEvent(new Event("toggle-debug-panel")) : undefined}
          />
          <span className="text-xs font-semibold text-foreground/70 tracking-wide">
            PromptPilot
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => api.windowMinimize()}
            className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/70"
            title="最小化"
          >
            <svg width="12" height="1" viewBox="0 0 12 1" fill="currentColor">
              <rect width="12" height="1" rx="0.5" />
            </svg>
          </button>
          <button
            onClick={openFullVersion}
            disabled={isModeSwitching}
className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/90 disabled:opacity-30"
            title="切换到完整版"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => api.windowClose(closeBehavior)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/55 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
            title="隐藏到托盘"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>
      </div>

      {/* 标题栏占位 */}
      <div className="h-9 shrink-0" />

      {/* 内容区 - 还原旧版结构 */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-4 pt-[7px] pb-4">
          {/* 输入区 - 支持拖拽图片 */}
          <div
            className={`relative rounded-xl border bg-muted/30 transition-colors ${
              isDragOver
                ? "border-foreground/40 bg-foreground/5"
                : "border-border"
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
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
              placeholder={isDragOver ? "松开鼠标即可上传图片..." : "在这里输入你想要优化的内容，支持粘贴/拖拽图片..."}
className="w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/45 placeholder:text-sm focus:outline-none transition-all"
              rows={3}
              disabled={isOptimizing}
            />

            {imageError && (
              <p className="text-[10px] text-rose-500 px-3 pb-1">{imageError}</p>
            )}

            {/* 底栏：图片按钮 + 缩略图 + 字数统计（在输入框卡片内部） */}
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/30">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  id="classic-image-upload"
                  name="classic-image-upload"
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
                <div className="relative group/upload">
                  <button
                    onClick={() => !isOptimizing && fileInputRef.current?.click()}
                    disabled={isOptimizing}
                    className="flex items-center justify-center rounded-md p-1 text-foreground/45 transition-colors hover:bg-muted hover:text-foreground/60 disabled:opacity-40"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                  </button>
                  <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 whitespace-nowrap rounded-md bg-foreground/80 px-2 py-0.5 text-[10px] text-background opacity-0 transition-opacity group-hover/upload:opacity-100">
                    上传图片
                  </span>
                </div>
                {/* 图片缩略图 - 紧跟在图标右侧 */}
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    ref={(el) => { thumbRefs.current[idx] = el; }}
                    className="relative flex-shrink-0 cursor-pointer"
                    style={{ width: 18, height: 18 }}
                    onMouseEnter={() => handleThumbEnter(idx)}
                    onMouseLeave={handleThumbLeave}
                  >
                    <div className="w-full h-full rounded overflow-hidden border border-border/40">
                      <img src={img.previewUrl} alt={img.fileName} className="w-full h-full object-cover" />
                    </div>
                  </div>
                ))}
                {images.length > 1 && (
                  <button onClick={clearImages} className="text-[10px] text-foreground/45 hover:text-rose-500 transition-colors ml-0.5" title="清除所有图片">
                    ×
                  </button>
                )}
                {images.length > 0 && (
                  <span className="text-[10px] text-foreground/40">{images.length}/5</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground/55">
                {input.length}/5000
              </span>
            </div>
          </div>

          {/* 模式选择 + 语言选择 + 优化按钮（独立一行） */}
          <div className="flex items-center gap-1 min-w-0">
            {/* 右键 Provider 切换菜单（开发者模式下可用） */}
            {showProviderMenu && devMode && (
              <div
                ref={providerMenuRef}
className="fixed z-[100] w-[130px] rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in zoom-in-95 duration-150"
                style={{ left: providerMenuPos.x, top: providerMenuPos.y }}
              >
                <div className="px-2.5 py-1.5 text-[10px] font-medium text-foreground/40 uppercase tracking-wider">切换 Provider</div>
                <button
                  onClick={() => { setAiProvider("gemini"); setShowProviderMenu(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                    aiProvider === "gemini" ? "bg-foreground/5 font-medium text-foreground" : "text-foreground/60 hover:bg-muted"
                  }`}
                >
                  <span>🔮</span>
                  <span>Gemini</span>
                  {aiProvider === "gemini" && <span className="ml-auto text-[10px] text-foreground/40">✓</span>}
                </button>
                <button
                  onClick={() => { setAiProvider("openai_compat"); setShowProviderMenu(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                    aiProvider === "openai_compat" ? "bg-foreground/5 font-medium text-foreground" : "text-foreground/60 hover:bg-muted"
                  }`}
                >
                  <span>🔗</span>
<span>OpenAI</span>
                  {aiProvider === "openai_compat" && <span className="ml-auto text-[10px] text-foreground/40">✓</span>}
                </button>
                <button
                  onClick={() => { setAiProvider("codebuddy"); setShowProviderMenu(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                    aiProvider === "codebuddy" ? "bg-foreground/5 font-medium text-foreground" : "text-foreground/60 hover:bg-muted"
                  }`}
                >
                  <span>⚡</span>
                  <span>CodeBuddy</span>
                  {aiProvider === "codebuddy" && <span className="ml-auto text-[10px] text-foreground/40">✓</span>}
                </button>
              </div>
            )}

            {/* 模式选择 */}
            <div className="relative shrink-0" ref={modeRef}>
              <button
                onClick={() => { setShowModeSelect(!showModeSelect); setShowLangSelect(false); }}
                className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-foreground/70 transition-colors hover:bg-muted"
              >
                <span>{currentMode.emoji}</span>
                <span>{currentMode.label}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>

              {showModeSelect && (
          <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                  {modes.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setMode(m.value);
                        setShowModeSelect(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                        mode === m.value
                          ? "bg-foreground/5 font-medium text-foreground"
                          : "text-foreground/60 hover:bg-muted"
                      }`}
                    >
                      <span>{m.emoji}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 语言选择 */}
            <div className="relative shrink-0" ref={langRef}>
              <button
                onClick={() => { setShowLangSelect(!showLangSelect); setShowModeSelect(false); }}
                className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-foreground/70 transition-colors hover:bg-muted"
              >
                <span>{currentLang.label}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>

              {showLangSelect && (
                <div className="absolute left-0 top-full z-50 mt-1 w-28 rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                  {languages.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => {
                        setLanguage(l.value);
                        setShowLangSelect(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                        language === l.value
                          ? "bg-foreground/5 font-medium text-foreground"
                          : "text-foreground/60 hover:bg-muted"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 模型选择 — CodeBuddy/OpenAI，或 Gemini 开发者模式下显示 */}
            {(aiProvider === "openai_compat" || aiProvider === "codebuddy" || (aiProvider === "gemini" && devMode && developerGeminiModelSelectorEnabled)) && (
              <div className="relative min-w-0" ref={modelRef}>
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
                  className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-foreground/70 transition-colors hover:bg-muted min-w-0"
                >
                  <span className="max-w-[80px] truncate">
                    {aiProvider === "gemini"
                      ? (geminiModel || "默认模型")
                      : aiProvider === "openai_compat"
                        ? (openaiModel || "选择模型")
                        : (codebuddyModel || "选择模型")}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </button>

                {showModelSelect && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-[200px] overflow-hidden rounded-xl border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="max-h-[200px] overflow-y-auto p-1">
                    {aiProvider === "gemini" ? (
                      <>
                        {/* 默认模型选项 */}
                        <button
                          onClick={() => { setGeminiModel(""); setShowModelSelect(false); }}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                            !geminiModel ? "bg-foreground/5 text-foreground/70" : "text-foreground/60 hover:bg-muted"
                          }`}
                        >
                          <span className="truncate">默认模型</span>
                        </button>
                        {geminiModelList.map((m) => (
                          <button
                            key={m}
                            onClick={() => { setGeminiModel(m); setShowModelSelect(false); }}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
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
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                            (aiProvider === "openai_compat" ? openaiModel : codebuddyModel) === m
                              ? "bg-foreground/5 text-foreground/70"
                              : "text-foreground/60 hover:bg-muted"
                          }`}
                        >
                          <span className="truncate">{m}</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-xs text-foreground/40 text-center">
                        请先在设置中获取模型列表
                      </div>
                    )}
                  </div>
                  </div>
                )}
              </div>
            )}

            {/* 优化按钮 - 圆形按钮（与完整版一致） */}
            <div className="flex-1" />
            <button
              onClick={handleOptimize}
              disabled={isOptimizing || (!input.trim() && images.length === 0)}
              className="flex items-center justify-center h-8 w-8 rounded-full border border-foreground/25 bg-muted text-foreground transition-all duration-200 hover:bg-foreground hover:text-background hover:border-foreground disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-muted disabled:hover:text-foreground disabled:hover:border-foreground/25"
            >
              {isOptimizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
              {error}
            </div>
          )}

          {/* 结果展示 */}
          {result && (
            <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* 优化思路（可折叠，受设置开关控制） */}
              {showAnalysis && parsedResult?.analysis && (
                <div className="rounded-xl border border-border/30 bg-muted/20 overflow-hidden">
                  <button
                    onClick={() => setAnalysisExpanded(!analysisExpanded)}
                    className="flex items-center gap-1.5 w-full px-3 py-2 text-[11px] font-medium text-foreground/45 hover:text-foreground/60 transition-colors"
                  >
                    <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${analysisExpanded ? 'rotate-90' : ''}`} />
                    <span>💡 优化思路</span>
                  </button>
                  {analysisExpanded && (
                    <div className="px-3 pb-2.5 border-t border-border/20">
                      <MarkdownRenderer content={parsedResult.analysis} className="markdown-body-mini text-foreground/55" />
                    </div>
                  )}
                </div>
              )}

              {/* 最终提示词 */}
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <MarkdownRenderer content={parsedResult?.prompt || result} className="markdown-body-mini overflow-y-auto" />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? "已复制" : "复制"}
                </button>
                <button
                  onClick={() => handleSave(parsedResult?.prompt || result)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Save className="h-4 w-4" />
                  保存
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleOptimize}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw className="h-4 w-4" />
                  重新优化
                </button>
              </div>
            </div>
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

      {/* 缩略图 hover 放大预览 - Portal 渲染到 body */}
      {hoveredThumb !== null && thumbRect && images[hoveredThumb] && createPortal(
        <div
          className="fixed z-[99999] pointer-events-auto"
          style={{
            left: thumbRect.left + thumbRect.width / 2 - 60,
            top: thumbRect.top - 128,
          }}
          onMouseEnter={cancelHide}
          onMouseLeave={handleThumbLeave}
        >
          <div className="relative rounded-lg overflow-hidden border border-border bg-background shadow-xl ring-1 ring-black/5" style={{ width: 120, height: 120 }}>
            <img src={images[hoveredThumb].previewUrl} alt={images[hoveredThumb].fileName} className="w-full h-full object-cover" />
            <button
              onClick={(e) => { e.stopPropagation(); removeImage(hoveredThumb); setHoveredThumb(null); setThumbRect(null); }}
              className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/30 text-white/50 transition-all hover:bg-red-500 hover:text-white"
              title="删除图片"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
