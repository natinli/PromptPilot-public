/**
 * PromptPicker — 提示词选择器
 * 从提示词库中搜索并选择提示词，填充到图片生成输入框
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Library, X } from "lucide-react";
import { getPrompts, type Prompt } from "@/lib/tauri-api";
import { cn } from "@/lib/utils";

interface PromptPickerProps {
  onSelect: (prompt: Prompt) => void;
  disabled?: boolean;
}

export function PromptPicker({ onSelect, disabled }: PromptPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 加载提示词列表
  const loadPrompts = useCallback(async (keyword?: string) => {
    setIsLoading(true);
    try {
      const result = await getPrompts({
        keyword,
        pageSize: 20,
        page: 1,
      });
      setPrompts(result.items);
    } catch {
      // 静默失败
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 打开弹出层时加载
  useEffect(() => {
    if (isOpen) {
      loadPrompts(search || undefined);
      // 聚焦搜索框
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, loadPrompts]); // eslint-disable-line react-hooks/exhaustive-deps -- search 有独立的防抖 effect

  // 搜索防抖
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      loadPrompts(search || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, isOpen, loadPrompts]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleSelect = useCallback((prompt: Prompt) => {
    onSelect(prompt);
    setIsOpen(false);
    setSearch("");
  }, [onSelect]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
          "text-foreground/50 hover:bg-foreground/[0.04] hover:text-foreground/70",
          "border border-foreground/[0.06]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Library className="h-3.5 w-3.5" />
        从提示词库选择
      </button>

      {/* 弹出层 */}
      {isOpen && (
        <div className={cn(
          "absolute top-full left-0 mt-1 z-50 w-80",
          "bg-white dark:bg-[oklch(0.25_0.008_270)] rounded-xl shadow-xl",
          "ring-1 ring-foreground/10 overflow-hidden"
        )}>
          {/* 搜索框 */}
          <div className="p-2 border-b border-foreground/[0.06]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/30" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索提示词..."
                className="w-full pl-8 pr-8 py-1.5 text-xs bg-foreground/[0.03] rounded-lg border-none outline-none placeholder:text-foreground/30"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/50"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* 提示词列表 */}
          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-foreground/30">加载中...</div>
            ) : prompts.length === 0 ? (
              <div className="p-4 text-center text-xs text-foreground/30">没有找到提示词</div>
            ) : (
              prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => handleSelect(prompt)}
                  className="w-full text-left px-3 py-2.5 hover:bg-foreground/[0.03] transition-colors border-b border-foreground/[0.03] last:border-0"
                >
                  <div className="text-xs font-medium text-foreground/70 truncate">
                    {prompt.title}
                  </div>
                  <div className="text-[10px] text-foreground/40 line-clamp-2 mt-0.5 leading-relaxed">
                    {prompt.content}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
