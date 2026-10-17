import { z } from "zod";

export const optimizeRequestSchema = z.object({
  rawRequirement: z
    .string()
    .min(1, "请输入需要优化的内容")
    .max(5000, "输入内容不能超过5000字"),
  mode: z
    .enum(["standard", "professional", "concise", "structured", "creative"])
    .optional()
    .default("standard"),
  language: z.string().optional(),
  outputFormat: z
    .enum(["plain_text", "markdown"])
    .optional()
    .default("plain_text"),
});

export type OptimizeRequest = z.infer<typeof optimizeRequestSchema>;
