/**
 * ViewSplitPage — 视图拆分页面
 * 将一张包含多个视角的图片按网格分割为多张独立图片。
 * 支持手动调节行列数 + 拖拽分割线微调，以及 AI 智能识别视图边界。
 */
import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Scissors,
  Sparkles,
  RotateCcw,
  Plus,
  Minus,
  FolderOpen,
  ClipboardPaste,
  X,
  Maximize2,
  Download,
} from "lucide-react";
import { useApiKey } from "@/components/settings/api-key-provider";
import * as api from "@/lib/tauri-api";
import { getCurrentAiProviderConfig } from "@/lib/settings-reader";
import { findGapsByPixelAnalysis } from "@/lib/pixel-analysis";

// ==================== 类型定义 ====================

interface SplitLine {
  /** 位置比例 0~1 */
  position: number;
}

interface ViewRegion {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CroppedView {
  label: string;
  dataUrl: string;      // 缩略图 dataUrl（用于预览）
  blob: Blob;           // 缩略图 blob
  width: number;        // 原始裁切区域宽度
  height: number;       // 原始裁切区域高度
  // 原始裁切坐标（用于按需生成全尺寸图片）
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** 预览缩略图最大边长 */
const PREVIEW_MAX_SIZE = 400;

// ==================== 主组件 ====================

export default function ViewSplitPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-foreground/35" />
        </div>
      }
    >
      <ViewSplitPageInner />
    </Suspense>
  );
}

function ViewSplitPageInner() {
  const { isConfigured, openSettings } = useApiKey();

  // 图片状态
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // 分割线状态（默认 1行3列）
  const [hLines, setHLines] = useState<SplitLine[]>([]);
  const [vLines, setVLines] = useState<SplitLine[]>([
    { position: 1 / 3 },
    { position: 2 / 3 },
  ]);

  // 拖拽状态
  const [dragging, setDragging] = useState<{
    type: "h" | "v";
    index: number;
  } | null>(null);

  // AI 识别状态
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI 识别的视图区域（直接裁切模式）
  const [aiRegions, setAiRegions] = useState<ViewRegion[] | null>(null);

  // AI 识别完成标记（用于UI提示和颜色区分）
  const [aiDetected, setAiDetected] = useState(false);

  // 裁切预览
  const [croppedViews, setCroppedViews] = useState<CroppedView[]>([]);

  // 大图预览弹层
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewFullUrl, setPreviewFullUrl] = useState<string | null>(null);

  // 保存状态
  const [saving, setSaving] = useState(false);
