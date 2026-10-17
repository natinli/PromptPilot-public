/**
 * optimize-modes.ts — 优化模式和语言常量
 * 统一在 MiniPageClassic 和 OptimizePage 之间共享，
 * 消除两个页面中完全相同的常量重复定义。
 */
import type { OptimizeMode } from "@/types/ai";

/** 基础优化模式（所有用户可见） */
export const baseModes: { value: OptimizeMode; label: string; emoji: string; desc: string }[] = [
  { value: "standard", label: "标准", emoji: "⚡", desc: "平衡清晰度与完整度" },
  { value: "professional", label: "专业", emoji: "🎯", desc: "详细、专业、结构完整" },
  { value: "concise", label: "精简", emoji: "✂️", desc: "简短精炼，直奔主题" },
  { value: "structured", label: "结构化", emoji: "📋", desc: "分段组织，条理清晰" },
  { value: "creative", label: "创意", emoji: "🎨", desc: "激发创意和想象力" },
];

/** Raw 直通模式（开发者模式下可见） */
export const rawMode = { value: "raw" as OptimizeMode, label: "直通", emoji: "🔗", desc: "不优化，直接发送给AI" };

/** 语言选项 */
export const languages = [
  { value: "zh-CN", label: "中文" },
  { value: "en", label: "English" },
];

/** Gemini 可用模型列表 */
export const geminiModelList = [
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

/** OpenAI 图片生成可用模型列表 */
export const openaiImageModelList = [
  "gpt-image-1",
  "dall-e-3",
  "dall-e-2",
];

/** Gemini 图片生成可用模型列表 */
export const geminiImageModelList = [
  "imagen-4.0-generate-001",
  "imagen-3.0-generate-002",
  "imagen-3.0-generate-001",
];
