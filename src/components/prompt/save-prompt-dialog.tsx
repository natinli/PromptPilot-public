import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ChevronDown, Check } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import * as tauriApi from "@/lib/tauri-api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Category {
  id: string;
  name: string;
  color: string | null;
}

interface SavePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    title: string;
    categoryId?: string;
  }) => void;
  defaultTitle?: string;
  saving?: boolean;
}

function SavePromptForm({
  defaultTitle,
  saving,
  onSave,
  onCancel,
}: {
  defaultTitle: string;
  saving: boolean;
  onSave: SavePromptDialogProps["onSave"];
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [categoryId, setCategoryId] = useState<string>("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const catDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tauriApi.getCategories()
      .then(setCategories)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) {
        setShowCatDropdown(false);
      }
    };
    if (showCatDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showCatDropdown]);

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setCreatingCategory(true);
    try {
      const newCat = await tauriApi.createCategory(trimmed);
      setCategories((prev) => [...prev, newCat]);
      setCategoryId(newCat.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch (err) {
      console.error("创建分类失败:", err);
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleSave = () => {
    const finalTitle = title.trim() || `提示词 ${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
    onSave({
      title: finalTitle,
      categoryId: categoryId || undefined,
    });
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="prompt-title">标题</Label>
          <Input
            id="prompt-title"
            placeholder="给提示词起个名字（可选，留空自动生成）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>分类</Label>
          {showNewCategory ? (
            <div className="flex gap-2">
              <Input
                id="new-category-name"
                name="new-category-name"
                aria-label="新建分类名称"
                placeholder="输入新分类名称"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateCategory();
                  }
                  if (e.key === "Escape") {
                    setShowNewCategory(false);
                    setNewCategoryName("");
                  }
                }}
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || creatingCategory}
              >
                {creatingCategory ? "..." : "确定"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowNewCategory(false);
                  setNewCategoryName("");
                }}
              >
                取消
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1" ref={catDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowCatDropdown(!showCatDropdown)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <span className={categoryId ? "text-foreground" : "text-muted-foreground"}>
                    {categoryId
                      ? categories.find((c) => c.id === categoryId)?.name ?? "选择分类（可选）"
                      : "选择分类（可选）"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {showCatDropdown && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-md">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCategoryId(c.id);
                          setShowCatDropdown(false);
                        }}
                        className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <span>{c.name}</span>
                        {categoryId === c.id && <Check className="h-4 w-4" />}
                      </button>
                    ))}
                    {categories.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">暂无分类</div>
                    )}
                  </div>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setShowNewCategory(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>新建分类</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function SavePromptDialog({
  open,
  onOpenChange,
  onSave,
  defaultTitle = "",
  saving = false,
}: SavePromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>保存提示词</DialogTitle>
        </DialogHeader>
        {open && (
          <SavePromptForm
            defaultTitle={defaultTitle}
            saving={saving}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
