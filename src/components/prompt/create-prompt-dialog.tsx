import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/lib/tauri-api";
import { createPromptSchema } from "@/lib/validations/prompt";

export interface CreatePromptData {
  title: string;
  content: string;
  categoryId?: string;
}

interface CreatePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onSave: (data: CreatePromptData) => Promise<void>;
}

type ValidationField = "title" | "content" | null;

export function createDefaultPromptTitle(now = new Date()): string {
  return `提示词 ${now.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function CreatePromptDialog({
  open,
  onOpenChange,
  categories,
  onSave,
}: CreatePromptDialogProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [validationField, setValidationField] = useState<ValidationField>(null);

  // 每次重新打开都从空表单开始；保存失败时不触发这个重置，因此输入会保留。
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setContent("");
    setCategoryId("");
    setSaving(false);
    setValidationMessage(null);
    setValidationField(null);
  }, [open]);

  const clearValidation = (field: ValidationField) => {
    if (validationField === field) {
      setValidationMessage(null);
      setValidationField(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const result = createPromptSchema.safeParse({
      title: title.trim() || createDefaultPromptTitle(),
      content: content.trim(),
      categoryId: categoryId || undefined,
      sourceType: "manual",
    });

    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path[0] === "title" ? "title" : "content";
      setValidationField(field);
      setValidationMessage(issue?.message ?? "请检查输入内容");
      return;
    }

    setValidationMessage(null);
    setValidationField(null);
    setSaving(true);

    try {
      await onSave({
        title: result.data.title,
        content: result.data.content,
        categoryId: result.data.categoryId,
      });
      toast.success("提示词已添加");
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存提示词失败，请重试";
      toast.error(message || "保存提示词失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && saving) return;
    onOpenChange(nextOpen);
  };

  const selectedCategoryName =
    categories.find((category) => category.id === categoryId)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="!bg-background/50 backdrop-blur-md"
        unstyled
        className="mx-4 flex max-h-[80vh] w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/95 p-0 text-sm shadow-2xl shadow-black/10 ring-0 backdrop-blur-xl dark:shadow-black/30 animate-in fade-in zoom-in-[0.97] slide-in-from-bottom-2 duration-250 sm:max-w-2xl"
      >
        <form className="flex max-h-[80vh] flex-col" onSubmit={handleSubmit}>
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border/40">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold text-foreground">
                添加提示词
              </DialogTitle>
              <DialogDescription className="sr-only">
                直接录入一条可搜索、可复用的提示词。标题留空时会自动生成。
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => handleOpenChange(false)}
              className="shrink-0 rounded-lg p-2 text-foreground/45 transition-all duration-200 hover:bg-muted/40 hover:text-foreground/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="shrink-0 border-b border-border/25 bg-muted/[0.03] px-6 py-2.5">
            <p className="text-[11px] text-foreground/50">
              直接录入提示词，保存后可以在提示词库中搜索、收藏和复用。
            </p>
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center px-6 py-2 bg-muted/[0.03]">
              <span className="text-xs font-medium text-foreground/55">
                ✏️ 编辑提示词
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="create-prompt-title" className="text-xs font-medium text-foreground/55">
                    标题（可选）
                  </Label>
                  <Input
                    id="create-prompt-title"
                    name="title"
                    placeholder="给提示词起个名字，留空自动生成"
                    value={title}
                    aria-invalid={validationField === "title"}
                    className="h-9 rounded-xl border-border/60 bg-background/60 px-3 text-sm text-foreground placeholder:text-foreground/35 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
                    onChange={(event) => {
                      setTitle(event.target.value);
                      clearValidation("title");
                    }}
                  />
                  {validationField === "title" && validationMessage && (
                    <p className="text-xs text-destructive" role="alert">
                      {validationMessage}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-prompt-content" className="text-xs font-medium text-foreground/55">
                    提示词正文
                  </Label>
                  <Textarea
                    id="create-prompt-content"
                    name="content"
                    rows={8}
                    placeholder="输入你想保存的提示词内容"
                    value={content}
                    aria-invalid={validationField === "content"}
                    onChange={(event) => {
                      setContent(event.target.value);
                      clearValidation("content");
                    }}
                    className="min-h-40 resize-y rounded-xl border-border/60 bg-background/60 px-3 py-3 text-sm leading-relaxed text-foreground placeholder:text-foreground/35 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
                  />
                  {validationField === "content" && validationMessage && (
                    <p className="text-xs text-destructive" role="alert">
                      {validationMessage}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-prompt-category" className="text-xs font-medium text-foreground/55">
                    分类（可选）
                  </Label>
                  <Select
                    value={categoryId || null}
                    onValueChange={(value) => setCategoryId(value === "__no-category__" ? "" : value ?? "")}
                  >
                    <SelectTrigger
                      id="create-prompt-category"
                      size="default"
                      className="h-9 w-full rounded-xl border-border/60 bg-background/60 text-sm text-foreground dark:bg-input/30"
                    >
                      <SelectValue placeholder="">{selectedCategoryName}</SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      className="rounded-xl border-border/60 bg-background/95 p-1.5 shadow-xl shadow-black/5 backdrop-blur-xl"
                    >
                      <SelectItem value="__no-category__" className="rounded-lg px-3 py-2 text-sm">
                        不分类
                      </SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id} className="rounded-lg px-3 py-2 text-sm">
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 px-6 py-3.5 border-t border-border/30 bg-muted/[0.02]">
            <div className="flex-1" />
            <Button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
              variant="outline"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={saving}
            >
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
