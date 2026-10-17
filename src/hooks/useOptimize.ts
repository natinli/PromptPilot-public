/**
 * useOptimize — 提示词优化核心逻辑 Hook
 * 将优化相关的状态管理和业务逻辑从页面组件中抽取出来，
 * 供 MiniPage 和 OptimizePage 复用。
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { OptimizeMode, ImageData } from "@/types/ai";
import { useApiKey } from "@/components/settings/api-key-provider";
import * as api from "@/lib/tauri-api";
import type { StreamChunkPayload } from "@/lib/tauri-api";
import { markdownToPlainText, parseAiOutput, type ParsedAiOutput } from "@/lib/utils";
import { getCurrentAiProviderConfig, getStreamEnabled } from "@/lib/settings-reader";
import { preprocessImage } from "@/lib/image-preprocess";
import { pushEventLog } from "@/components/debug/debug-store";
import { listen } from "@tauri-apps/api/event";

/** 默认最多上传 10 张图片 */
const DEFAULT_MAX_IMAGE_COUNT = 10;
/** 允许的图片 MIME 类型 */
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export interface UseOptimizeOptions {
  /** 默认优化模式 */
  defaultMode?: OptimizeMode;
  /** 默认语言 */
  defaultLanguage?: string;
  /** 默认输出格式 */
  defaultOutputFormat?: "plain_text" | "markdown";
  /** 优化完成后的回调 */
  onOptimizeSuccess?: () => void;
  /** 单张图片最大大小（MB），默认 20 */
  maxImageSizeMB?: number;
  /** 最多上传图片数量，默认 10 */
  maxImageCount?: number;
  /**
   * 持久化 key — 传入后会将输入/输出/模式等状态保存到 sessionStorage，
   * 组件重新挂载时自动恢复。用于 Mini 模式切换到 Full 再切回时保留状态。
   * 不传则不持久化（保持原有行为）。
   */
  persistKey?: string;
}

/** 带预览信息的图片 */
export interface ImagePreview extends ImageData {
  /** 用于预览的 data URL */
  previewUrl: string;
  /** 文件名（用于显示） */
  fileName: string;
  /** 文件大小（字节） */
  fileSize: number;
}

export interface UseOptimizeReturn {
  /** 输入文本 */
  input: string;
  setInput: (value: string) => void;
  /** 当前优化模式 */
  mode: OptimizeMode;
  setMode: (mode: OptimizeMode) => void;
  /** 语言 */
  language: string;
  setLanguage: (lang: string) => void;
  /** 输出格式 */
  outputFormat: "plain_text" | "markdown";
  setOutputFormat: (format: "plain_text" | "markdown") => void;
  /** 是否正在优化 */
  isOptimizing: boolean;
  /** 优化结果（原始完整内容） */
  result: string;
  /** 解析后的结果（分离分析思路和最终提示词） */
  parsedResult: ParsedAiOutput | null;
  /** 错误信息 */
  error: string | null;
  /** 是否已复制 */
  copied: boolean;
  /** 执行优化 */
  handleOptimize: () => Promise<void>;
  /** 复制结果 */
  handleCopy: () => Promise<void>;
  /** 键盘快捷键处理（Enter 触发优化，Ctrl+Enter 换行） */
  handleKeyDown: (e: React.KeyboardEvent) => void;
  /** API Key 是否已配置 */
  isConfigured: boolean;
  /** 完整的优化结果（含 model 和 usage） */
  fullResult: api.OptimizeResult | null;
  /** 已上传的图片列表 */
  images: ImagePreview[];
  /** 添加图片（从 File 对象） */
  addImages: (files: FileList | File[]) => Promise<void>;
  /** 移除指定索引的图片 */
  removeImage: (index: number) => void;
  /** 清除所有图片 */
  clearImages: () => void;
  /** 图片操作相关的错误信息 */
  imageError: string | null;
}

/** 持久化的图片数据（不含 previewUrl，恢复时重建） */
export interface PersistedImageData {
  mimeType: string;
  data: string;
  fileName: string;
  fileSize: number;
}

/** 持久化的状态结构（存储在 IndexedDB 中） */
export interface PersistedOptimizeState {
  input: string;
  mode: OptimizeMode;
  language: string;
  outputFormat: "plain_text" | "markdown";
  result: string;
  parsedResult: ParsedAiOutput | null;
  /** 持久化的图片数据（不含 previewUrl） */
  images?: PersistedImageData[];
}

// ─── IndexedDB 持久化层 ───────────────────────────────────────────
const IDB_NAME = "promptpilot_optimize";
const IDB_VERSION = 1;
const IDB_STORE = "state";

