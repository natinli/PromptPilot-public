import { useRef, useState, useEffect } from "react";
import {
  Search,
  Star,
  ChevronDown,
  Plus,
  X,
  Pencil,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as tauriApi from "@/lib/tauri-api";
import type { Category } from "@/lib/tauri-api";
import type { PromptFilters } from "../hooks/usePrompts";

interface Props {
  filters: PromptFilters;
  categories: Category[];
  onUpdateFilter: <K extends keyof PromptFilters>(
    key: K,
    value: PromptFilters[K]
  ) => void;
  stats: { total: number; favorites: number };
  onAddPrompt: () => void;
  onCategoriesChange?: (categories: Category[]) => void;
}

const sortLabels: Record<string, string> = {
  updated: "最近更新",
  usage: "使用频次",
  created: "创建时间",
  custom: "自定义排序",
};

export default function PromptSearchBar({
  filters,
  categories,
  onUpdateFilter,
  stats,
  onAddPrompt,
  onCategoriesChange,
}: Props) {
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const newCatInputRef = useRef<HTMLInputElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setShowCatDropdown(false);
        setDeletingCatId(null);
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    if (showCatDropdown || showSortDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showCatDropdown, showSortDropdown]);

  const currentCat =
    filters.categoryFilter === "all"
      ? "全部分类"
      : categories.find((c) => c.id === filters.categoryFilter)?.name ?? "分类";

  return (
    <div className="shrink-0 space-y-4 mb-5 pl-4">
      {/* 标题 + 统计 */}
      <div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-foreground/65">
            提示词库
          </h1>
          <div className="flex items-center gap-4 text-xs text-foreground/55">
            <span>
              共{" "}
              <strong className="text-foreground/70 tabular-nums">
                {stats.total}
              </strong>{" "}
              条
            </span>
            <span>
              收藏{" "}
              <strong className="text-foreground/70 tabular-nums">
                {stats.favorites}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 搜索 + 筛选栏 */}
      <div className="flex items-center gap-2.5">
        {/* 搜索框 */}
        <div className="relative flex-1 group/search">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40 transition-colors group-focus-within/search:text-foreground/65" />
          <input
            id="prompt-search"
            name="prompt-search"
            type="text"
            aria-label="搜索提示词"
            placeholder="搜索提示词..."
            className="w-full rounded-xl border border-border/60 bg-background/80 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/35 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 hover:border-border"
            value={filters.keyword}
            onChange={(e) => onUpdateFilter("keyword", e.target.value)}
          />
        </div>

        {/* 分类筛选 */}
        <div className="relative" ref={catRef}>
          <button
            onClick={() => {
              setShowCatDropdown(!showCatDropdown);
              setShowSortDropdown(false);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-200 cursor-pointer",
              filters.categoryFilter !== "all"
                ? "border-primary/25 bg-primary/5 text-foreground font-medium"
                : "border-border/60 text-foreground/60 hover:bg-muted/40 hover:border-border"
            )}
          >
            {currentCat}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 opacity-40 transition-transform duration-200",
                showCatDropdown && "rotate-180"
              )}
            />
          </button>
          {showCatDropdown && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl p-1.5 shadow-xl shadow-black/5 animate-in fade-in slide-in-from-top-2 duration-150">
              <button
                onClick={() => {
                  onUpdateFilter("categoryFilter", "all");
                  setShowCatDropdown(false);
                }}
                className={cn(
                  "flex w-full rounded-lg px-3 py-2 text-sm transition-colors",
                  filters.categoryFilter === "all"
                    ? "bg-primary/8 text-foreground font-medium"
                    : "text-foreground/65 hover:bg-muted/60 hover:text-foreground/70"
                )}
              >
                全部分类
              </button>
              {categories.map((c) => (
                editingCatId === c.id ? (
                  <div key={c.id} className="relative px-1 py-1">
                    <input
                      id={`edit-cat-${c.id}`}
                      name={`edit-cat-${c.id}`}
                      type="text"
                      aria-label="编辑分类名称"
                      className="w-full rounded-md border border-primary/30 bg-background pl-2 pr-12 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/20"
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && editCatName.trim()) {
                          try {
                            const updated = await tauriApi.updateCategory(c.id, editCatName.trim());
                            onCategoriesChange?.(categories.map((cat) => cat.id === c.id ? updated : cat));
                            setEditingCatId(null);
                            setEditCatName("");
                          } catch (err) {
                            console.error("更新分类失败:", err);
                          }
                        }
                        if (e.key === "Escape") {
                          setEditingCatId(null);
                          setEditCatName("");
                        }
                      }}
                      autoFocus
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button
                        className="rounded p-0.5 text-primary/60 hover:text-primary transition-colors"
                        onClick={async () => {
                          if (editCatName.trim()) {
                            try {
                              const updated = await tauriApi.updateCategory(c.id, editCatName.trim());
                              onCategoriesChange?.(categories.map((cat) => cat.id === c.id ? updated : cat));
                            } catch (err) {
                              console.error("更新分类失败:", err);
                            }
                          }
                          setEditingCatId(null);
                          setEditCatName("");
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        className="rounded p-0.5 text-foreground/40 hover:text-foreground/70 transition-colors"
                        onClick={() => {
                          setEditingCatId(null);
                          setEditCatName("");
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    key={c.id}
                    onClick={() => {
                      onUpdateFilter("categoryFilter", c.id);
                      setShowCatDropdown(false);
                    }}
                    className={cn(
"group/cat relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                      filters.categoryFilter === c.id
                        ? "bg-primary/8 text-foreground font-medium"
                        : "text-foreground/65 hover:bg-muted/60 hover:text-foreground/70"
                    )}
                  >
                    <span>{c.name}</span>
                    <span className="flex items-center gap-0.5">
                      {/* 编辑按钮 */}
                      <Pencil
                        className="h-3 w-3 opacity-0 group-hover/cat:opacity-40 hover:!opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCatId(c.id);
                          setEditCatName(c.name);
                        }}
                      />
                      {/* 删除按钮 */}
                      <X
                        className="h-3 w-3 opacity-0 group-hover/cat:opacity-40 hover:!opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingCatId(c.id);
                        }}
                      />
                    </span>
                    {/* 删除确认浮层 */}
                    {deletingCatId === c.id && (
                      <span
                        className="absolute inset-0 z-10 flex items-center justify-between rounded-lg bg-rose-50/90 dark:bg-rose-950/60 px-2 animate-in fade-in duration-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium truncate">删除「{c.name}」？</span>
                        <span className="flex items-center gap-0.5 shrink-0">
                          <button
                            className="rounded p-0.5 text-rose-500 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await tauriApi.deleteCategory(c.id);
                                const updated = categories.filter((cat) => cat.id !== c.id);
                                onCategoriesChange?.(updated);
                                if (filters.categoryFilter === c.id) {
                                  onUpdateFilter("categoryFilter", "all");
                                }
                              } catch (err) {
                                console.error("删除分类失败:", err);
                              } finally {
                                setDeletingCatId(null);
                              }
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            className="rounded p-0.5 text-foreground/40 hover:text-foreground/70 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingCatId(null);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      </span>
                    )}
                  </button>
                )
              ))}
              {/* 分隔线 + 新建分类 */}
              <div className="mt-1 border-t border-border/40 pt-1">
                {showNewCatInput ? (
                  <div className="relative px-1">
                    <input
                      id="searchbar-new-category"
                      name="searchbar-new-category"
                      ref={newCatInputRef}
                      type="text"
                      aria-label="新建分类名称"
                      placeholder="分类名称"
                      className="w-full rounded-md border border-border/60 bg-background pl-2 pr-12 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/20"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && newCatName.trim()) {
                          try {
                            const newCat = await tauriApi.createCategory(newCatName.trim());
                            onCategoriesChange?.([...categories, newCat]);
                            setNewCatName("");
                            setShowNewCatInput(false);
                          } catch (err) {
                            console.error("创建分类失败:", err);
                          }
                        }
                        if (e.key === "Escape") {
                          setShowNewCatInput(false);
                          setNewCatName("");
                        }
                      }}
                      autoFocus
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button
                        className="rounded p-0.5 text-primary/60 hover:text-primary transition-colors"
                        onClick={async () => {
                          if (newCatName.trim()) {
                            try {
                              const newCat = await tauriApi.createCategory(newCatName.trim());
                              onCategoriesChange?.([...categories, newCat]);
                              setNewCatName("");
                              setShowNewCatInput(false);
                            } catch (err) {
                              console.error("创建分类失败:", err);
                            }
                          }
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        className="rounded p-0.5 text-foreground/40 hover:text-foreground/70 transition-colors"
                        onClick={() => {
                          setShowNewCatInput(false);
                          setNewCatName("");
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowNewCatInput(true);
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-foreground/50 hover:bg-muted/60 hover:text-foreground/70 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新建分类
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 排序 */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => {
              setShowSortDropdown(!showSortDropdown);
              setShowCatDropdown(false);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3.5 py-2.5 text-sm text-foreground/60 transition-all duration-200 hover:bg-muted/40 hover:border-border cursor-pointer"
          >
            {sortLabels[filters.sortBy]}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 opacity-40 transition-transform duration-200",
                showSortDropdown && "rotate-180"
              )}
            />
          </button>
          {showSortDropdown && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-36 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl p-1.5 shadow-xl shadow-black/5 animate-in fade-in slide-in-from-top-2 duration-150">
              {Object.entries(sortLabels).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => {
                    onUpdateFilter("sortBy", val);
                    setShowSortDropdown(false);
                  }}
                  className={cn(
                    "flex w-full rounded-lg px-3 py-2 text-sm transition-colors",
                    filters.sortBy === val
                      ? "bg-primary/8 text-foreground font-medium"
                      : "text-foreground/65 hover:bg-muted/60 hover:text-foreground/70"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 分隔线 */}
        <div className="h-5 w-px bg-border/40" />

        {/* 添加提示词 */}
        <button
          type="button"
          onClick={onAddPrompt}
          className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3.5 py-2.5 text-sm text-foreground/60 transition-all duration-200 hover:border-primary/25 hover:bg-primary/5 hover:text-primary cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          添加提示词
        </button>

        {/* 收藏筛选（仅显示收藏的提示词） */}
        <button
          onClick={() => onUpdateFilter("showFavorite", !filters.showFavorite)}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200",
            filters.showFavorite
              ? "border-amber-400/30 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-400"
              : "border-border/60 text-foreground/60 hover:text-foreground/65 hover:bg-muted/30 hover:border-border"
          )}
        >
          <Star
            className={cn(
              "h-3.5 w-3.5 transition-all duration-200",
              filters.showFavorite &&
                "fill-amber-400 text-amber-400 scale-110"
            )}
          />
          收藏
        </button>


      </div>
    </div>
  );
}
