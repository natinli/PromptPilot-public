import { Library, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import type { Prompt } from "@/lib/tauri-api";
import PromptCard from "./PromptCard";
import SortablePromptCard from "./SortablePromptCard";

interface Props {
  prompts: Prompt[];
  loading: boolean;
  getCategoryName: (catId: string | null) => string | null;
  copiedId: string | null;
  isDragMode: boolean;
  onOpen: (prompt: Prompt) => void;
  onToggleFavorite: (
    e: React.MouseEvent,
    id: string,
    favorite: boolean
  ) => void;
  onCopy: (e: React.MouseEvent, prompt: Prompt) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

/** Shimmer 骨架屏卡片 */
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border/30 bg-background/40 p-5 space-y-3.5">
      <div className="flex items-center gap-2">
        <div className="h-4 w-3/5 rounded-lg bg-foreground/[0.04] skeleton-shimmer" />
        <div className="h-3.5 w-3.5 rounded-full bg-foreground/[0.04] ml-auto skeleton-shimmer" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded-md bg-foreground/[0.04] skeleton-shimmer" />
        <div className="h-3 w-full rounded-md bg-foreground/[0.04] skeleton-shimmer" />
        <div className="h-3 w-2/3 rounded-md bg-foreground/[0.04] skeleton-shimmer" />
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <div className="h-4 w-12 rounded-md bg-foreground/[0.04] skeleton-shimmer" />
        <div className="h-3 w-14 rounded-md bg-foreground/[0.04] ml-auto skeleton-shimmer" />
      </div>
    </div>
  );
}

export default function PromptGrid({
  prompts,
  loading,
  getCategoryName,
  copiedId,
  isDragMode,
  onOpen,
  onToggleFavorite,
  onCopy,
  onDragEnd,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 骨架屏
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // 空状态
  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-foreground/45">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground/[0.03] mb-5">
          <Library className="h-7 w-7 text-foreground/15" />
        </div>
        <p className="text-sm font-medium text-foreground/50">
          还没有提示词
        </p>
        <p className="text-xs text-foreground/35 mt-2">
          去优化页面创建你的第一个提示词吧
        </p>
        <Link
          to="/optimize"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" />
          去创建提示词
        </Link>
      </div>
    );
  }

  // 拖拽排序模式
  if (isDragMode) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={prompts.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-3 gap-4">
            {prompts.map((prompt) => (
              <SortablePromptCard
                key={prompt.id}
                prompt={prompt}
                categoryName={getCategoryName(prompt.category_id)}
                isCopied={copiedId === prompt.id}
                onOpen={onOpen}
                onToggleFavorite={onToggleFavorite}
                onCopy={onCopy}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  // 普通模式
  return (
    <div className="grid grid-cols-3 gap-4">
      {prompts.map((prompt) => (
        <PromptCard
          key={prompt.id}
          prompt={prompt}
          categoryName={getCategoryName(prompt.category_id)}
          isCopied={copiedId === prompt.id}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
          onCopy={onCopy}
        />
      ))}
    </div>
  );
}
