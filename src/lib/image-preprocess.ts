/**
 * image-preprocess.ts — 图片上传前的智能缩放预处理
 *
 * 背景：
 *  - 手机/相机原图常见 3000×4000+ 像素、3-8 MB
 *  - base64 编码后体积膨胀 33%，4-10 MB 的 data URI 会触发多种链路问题：
 *      1. OpenAI 兼容中转商对超大 base64 字段截断（图片丢失但 token 照算）
 *      2. 流式请求 body 上传期超过 60s 触发 chunk 超时
 *  - OpenAI/Gemini/Claude Vision 官方推荐的最优尺寸：
 *      - 短边 ≤ 768 px、长边 ≤ 2000 px
 *      - 超过这个尺寸模型内部也会被自动 resize 后再喂入，多余像素是浪费
 *
 * 策略：
 *  - 走 canvas 等比缩放
 *  - JPEG/WebP 在质量轴上额外做有损压缩
 *  - PNG 保持 PNG 格式（保留透明通道），仅缩尺寸；GIF 不缩放（保留动图帧）
 */

/** 单张图片的最大输出像素（长边） */
const MAX_LONG_EDGE = 2000;
/** 单张图片的最大输出像素（短边） */
const MAX_SHORT_EDGE = 768;
/** JPEG/WebP 输出质量 */
const OUTPUT_QUALITY = 0.85;
/** 文件超过此阈值才执行缩放（小图直接透传） */
const SIZE_THRESHOLD_BYTES = 1024 * 1024; // 1 MB
/** 像素超过此阈值才执行缩放 */
const PIXEL_THRESHOLD = MAX_LONG_EDGE * MAX_SHORT_EDGE;

/** 预处理结果 */
export interface PreprocessResult {
  /** 处理后的 base64 内容（不含 data URI 前缀） */
  data: string;
  /** 处理后的 MIME 类型 */
  mimeType: string;
  /** 处理后的字节数（base64 解码后的真实大小） */
  size: number;
  /** 处理后的图片宽度（像素） */
  width: number;
  /** 处理后的图片高度（像素） */
  height: number;
  /** 是否实际执行了缩放（false 表示原图直接透传） */
  resized: boolean;
}

/**
 * 把 File 加载为 HTMLImageElement，便于绘制到 canvas
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });
}

/** 同 fileToBase64，但不剥前缀，返回完整 data URI（兜底用） */
function fileToBase64Raw(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 计算缩放后的目标尺寸：等比缩放，长边 ≤ MAX_LONG_EDGE 且短边 ≤ MAX_SHORT_EDGE
 */
function computeTargetSize(srcW: number, srcH: number): { w: number; h: number } {
  const longEdge = Math.max(srcW, srcH);
  const shortEdge = Math.min(srcW, srcH);
  const longScale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
  const shortScale = shortEdge > MAX_SHORT_EDGE ? MAX_SHORT_EDGE / shortEdge : 1;
  const scale = Math.min(longScale, shortScale);
  if (scale >= 1) return { w: srcW, h: srcH };
  return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
}

/**
 * 把 canvas blob 转为 base64（剥离 data URI 前缀）
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 智能缩放预处理图片。
 *
 * 决策表：
 *  | 文件类型 | 文件 < 1MB 且像素 < 阈值 | 否则 |
 *  |---|---|---|
 *  | JPEG/WebP | 透传 | 缩放 + 同格式重编码 |
 *  | PNG | 透传 | 缩放 + 保持 PNG（保留透明通道） |
 *  | GIF | 透传（动图缩放会丢失帧） | 透传（GIF 不缩放，避免破坏动图） |
 *
 * 失败时回退到原始 base64，保证主流程可用。
 */
export async function preprocessImage(file: File): Promise<PreprocessResult> {
  // 小文件直接透传，不浪费 CPU
  const isSmall = file.size < SIZE_THRESHOLD_BYTES;

  // GIF 不缩放（避免动图变静图），直接透传
  if (file.type === "image/gif") {
    const raw = await fileToBase64Raw(file);
    const idx = raw.indexOf(",");
    const data = idx === -1 ? raw : raw.slice(idx + 1);
    return {
      data,
      mimeType: file.type,
      size: file.size,
      width: 0,
      height: 0,
      resized: false,
    };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    // 加载失败 → 回退到原始 base64
    const raw = await fileToBase64Raw(file);
    const idx = raw.indexOf(",");
    const data = idx === -1 ? raw : raw.slice(idx + 1);
    return {
      data,
      mimeType: file.type,
      size: file.size,
      width: 0,
      height: 0,
      resized: false,
    };
  }

  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const target = computeTargetSize(srcW, srcH);
  const needResize = target.w !== srcW || target.h !== srcH;
  const pixelLarge = srcW * srcH > PIXEL_THRESHOLD;

  // 不需要缩放 + 文件不大 → 原图透传
  if (!needResize && isSmall && !pixelLarge) {
    const raw = await fileToBase64Raw(file);
    const idx = raw.indexOf(",");
    const data = idx === -1 ? raw : raw.slice(idx + 1);
    return {
      data,
      mimeType: file.type,
      size: file.size,
      width: srcW,
      height: srcH,
      resized: false,
    };
  }

  // 走 canvas 重新编码
  const canvas = document.createElement("canvas");
  canvas.width = target.w;
  canvas.height = target.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // canvas 不可用 → 回退
    const raw = await fileToBase64Raw(file);
    const idx = raw.indexOf(",");
    const data = idx === -1 ? raw : raw.slice(idx + 1);
    return {
      data,
      mimeType: file.type,
      size: file.size,
      width: srcW,
      height: srcH,
      resized: false,
    };
  }

  // PNG 保持 PNG 格式（保留透明通道），WebP 转 JPEG（兼容性），JPEG 保持 JPEG
  const outputMime =
    file.type === "image/webp"
      ? "image/jpeg"
      : file.type;
  // JPEG 输出时铺白底（WebP 转 JPEG 场景），避免透明区域变黑
  if (outputMime === "image/jpeg" && file.type !== "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, target.w, target.h);
  }
  ctx.drawImage(img, 0, 0, target.w, target.h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputMime, OUTPUT_QUALITY),
  );
  if (!blob) {
    // 编码失败 → 回退原图
    const raw = await fileToBase64Raw(file);
    const idx = raw.indexOf(",");
    const data = idx === -1 ? raw : raw.slice(idx + 1);
    return {
      data,
      mimeType: file.type,
      size: file.size,
      width: srcW,
      height: srcH,
      resized: false,
    };
  }

  const data = await blobToBase64(blob);
  return {
    data,
    mimeType: outputMime,
    size: blob.size,
    width: target.w,
    height: target.h,
    resized: true,
  };
}
