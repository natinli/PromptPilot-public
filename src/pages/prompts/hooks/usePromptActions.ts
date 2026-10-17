import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as api from "@/lib/tauri-api";
import type { Prompt } from "@/lib/tauri-api";
import { markdownToPlainText, parseAiOutput } from "@/lib/utils";
// 注意：markdownToPlainText 仅用于复制到剪贴板，编辑时保留原始 Markdown

/** 触发全局事件通知其他组件刷新 */
function dispatchUpdate(mutatedData: string[] = ["prompts"]) {
  window.dispatchEvent(
    new CustomEvent("prompts-updated", {
      detail: { source: "prompts-page", mutatedData },
    })
  );
}

export function usePromptActions(
  setPrompts: React.Dispatch<React.SetStateAction<Prompt[]>>,
  setPaginationTotal: (delta: number) => void
) {
  const navigate = useNavigate();

  // 复制状态
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedDetail, setCopiedDetail] = useState(false);

  // 详情面板
  const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);

  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  // 删除确认
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ==================== 创建手动提示词 ====================
  const createManualPrompt = useCallback(
    async (data: {
      title: string;
      content: string;
      categoryId?: string;
    }) => {
      const created = await api.createPrompt({
        ...data,
        sourceType: "manual",
      });
      dispatchUpdate(["prompts", "stats"]);
      return created;
    },
    []
  );

  // ==================== 收藏 ====================
  const toggleFavorite = useCallback(
    async (e: React.MouseEvent, id: string, favorite: boolean) => {
      e.stopPropagation();
      await api.updatePrompt(id, { isFavorite: favorite });
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_favorite: favorite } : p))
      );
      setDetailPrompt((prev) =>
        prev?.id === id ? { ...prev, is_favorite: favorite } : prev
      );
      dispatchUpdate(["prompts", "stats"]);
    },
    [setPrompts]
  );

  // ==================== 复制（卡片） ====================
  const copyFromCard = useCallback(
    async (e: React.MouseEvent, prompt: Prompt) => {
      e.stopPropagation();
      const finalPrompt = parseAiOutput(prompt.content).prompt;
      await navigator.clipboard.writeText(markdownToPlainText(finalPrompt));
      await api.copyPrompt(prompt.id);
      // 乐观更新 usage_count，避免需要手动刷新才能看到最新次数
      setPrompts((prev) =>
        prev.map((p) =>
          p.id === prompt.id ? { ...p, usage_count: p.usage_count + 1 } : p
        )
      );
      setDetailPrompt((prev) =>
        prev?.id === prompt.id
          ? { ...prev, usage_count: prev.usage_count + 1 }
          : prev
      );
      setCopiedId(prompt.id);
      toast.success("已复制");
      setTimeout(() => setCopiedId(null), 2000);
    },
    [setPrompts]
  );

  // ==================== 复制（详情面板） ====================
  const copyFromDetail = useCallback(
    async (content: string) => {
      await navigator.clipboard.writeText(markdownToPlainText(content));
      if (detailPrompt) {
        await api.copyPrompt(detailPrompt.id);
        // 乐观更新 usage_count，避免需要手动刷新才能看到最新次数
        const newCount = detailPrompt.usage_count + 1;
        setPrompts((prev) =>
          prev.map((p) =>
            p.id === detailPrompt.id
              ? { ...p, usage_count: newCount }
              : p
          )
        );
        setDetailPrompt((prev) =>
          prev?.id === detailPrompt.id
            ? { ...prev, usage_count: newCount }
            : prev
        );
      }
      setCopiedDetail(true);
      toast.success("已复制");
      setTimeout(() => setCopiedDetail(false), 2000);
    },
    [detailPrompt, setPrompts]
  );

  // ==================== 详情面板 ====================
  const openDetail = useCallback((prompt: Prompt) => {
    setDetailPrompt(prompt);
    setCopiedDetail(false);
    setIsEditing(false);
    setDeleteConfirmId(null);

  }, []);

  const closeDetail = useCallback(() => {
    setDetailPrompt(null);
    setIsEditing(false);
    setDeleteConfirmId(null);

  }, []);

  // ==================== 编辑 ====================
  const startEdit = useCallback(() => {
    if (!detailPrompt) return;
    setEditTitle(detailPrompt.title);
    // 只提取纯提示词部分，去掉优化思路和 ---PROMPT--- 分隔符
    const parsed = parseAiOutput(detailPrompt.content);
    setEditContent(parsed.prompt);
    setIsEditing(true);
  }, [detailPrompt]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!detailPrompt) return;
    setSaving(true);
    try {
      const updated = await api.updatePrompt(detailPrompt.id, {
        title: editTitle,
        content: editContent,
      });
      setDetailPrompt(updated);
      setPrompts((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      setIsEditing(false);
      dispatchUpdate(["prompts"]);
    } catch {
      console.error("Save failed");
    } finally {
      setSaving(false);
    }
  }, [detailPrompt, editTitle, editContent, setPrompts]);

  // ==================== 更新分类 ====================
  const updateCategory = useCallback(
    async (promptId: string, categoryId: string | null) => {
      try {
        const updated = await api.updatePrompt(promptId, {
          categoryId: categoryId,  // null=清除分类, string=设置分类
        });
        
        // 使用更新后的结果
        const finalData = updated;
        setDetailPrompt((prev) =>
          prev?.id === promptId ? finalData : prev
        );
        setPrompts((prev) =>
          prev.map((p) => (p.id === finalData.id ? finalData : p))
        );
        dispatchUpdate(["prompts"]);
      } catch {
        console.error("更新分类失败");
      }
    },
    [setPrompts]
  );

  // ==================== 删除 ====================
  const confirmDelete = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteConfirmId(null);
  }, []);

  const executeDelete = useCallback(
    async (id: string) => {
      try {
        await api.deletePrompt(id);
        setPrompts((prev) => prev.filter((p) => p.id !== id));
        setPaginationTotal(-1);
        if (detailPrompt?.id === id) {
          closeDetail();
        }
        dispatchUpdate(["prompts", "stats"]);
      } catch {
        console.error("Failed to delete prompt");
      } finally {
        setDeleteConfirmId(null);
      }
    },
    [detailPrompt, closeDetail, setPrompts, setPaginationTotal]
  );

  // ==================== 重新优化 ====================
  const goToOptimize = useCallback(() => {
    navigate("/optimize");
  }, [navigate]);

  return {
    // 创建
    createManualPrompt,
    // 复制
    copiedId,
    copiedDetail,
    copyFromCard,
    copyFromDetail,
    // 详情
    detailPrompt,
    setDetailPrompt,
    openDetail,
    closeDetail,
    // 分类
    updateCategory,
    // 编辑
    isEditing,
    editTitle,
    setEditTitle,
    editContent,
    setEditContent,
    saving,
    startEdit,
    cancelEdit,
    saveEdit,
    // 收藏
    toggleFavorite,
    // 删除
    deleteConfirmId,
    confirmDelete,
    cancelDelete,
    executeDelete,
    // 导航
    goToOptimize,
  };
}
