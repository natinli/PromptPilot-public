/**
 * ImageGenPage — AI 图片生成页面
 *
 * 功能：
 * 1. 输入提示词 + 选择尺寸 + 选择 Provider → 生成图片
 * 2. 图片库：网格展示已生成的图片
 * 3. 图片详情弹窗：大图预览 + 元信息 + 操作
 * 4. 双向关联：从提示词库选择 / 保存提示词到词库
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, ChevronDown, ArrowUp, ImagePlus, X } from "lucide-react";
import { useImageGen } from "@/hooks/useImageGen";
import { useSettings } from "@/hooks/useSettings";
import { SizeSelector } from "@/components/image-gen/SizeSelector";
import { ImageGrid } from "@/components/image-gen/ImageGrid";
import { ImageDetailModal } from "@/components/image-gen/ImageDetailModal";
import { PromptPicker } from "@/components/image-gen/PromptPicker";
import { openaiImageModelList, geminiImageModelList } from "@/constants/optimize-modes";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { GeneratedImage, Prompt } from "@/lib/tauri-api";

export default function ImageGenPage() {
  // 生成参数
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [promptId, setPromptId] = useState<string | undefined>(undefined);

  // 模型选择下拉
  const [showModelSelect, setShowModelSelect] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  // 从 localStorage 读取已缓存的 OpenAI 模型列表（设置页获取后存储）
  const [cachedOpenaiModelList, setCachedOpenaiModelList] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("pp_openai_model_list");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // 图片上传（参考图）
  const [uploadedImages, setUploadedImages] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 详情弹窗
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Tab 切换：最新生成 / 图片库
  const [_activeTab, _setActiveTab] = useState<"recent" | "gallery">("gallery");

  const {
    isGenerating,
    progress,
    generate,
    images,
    total,
    isLoading,
    loadImages,
    loadMore,
    hasMore,
    deleteImage,
    savePromptToLibrary,
    getImageUrl,
  } = useImageGen();

  const { devMode: _devMode } = useSettings();

  // 监听 OpenAI 模型列表变化（storage 跨窗口 + 自定义事件同窗口）
  useEffect(() => {
    const handler = () => {
      try {
        const stored = localStorage.getItem("pp_openai_model_list");
        setCachedOpenaiModelList(stored ? JSON.parse(stored) : []);
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", handler);
    window.addEventListener("pp_openai_model_list_updated", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("pp_openai_model_list_updated", handler);
    };
  }, []);

  // 点击外部关闭模型下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setShowModelSelect(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 切换 Provider 时重置模型选择
  const handleProviderChange = useCallback((newProvider: string) => {
    setProvider(newProvider);
    setModel(""); // 切换 Provider 时重置为默认模型
    setShowModelSelect(false);
  }, []);

  // 初始加载图片列表
  useEffect(() => {
    loadImages(1);
  }, [loadImages]);

  // 监听图片更新事件
  useEffect(() => {
    const handler = () => loadImages(1);
    window.addEventListener("images-updated", handler);
    return () => window.removeEventListener("images-updated", handler);
  }, [loadImages]);

  // 图片上传处理
  const addUploadedImages = useCallback((files: FileList | File[]) => {
    const newImages = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
    if (newImages.length > 0) {
      setUploadedImages((prev) => [...prev, ...newImages]);
    }
  }, []);

  const removeUploadedImage = useCallback((index: number) => {
    setUploadedImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // 生成图片
  const handleGenerate = useCallback(async () => {
    // 将上传的图片转为 base64
    const imageBase64List: string[] = [];
    for (const img of uploadedImages) {
      const arrayBuffer = await img.file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      imageBase64List.push(btoa(binary));
    }

    const result = await generate({
      prompt,
      size,
      provider,
      model: model || undefined,
      promptId,
      images: imageBase64List.length > 0 ? imageBase64List : undefined,
    });
    if (result) {
      // 生成成功后清除上传的图片、刷新列表
      setUploadedImages((prev) => {
        prev.forEach((img) => URL.revokeObjectURL(img.preview));
        return [];
      });
      loadImages(1);
    }
  }, [prompt, size, provider, model, promptId, uploadedImages, generate, loadImages]);

  // 从提示词库选择
  const handleSelectPrompt = useCallback((selectedPrompt: Prompt) => {
    setPrompt(selectedPrompt.content);
    setPromptId(selectedPrompt.id);
  }, []);

  // 打开详情
  const handleImageClick = useCallback((image: GeneratedImage) => {
    setSelectedImage(image);
    setIsDetailOpen(true);
  }, []);

  // Ctrl+Enter 快捷生成
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isGenerating) {
        e.preventDefault();
        handleGenerate();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGenerate, isGenerating]);

  return (
    <div className="flex flex-col pt-6 h-full overflow-hidden">
      <div className="space-y-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground/65 pl-4">图片生成</h1>
        </div>
      </div>

      <div className="space-y-6">
      {/* 生成区域 — 与优化页卡片风格统一 */}
      <div className={cn(
        "rounded-2xl border bg-background/60 overflow-visible transition-all duration-300 ease-out",
        isGenerating
          ? "border-foreground/20"
          : "border-border/50 hover:border-border hover:shadow-lg hover:shadow-black/[0.03] dark:hover:shadow-black/[0.15]"
      )}>
        {/* 提示词输入框 — 透明背景融入卡片 */}
        <textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setPromptId(undefined); // 手动编辑时清除关联 ID
          }}
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
              addUploadedImages(imageFiles);
            }
          }}
          placeholder="描述你想生成的图片...&#10;例如：一只戴着宇航员头盔的柯基犬，站在月球表面，地球在背景中，数字艺术风格"
          rows={3}
          disabled={isGenerating}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/65 focus:outline-none min-h-[140px]"
        />

        {/* 上传图片预览 — 内嵌在输入卡片内 */}
        {uploadedImages.length > 0 && (
          <div className="flex items-start gap-2 flex-wrap px-4 pb-2">
            {uploadedImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={img.preview}
                  alt={`参考图 ${idx + 1}`}
                  className="h-16 w-16 rounded-lg object-cover ring-1 ring-foreground/10"
                />
                <button
                  type="button"
                  onClick={() => removeUploadedImage(idx)}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 底栏：参数选择 + 生成按钮 — 与优化页底部工具栏统一 */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border/30">
          <div className="flex items-center gap-1.5">
            {/* 图片上传按钮 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addUploadedImages(e.target.files);
                e.target.value = "";
              }}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isGenerating}
                    className="flex items-center justify-center rounded-md border border-transparent p-1.5 text-foreground/40 transition-colors hover:bg-muted hover:text-foreground/70 disabled:opacity-50"
                  />
                }
              >
                <ImagePlus className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>上传参考图</TooltipContent>
            </Tooltip>

            {/* 从提示词库选择 */}
            <PromptPicker onSelect={handleSelectPrompt} disabled={isGenerating} />

            {/* 尺寸选择 */}
            <SizeSelector value={size} onChange={setSize} disabled={isGenerating} />

            {/* Provider 切换 */}
            <div className="flex gap-1">
              <ProviderToggle
                value="openai"
                label="OpenAI"
                active={provider === "openai"}
                onClick={() => handleProviderChange("openai")}
                disabled={isGenerating}
                color="emerald"
              />
              <ProviderToggle
                value="gemini"
                label="Gemini"
                active={provider === "gemini"}
                onClick={() => handleProviderChange("gemini")}
                disabled={isGenerating}
                color="blue"
              />
            </div>

            {/* 模型选择 */}
            <div className="relative" ref={modelRef}>
              <button
                type="button"
                onClick={() => setShowModelSelect(!showModelSelect)}
                disabled={isGenerating}
                className="flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/70"
              >
                <span className="max-w-[140px] truncate">
                  {model || "默认模型"}
                </span>
                <ChevronDown className="h-3 w-3 opacity-40" />
              </button>

              {showModelSelect && (
                <div className="absolute left-0 top-full z-50 mt-1 w-[240px] overflow-hidden rounded-lg border border-border bg-background shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="max-h-[300px] overflow-y-auto p-1">
                    {/* 默认模型选项 */}
                    <button
                      onClick={() => { setModel(""); setShowModelSelect(false); }}
                      className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
                        !model ? "bg-foreground/5 text-foreground/70" : "text-foreground/60 hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">默认模型</span>
                      <span className="ml-auto text-[10px] text-foreground/30">
                        {provider === "openai" ? "gpt-image-1" : "imagen-4.0-generate-001"}
                      </span>
                    </button>

                    {/* 分隔线 */}
                    <div className="my-1 h-px bg-foreground/[0.06]" />

                    {/* 预设模型列表 */}
                    <div className="px-2.5 py-1 text-[10px] text-foreground/30 font-medium">
                      {provider === "openai" ? "OpenAI 图片模型" : "Gemini Imagen 模型"}
                    </div>
                    {(provider === "openai" ? openaiImageModelList : geminiImageModelList).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setModel(m); setShowModelSelect(false); }}
                        className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
                          model === m ? "bg-foreground/5 text-foreground/70" : "text-foreground/60 hover:bg-muted"
                        }`}
                      >
                        <span className="truncate">{m}</span>
                      </button>
                    ))}

                    {/* OpenAI 时额外显示已缓存的模型列表（来自设置页获取） */}
                    {provider === "openai" && cachedOpenaiModelList.length > 0 && (
                      <>
                        <div className="my-1 h-px bg-foreground/[0.06]" />
                        <div className="px-2.5 py-1 text-[10px] text-foreground/30 font-medium">
                          API 获取的模型
                        </div>
                        {cachedOpenaiModelList
                          .filter((m) => !openaiImageModelList.includes(m))
                          .map((m) => (
                          <button
                            key={m}
                            onClick={() => { setModel(m); setShowModelSelect(false); }}
                            className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
                              model === m ? "bg-foreground/5 text-foreground/70" : "text-foreground/60 hover:bg-muted"
                            }`}
                          >
                            <span className="truncate">{m}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1" />

          {/* 生成按钮 — 与优化页圆形按钮统一 */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  className="flex items-center justify-center h-8 w-8 rounded-full border border-foreground/25 bg-muted text-foreground transition-all duration-200 hover:bg-foreground hover:text-background hover:border-foreground disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-muted disabled:hover:text-foreground disabled:hover:border-foreground/25"
                />
              }
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </TooltipTrigger>
            <TooltipContent>{isGenerating ? (progress || "生成中...") : "生成图片 (Ctrl+Enter)"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      </div>

      {/* 图片库区域 — 可滚动 */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-6">
        {/* 标题栏 */}
        <div className="flex items-center gap-4 pl-4">
          <h2 className="text-sm font-medium text-foreground/70">
            图片库
          </h2>
          <span className="text-xs text-foreground/30">
            {total} 张图片
          </span>
        </div>

        {/* 图片网格 */}
        <ImageGrid
          images={images}
          onImageClick={handleImageClick}
          onDelete={deleteImage}
          getImageUrl={getImageUrl}
          isLoading={isLoading}
        />

        {/* 加载更多 */}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              onClick={loadMore}
              disabled={isLoading}
              className="px-4 py-1.5 text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
            >
              {isLoading ? "加载中..." : "加载更多"}
            </button>
          </div>
        )}
      </div>

      {/* 图片详情弹窗 */}
      <ImageDetailModal
        image={selectedImage}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onDelete={deleteImage}
        onSavePrompt={savePromptToLibrary}
        getImageUrl={getImageUrl}
      />
    </div>
  );
}

/** Provider 切换按钮 */
function ProviderToggle({
  value: _value,
  label,
  active,
  onClick,
  disabled,
  color,
}: {
  value: string;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-foreground/5 text-foreground/70"
          : "text-foreground/40 hover:text-foreground/60 hover:bg-muted",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span className={cn(
        "inline-block w-1.5 h-1.5 rounded-full",
        active
          ? color === "emerald" ? "bg-emerald-500" : "bg-blue-500"
          : "bg-foreground/20"
      )} />
      {label}
    </button>
  );
}
