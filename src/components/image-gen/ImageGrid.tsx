/**
 * ImageGrid — 图片网格组件
 * 瀑布流/网格展示已生成的图片
 */
import { useState, useEffect, useCallback } from "react";
import { Trash2, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseUTCDate } from "@/lib/utils";
import type { GeneratedImage } from "@/lib/tauri-api";

interface ImageGridProps {
  images: GeneratedImage[];
  onImageClick: (image: GeneratedImage) => void;
  onDelete: (id: string) => void;
  getImageUrl: (fileName: string) => Promise<string>;
  isLoading?: boolean;
}

export function ImageGrid({
  images,
  onImageClick,
  onDelete,
  getImageUrl,
  isLoading,
}: ImageGridProps) {
  if (isLoading && images.length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl bg-foreground/[0.03] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-foreground/40">
        <Sparkles className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm">还没有生成过图片</p>
        <p className="text-xs mt-1">输入描述，点击「生成图片」开始创作</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {images.map((image) => (
        <ImageCard
          key={image.id}
          image={image}
          onClick={() => onImageClick(image)}
          onDelete={() => onDelete(image.id)}
          getImageUrl={getImageUrl}
        />
      ))}
    </div>
  );
}

/** 单张图片卡片 */
function ImageCard({
  image,
  onClick,
  onDelete,
  getImageUrl,
}: {
  image: GeneratedImage;
  onClick: () => void;
  onDelete: () => void;
  getImageUrl: (fileName: string) => Promise<string>;
}) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    getImageUrl(image.file_name).then(setImageUrl).catch(() => {});
  }, [image.file_name, getImageUrl]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  }, [onDelete]);

  const timeStr = (() => {
    try {
      const date = parseUTCDate(image.created_at);
      return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  })();

  return (
    <div
      className={cn(
        "group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200",
        "bg-foreground/[0.02] hover:bg-foreground/[0.04]",
        "ring-1 ring-foreground/[0.06] hover:ring-foreground/[0.12]",
        "hover:shadow-md"
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 图片 */}
      <div className="aspect-square relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={image.prompt}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-foreground/[0.03] animate-pulse" />
        )}

        {/* 悬停遮罩 */}
        {isHovered && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent">
            {/* 删除按钮 */}
            <button
              onClick={handleDelete}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-white/80 hover:bg-red-500/80 hover:text-white transition-colors"
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {/* 底部信息 */}
            <div className="absolute bottom-0 left-0 right-0 p-2.5">
              <p className="text-white/90 text-xs font-medium line-clamp-2 leading-relaxed">
                {image.prompt}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 底部信息栏 */}
      <div className="px-2.5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-foreground/40 text-[10px]">
          <span className={cn(
            "inline-block w-1.5 h-1.5 rounded-full",
            image.provider === "openai" ? "bg-emerald-500" : "bg-blue-500"
          )} />
          <span>{image.provider === "openai" ? "OpenAI" : "Gemini"}</span>
        </div>
        {timeStr && (
          <div className="flex items-center gap-0.5 text-foreground/30 text-[10px]">
            <Clock className="h-2.5 w-2.5" />
            <span>{timeStr}</span>
          </div>
        )}
      </div>
    </div>
  );
}
