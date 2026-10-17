/**
 * useImageGen — AI 图片生成 Hook
 * 管理图片生成状态、图片库列表和操作
 */
import { useState, useCallback, useRef } from "react";
import {
  generateImage,
  listGeneratedImages,
  deleteGeneratedImage,
  getImageFilePath,
  createPrompt,
  type GeneratedImage,
} from "@/lib/tauri-api";
import { toast } from "sonner";
import { convertFileSrc } from "@tauri-apps/api/core";

/** 图片生成参数 */
export interface ImageGenParams {
  prompt: string;
  size: string;
  provider: string;
  model?: string;
  promptId?: string;
  /** 上传的参考图 base64 列表 */
  images?: string[];
}

/** Hook 返回类型 */
export interface UseImageGenReturn {
  // 生成状态
  isGenerating: boolean;
  progress: string;
  lastGenerated: GeneratedImage | null;

  // 生成操作
  generate: (params: ImageGenParams) => Promise<GeneratedImage | null>;

  // 图片库
  images: GeneratedImage[];
  total: number;
  isLoading: boolean;
  loadImages: (page?: number, search?: string) => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  deleteImage: (id: string) => Promise<void>;

  // 提示词关联
  savePromptToLibrary: (image: GeneratedImage) => Promise<void>;

  // 图片 URL
  getImageUrl: (fileName: string) => Promise<string>;
}

export function useImageGen(): UseImageGenReturn {
  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [lastGenerated, setLastGenerated] = useState<GeneratedImage | null>(null);

  // 图片库状态
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const currentPage = useRef(1);
  const currentSearch = useRef<string | undefined>(undefined);
  const PAGE_SIZE = 20;

  /** 生成图片 */
  const generate = useCallback(async (params: ImageGenParams): Promise<GeneratedImage | null> => {
    if (!params.prompt.trim()) {
      toast.error("请输入图片描述");
      return null;
    }

    setIsGenerating(true);
    setProgress("正在生成图片...");

    try {
      const result = await generateImage({
        prompt: params.prompt,
        size: params.size,
        provider: params.provider,
        model: params.model,
        promptId: params.promptId,
        images: params.images,
      });

      setLastGenerated(result);
      setProgress("");
      toast.success(`图片生成成功 (${((result.generation_time || 0) / 1000).toFixed(1)}s)`);

      // 触发图片库更新事件
      window.dispatchEvent(new CustomEvent("images-updated"));

      return result;
    } catch (error) {
      const msg = String(error);
      toast.error(`图片生成失败: ${msg}`);
      setProgress("");
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /** 加载图片列表 */
  const loadImages = useCallback(async (page: number = 1, search?: string) => {
    setIsLoading(true);
    try {
      const result = await listGeneratedImages(page, PAGE_SIZE, search);
      if (page === 1) {
        setImages(result.items);
      } else {
        setImages(prev => [...prev, ...result.items]);
      }
      setTotal(result.total);
      currentPage.current = page;
      currentSearch.current = search;
    } catch (error) {
      toast.error(`加载图片列表失败: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** 加载更多 */
  const loadMore = useCallback(async () => {
    const nextPage = currentPage.current + 1;
    await loadImages(nextPage, currentSearch.current);
  }, [loadImages]);

  const hasMore = images.length < total;

  /** 删除图片 */
  const deleteImage = useCallback(async (id: string) => {
    try {
      await deleteGeneratedImage(id);
      setImages(prev => prev.filter(img => img.id !== id));
      setTotal(prev => prev - 1);
      toast.success("图片已删除");
      window.dispatchEvent(new CustomEvent("images-updated"));
    } catch (error) {
      toast.error(`删除失败: ${String(error)}`);
    }
  }, []);

  /** 保存提示词到词库 */
  const savePromptToLibrary = useCallback(async (image: GeneratedImage) => {
    try {
      const title = image.prompt.length > 20
        ? image.prompt.slice(0, 20) + "..."
        : image.prompt;

      await createPrompt({
        title: `[图片] ${title}`,
        content: image.prompt,
        sourceType: "image_gen",
      });

      toast.success("提示词已保存到词库");
      window.dispatchEvent(new CustomEvent("prompts-updated"));
    } catch (error) {
      toast.error(`保存失败: ${String(error)}`);
    }
  }, []);

  /** 获取图片可访问 URL（通过 convertFileSrc） */
  const getImageUrl = useCallback(async (fileName: string): Promise<string> => {
    const fullPath = await getImageFilePath(fileName);
    return convertFileSrc(fullPath);
  }, []);

  return {
    isGenerating,
    progress,
    lastGenerated,
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
  };
}
