export type OptimizeMode =
  | "standard"
  | "professional"
  | "concise"
  | "structured"
  | "creative"
  | "raw";

/** 图片数据（Base64 编码） */
export interface ImageData {
  /** MIME 类型，如 "image/png", "image/jpeg", "image/webp" */
  mimeType: string;
  /** Base64 编码的图片数据（不含 data:xxx;base64, 前缀） */
  data: string;
}

export interface OptimizePromptInput {
  rawRequirement: string;
  mode?: OptimizeMode;
  language?: string;
  outputFormat?: "plain_text" | "markdown";
  /** 用户上传的图片列表（可选），用于多模态优化 */
  images?: ImageData[];
}

export interface OptimizePromptOutput {
  optimizedPrompt: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface PromptOptimizerProvider {
  optimize(input: OptimizePromptInput): Promise<OptimizePromptOutput>;
}
