import { z } from "zod";

export const createPromptSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200, "标题不能超过200字"),
  content: z.string().min(1, "内容不能为空"),
  rawRequirement: z.string().optional(),
  optimizedByModel: z.string().optional(),
  categoryId: z.string().optional(),
  sourceType: z.enum(["manual", "optimized"]).optional().default("manual"),
});

export const updatePromptSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  categoryId: z.string().nullable().optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const promptQuerySchema = z.object({
  keyword: z.string().optional(),
  categoryId: z.string().optional(),
  favorite: z.string().optional(),
  archived: z.string().optional(),
  sort: z.enum(["updated", "usage", "created"]).optional().default("updated"),
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("20"),
});

export type CreatePromptInput = z.infer<typeof createPromptSchema>;
export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;
