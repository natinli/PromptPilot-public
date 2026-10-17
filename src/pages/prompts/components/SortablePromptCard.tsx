import { useSortable } from "@dnd-kit/sortable";
import type { Prompt } from "@/lib/tauri-api";
import PromptCard from "./PromptCard";

interface Props {
  prompt: Prompt;
  categoryName: string | null;
  isCopied: boolean;
  onOpen: (prompt: Prompt) => void;
  onToggleFavorite: (
    e: React.MouseEvent,
    id: string,
    favorite: boolean
  ) => void;
  onCopy: (e: React.MouseEvent, prompt: Prompt) => void;
}

export default function SortablePromptCard({
  prompt,
  categoryName,
  isCopied,
  onOpen,
  onToggleFavorite,
  onCopy,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prompt.id });

  // 只用 translate，禁用 scale — 避免网格布局中拖拽时其他卡片出现奇怪的缩放/拉伸
  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <PromptCard
        prompt={prompt}
        categoryName={categoryName}
        isCopied={isCopied}
        onOpen={onOpen}
        onToggleFavorite={onToggleFavorite}
        onCopy={onCopy}
      />
    </div>
  );
}
