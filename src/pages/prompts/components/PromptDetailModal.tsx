import { useEffect, useState, useRef } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Star,
  Copy,
  Check,
  Trash2,
  Pencil,
  Save,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Plus,
} from "lucide-react";
import { cn, parseAiOutput, parseUTCDate } from "@/lib/utils";
import type { Prompt, Category } from "@/lib/tauri-api";
import * as tauriApi from "@/lib/tauri-api";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { useSettings } from "@/hooks/useSettings";

// 预设的分类颜色列表
const CATEGORY_COLORS = [
  "#f43f5e", "#ec4899", "#d946ef", "#a855f7", "#8b5cf6",
  "#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6",
  "#10b981", "#22c55e", "#84cc16", "#eab308", "#f59e0b",
  "#f97316", "#ef4444",
];

function randomColor() {
  return CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
}

interface Props {
  prompt: Prompt;
  categories: Category[];
  getCategoryName: (catId: string | null) => string | null;
  onUpdateCategory: (promptId: string, categoryId: string | null) => void;
  onCategoriesChange: (cats: Category[]) => void;
  // 复制
  copiedDetail: boolean;
  onCopyDetail: (content: string) => void;
  // 收藏
  onToggleFavorite: (
    e: React.MouseEvent,
    id: string,
    favorite: boolean
  ) => void;
  // 编辑
  isEditing: boolean;
  editTitle: string;
  editContent: string;
  saving: boolean;
  onSetEditTitle: (v: string) => void;
  onSetEditContent: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  // 删除
  deleteConfirmId: string | null;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onExecuteDelete: (id: string) => void;
  // 其他
  onClose: () => void;
  onGoToOptimize: () => void;
}

