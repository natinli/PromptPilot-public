/**
 * ImageDetailModal — 图片详情弹窗
 * 大图预览 + 元信息 + 操作按钮
 */
import { useState, useEffect, useCallback } from "react";
import {
  X,
  Save,
  Copy,
  FolderOpen,
  Trash2,
  Clock,
  Layers,
  Ruler,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseUTCDate } from "@/lib/utils";
import type { GeneratedImage } from "@/lib/tauri-api";
import { toast } from "sonner";

interface ImageDetailModalProps {
  image: GeneratedImage | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSavePrompt: (image: GeneratedImage) => void;
  getImageUrl: (fileName: string) => Promise<string>;
}

export function ImageDetailModal({
  image,
  isOpen,
  onClose,
  onDelete,
  onSavePrompt,
  getImageUrl,
}: ImageDetailModalProps) {
  const [imageUrl, setImageUrl] = useState<string>("");

  useEffect(() => {
    if (image) {
      getImageUrl(image.file_name).then(setImageUrl).catch(() => {});
    }
  }, [image, getImageUrl]);

  const handleCopyPrompt = useCallback(() => {
    if (!image) return;
    navigator.clipboard.writeText(image.prompt).then(() => {
      toast.success("提示词已复制");
    }).catch(() => {
      toast.error("复制失败");
    });
  }, [image]);

  const handleDelete = useCallback(() => {
    if (!image) return;
    onDelete(image.id);
    onClose();
  }, [image, onDelete, onClose]);

  const handleOpenFolder = useCallback(async () => {
    if (!image) return;
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      const { getImageFilePath } = await import("@/lib/tauri-api");
      const fullPath = await getImageFilePath(image.file_name);
      // 取目录部分
      const dir = fullPath.replace(/[\\/][^\\/]+$/, "");
      await open(dir);
    } catch {
      toast.error("打开文件位置失败");
    }
  }, [image]);

  if (!isOpen || !image) return null;

  const createdAt = (() => {
    try {
      return parseUTCDate(image.created_at).toLocaleString("zh-CN");
    } catch {
      return image.created_at;
    }
  })();

  const fileSizeStr = image.file_size
    ? image.file_size > 1024 * 1024
      ? `${(image.file_size / 1024 / 1024).toFixed(1)} MB`
      : `${(image.file_size / 1024).toFixed(0)} KB`
    : "未知";

  const genTimeStr = image.generation_time
    ? `${(image.generation_time / 1000).toFixed(1)}s`
    : "未知";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* 弹窗内容 */}
      <div
        className={cn(
          "relative z-10 w-[90vw] max-w-3xl max-h-[85vh] overflow-y-auto",
          "bg-white dark:bg-[oklch(0.25_0.008_270)] rounded-2xl shadow-2xl",
          "ring-1 ring-foreground/10"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-lg bg-black/20 text-white/80 hover:bg-black/40 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 大图预览 */}
        <div className="relative bg-foreground/[0.02] rounded-t-2xl overflow-hidden flex items-center justify-center"
          style={{ maxHeight: "50vh" }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={image.prompt}
              className="max-w-full max-h-[50vh] object-contain"
            />
          ) : (
            <div className="w-64 h-64 bg-foreground/[0.03] animate-pulse rounded" />
          )}
        </div>

        {/* 详情信息 */}
        <div className="p-5 space-y-4">
          {/* 提示词 */}
          <div>
            <h4 className="text-xs font-medium text-foreground/40 mb-1.5">提示词</h4>
            <p className="text-sm text-foreground/80 leading-relaxed">{image.prompt}</p>
          </div>

          {/* 元信息网格 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoItem
              icon={<Layers className="h-3.5 w-3.5" />}
              label="Provider"
              value={`${image.provider === "openai" ? "OpenAI" : "Gemini"} · ${image.model}`}
            />
            <InfoItem
              icon={<Ruler className="h-3.5 w-3.5" />}
              label="尺寸"
              value={image.width && image.height ? `${image.width}×${image.height}` : (image.size_param || "未知")}
            />
            <InfoItem
              icon={<HardDrive className="h-3.5 w-3.5" />}
              label="大小"
              value={fileSizeStr}
            />
            <InfoItem
              icon={<Clock className="h-3.5 w-3.5" />}
              label="耗时"
              value={genTimeStr}
            />
          </div>

          <div className="text-xs text-foreground/30">
            创建于 {createdAt}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2 pt-2">
            <ActionButton
              icon={<Save className="h-3.5 w-3.5" />}
              label="保存提示词到词库"
              onClick={() => onSavePrompt(image)}
            />
            <ActionButton
              icon={<Copy className="h-3.5 w-3.5" />}
              label="复制提示词"
              onClick={handleCopyPrompt}
            />
            <ActionButton
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              label="打开文件位置"
              onClick={handleOpenFolder}
            />
            <ActionButton
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="删除"
              onClick={handleDelete}
              variant="danger"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-foreground/[0.02]">
      <span className="text-foreground/30 mt-0.5">{icon}</span>
      <div>
        <div className="text-[10px] text-foreground/30">{label}</div>
        <div className="text-xs text-foreground/70 font-medium">{value}</div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
        variant === "danger"
          ? "text-red-500/70 hover:bg-red-500/10 hover:text-red-500"
          : "text-foreground/50 hover:bg-foreground/[0.04] hover:text-foreground/70"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
