import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Check,
  Pencil,
  Trash2,
  Star,
  RotateCcw,
  Save,
  Loader2,
} from "lucide-react";
import { cn, markdownToPlainText, parseAiOutput, parseUTCDate } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import * as api from "@/lib/tauri-api";
import type { Prompt } from "@/lib/tauri-api";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

export default function PromptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [categories, setCategories] = useState<api.Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // 延迟显示加载动画：仅在加载超过 150ms 时才显示，避免快速切换闪屏
  useEffect(() => {
    if (loading) {
      skeletonTimer.current = setTimeout(() => setShowSkeleton(true), 150);
    } else {
      if (skeletonTimer.current) clearTimeout(skeletonTimer.current);
      setShowSkeleton(false);
    }
    return () => {
      if (skeletonTimer.current) clearTimeout(skeletonTimer.current);
    };
  }, [loading]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getPrompt(id),
      api.getCategories(),
    ])
      .then(([data, cats]) => {
        setPrompt(data);
        setEditTitle(data.title);
        setEditContent(parseAiOutput(data.content).prompt);
        setCategories(cats);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleCopy = async () => {
    if (!prompt || !id) return;
    await navigator.clipboard.writeText(markdownToPlainText(prompt.content));
    setCopied(true);
    toast.success("已复制");
    await api.copyPrompt(id);
    setPrompt(prev => prev ? { ...prev, usage_count: prev.usage_count + 1 } : prev);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.updatePrompt(id, {
        title: editTitle,
        content: editContent,
      });
      setPrompt(updated);
      setIsEditing(false);
    } catch {
      console.error("Save failed");
    } finally {
      setSaving(false);
    }
  }, [id, editTitle, editContent]);

  // Ctrl+S 快捷键：编辑模式下保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && isEditing) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, handleSave]);

  const handleDelete = async () => {
    if (!id || !confirm("确定要删除这条提示词吗？")) return;
    await api.deletePrompt(id);
    navigate("/prompts");
  };

  const handleToggleFavorite = async () => {
    if (!prompt || !id) return;
    const updated = await api.updatePrompt(id, {
      isFavorite: !prompt.is_favorite,
    });
    setPrompt(updated);
  };

  if (loading && showSkeleton) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/35" />
      </div>
    );
  }

  if (loading) return null;

  if (!prompt) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm font-medium text-foreground/65">提示词不存在</p>
        <button
          onClick={() => navigate("/prompts")}
          className="mt-3 text-xs text-primary hover:underline"
        >
          返回提示词库
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pt-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border transition-all hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4 text-foreground/65" />
            </button>
          </TooltipTrigger>
          <TooltipContent>返回</TooltipContent>
        </Tooltip>

        {isEditing ? (
          <input
            id="prompt-edit-title"
            name="prompt-edit-title"
            aria-label="编辑提示词标题"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="flex-1 bg-transparent text-xl font-bold focus:outline-none border-b border-foreground/20 pb-1"
          />
        ) : (
          <h1 className="flex-1 text-xl font-bold text-foreground">{prompt.title}</h1>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleToggleFavorite}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border transition-all hover:bg-muted"
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  prompt.is_favorite
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-foreground/45"
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>{prompt.is_favorite ? "取消收藏" : "收藏"}</TooltipContent>
        </Tooltip>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2">
        {prompt.category_id && (
          <span className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-foreground/65">
            {categories.find(c => c.id === prompt.category_id)?.name || '未分类'}
          </span>
        )}
        {prompt.optimized_by_model && (
          <span className="text-sm text-foreground/35">
            模型: {prompt.optimized_by_model}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="rounded-xl border border-border bg-muted/20 p-5">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full resize-none bg-transparent text-sm leading-relaxed focus:outline-none min-h-[260px]"
          />
        ) : (
          <MarkdownRenderer content={prompt.content} className="markdown-body-full" />
        )}
      </div>

      {/* Raw Requirement */}
      {prompt.raw_requirement && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground/45">原始需求</span>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-foreground/55 leading-relaxed">{prompt.raw_requirement}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-6 text-sm text-foreground/35">
        <span>使用 {prompt.usage_count} 次</span>
        <span>优化 {prompt.optimize_count} 次</span>
        <span>创建于 {parseUTCDate(prompt.created_at).toLocaleDateString("zh-CN")}</span>
        <span>更新于 {parseUTCDate(prompt.updated_at).toLocaleDateString("zh-CN")}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isEditing ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-all hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditTitle(prompt.title);
                setEditContent(parseAiOutput(prompt.content).prompt);
              }}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              取消
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "已复制" : "复制"}
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
              编辑
            </button>
            <button
              onClick={() => navigate("/optimize")}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
              重新优化
            </button>

            <div className="flex-1" />

            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-rose-500/60 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </>
        )}
      </div>
    </div>
  );
}
