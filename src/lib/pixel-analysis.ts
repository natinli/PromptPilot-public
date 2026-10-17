/**
 * pixel-analysis.ts — 图片像素分析工具
 * 从 ViewSplitPage 提取的纯算法函数，不依赖任何 React 组件状态。
 * 用于分析图片像素找到视图之间的空白间隙位置。
 */

/**
 * 扫描图片像素，找到视图之间的空白间隙位置。
 * 使用"列/行方差"策略：间隙区域的每列/行像素颜色变化小（都是背景），
 * 而物体区域的每列/行像素颜色变化大（有物体+背景混合）。
 * 同时结合背景色匹配，双重验证。
 *
 * @param img - HTMLImageElement 元素
 * @param direction - 扫描方向: "vertical" 找垂直间隙, "horizontal" 找水平间隙
 * @param splitCount - 需要找到的间隙数量
 * @returns 间隙位置的像素坐标数组（原始图片尺寸）
 */
export function findGapsByPixelAnalysis(
  img: HTMLImageElement,
  direction: "vertical" | "horizontal",
  splitCount: number,
): number[] {
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // 为了性能，对大图进行缩放采样
  const maxSample = 2000;
  const scale = direction === "vertical"
    ? Math.min(1, maxSample / w)
    : Math.min(1, maxSample / h);
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);

  const offscreen = document.createElement("canvas");
  offscreen.width = sw;
  offscreen.height = sh;
  const ctx = offscreen.getContext("2d")!;
  ctx.drawImage(img, 0, 0, sw, sh);
  const imageData = ctx.getImageData(0, 0, sw, sh);
  const pixels = imageData.data;

  // ---- 更鲁棒的背景色采样 ----
  const getPixel = (x: number, y: number): [number, number, number] => {
    const cx = Math.max(0, Math.min(sw - 1, x));
    const cy = Math.max(0, Math.min(sh - 1, y));
    const i = (cy * sw + cx) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };

  const edgeSamples: [number, number, number][] = [];
  const sampleCount = 20;
  // 上边
  for (let i = 0; i < sampleCount; i++) {
    edgeSamples.push(getPixel(Math.round(i * (sw - 1) / (sampleCount - 1)), 0));
  }
  // 下边
  for (let i = 0; i < sampleCount; i++) {
    edgeSamples.push(getPixel(Math.round(i * (sw - 1) / (sampleCount - 1)), sh - 1));
  }
  // 左边
  for (let i = 0; i < sampleCount; i++) {
    edgeSamples.push(getPixel(0, Math.round(i * (sh - 1) / (sampleCount - 1))));
  }
  // 右边
  for (let i = 0; i < sampleCount; i++) {
    edgeSamples.push(getPixel(sw - 1, Math.round(i * (sh - 1) / (sampleCount - 1))));
  }

  // 简单聚类：将颜色量化到 8x8x8 的桶中，取最大桶的平均色
  const buckets = new Map<string, { sum: [number, number, number]; count: number }>();
  for (const [r, g, b] of edgeSamples) {
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const bucket = buckets.get(key) || { sum: [0, 0, 0] as [number, number, number], count: 0 };
    bucket.sum[0] += r;
    bucket.sum[1] += g;
    bucket.sum[2] += b;
    bucket.count++;
    buckets.set(key, bucket);
  }
  let bestBucket = { sum: [200, 200, 200] as [number, number, number], count: 0 };
  for (const bucket of buckets.values()) {
    if (bucket.count > bestBucket.count) bestBucket = bucket;
  }
  const bgR = Math.round(bestBucket.sum[0] / bestBucket.count);
  const bgG = Math.round(bestBucket.sum[1] / bestBucket.count);
  const bgB = Math.round(bestBucket.sum[2] / bestBucket.count);

  // 颜色距离阈值（自适应）
  const bgVariance = (() => {
    let totalDist = 0;
    let count = 0;
    for (const [r, g, b] of edgeSamples) {
      const dr = r - bgR, dg = g - bgG, db = b - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < 80) {
        totalDist += dist;
        count++;
      }
    }
    return count > 0 ? totalDist / count : 15;
  })();
  const threshold = Math.max(40, Math.min(80, bgVariance * 3));

  const isBg = (r: number, g: number, b: number) => {
    const dr = r - bgR, dg = g - bgG, db = b - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db) < threshold;
  };

  // ---- 计算每列/每行的"间隙得分" ----
  const totalLines = direction === "vertical" ? sw : sh;
  const perpendicularSize = direction === "vertical" ? sh : sw;
  const gapScores: number[] = new Array(totalLines);

  for (let i = 0; i < totalLines; i++) {
    let bgCount = 0;
    let sumR = 0, sumG = 0, sumB = 0;
    let sumR2 = 0, sumG2 = 0, sumB2 = 0;

    for (let j = 0; j < perpendicularSize; j++) {
      const px = direction === "vertical" ? i : j;
      const py = direction === "vertical" ? j : i;
      const idx = (py * sw + px) * 4;
      const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];

      if (isBg(r, g, b)) bgCount++;
      sumR += r; sumG += g; sumB += b;
      sumR2 += r * r; sumG2 += g * g; sumB2 += b * b;
    }

    const bgRatio = bgCount / perpendicularSize;
    const n = perpendicularSize;
    const varR = sumR2 / n - (sumR / n) ** 2;
    const varG = sumG2 / n - (sumG / n) ** 2;
    const varB = sumB2 / n - (sumB / n) ** 2;
    const colorVariance = Math.sqrt(varR + varG + varB);
    const uniformity = Math.max(0, 1 - colorVariance / 120);
    gapScores[i] = bgRatio * 0.6 + uniformity * 0.4;
  }

  // ---- 滑动窗口平滑 ----
  const windowSize = Math.max(3, Math.round(totalLines * 0.005));
  const smoothed: number[] = new Array(totalLines);
  for (let i = 0; i < totalLines; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(totalLines - 1, i + windowSize); j++) {
      sum += gapScores[j];
      count++;
    }
    smoothed[i] = sum / count;
  }

  // ---- 找到间隙区域 ----
  const sortedScores = [...smoothed].sort((a, b) => a - b);
  const medianScore = sortedScores[Math.floor(sortedScores.length * 0.5)];
  const p90Score = sortedScores[Math.floor(sortedScores.length * 0.9)];
  const gapThreshold = medianScore + (p90Score - medianScore) * 0.6;

  const gaps: { start: number; end: number; center: number; peakScore: number; avgScore: number }[] = [];
  let gapStart = -1;

  for (let i = 0; i < totalLines; i++) {
    if (smoothed[i] >= gapThreshold) {
      if (gapStart === -1) gapStart = i;
    } else {
      if (gapStart !== -1) {
        const gapEnd = i - 1;
        let peakIdx = gapStart;
        let peakVal = smoothed[gapStart];
        let totalScore = 0;
        for (let k = gapStart; k <= gapEnd; k++) {
          totalScore += smoothed[k];
          if (smoothed[k] > peakVal) {
            peakVal = smoothed[k];
            peakIdx = k;
          }
        }
        const avgScore = totalScore / (gapEnd - gapStart + 1);
        gaps.push({ start: gapStart, end: gapEnd, center: peakIdx, peakScore: peakVal, avgScore });
        gapStart = -1;
      }
    }
  }
  if (gapStart !== -1) {
    const gapEnd = totalLines - 1;
    let peakIdx = gapStart;
    let peakVal = smoothed[gapStart];
    let totalScore = 0;
    for (let k = gapStart; k <= gapEnd; k++) {
      totalScore += smoothed[k];
      if (smoothed[k] > peakVal) {
        peakVal = smoothed[k];
        peakIdx = k;
      }
    }
    const avgScore = totalScore / (gapEnd - gapStart + 1);
    gaps.push({ start: gapStart, end: gapEnd, center: peakIdx, peakScore: peakVal, avgScore });
  }

  // 过滤图片边缘
  const margin = Math.round(totalLines * 0.05);
  const innerGaps = gaps.filter(g => g.center > margin && g.center < totalLines - margin);

  // 按峰值得分排序，取前 splitCount 个
  innerGaps.sort((a, b) => b.peakScore - a.peakScore);
  const selectedGaps = innerGaps.slice(0, splitCount);

  // 转换回原始像素坐标并排序
  const splitPositions = selectedGaps
    .map(g => Math.round(g.center / scale))
    .sort((a, b) => a - b);

  return splitPositions;
}