const [savedDir, setSavedDir] = useState<string | null>(() => sessionStorage.getItem("viewsplit-save-dir"));

  // refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 行数 = hLines.length + 1, 列数 = vLines.length + 1
  const rows = hLines.length + 1;
  const cols = vLines.length + 1;

  // ==================== 图片上传 ====================

  const loadImage = useCallback((file: File) => {
    const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/bmp"];
    if (!ALLOWED.includes(file.type)) {
      setAiError(`不支持的格式: ${file.type}`);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setAiError("图片超过 50MB 限制");
      return;
    }

    setAiError(null);
    setCroppedViews([]);
    setAiRegions(null);
    setImageFile(file);

    const url = URL.createObjectURL(file);
    setImageSrc(url);

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      // 默认分割线：1行3列
      setHLines([]);
      setVLines([{ position: 1 / 3 }, { position: 2 / 3 }]);
    };
    img.src = url;
  }, []);

  // ==================== 粘贴图片支持 ====================

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            // 粘贴的图片没有文件名，用短随机后缀生成唯一名称避免覆盖
            const ext = file.type.split("/")[1] || "png";
            const suffix = Math.random().toString(36).slice(2, 6);
            const namedFile = new File([file], `粘贴图片_${suffix}.${ext}`, { type: file.type });
            loadImage(namedFile);
          }
          return;
        }
      }
    },
    [loadImage]
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) {
        loadImage(files[0]);
      }
    },
    [loadImage]
  );

  // 复制单张图片到剪贴板
  // 打开大图预览时按需生成全尺寸图片（延迟到弹层动画完成后再绘制，避免卡顿）
  const openPreview = useCallback((index: number) => {
    setPreviewIndex(index);
    setPreviewFullUrl(null); // 先清空，立即显示缩略图
    const view = croppedViews[index];
    if (!view) return;
    const img = imageRef.current;
    if (!img) return;
    // 延迟到下一帧之后再生成全尺寸图片，让弹层动画先流畅完成
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 使用 JPEG 格式（quality=0.92）替代 PNG，编码速度快 3-5 倍
        const offscreen = document.createElement("canvas");
        offscreen.width = view.sw;
        offscreen.height = view.sh;
        const ctx = offscreen.getContext("2d")!;
        ctx.drawImage(img, view.sx, view.sy, view.sw, view.sh, 0, 0, view.sw, view.sh);
        offscreen.toBlob((b) => {
          if (b) {
            const url = URL.createObjectURL(b);
            // 用 Image() 预加载，确保浏览器完全解码后再切换，避免闪烁
            const preloader = new Image();
            preloader.onload = () => setPreviewFullUrl(url);
            preloader.src = url;
          }
        }, "image/jpeg", 0.92);
      });
    });
  }, [croppedViews]);

  // 切换预览图片
  const switchPreview = useCallback((newIndex: number) => {
    // 清理旧的 URL
    if (previewFullUrl) URL.revokeObjectURL(previewFullUrl);
    openPreview(newIndex);
  }, [previewFullUrl, openPreview]);

  // 关闭预览时清理
  const closePreview = useCallback(() => {
    if (previewFullUrl) URL.revokeObjectURL(previewFullUrl);
    setPreviewIndex(null);
    setPreviewFullUrl(null);
  }, [previewFullUrl]);

  /** 按需生成原始尺寸的 Blob（复制/保存时调用） */
  const getFullSizeBlob = useCallback((view: CroppedView): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = imageRef.current;
      if (!img) return reject(new Error("图片未加载"));
      const offscreen = document.createElement("canvas");
      offscreen.width = view.sw;
      offscreen.height = view.sh;
      const ctx = offscreen.getContext("2d")!;
      ctx.drawImage(img, view.sx, view.sy, view.sw, view.sh, 0, 0, view.sw, view.sh);
      offscreen.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("toBlob 失败"));
      }, "image/png");
    });
  }, []);

  const copyImageToClipboard = useCallback(async (view: CroppedView) => {
    try {
      const fullBlob = await getFullSizeBlob(view);
      const item = new ClipboardItem({ "image/png": fullBlob });
      await navigator.clipboard.write([item]);
      toast.success(`已复制第 ${view.label} 张`);
    } catch (err) {
      console.error("复制失败:", err);
      toast.error("复制失败，请重试");
    }
  }, [getFullSizeBlob]);

  const resetAll = useCallback(() => {
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageFile(null);
    setImageSrc(null);
    setImageNaturalSize(null);
    imageRef.current = null;
    setHLines([]);
    setVLines([{ position: 1 / 3 }, { position: 2 / 3 }]);
    setAiRegions(null);
    setAiDetected(false);
    setCroppedViews([]);
    setAiError(null);
  }, [imageSrc]);

  // 清理 URL
  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  // ==================== 分割线操作 ====================

  const addRow = useCallback(() => {
    setHLines((prev) => {
      if (prev.length >= 9) return prev; // 最多10行
      // 均匀分配所有分割线位置
      const newCount = prev.length + 1;
      const newLines: SplitLine[] = [];
      for (let i = 1; i <= newCount; i++) {
        newLines.push({ position: i / (newCount + 1) });
      }
      return newLines;
    });
    setAiDetected(false);
  }, []);

  const removeRow = useCallback(() => {
    setHLines((prev) => {
      if (prev.length <= 0) return prev;
      // 均匀分配剩余分割线位置
      const newCount = prev.length - 1;
      const newLines: SplitLine[] = [];
      for (let i = 1; i <= newCount; i++) {
        newLines.push({ position: i / (newCount + 1) });
      }
      return newLines;
    });
    setAiDetected(false);
  }, []);

  const addCol = useCallback(() => {
    setVLines((prev) => {
      if (prev.length >= 9) return prev;
      // 均匀分配所有分割线位置
      const newCount = prev.length + 1;
      const newLines: SplitLine[] = [];
      for (let i = 1; i <= newCount; i++) {
        newLines.push({ position: i / (newCount + 1) });
      }
      return newLines;
    });
    setAiDetected(false);
  }, []);

  const removeCol = useCallback(() => {
    setVLines((prev) => {
      if (prev.length <= 0) return prev;
      // 均匀分配剩余分割线位置
      const newCount = prev.length - 1;
      const newLines: SplitLine[] = [];
      for (let i = 1; i <= newCount; i++) {
        newLines.push({ position: i / (newCount + 1) });
      }
      return newLines;
    });
    setAiDetected(false);
  }, []);

  // ==================== Canvas 绘制 ====================

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imageNaturalSize) return;

    const container = containerRef.current;
    if (!container) return;

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    // 计算适配尺寸（保持比例）
    const scale = Math.min(containerW / img.naturalWidth, containerH / img.naturalHeight, 1);
    const drawW = Math.floor(img.naturalWidth * scale);
    const drawH = Math.floor(img.naturalHeight * scale);

    canvas.width = drawW;
    canvas.height = drawH;
    canvas.style.width = `${drawW}px`;
    canvas.style.height = `${drawH}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, drawW, drawH);
    ctx.drawImage(img, 0, 0, drawW, drawH);

    // 绘制分割线（手动模式和AI微调模式都显示）
    if (!aiRegions) {
      // 水平线红色、垂直线蓝色（AI模式和手动模式统一配色）
      const hColor = "239, 68, 68";
      const vColor = "59, 130, 246";

      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;

      // 水平线
      ctx.strokeStyle = `rgba(${hColor}, 0.85)`;
      for (const line of hLines) {
        const y = Math.round(line.position * drawH);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(drawW, y);
        ctx.stroke();

        // 拖拽手柄
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(${hColor}, 0.9)`;
        ctx.beginPath();
        ctx.roundRect(drawW / 2 - 20, y - 8, 40, 16, 8);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⋯", drawW / 2, y);
        ctx.setLineDash([6, 4]);
      }

      // 垂直线（蓝色）
      ctx.strokeStyle = `rgba(${vColor}, 0.85)`;
      for (const line of vLines) {
        const x = Math.round(line.position * drawW);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, drawH);
        ctx.stroke();

        // 拖拽手柄
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(${vColor}, 0.9)`;
        ctx.beginPath();
        ctx.roundRect(x - 8, drawH / 2 - 20, 16, 40, 8);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⋮", x, drawH / 2);
        ctx.setLineDash([6, 4]);
      }
    }

    // 绘制 AI 识别区域（仅在AI刚识别完、还未转为微调模式时短暂显示）
    if (aiRegions) {
      ctx.setLineDash([]);
      for (let i = 0; i < aiRegions.length; i++) {
        const v = aiRegions[i];
        const rx = (v.x / img.naturalWidth) * drawW;
        const ry = (v.y / img.naturalHeight) * drawH;
        const rw = (v.width / img.naturalWidth) * drawW;
        const rh = (v.height / img.naturalHeight) * drawH;

        // 绘制区域边框（蓝色）
        ctx.strokeStyle = "rgba(59, 130, 246, 0.85)";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(rx, ry, rw, rh);

        // 半透明填充
        ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
        ctx.fillRect(rx, ry, rw, rh);

        // 标签背景（数字编号）
        const label = String(i + 1);
        ctx.font = "bold 12px system-ui";
        const textW = ctx.measureText(label).width + 12;
        ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
        ctx.beginPath();
        ctx.roundRect(rx, ry, textW, 22, [0, 0, 6, 0]);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, rx + 6, ry + 11);
      }
    }

    // 绘制网格区域编号（非 aiRegions 直接绘制模式时显示）
    if (!aiRegions) {
      ctx.setLineDash([]);
      const sortedH = [0, ...hLines.map((l) => l.position).sort((a, b) => a - b), 1];
      const sortedV = [0, ...vLines.map((l) => l.position).sort((a, b) => a - b), 1];

      const circleColor = "rgba(0, 0, 0, 0.55)";

      let idx = 1;
      for (let r = 0; r < sortedH.length - 1; r++) {
        for (let c = 0; c < sortedV.length - 1; c++) {
          const cx = ((sortedV[c] + sortedV[c + 1]) / 2) * drawW;
          const cy = ((sortedH[r] + sortedH[r + 1]) / 2) * drawH;

          ctx.fillStyle = circleColor;
          ctx.beginPath();
          ctx.arc(cx, cy, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#fff";
          ctx.font = "bold 13px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(idx), cx, cy);
          idx++;
        }
      }
    }
  }, [hLines, vLines, imageNaturalSize, aiRegions]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // 窗口 resize 时重绘
  useEffect(() => {
    const handleResize = () => drawCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawCanvas]);

  // ==================== 拖拽分割线 ====================

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = canvas.width;
      const h = canvas.height;

      const THRESHOLD = 12;

      // 检查水平线
      for (let i = 0; i < hLines.length; i++) {
        const lineY = hLines[i].position * h;
        if (Math.abs(y - lineY) < THRESHOLD) {
          setDragging({ type: "h", index: i });
          e.preventDefault();
          return;
        }
      }

      // 检查垂直线
      for (let i = 0; i < vLines.length; i++) {
        const lineX = vLines[i].position * w;
        if (Math.abs(x - lineX) < THRESHOLD) {
          setDragging({ type: "v", index: i });
          e.preventDefault();
          return;
        }
      }
    },
    [hLines, vLines]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = canvas.width;
      const h = canvas.height;

      if (dragging) {
        const MIN = 0.02;
        const MAX = 0.98;
        if (dragging.type === "h") {
          const newPos = Math.max(MIN, Math.min(MAX, y / h));
          setHLines((prev) => {
            const next = [...prev];
            next[dragging.index] = { position: newPos };
            return next;
          });
        } else {
          const newPos = Math.max(MIN, Math.min(MAX, x / w));
          setVLines((prev) => {
            const next = [...prev];
            next[dragging.index] = { position: newPos };
            return next;
          });
        }
        setCroppedViews([]);
        return;
      }

      // 光标样式
      const THRESHOLD = 12;
      let cursor = "default";
      for (const line of hLines) {
        if (Math.abs(y - line.position * h) < THRESHOLD) {
          cursor = "row-resize";
          break;
        }
      }
      if (cursor === "default") {
        for (const line of vLines) {
          if (Math.abs(x - line.position * w) < THRESHOLD) {
            cursor = "col-resize";
            break;
          }
        }
      }
      canvas.style.cursor = cursor;
    },
    [dragging, hLines, vLines]
  );

  const handleCanvasMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // 全局 mouseup 防止拖出 canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => setDragging(null);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  // ==================== AI 智能识别 ====================

  // ==================== 像素分析：找间隙（已提取到 @/lib/pixel-analysis） ====================

  const handleAiDetect = useCallback(async () => {
    if (!imageFile || !imageNaturalSize) return;

    if (!isConfigured) {
      openSettings();
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      // 将图片转为 base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const aspectHint = imageNaturalSize.w > imageNaturalSize.h * 1.5
        ? "这是一张横向宽幅图片，视图很可能是水平一行排列的。"
        : imageNaturalSize.h > imageNaturalSize.w * 1.5
          ? "这是一张纵向长图，视图很可能是垂直一列排列的。"
          : "视图可能以网格形式排列。";

      // AI 只负责判断视图数量和排列方式，不需要返回精确坐标
      const prompt = `你是一个图像分析工具。这张图片包含同一物体/场景的多个视图（如正面、侧面、背面、顶部等不同角度），排列在一张图中。