/** 打开 IndexedDB（单例缓存） */
let _dbPromise: Promise<IDBDatabase> | null = null;
function openIDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      _dbPromise = null;
      reject(req.error);
    };
  });
  return _dbPromise;
}

/** 从 IndexedDB 异步读取持久化状态 */
export async function loadPersistedStateAsync(key: string): Promise<PersistedOptimizeState | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(`optimize_${key}`);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 同步读取持久化状态（仅文本部分，从 sessionStorage 回退读取，用于初始渲染） */
export function loadPersistedState(key: string): PersistedOptimizeState | null {
  try {
    const raw = sessionStorage.getItem(`optimize_${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedOptimizeState;
  } catch {
    return null;
  }
}

/** 保存状态到 IndexedDB + sessionStorage（文本部分双写，图片仅写 IndexedDB） */
export function savePersistedState(key: string, state: PersistedOptimizeState): void {
  // sessionStorage 只存文本部分（用于同步初始化，避免配额问题）
  try {
    const { images: _imgs, ...textState } = state;
    sessionStorage.setItem(`optimize_${key}`, JSON.stringify(textState));
  } catch {
    // 静默忽略
  }
  // IndexedDB 存完整数据（含图片）
  // 如果 state 中没有 images 字段，先读取已有数据保留图片（避免覆盖）
  openIDB().then(async db => {
    let dataToWrite = state;
    if (!('images' in state)) {
      const existing = await new Promise<PersistedOptimizeState | null>((resolve) => {
        const readTx = db.transaction(IDB_STORE, "readonly");
        const req = readTx.objectStore(IDB_STORE).get(`optimize_${key}`);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
      if (existing?.images) {
        dataToWrite = { ...state, images: existing.images };
      }
    }
    const writeTx = db.transaction(IDB_STORE, "readwrite");
    writeTx.objectStore(IDB_STORE).put(dataToWrite, `optimize_${key}`);
  }).catch(() => { /* 静默忽略 */ });
}

/**
 * 清除 IndexedDB 中持久化的图片数据（保留文本状态）。
 * 应在应用启动时调用，确保关闭应用后图片不会残留。
 */
export async function clearPersistedImages(): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    // 遍历所有 key，清除其中的 images 字段
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const value = cursor.value as PersistedOptimizeState | null;
        if (value?.images?.length) {
          const { images: _, ...rest } = value;
          cursor.update(rest);
        }
        cursor.continue();
      }
    };
  } catch {
    // 静默忽略
  }
}

/** 从持久化的图片数据重建 ImagePreview（生成 previewUrl） */
export function rebuildImagePreviews(persisted: PersistedImageData[]): ImagePreview[] {
  return persisted.map(img => ({
    mimeType: img.mimeType,
    data: img.data,
    fileName: img.fileName,
    fileSize: img.fileSize,
    previewUrl: `data:${img.mimeType};base64,${img.data}`,
  }));
}

export function useOptimize(options: UseOptimizeOptions = {}): UseOptimizeReturn {
  const {
    defaultMode = "standard",
    defaultLanguage = "zh-CN",
    defaultOutputFormat = "plain_text",
    onOptimizeSuccess,
    maxImageSizeMB = 20,
    maxImageCount = DEFAULT_MAX_IMAGE_COUNT,
    persistKey,
  } = options;

  const MAX_IMAGE_SIZE = maxImageSizeMB * 1024 * 1024;
  const MAX_IMAGE_COUNT = maxImageCount;

  // 尝试从 sessionStorage 恢复状态
  const persisted = persistKey ? loadPersistedState(persistKey) : null;

  const [input, setInput] = useState(persisted?.input ?? "");
  const [mode, setMode] = useState<OptimizeMode>(persisted?.mode ?? defaultMode);
  const [language, setLanguage] = useState(persisted?.language ?? defaultLanguage);
  const [outputFormat, setOutputFormat] = useState<"plain_text" | "markdown">(persisted?.outputFormat ?? defaultOutputFormat);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState(persisted?.result ?? "");
  const [parsedResult, setParsedResult] = useState<ParsedAiOutput | null>(persisted?.parsedResult ?? null);
  const [fullResult, setFullResult] = useState<api.OptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 图片相关状态
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  // 标记图片是否已从 IndexedDB 恢复完成（防止空 images 覆盖已持久化的图片数据）
  const imagesRestoredRef = useRef(!persistKey);

  const { isConfigured, openSettings } = useApiKey();

  // 异步从 IndexedDB 恢复图片（组件挂载时执行一次）
  useEffect(() => {
    if (!persistKey) return;
    let cancelled = false;
    loadPersistedStateAsync(persistKey).then(state => {
      if (cancelled) return;
      if (state?.images?.length) {
        const restored = rebuildImagePreviews(state.images);
        setImages(prev => prev.length > 0 ? prev : restored);
      }
      // 无论是否有图片，都标记恢复完成
      imagesRestoredRef.current = true;
    });
    return () => { cancelled = true; };
  }, [persistKey]);

  // 持久化状态到 IndexedDB + sessionStorage（仅当 persistKey 存在时）
  useEffect(() => {
    if (!persistKey) return;
    // 图片尚未从 IndexedDB 恢复完成时，不写入图片字段（避免空数组覆盖已有数据）
    const shouldPersistImages = imagesRestoredRef.current;
    const persistedImages: PersistedImageData[] = shouldPersistImages
      ? images.map(img => ({
          mimeType: img.mimeType,
          data: img.data,
          fileName: img.fileName,
          fileSize: img.fileSize,
        }))
      : [];
    savePersistedState(persistKey, {
      input,
      mode,
      language,
      outputFormat,
      result,
      parsedResult,
      // 未恢复完成时不传 images 字段，保留 IndexedDB 中已有的图片数据
      ...(shouldPersistImages ? { images: persistedImages.length > 0 ? persistedImages : undefined } : {}),
    });
  }, [persistKey, input, mode, language, outputFormat, result, parsedResult, images]);

  /** 添加图片（含智能缩放预处理） */
  const addImages = useCallback(async (files: FileList | File[]) => {
    setImageError(null);
    const fileArray = Array.from(files);

    // 检查数量限制
    const currentMaxCount = MAX_IMAGE_COUNT;
    if (images.length + fileArray.length > currentMaxCount) {
      setImageError(`最多上传 ${currentMaxCount} 张图片`);
      return;
    }

    const newImages: ImagePreview[] = [];
    for (const file of fileArray) {
      // 检查类型
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setImageError(`不支持的图片格式: ${file.type}，仅支持 PNG、JPEG、WebP、GIF`);
        continue;
      }
      // 检查大小（基于原始文件，预处理后会自动缩小）
      if (file.size > MAX_IMAGE_SIZE) {
        setImageError(`图片 "${file.name}" 超过 ${maxImageSizeMB}MB 限制`);
        continue;
      }
      try {
        // 关键修复：大图（手机原图等）发到 OpenAI 兼容中转商时
        // 容易被截断或导致模型识别不到，必须前端预先缩放到 vision 推荐尺寸
        // 之前 fileToBase64 直接发原图，是 v0.3.5 之后大图无法识别的根因
        const processed = await preprocessImage(file);
        if (processed.resized) {
          // 调试用：让 IPC 日志能看到缩放前后的对比
          console.info(
            `[image-preprocess] ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(processed.size / 1024).toFixed(0)}KB (${processed.width}×${processed.height})`,
          );
        }
        newImages.push({
          mimeType: processed.mimeType,
          data: processed.data,
          previewUrl: URL.createObjectURL(file),
          fileName: file.name,
          fileSize: processed.size,
        });
      } catch {
        setImageError(`读取图片 "${file.name}" 失败`);
      }
    }

    if (newImages.length > 0) {
      setImages(prev => [...prev, ...newImages]);
    }
  }, [images.length, MAX_IMAGE_COUNT, MAX_IMAGE_SIZE, maxImageSizeMB]);

  /** 移除指定索引的图片 */
  const removeImage = useCallback((index: number) => {
    setImages(prev => {
      const removed = prev[index];
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
    setImageError(null);
  }, []);

  /** 清除所有图片 */
  const clearImages = useCallback(() => {
    images.forEach(img => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setImageError(null);
  }, [images]);

  const handleOptimize = useCallback(async () => {
    if ((!input.trim() && images.length === 0) || isOptimizing) return;

    if (!isConfigured) {
      openSettings();
      return;
    }

    setError(null);
    setIsOptimizing(true);
    setResult("");
    setParsedResult(null);
    setFullResult(null);

    try {
      // 读取当前 AI Provider 设置
      const { provider: currentProvider, openaiModel: currentOpenaiModel, codebuddyModel: currentCodebuddyModel, geminiModel: currentGeminiModel } = getCurrentAiProviderConfig();

      // 读取自定义系统提示词
      let customSystemPromptValue: string | undefined;
      try {
        const settingsRaw = localStorage.getItem("promptpilot_settings");
        if (settingsRaw) {
          const s = JSON.parse(settingsRaw);
          if (s.customSystemPrompt) customSystemPromptValue = s.customSystemPrompt;
        }
      } catch { /* ignore */ }

      // 构建图片数据（转为 Rust 端格式：mime_type 而非 mimeType）
      const imagePayload = images.length > 0
        ? images.map(img => ({ mime_type: img.mimeType, data: img.data }))
        : undefined;

      const commonParams = {
        rawRequirement: input,
        mode,
        language,
        outputFormat,
        images: imagePayload,
        provider: currentProvider,
        openaiModel: currentProvider === "openai_compat" ? currentOpenaiModel : undefined,
        codebuddyModel: currentProvider === "codebuddy" ? currentCodebuddyModel : undefined,
        geminiModel: currentProvider === "gemini" && currentGeminiModel ? currentGeminiModel : undefined,
        customSystemPrompt: customSystemPromptValue,
      };

      // 检查是否启用流式输出
      const streamMode = getStreamEnabled();
      pushEventLog({
        type: "tauri-event",
        source: "useOptimize",
        detail: `优化请求（${currentProvider}）：流式开关=${streamMode ? "开启" : "关闭"}`,
      });

      if (streamMode) {
        // ─── 流式模式 ───
        let streamText = "";
        let streamError: string | null = null;
        let streamChunkCount = 0;
        let firstTextAt: number | null = null;
        const streamStartedAt = performance.now();
        const PROMPT_MARKER = "---PROMPT---";
        const streamRequestId = globalThis.crypto?.randomUUID?.()
          ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const unlisten = await listen<StreamChunkPayload>("optimize-stream", (event) => {
          const payload = event.payload;
          if (payload.request_id !== streamRequestId) return;
          if (payload.type === "chunk" && payload.text) {
            streamChunkCount += 1;
            firstTextAt ??= performance.now();
            streamText += payload.text;
            // 标记到达后只显示最终提示词；标记尚未到达时也先显示已收到的内容，
            // 否则前端会把真实的流式响应隐藏到请求结束，看起来像一次性返回。
            const idx = streamText.indexOf(PROMPT_MARKER);
            const visibleText = idx === -1
              ? streamText
              : streamText.slice(idx + PROMPT_MARKER.length).trimStart();
            setResult(visibleText);
            setParsedResult(parseAiOutput(visibleText));
          } else if (payload.type === "error" && payload.message) {
            // 收到流式错误事件，记录错误信息
            streamError = payload.message;
          }
        });

        try {
          // 2. 发起流式 invoke（Rust 端会边读边 emit，最终 resolve）
          const data = await api.optimizePromptStream({
            ...commonParams,
            requestId: streamRequestId,
          });

          // 检查是否有流式错误（Rust 端可能正常返回但 stream_error 不为空）
          if (streamError) {
            throw new Error(streamError);
          }

          // 3. 流结束，用最终完整结果覆盖（确保一致性）
          setResult(data.optimized_prompt);
          setParsedResult(parseAiOutput(data.optimized_prompt));
          setFullResult(data);
          window.dispatchEvent(new CustomEvent("optimization-completed"));
          onOptimizeSuccess?.();
        } finally {
          pushEventLog({
            type: "tauri-event",
            source: "useOptimize",
            detail: `流式响应（${currentProvider}）：收到 ${streamChunkCount} 个文本分片，首字延迟 ${firstTextAt == null ? "未收到" : `${Math.round(firstTextAt - streamStartedAt)}ms`}，总耗时 ${Math.round(performance.now() - streamStartedAt)}ms`,
          });
          unlisten();
        }
      } else {
        // ─── 非流式模式（原有逻辑不变） ───
        const data = await api.optimizePrompt(commonParams);
        setResult(data.optimized_prompt);
        setParsedResult(parseAiOutput(data.optimized_prompt));
        setFullResult(data);
        window.dispatchEvent(new CustomEvent("optimization-completed"));
        onOptimizeSuccess?.();
      }
    } catch (err: unknown) {
      const message = typeof err === "string"
        ? err
        : err instanceof Error
          ? err.message
          : "优化失败";
      setError(message);
    } finally {
      setIsOptimizing(false);
    }
  }, [input, mode, language, outputFormat, images, isOptimizing, isConfigured, openSettings, onOptimizeSuccess]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    // 优先复制解析后的最终提示词部分，而非完整输出
    const textToCopy = parsedResult ? parsedResult.prompt : result;
    const plainText = markdownToPlainText(textToCopy);
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    toast.success("已复制");
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [result, parsedResult]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Enter 发送
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      handleOptimize();
      return;
    }
    // Ctrl+Enter 换行
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
  }, [handleOptimize, input, setInput]);

  return {
    input,
    setInput,
    mode,
    setMode,
    language,
    setLanguage,
    outputFormat,
    setOutputFormat,
    isOptimizing,
    result,
    parsedResult,
    error,
    copied,
    handleOptimize,
    handleCopy,
    handleKeyDown,
    isConfigured,
    fullResult,
    images,
    addImages,
    removeImage,
    clearImages,
    imageError,
  };
}