// ==================== 内联分类选择器 ====================
function InlineCategorySelector({
  currentCategoryId,
  categories,
  getCategoryName,
  onSelect,
  onCategoriesChange,
}: {
  currentCategoryId: string | null;
  categories: Category[];
  getCategoryName: (catId: string | null) => string | null;
  onSelect: (categoryId: string | null) => void;
  onCategoriesChange: (cats: Category[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNewInput(false);
        setNewName("");
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 获取当前分类的颜色
  const currentCat = categories.find((c) => c.id === currentCategoryId);
  const catName = getCategoryName(currentCategoryId);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const color = randomColor();
      const newCat = await tauriApi.createCategory(trimmed, color);
      onCategoriesChange([...categories, newCat]);
      onSelect(newCat.id);
      setShowNewInput(false);
      setNewName("");
      setOpen(false);
    } catch (err) {
      console.error("创建分类失败:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 px-0 py-0.5 text-[11px] font-medium transition-all duration-200 cursor-pointer",
          catName
            ? "text-foreground/50 hover:text-foreground/70"
            : "text-foreground/40 hover:text-foreground/55"
        )}
      >
        {currentCat?.color && (
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: currentCat.color }} />
        )}
        {catName || "添加分类"}
        <ChevronDown className="h-2.5 w-2.5 opacity-50" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 w-48 rounded-xl border border-border/60 bg-background/98 backdrop-blur-xl shadow-xl shadow-black/10 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* 无分类选项 */}
          <button
            onClick={() => { console.log("[InlineCategorySelector] 点击: 无分类"); onSelect(null); setOpen(false); }}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-muted/50",
              !currentCategoryId ? "text-primary font-medium" : "text-foreground/60"
            )}
          >
            无分类
          </button>
          {categories.map((cat) => (
            editingId === cat.id ? (
              <div key={cat.id} className="relative px-2 py-1">
                <div className="flex items-center">
                  <span
                    className="absolute left-4 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full shrink-0 z-10"
                    style={{ backgroundColor: cat.color || "#94a3b8" }}
                  />
                  <input
                    id={`modal-edit-cat-${cat.id}`}
                    name={`modal-edit-cat-${cat.id}`}
                    type="text"
                    aria-label="编辑分类名称"
                    className="w-full min-w-0 rounded-md border border-primary/30 bg-transparent pl-6 pr-11 py-0.5 text-xs focus:outline-none focus:border-primary/40"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && editName.trim()) {
                        try {
                          const updated = await tauriApi.updateCategory(cat.id, editName.trim());
                          onCategoriesChange(categories.map((c) => c.id === cat.id ? updated : c));
                          setEditingId(null);
                          setEditName("");
                        } catch (err) {
                          console.error("更新分类失败:", err);
                        }
                      }
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditName("");
                      }
                    }}
                    autoFocus
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    <button
                      className="rounded p-0.5 text-primary/60 hover:text-primary transition-colors"
                      onClick={async () => {
                        if (editName.trim()) {
                          try {
                            const updated = await tauriApi.updateCategory(cat.id, editName.trim());
                            onCategoriesChange(categories.map((c) => c.id === cat.id ? updated : c));
                          } catch (err) {
                            console.error("更新分类失败:", err);
                          }
                        }
                        setEditingId(null);
                        setEditName("");
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      className="rounded p-0.5 text-foreground/40 hover:text-foreground/70 transition-colors"
                      onClick={() => { setEditingId(null); setEditName(""); }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                key={cat.id}
                onClick={() => { onSelect(cat.id); setOpen(false); }}
                className={cn(
                  "group/cat w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-muted/50 flex items-center gap-2",
                  currentCategoryId === cat.id ? "text-primary font-medium" : "text-foreground/60"
                )}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color || "#94a3b8" }}
                />
                {cat.name}
                <span className="ml-auto flex items-center gap-0.5">
                  <Pencil
                    className="h-2.5 w-2.5 opacity-0 group-hover/cat:opacity-40 hover:!opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(cat.id);
                      setEditName(cat.name);
                    }}
                  />
                  {currentCategoryId === cat.id && <Check className="h-3 w-3 text-primary" />}
                </span>
              </button>
            )
          ))}
          <div className="border-t border-border/30 mt-1 pt-1">
            {showNewInput ? (
              <div className="relative px-2 py-1">
                <input
                  id="modal-new-category"
                  name="modal-new-category"
                  aria-label="新建分类名称"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
                    if (e.key === "Escape") { setShowNewInput(false); setNewName(""); }
                  }}
                  placeholder="分类名称"
                  className="w-full min-w-0 rounded-md border border-border/50 bg-transparent pl-2 pr-12 py-1 text-xs focus:outline-none focus:border-primary/40"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || creating}
                    className="rounded p-0.5 text-primary/60 hover:text-primary transition-colors disabled:opacity-40"
                  >
                    {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  </button>
                  <button
                    className="rounded p-0.5 text-foreground/40 hover:text-foreground/70 transition-colors"
                    onClick={() => { setShowNewInput(false); setNewName(""); }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewInput(true)}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground/45 hover:text-foreground/60 hover:bg-muted/50 flex items-center gap-1.5"
              >
                <Plus className="h-3 w-3" />
                新建分类
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 主组件 ====================
export default function PromptDetailModal({
  prompt,
  categories,
  getCategoryName,
  onUpdateCategory,
  onCategoriesChange,
  copiedDetail,
  onCopyDetail,
  onToggleFavorite,
  isEditing,
  editTitle,
  editContent,
  saving,
  onSetEditTitle,
  onSetEditContent,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  deleteConfirmId,
  onConfirmDelete,
  onCancelDelete,
  onExecuteDelete,
  onClose,
  onGoToOptimize: _onGoToOptimize,
}: Props) {
  const { showAnalysis } = useSettings();
  // ESC 关闭 + Ctrl+S 保存
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && isEditing) {
        e.preventDefault();
        onSaveEdit();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, isEditing, onSaveEdit]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-background/50 backdrop-blur-md animate-in fade-in duration-200" />

      {/* 详情卡片 */}
      <div
        className={cn(
          "relative w-full mx-4 rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/30 flex flex-col overflow-hidden animate-in fade-in zoom-in-[0.97] slide-in-from-bottom-2 duration-250",
          isEditing ? "max-w-4xl max-h-[90vh]" : "max-w-2xl max-h-[80vh]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 删除确认覆盖层 */}
        {deleteConfirmId === prompt.id && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 backdrop-blur-sm rounded-2xl animate-in fade-in duration-150">
            <div className="text-center space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-400/10 mx-auto">
                <Trash2 className="h-5 w-5 text-rose-500" />
              </div>
              <p className="text-sm font-medium text-foreground/70">
                确定删除该提示词？
              </p>
              <p className="text-xs text-foreground/50">
                此操作不可恢复
              </p>
              <div className="flex items-center gap-2.5 justify-center pt-1">
                <button
                  onClick={() => onExecuteDelete(prompt.id)}
                  className="rounded-xl bg-rose-500 px-5 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-rose-600 active:scale-[0.98]"
                >
                  确认删除
                </button>
                <button
                  onClick={onCancelDelete}
                  className="rounded-xl border border-border/60 px-5 py-2 text-xs font-medium text-foreground/65 transition-all duration-200 hover:bg-muted/60"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 头部 */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {isEditing ? (
              <input
                id="modal-edit-title"
                name="modal-edit-title"
                aria-label="编辑提示词标题"
                value={editTitle}
                onChange={(e) => onSetEditTitle(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-base font-semibold text-foreground focus:outline-none border-b-2 border-primary/30 pb-0.5 transition-colors focus:border-primary/60"
                placeholder="提示词标题"
                autoFocus
              />
            ) : (
              <h2 className="text-base font-semibold text-foreground truncate">
                {prompt.title}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0 ml-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) =>
                    onToggleFavorite(e, prompt.id, !prompt.is_favorite)
                  }
                  className="p-2 rounded-lg text-foreground/45 hover:text-foreground/60 hover:bg-muted/40 transition-all duration-200"
                >
                  <Star
                    className={cn(
                      "h-4 w-4 transition-all duration-200",
                      prompt.is_favorite
                        ? "fill-amber-400 text-amber-400 scale-110"
                        : ""
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>{prompt.is_favorite ? "取消收藏" : "收藏"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-foreground/45 hover:text-foreground/60 hover:bg-muted/40 transition-all duration-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>关闭</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* 元信息 + 分类 */}
        <div className="shrink-0 px-6 py-2.5 border-b border-border/25 bg-muted/[0.03]">
          <div className="flex items-center gap-2.5 text-[11px] text-foreground/50 flex-wrap">
            <InlineCategorySelector
              currentCategoryId={prompt.category_id}
              categories={categories}
              getCategoryName={getCategoryName}
              onSelect={(catId) => { console.log(`[PromptDetailModal] onSelect 回调: promptId=${prompt.id}, catId=${catId}`); onUpdateCategory(prompt.id, catId); }}
              onCategoriesChange={onCategoriesChange}
            />
            {prompt.optimized_by_model && (
              <>
                <span className="text-foreground/10">·</span>
                <span>模型: {prompt.optimized_by_model}</span>
              </>
            )}
            <span className="text-foreground/10">·</span>
            <span>使用 {prompt.usage_count} 次</span>
            <span className="text-foreground/10">·</span>
            <span className="tabular-nums">
              {parseUTCDate(prompt.updated_at).toLocaleString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* 原始需求 */}
          {prompt.raw_requirement && !isEditing && (
            <div className="shrink-0 max-h-[25%] flex flex-col border-b border-border/25">
              <div className="shrink-0 flex items-center px-6 py-2 bg-muted/[0.03]">
                <span className="text-xs font-medium text-foreground/55">
                  📝 原始需求
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-3">
                <p className="text-sm leading-relaxed text-foreground/50 whitespace-pre-wrap">
                  {prompt.raw_requirement}
                </p>
              </div>
            </div>
          )}

          {/* 提示词内容 */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-6 py-2 bg-muted/[0.03]">
              <span className="text-xs font-medium text-foreground/55">
                {isEditing ? "✏️ 编辑内容" : "✨ 提示词内容"}
              </span>

            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => onSetEditContent(e.target.value)}
                  className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground/75 focus:outline-none"
                  style={{ minHeight: "400px", height: "100%" }}
                  placeholder="提示词内容..."
                />
              ) : (
                <>
                  {(() => {
                    const parsed = parseAiOutput(prompt.content);
                    return (
                      <>
                        {showAnalysis && parsed.analysis && (
                          <details className="rounded-lg border border-border/30 bg-muted/20 overflow-hidden mb-3">
                            <summary className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground/50 hover:text-foreground/70 transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                              <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 [[open]>&]:rotate-90" />
                              <span>💡 优化思路</span>
                            </summary>
                            <div className="px-3 pb-2.5 border-t border-border/20">
                              <MarkdownRenderer content={parsed.analysis} className="markdown-body-full text-foreground/55" />
                            </div>
                          </details>
                        )}
                        <MarkdownRenderer content={parsed.prompt} className="markdown-body-full" />
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="shrink-0 flex items-center gap-1.5 px-6 py-3.5 border-t border-border/30 bg-muted/[0.02]">
          {isEditing ? (
            <>
              <button
                onClick={onSaveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-2.5 text-xs font-medium text-background transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? "保存中..." : "保存"}
              </button>
              <button
                onClick={onCancelEdit}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-medium text-foreground/60 transition-all duration-200 hover:bg-muted/50 hover:text-foreground/70"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onCopyDetail(parseAiOutput(prompt.content).prompt)}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-foreground/60 transition-all duration-200 hover:bg-muted/50 hover:text-foreground/70"
              >
                {copiedDetail ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedDetail ? "已复制" : "复制"}
              </button>
              <button
                onClick={onStartEdit}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-foreground/60 transition-all duration-200 hover:bg-muted/50 hover:text-foreground/70"
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>

              <div className="flex-1" />
              <button
                onClick={() => onConfirmDelete(prompt.id)}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-rose-400/60 transition-all duration-200 hover:bg-rose-500/8 hover:text-rose-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
