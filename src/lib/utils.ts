import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 将 Markdown 文本转为纯文本（去除格式标记），用于复制等场景 */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, (match) => {
      return match.replace(/```\w*\n?/g, '').replace(/```/g, '').trim();
    })
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*?)\]\([^)]+\)/g, '$1')
    .replace(/^[\s]*[-*+]\s+/gm, '• ')
    .replace(/^[\s]*\d+\.\s+/gm, (match) => match.replace(/^\s*/, ''))
    .replace(/^---+$/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** AI 输出解析结果 */
export interface ParsedAiOutput {
  /** 分析思路（---PROMPT--- 标记前的内容），无标记时为 null */
  analysis: string | null;
  /** 最终提示词（---PROMPT--- 标记后的内容，或全部内容） */
  prompt: string;
}

/** 
 * 解析 AI 输出，按 ---PROMPT--- 标记分离分析思路和最终提示词。
 * 如果 AI 没有输出标记，整个内容视为最终提示词（fallback）。
 */
export function parseAiOutput(raw: string): ParsedAiOutput {
  const marker = '---PROMPT---';
  const idx = raw.indexOf(marker);
  if (idx === -1) {
    return { analysis: null, prompt: raw };
  }
  const analysis = raw.substring(0, idx).trim();
  const prompt = raw.substring(idx + marker.length).trim();
  return {
    analysis: analysis || null,
    prompt: prompt || raw, // 如果标记后为空，fallback 到全部内容
  };
}

/**
 * ⚠️ 重要：解析后端返回的 UTC 时间字符串为本地 Date 对象。
 * 
 * 【强制规范】所有来自后端的时间字段（created_at / updated_at 等），
 *   必须通过本函数解析，禁止直接 new Date(item.created_at)！
 *   直接 new Date() 会导致时区偏移（UTC 被当作本地时间，差 8 小时）。
 * 
 * 兼容两种格式：
 * - 新格式（带 Z 后缀）：`"2026-04-21T03:41:41Z"` — 浏览器自动识别为 UTC
 * - 旧格式（不带时区标记）：`"2026-04-21 03:41:41"` — 需要手动加 `Z` 后缀
 * 
 * 这样 `new Date()` 会正确地将 UTC 时间转换为用户本地时区。
 * 
 * @important 新增页面/组件涉及时间显示时，务必使用此函数！
 */
export function parseUTCDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  // 如果已经带 Z 或带时区偏移（如 +08:00），直接解析
  if (dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }
  // 旧格式：将空格替换为 T，并加 Z 后缀
  return new Date(dateStr.replace(' ', 'T') + 'Z');
}