图片尺寸：${imageNaturalSize.w}×${imageNaturalSize.h} 像素。${aspectHint}

**你的任务**：判断这张图片中有多少个独立的视图，以及它们的排列方式。

**分析要点**：
- 每个视图展示的是同一物体的不同角度
- 视图之间通常有空白/背景色间隔
- 注意区分：一个完整物体（包括其所有突出部件如翅膀、提手等）算一个视图

返回 JSON 格式（只返回 JSON，不要其他文字）：
{
  "layout": "horizontal" | "vertical" | "grid",
  "view_count": 总视图数量,
  "rows": 行数,
  "cols": 列数
}

示例：4个视图水平排列 → {"layout":"horizontal","view_count":4,"rows":1,"cols":4}
示例：6个视图2行3列 → {"layout":"grid","view_count":6,"rows":2,"cols":3}`;

      // 读取当前 AI Provider 设置
      const { provider: currentProvider, openaiModel: currentOpenaiModel, codebuddyModel: currentCodebuddyModel, geminiModel: currentGeminiModel } = getCurrentAiProviderConfig();

      const result = await api.optimizePrompt({
        rawRequirement: prompt,
        mode: "raw",
        images: [{ mime_type: imageFile.type, data: base64 }],
        skipLog: true,
        provider: currentProvider,
        openaiModel: currentProvider === "openai_compat" ? currentOpenaiModel : undefined,
        codebuddyModel: currentProvider === "codebuddy" ? currentCodebuddyModel : undefined,
        geminiModel: currentProvider === "gemini" && currentGeminiModel ? currentGeminiModel : undefined,
      });

      // 解析 AI 返回的 JSON
      const text = result.optimized_prompt;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("AI 返回格式异常，无法解析");
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        layout?: string;
        view_count?: number;
        rows?: number;
        cols?: number;
      };

      const layout = parsed.layout || "horizontal";
      const rows = parsed.rows || 1;
      const cols = parsed.cols || (parsed.view_count || 4);

      // 使用前端像素分析来精确定位间隙
      const img = imageRef.current;
      if (!img) throw new Error("图片未加载");

      let vSplits: number[] = [];
      let hSplits: number[] = [];

      if (layout === "horizontal" || layout === "grid") {
        // 需要垂直分割线
        const vCount = cols - 1;
        if (vCount > 0) {
          vSplits = findGapsByPixelAnalysis(img, "vertical", vCount);
        }
      }
      if (layout === "vertical" || layout === "grid") {
        // 需要水平分割线
        const hCount = rows - 1;
        if (hCount > 0) {
          hSplits = findGapsByPixelAnalysis(img, "horizontal", hCount);
        }
      }

      // 如果像素分析没找到足够的间隙，回退使用均分（但这种情况应该很少）
      if (layout !== "vertical" && vSplits.length < cols - 1) {
        console.warn("像素分析未找到足够的垂直间隙，补充均分");
        const step = imageNaturalSize.w / cols;
        vSplits = [];
        for (let i = 1; i < cols; i++) {
          vSplits.push(Math.round(step * i));
        }
      }
      if (layout !== "horizontal" && hSplits.length < rows - 1) {
        console.warn("像素分析未找到足够的水平间隙，补充均分");
        const step = imageNaturalSize.h / rows;
        hSplits = [];
        for (let i = 1; i < rows; i++) {
          hSplits.push(Math.round(step * i));
        }
      }

      // 将分割线位置转换为完整的视图区域
      const xBounds = [0, ...vSplits, imageNaturalSize.w];
      const yBounds = [0, ...hSplits, imageNaturalSize.h];

      const views: ViewRegion[] = [];
      let idx = 1;
      for (let r = 0; r < yBounds.length - 1; r++) {
        for (let c = 0; c < xBounds.length - 1; c++) {
          const x = xBounds[c];
          const y = yBounds[r];
          const w = xBounds[c + 1] - x;
          const h = yBounds[r + 1] - y;
          if (w > 0 && h > 0) {
            views.push({ label: String(idx), x, y, width: w, height: h });
            idx++;
          }
        }
      }

      // 将AI识别的分割线位置转换为 hLines/vLines（比例值），进入可微调模式
      const newVLines: SplitLine[] = vSplits.map(pos => ({ position: pos / imageNaturalSize.w }));
      const newHLines: SplitLine[] = hSplits.map(pos => ({ position: pos / imageNaturalSize.h }));

      setVLines(newVLines);
      setHLines(newHLines);
      setAiDetected(true);
      setAiRegions(null); // 不使用区域绘制模式，直接用分割线模式

      // 自动执行裁切生成预览（缩略图）
      {
        const sortedH = [0, ...newHLines.map(l => l.position).sort((a, b) => a - b), 1];
        const sortedV = [0, ...newVLines.map(l => l.position).sort((a, b) => a - b), 1];
        const results: CroppedView[] = [];
        let idx = 1;
        for (let r = 0; r < sortedH.length - 1; r++) {
          for (let c = 0; c < sortedV.length - 1; c++) {
            const sx = Math.round(sortedV[c] * imageNaturalSize.w);
            const sy = Math.round(sortedH[r] * imageNaturalSize.h);
            const sw = Math.round((sortedV[c + 1] - sortedV[c]) * imageNaturalSize.w);
            const sh = Math.round((sortedH[r + 1] - sortedH[r]) * imageNaturalSize.h);
            if (sw <= 0 || sh <= 0) continue;

            const thumbScale = Math.min(PREVIEW_MAX_SIZE / sw, PREVIEW_MAX_SIZE / sh, 1);
            const thumbW = Math.round(sw * thumbScale);
            const thumbH = Math.round(sh * thumbScale);

            const offscreen = document.createElement("canvas");
            offscreen.width = thumbW;
            offscreen.height = thumbH;
            const octx = offscreen.getContext("2d")!;
            octx.drawImage(img, sx, sy, sw, sh, 0, 0, thumbW, thumbH);
            const dataUrl = offscreen.toDataURL("image/png");
            const byteString = atob(dataUrl.split(",")[1]);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let j = 0; j < byteString.length; j++) {
              ia[j] = byteString.charCodeAt(j);
            }
            const blob = new Blob([ab], { type: "image/png" });
            results.push({ label: String(idx), dataUrl, blob, width: sw, height: sh, sx, sy, sw, sh });
            idx++;
          }
        }
        setCroppedViews(results);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  }, [imageFile, imageNaturalSize, isConfigured, openSettings]);

  // ==================== 执行裁切 ====================

  const handleSplit = useCallback(() => {
    const img = imageRef.current;
    if (!img || !imageNaturalSize) return;

    const sortedH = [0, ...hLines.map((l) => l.position).sort((a, b) => a - b), 1];
    const sortedV = [0, ...vLines.map((l) => l.position).sort((a, b) => a - b), 1];

    const results: CroppedView[] = [];
    let idx = 1;

    for (let r = 0; r < sortedH.length - 1; r++) {
      for (let c = 0; c < sortedV.length - 1; c++) {
        const sx = Math.round(sortedV[c] * imageNaturalSize.w);
        const sy = Math.round(sortedH[r] * imageNaturalSize.h);
        const sw = Math.round((sortedV[c + 1] - sortedV[c]) * imageNaturalSize.w);
        const sh = Math.round((sortedH[r + 1] - sortedH[r]) * imageNaturalSize.h);

        if (sw <= 0 || sh <= 0) continue;

        // 生成缩略图用于预览（限制最大边长，大幅减少绘制量）
        const thumbScale = Math.min(PREVIEW_MAX_SIZE / sw, PREVIEW_MAX_SIZE / sh, 1);
        const thumbW = Math.round(sw * thumbScale);
        const thumbH = Math.round(sh * thumbScale);

        const offscreen = document.createElement("canvas");
        offscreen.width = thumbW;
        offscreen.height = thumbH;
        const octx = offscreen.getContext("2d")!;
        octx.drawImage(img, sx, sy, sw, sh, 0, 0, thumbW, thumbH);

        const dataUrl = offscreen.toDataURL("image/png");

        // 同步创建缩略图 Blob
        const byteString = atob(dataUrl.split(",")[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: "image/png" });

        results.push({
          label: String(idx),
          dataUrl,
          blob,
          width: sw,
          height: sh,
          sx, sy, sw, sh,
        });
        idx++;
      }
    }

    setCroppedViews(results);
  }, [hLines, vLines, imageNaturalSize]);

  // ==================== 实时刷新预览（防抖） ====================

  useEffect(() => {
    if (!imageRef.current || !imageNaturalSize) return;

    const timer = setTimeout(() => {
      handleSplit();
    }, 300);

    return () => clearTimeout(timer);
  }, [hLines, vLines, imageNaturalSize, handleSplit]);

  // ==================== 批量保存 ====================

  // 选择保存目录（弹窗）
  const pickSaveDir = useCallback(async (): Promise<string | null> => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({
      directory: true,
      title: "选择保存目录",
      defaultPath: savedDir || undefined,
    });
    if (dir) {
      setSavedDir(dir as string);
sessionStorage.setItem("viewsplit-save-dir", dir as string);
    }
    return (dir as string) || null;
  }, [savedDir]);

  // 更换目录
  const handleChangeDir = useCallback(async () => {
    await pickSaveDir();
  }, [pickSaveDir]);

  const handleBatchSave = useCallback(async () => {
    if (croppedViews.length === 0) return;

    setSaving(true);

    try {
      // 优先使用记忆的目录，没有则弹窗选择
      let dir = savedDir;
      if (!dir) {
        dir = await pickSaveDir();
        if (!dir) {
          setSaving(false);
          return;
        }
      }

      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const { join } = await import("@tauri-apps/api/path");

      // 获取原始文件名（去掉扩展名）作为前缀
      const baseName = imageFile?.name?.replace(/\.[^.]+$/, "") || "split";

      for (let i = 0; i < croppedViews.length; i++) {
        const view = croppedViews[i];
        const fileName = `${baseName}_${i + 1}.png`;
        const filePath = await join(dir, fileName);

        // 按需生成原始尺寸 blob 用于保存
        const fullBlob = await getFullSizeBlob(view);
        const arrayBuffer = await fullBlob.arrayBuffer();
        await writeFile(filePath, new Uint8Array(arrayBuffer));
      }

      toast.success(`已保存 ${croppedViews.length} 张图片到 ${dir}`);
    } catch (err) {
      // 如果保存失败且是使用记忆目录，可能目录已不存在，清除记忆
      const errMsg = err instanceof Error ? err.message : String(err);
      if (savedDir && (errMsg.includes("not found") || errMsg.includes("No such") || errMsg.includes("不存在"))) {
        setSavedDir(null);
sessionStorage.removeItem("viewsplit-save-dir");
        toast.error("目录已失效，已清除记忆，请重新选择目录");
      } else {
        toast.error(`保存失败：${errMsg}`);
      }
    } finally {
      setSaving(false);
    }
  }, [croppedViews, imageFile, savedDir, pickSaveDir, getFullSizeBlob]);

  // ==================== 渲染 ====================

  // 编辑模式（始终显示，无图片时 Canvas 区域显示上传提示）
  return (
    <div className="flex flex-col h-full pt-6 overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground/65">视图拆分</h1>
          <p className="text-xs text-foreground/40 mt-0.5">
            {imageSrc
              ? <>{imageFile?.name} · {imageNaturalSize?.w}×{imageNaturalSize?.h}px</>
              : "上传一张包含多个视角的图片，将其拆分为多张独立图片"}
          </p>
        </div>
        {imageSrc && (
          <button
            onClick={resetAll}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground/55 transition-colors hover:bg-muted hover:text-foreground/70"
          >
            <RotateCcw className="h-4 w-4" />
            重新选择
          </button>
        )}
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 gap-4 px-4 pb-4 min-h-0 overflow-hidden">
        {/* 左侧：Canvas 编辑器 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 工具栏 */}
          <div className="flex items-center gap-2 mb-3 flex-wrap shrink-0">
            {/* 行数控制 */}
            <div className={`flex items-center gap-1 rounded-lg px-2 py-1 ${!imageSrc ? 'opacity-40 pointer-events-none' : ''}`}>
              <span className="text-xs text-foreground/50 mr-1">行</span>
              <button
                onClick={removeRow}
                disabled={hLines.length <= 0}
                className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-muted disabled:opacity-30"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-sm font-medium text-foreground/70 w-5 text-center">{rows}</span>
              <button
                onClick={addRow}
                disabled={hLines.length >= 9}
                className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-muted disabled:opacity-30"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* 列数控制 */}
            <div className={`flex items-center gap-1 rounded-lg px-2 py-1 ${!imageSrc ? 'opacity-40 pointer-events-none' : ''}`}>
              <span className="text-xs text-foreground/50 mr-1">列</span>
              <button
                onClick={removeCol}
                disabled={vLines.length <= 0}
                className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-muted disabled:opacity-30"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-sm font-medium text-foreground/70 w-5 text-center">{cols}</span>
              <button
                onClick={addCol}
                disabled={vLines.length >= 9}
                className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-muted disabled:opacity-30"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            <div className="h-5 w-px bg-border/50" />

            {/* AI 识别按钮 */}
            <button
              onClick={() => {
                // 点击 AI 识别时清除之前的状态，重新发起识别
                setAiRegions(null);
                setAiDetected(false);
                handleAiDetect();
              }}
              disabled={aiLoading || !imageSrc}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground/80 disabled:opacity-50"
            >
              {aiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              AI 智能识别
            </button>

            <div className="flex-1" />

            {/* AI 模式下显示识别结果数量 */}
            {aiDetected && (
              <span className="text-xs text-blue-500 font-medium">
                ✓ AI 识别完成 · 拖拽分割线微调
              </span>
            )}
          </div>

          {/* 错误提示 */}
          {aiError && (
            <div className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-500 shrink-0">
              {aiError}
            </div>
          )}

          {/* Canvas 区域 */}
          <div
            ref={containerRef}
            className={`flex-1 flex items-center justify-center rounded-xl border overflow-hidden min-h-0 ${
              !imageSrc
                ? `border-2 border-dashed cursor-pointer transition-all duration-200 ${
                    isDragOver ? 'border-foreground/40 bg-foreground/5' : 'border-border/60 hover:border-foreground/20 hover:bg-muted/20'
                  }`
                : 'border-border/50 bg-muted/10'
            }`}
            onDragOver={(e) => {
              if (!imageSrc) {
                e.preventDefault();
                setIsDragOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (!imageSrc) {
                e.preventDefault();
                setIsDragOver(false);
              }
            }}
            onDrop={(e) => {
              if (!imageSrc) {
                e.preventDefault();
                setIsDragOver(false);
                handleFileSelect(e.dataTransfer.files);
              }
            }}
            onClick={() => {
              if (!imageSrc) fileInputRef.current?.click();
            }}
          >
            {imageSrc ? (
              <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="max-w-full max-h-full"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 text-foreground/45">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground/5">
                  <Upload className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">拖拽图片到此处，或点击选择</p>
                  <p className="text-xs mt-1 text-foreground/35">
                    支持 PNG、JPEG、WebP、BMP，最大 50MB
                  </p>
                  <p className="text-xs mt-0.5 text-foreground/30 flex items-center justify-center gap-1">
                    <ClipboardPaste className="h-3 w-3" />
                    也可以直接 Ctrl+V 粘贴图片
                  </p>
                </div>
              </div>
            )}
          </div>

          {imageSrc && (
            <p className="text-[10px] text-foreground/35 mt-2 text-center shrink-0">
              {aiDetected
                ? <>AI 识别结果 · <span className="text-red-400">红色</span>水平线 · <span className="text-blue-400">蓝色</span>垂直线 · 拖拽可微调 · 预览实时刷新</>
                : <>拖拽分割线调整位置 · <span className="text-red-400">红色</span>水平线 · <span className="text-blue-400">蓝色</span>垂直线</>}
            </p>
          )}
        </div>

        {/* 右侧：预览面板 */}
        <div className="w-72 shrink-0 flex flex-col rounded-2xl border border-border/50 bg-background/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-foreground/55" />
              <span className="text-xs font-medium text-foreground/60">拆分预览</span>
            </div>
            {croppedViews.length > 0 && (
              <span className="text-[10px] text-foreground/35">{croppedViews.length} 张</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            {croppedViews.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-foreground/35">
                <Scissors className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">加载图片后自动预览</p>
              </div>
            ) : (
<div className="grid grid-cols-2 gap-1.5">
                {croppedViews.map((view, i) => (
                  <div
                    key={i}
                    className="group relative rounded-lg border border-border/50 overflow-hidden cursor-pointer transition-all duration-150 hover:border-foreground/25 hover:shadow-sm active:scale-95"
                    onClick={() => copyImageToClipboard(view)}
                  >
                    <img
                      src={view.dataUrl}
                      alt={view.label}
                      className="w-full aspect-[4/3] object-contain bg-muted/20"
                    />
                    {/* hover 遮罩 + 居中文字 */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors pointer-events-none">
                      <span className="text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        点击复制
                      </span>
                    </div>
                    {/* 左上角序号 */}
                    <div className="absolute top-0.5 left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/40 text-[9px] font-bold text-white">
                      {view.label}
                    </div>
                    {/* 右上角展开图标 - hover 时显示 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openPreview(i); }}
                      className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-black/60"
                      title="查看大图"
                    >
                      <Maximize2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 底部保存栏 - 分体按钮（Split Button） */}
          {croppedViews.length > 0 && (
            <div className="border-t border-border shrink-0">
              <div className="p-2">
                <div className="flex rounded-lg overflow-hidden border border-foreground/10">
                  {/* 左侧：保存按钮，hover 显示目录路径 */}
                  <button
                    onClick={handleBatchSave}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-all disabled:opacity-40 bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/[0.08]"
                    title={savedDir ? `保存到: ${savedDir}` : "首次保存将选择目录"}
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    {saving ? "保存中..." : `保存 ${croppedViews.length} 张`}
                  </button>
                  {/* 分隔线 */}
                  <div className="w-px bg-foreground/10" />
                  {/* 右侧：目录选择按钮 */}
                  <button
                    onClick={handleChangeDir}
                    className="flex items-center justify-center w-9 text-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.08] transition-colors"
                    title={savedDir ? `当前: ${savedDir}\n点击更换目录` : "选择保存目录"}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 大图预览弹层 */}
      {previewIndex !== null && croppedViews[previewIndex] && (() => {
        // 根据原始图片宽高比和视口限制，计算固定的显示尺寸
        const view = croppedViews[previewIndex];
        const maxW = window.innerWidth * 0.85;
        const maxH = window.innerHeight * 0.85;
        const scale = Math.min(maxW / view.width, maxH / view.height, 1);
        const displayW = Math.round(view.width * scale);
        const displayH = Math.round(view.height * scale);
        return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => closePreview()}
        >
          <div
            className="relative animate-in zoom-in-95 duration-200"
            style={{ width: displayW, height: displayH }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 底层：缩略图（始终显示，撑满固定尺寸容器） */}
            <img
              src={view.dataUrl}
              alt={view.label}
              className="absolute inset-0 w-full h-full object-contain rounded-lg shadow-2xl"
            />
            {/* 顶层：全尺寸图（CSS opacity 过渡淡入，不触发布局变化） */}
            <img
              src={previewFullUrl || undefined}
              alt={view.label}
              className="absolute inset-0 w-full h-full object-contain rounded-lg shadow-2xl transition-opacity duration-300"
              style={{ opacity: previewFullUrl ? 1 : 0 }}
            />
            {/* 全尺寸图片加载中指示器 */}
            {!previewFullUrl && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 z-10">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span className="text-[11px] text-white/80">加载高清图...</span>
              </div>
            )}
            {/* 关闭按钮 */}
            <button
              onClick={() => closePreview()}
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/80 text-background shadow-lg transition-colors hover:bg-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            {/* 底部信息栏 */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between rounded-b-lg bg-black/50 px-4 py-2 z-10">
              <span className="text-xs text-white/80">
                第 {view.label} 张 · {view.width}×{view.height}px
              </span>
              <button
                onClick={() => copyImageToClipboard(croppedViews[previewIndex!])}
                className="flex items-center gap-1 rounded-md bg-white/20 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/30"
              >
                复制图片
              </button>
            </div>
            {/* 左右切换 */}
            {croppedViews.length > 1 && (
              <>
                <button
                  onClick={() => switchPreview((previewIndex - 1 + croppedViews.length) % croppedViews.length)}
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/60 text-background shadow-lg transition-colors hover:bg-foreground/80"
                >
                  ‹
                </button>
                <button
                  onClick={() => switchPreview((previewIndex + 1) % croppedViews.length)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/60 text-background shadow-lg transition-colors hover:bg-foreground/80"
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>
        );
      })()}


      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
