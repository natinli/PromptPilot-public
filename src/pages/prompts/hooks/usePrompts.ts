import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import * as api from "@/lib/tauri-api";
import type { Category, Prompt } from "@/lib/tauri-api";

export interface PromptFilters {
  keyword: string;
  categoryFilter: string;
  sortBy: string;
  showFavorite: boolean;
}

export interface PaginationState {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 0,
  });
  const [categories, setCategories] = useState<Category[]>([]);
  // loading 仅用于首次加载时显示骨架屏
  const [loading, setLoading] = useState(true);
  const isFirstLoad = useRef(true);
  // 标记是否已完成首次加载（后续刷新不再触发骨架屏）
  const hasLoadedOnce = useRef(false);
  // 标记是否已完成首次数据加载（用于页面级别判断是否渲染内容，避免刷新时闪过骨架屏）
  const [initialized, setInitialized] = useState(false);

  // 筛选状态
  const [filters, setFilters] = useState<PromptFilters>({
    keyword: "",
    categoryFilter: "all",
    sortBy: "updated",
    showFavorite: false,
  });

  // 用 ref 跟踪最新的 filters 和 page，避免 fetchPrompts 闭包捕获旧值
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pageRef = useRef(1);

  const updateFilter = useCallback(
    <K extends keyof PromptFilters>(key: K, value: PromptFilters[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        // 同步更新 ref，确保后续 fetchPrompts 能读到最新值
        filtersRef.current = next;
        return next;
      });
      // 筛选变化时重置分页
      if (key !== "keyword") {
        pageRef.current = 1;
        setPagination((prev) => ({ ...prev, page: 1 }));
      }
    },
    []
  );

  // fetchPrompts 使用 ref 读取最新状态，不依赖 filters/pagination
  // 这样 filters 变化时不会导致 fetchPrompts 被重建
  const fetchPrompts = useCallback(async () => {
    const currentFilters = filtersRef.current;
    const currentPage = pageRef.current;

    // 首次加载后，后续刷新不再显示骨架屏（消除闪烁）
    if (!hasLoadedOnce.current) {
      setLoading(true);
    }
    try {
      // 收藏筛选改为纯前端过滤，不再传 favorite 参数给后端
      // 彻底避免 Tauri 2 参数传递的各种坑
      const params = {
        keyword: currentFilters.keyword || undefined,
        categoryId:
          currentFilters.categoryFilter !== "all"
            ? currentFilters.categoryFilter
            : undefined,
        sort: currentFilters.sortBy,
        page: currentPage,
      };
      const data = await api.getPrompts(params);
      setPrompts(data.items || []);
      const totalPages = Math.ceil(
        (data.total || 0) / (data.page_size || 20)
      );
      setPagination({
        page: data.page || 1,
        page_size: data.page_size || 20,
        total: data.total || 0,
        total_pages: totalPages,
      });
    } catch {
      console.error("Failed to fetch prompts");
    } finally {
      setLoading(false);
      hasLoadedOnce.current = true;
    }
  }, []); // 空依赖！通过 ref 读取最新状态

  // 初始加载
  useEffect(() => {
    if (!isFirstLoad.current) return;
    isFirstLoad.current = false;

    Promise.all([
      api.getCategories(),
      api.getPrompts({ sort: "updated", page: 1 }),
    ])
      .then(([cats, promptData]) => {
        setCategories(cats);
        setPrompts(promptData.items || []);
        const totalPages = Math.ceil(
          (promptData.total || 0) / (promptData.page_size || 20)
        );
        setPagination({
          page: promptData.page || 1,
          page_size: promptData.page_size || 20,
          total: promptData.total || 0,
          total_pages: totalPages,
        });
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        hasLoadedOnce.current = true;
        setInitialized(true);
      });
  }, []);

  // 筛选变化后自动刷新（防抖）
  // 注意：showFavorite 不在依赖中，因为收藏筛选是纯前端过滤，不需要重新请求后端
  const skipFirstDebounce = useRef(true);
  useEffect(() => {
    if (skipFirstDebounce.current) {
      skipFirstDebounce.current = false;
      return;
    }
    const timer = setTimeout(fetchPrompts, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.keyword, filters.categoryFilter, filters.sortBy]);

  // 翻页时立即刷新（不需要防抖）
  const isFirstPageEffect = useRef(true);
  useEffect(() => {
    if (isFirstPageEffect.current) {
      isFirstPageEffect.current = false;
      return;
    }
    fetchPrompts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page]);

  // 监听外部更新事件（其他页面保存提示词、新建分类等）
  useEffect(() => {
    const REFRESHED_DATA = ["prompts", "categories"];

    const handlePromptsUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.source === "prompts-page") return;
      fetchPrompts();
      // 同步刷新分类列表（其他页面可能新建了分类）
      api.getCategories().then(setCategories).catch(console.error);

      // 开发模式：检测同步遗漏
      if (import.meta.env.DEV && detail?.mutatedData) {
        const missed = (detail.mutatedData as string[]).filter(
          (d) => !REFRESHED_DATA.includes(d) && d !== "stats"
        );
        if (missed.length > 0) {
          console.warn(
            `[Sync Warning] usePrompts 监听方未刷新: ${missed.join(", ")}（来源: ${detail.source || "未知"}）`
          );
        }
      }
    };
    window.addEventListener("prompts-updated", handlePromptsUpdated);
    return () => {
      window.removeEventListener("prompts-updated", handlePromptsUpdated);
    };
  }, [fetchPrompts]);

  // 翻页
  const goToPage = useCallback((page: number) => {
    pageRef.current = page;
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  // 调整总数（删除时使用）
  const adjustTotal = useCallback((delta: number) => {
    setPagination((prev) => ({ ...prev, total: prev.total + delta }));
  }, []);

  // 收藏筛选 + 收藏置顶：纯前端处理，不依赖后端参数
  // 自定义排序模式下不做收藏置顶，保持用户的拖拽顺序
  const displayPrompts = useMemo(() => {
    if (filters.showFavorite) {
      return prompts.filter((p) => p.is_favorite);
    }
    // 自定义排序模式下，保持后端返回的 sort_order 顺序
    if (filters.sortBy === "custom") {
      return prompts;
    }
    // 其他排序模式：收藏的提示词自动排在前面，未收藏的保持原有顺序
    const favorites = prompts.filter((p) => p.is_favorite);
    const nonFavorites = prompts.filter((p) => !p.is_favorite);
    return [...favorites, ...nonFavorites];
  }, [prompts, filters.showFavorite, filters.sortBy]);

  // 统计信息
  const stats = useMemo(
    () => ({
      total: pagination.total,
      favorites: prompts.filter((p) => p.is_favorite).length,
    }),
    [pagination.total, prompts]
  );

  // 获取分类名称
  const getCategoryName = useCallback(
    (catId: string | null) => {
      if (!catId) return null;
      return categories.find((c) => c.id === catId)?.name ?? null;
    },
    [categories]
  );

  // 拖拽排序模式：仅在排序方式为 custom、无搜索关键词、无分类筛选时启用
  const isDragMode = filters.sortBy === "custom" && !filters.keyword && filters.categoryFilter === "all" && !filters.showFavorite;

  // 拖拽结束处理：乐观更新本地 + 持久化到后端
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPrompts((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(prev, oldIndex, newIndex);

      // 生成新的 sort_order 值并持久化
      const updates: Array<[string, number]> = reordered.map((p, i) => [p.id, i + 1]);
      api.updatePromptSortOrder(updates).catch((err) => {
        console.error("更新排序失败:", err);
        // 失败时回退
        fetchPrompts();
      });

      // 乐观更新本地 sort_order
      return reordered.map((p, i) => ({ ...p, sort_order: i + 1 }));
    });
  }, [fetchPrompts]);

  return {
    prompts: displayPrompts,
    setPrompts,
    pagination,
    categories,
    setCategories,
    loading,
    initialized,
    filters,
    updateFilter,
    goToPage,
    adjustTotal,
    stats,
    getCategoryName,
    fetchPrompts,
    isDragMode,
    handleDragEnd,
  };
}
