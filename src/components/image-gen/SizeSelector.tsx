/**
 * SizeSelector — 图片尺寸选择器
 * 下拉网格展示多种比例，底部工具栏内使用
 */
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface SizeOption {
  label: string;
  value: string;
  /** 宽高比例，用于绘制缩略图标 */
  ratio: [number, number];
}

const SIZE_OPTIONS: SizeOption[] = [
  { label: "1:1",   value: "1024x1024", ratio: [1, 1] },
  { label: "2:3",   value: "768x1152",  ratio: [2, 3] },
  { label: "3:2",   value: "1152x768",  ratio: [3, 2] },
  { label: "3:4",   value: "768x1024",  ratio: [3, 4] },
  { label: "4:3",   value: "1024x768",  ratio: [4, 3] },
  { label: "4:5",   value: "832x1024",  ratio: [4, 5] },
  { label: "5:4",   value: "1024x832",  ratio: [5, 4] },
  { label: "9:16",  value: "576x1024",  ratio: [9, 16] },
  { label: "16:9",  value: "1024x576",  ratio: [16, 9] },
  { label: "21:9",  value: "1024x440",  ratio: [21, 9] },
  { label: "1:2",   value: "512x1024",  ratio: [1, 2] },
  { label: "2:1",   value: "1024x512",  ratio: [2, 1] },
];

/** 缩略比例图标 */
function RatioIcon({ ratio, active }: { ratio: [number, number]; active: boolean }) {
  const [w, h] = ratio;
  const maxSize = 18;
  const scale = maxSize / Math.max(w, h);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);

  return (
    <div className="flex items-center justify-center w-5 h-5">
      <div
        className={cn(
          "rounded-[2px] border transition-colors",
          active
            ? "border-foreground/50 bg-foreground/10"
            : "border-foreground/20 bg-foreground/[0.03]"
        )}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </div>
  );
}

interface SizeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SizeSelector({ value, onChange, disabled }: SizeSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = SIZE_OPTIONS.find((o) => o.value === value) || SIZE_OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium transition-colors",
          open
            ? "bg-foreground/5 text-foreground/70"
            : "text-foreground/55 hover:bg-muted hover:text-foreground/70",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <RatioIcon ratio={current.ratio} active={false} />
        <span>{current.label}</span>
        <ChevronDown className={cn("h-3 w-3 opacity-40 transition-transform", open && "rotate-180")} />
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute left-0 bottom-full z-50 mb-1.5 w-[260px] rounded-lg border border-border bg-background shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-150">
          <div className="p-2">
            <div className="text-[10px] text-foreground/30 font-medium px-1 pb-1.5">画面比例</div>
            <div className="grid grid-cols-4 gap-1">
              {SIZE_OPTIONS.map((option) => {
                const isActive = value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors",
                      isActive
                        ? "bg-foreground/8 text-foreground/80 ring-1 ring-foreground/15"
                        : "text-foreground/50 hover:bg-muted hover:text-foreground/70"
                    )}
                  >
                    <RatioIcon ratio={option.ratio} active={isActive} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
