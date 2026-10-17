/**
 * Tauri API 适配层
 * 将所有 Tauri invoke 调用封装成类型安全的函数
 * 替代原 Next.js 的 fetch("/api/xxx") 调用
 */
import { invoke } from "@tauri-apps/api/core";
import { pushIpcLog, pushAiLog, updateAiLog } from "@/components/debug/debug-store";

// ==================== Debug 日志系统 ====================
// 开发模式下自动打印所有 IPC 调用的入参和返回值，方便排查数据流问题
// 同时推送到可视化 Debug 面板（按 F8 打开），无需手动打开浏览器控制台
// 生产模式下完全静默，零性能开销

const DEBUG_IPC = import.meta.env.DEV;

const REDACTED_IPC_VALUE = "<redacted>";
const SENSITIVE_IPC_COMMANDS = new Set(["get_api_key", "get_api_key_for_provider"]);

function isSensitiveIpcField(fieldName: string): boolean {
  const normalized = fieldName.replace(/[-_]/g, "").toLowerCase();
  return normalized === "key"
    || normalized === "apikey"
    || normalized === "authorization"
    || normalized === "secret"
    || normalized === "accesstoken"
    || normalized === "refreshtoken";
}

/** Debug 日志中的敏感字段统一脱敏，但不改变实际 IPC 请求。 */
function redactIpcLogValue(value: unknown, fieldName = ""): unknown {
  if (SENSITIVE_IPC_COMMANDS.has(fieldName) || isSensitiveIpcField(fieldName)) {
    return REDACTED_IPC_VALUE;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactIpcLogValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, nestedValue]) => [key, redactIpcLogValue(nestedValue, key)]),
    );
  }
  return value;
}

/**
 * 带 debug 日志的 invoke 包装
 * 开发模式下自动打印：命令名、入参、返回值/错误
 * 同时推送到 Debug 面板（F8 打开），方便无开发经验的用户查看
 * 生产模式下等同于原生 invoke，零开销
 */
async function invokeWithLog<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (DEBUG_IPC) {
    const loggedArgs = redactIpcLogValue(args ?? {});
    console.log(`[IPC →] ${cmd}`, loggedArgs);
    pushIpcLog({ command: cmd, direction: "request", data: loggedArgs });
  }
  const startTime = DEBUG_IPC ? performance.now() : 0;
  try {
    const result = await invoke<T>(cmd, args);
    if (DEBUG_IPC) {
      const duration = Math.round(performance.now() - startTime);
      const loggedResult = redactIpcLogValue(result, cmd);
      console.log(`[IPC ←] ${cmd} ✅`, loggedResult);
      pushIpcLog({ command: cmd, direction: "response", data: loggedResult, duration });
    }
    return result;
  } catch (error) {
    if (DEBUG_IPC) {
      const duration = Math.round(performance.now() - startTime);
      const loggedError = redactIpcLogValue(error, cmd);
      console.error(`[IPC ←] ${cmd} ❌`, loggedError);
      pushIpcLog({ command: cmd, direction: "error", data: loggedError, duration });
    }
    throw error;
  }
}

// ==================== 类型定义 ====================

export interface Category {
  id: string;
  name: string;
  color: string | null;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  raw_requirement: string | null;
  optimized_by_model: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  usage_count: number;
  optimize_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  category_id: string | null;
  sort_order: number;
}

export interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface PromptsResult {
  items: Prompt[];
  total: number;
  page: number;
  page_size: number;
}

export interface StatsResult {
  total_prompts: number;
  total_categories: number;
  total_favorites: number;
  total_optimizations: number;
}

export interface OptimizeResult {
  optimized_prompt: string;
  model: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface OptimizationLog {
  id: string;
  input_text: string;
  output_text: string | null;
  mode: string;
  model_name: string;
  token_in: number | null;
  token_out: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

// ==================== Prompt CRUD ====================

/** 分页查询提示词列表（支持搜索、分类、收藏、归档过滤和排序） */
export async function getPrompts(params: {
  keyword?: string;
  categoryId?: string;
  favorite?: boolean;
  archived?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
}): Promise<PromptsResult> {
  // 使用字符串协议传递布尔值，彻底避免 Tauri 2 对 bool/number 的隐式转换问题
  // 后端用 Option<String> 接收，自行解析 "true"/"false"
  // Tauri 2 的 #[tauri::command] 默认将 Rust snake_case 参数映射为 camelCase
  const invokeParams = {
    search: params.keyword || null,
    categoryId: params.categoryId || null,
    isFavorite: params.favorite === true ? "true" : null,
    isArchived: "false",
    sort: params.sort || null,
    page: params.page || 1,
    pageSize: params.pageSize || 20,
  };
  return invokeWithLog("get_prompts", invokeParams);
}

/** 根据 ID 查询单个提示词 */
export async function getPrompt(id: string): Promise<Prompt> {
  return invokeWithLog("get_prompt", { id });
}

export async function createPrompt(data: {
  title: string;
  content: string;
  rawRequirement?: string;
  optimizedByModel?: string;
  categoryId?: string;
  sourceType?: string;
}): Promise<Prompt> {
  return invokeWithLog("create_prompt", {
    title: data.title,
    content: data.content,
    rawRequirement: data.rawRequirement || null,
    categoryId: data.categoryId || null,
    sourceType: data.sourceType || "manual",
  });
}

export async function updatePrompt(
  id: string,
  data: {
    title?: string;
    content?: string;
    isFavorite?: boolean;
    isArchived?: boolean;
    categoryId?: string | null;  // undefined=不更新, null=清除分类, string=设置分类
  }
): Promise<Prompt> {
  // ★ Tauri 2 的 #[tauri::command] 默认将 Rust snake_case 参数映射为 camelCase
  // 所以前端必须用 camelCase 传参，否则 Option<T> 参数会静默变成 None
  const invokeArgs: Record<string, unknown> = { id };

  if (data.title !== undefined) {
    invokeArgs.title = data.title;
  }
  if (data.content !== undefined) {
    invokeArgs.content = data.content;
  }
  if (data.isFavorite !== undefined) {
    invokeArgs.isFavorite = String(data.isFavorite);
  }
  if (data.isArchived !== undefined) {
    invokeArgs.isArchived = String(data.isArchived);
  }

  // categoryId: undefined → 不传（后端 Option 默认 None，保持原值）
  //             null → 传空字符串（清除分类）
  //             string → 传原值（设置分类）
  if (data.categoryId === null) {
    invokeArgs.categoryId = "";  // 空字符串告诉后端清除分类
  } else if (data.categoryId !== undefined) {
    invokeArgs.categoryId = data.categoryId;  // 设置新分类
  }
  // else: undefined → 不传 categoryId 字段，后端收到 None

  return invokeWithLog("update_prompt", invokeArgs);
}

/** 删除提示词（软删除） */
export async function deletePrompt(id: string): Promise<void> {
  return invokeWithLog("delete_prompt", { id });
}

/** 复制提示词内容到剪贴板并递增使用计数 */
export async function copyPrompt(id: string): Promise<void> {
  return invokeWithLog("copy_prompt", { id });
}

/** 创建提示词副本 */
export async function duplicatePrompt(id: string): Promise<Prompt> {
  return invokeWithLog("duplicate_prompt", { id });
}

/** 批量更新提示词排序顺序 */
export async function updatePromptSortOrder(updates: Array<[string, number]>): Promise<void> {
  return invokeWithLog("update_prompt_sort_order", { updates });
}

// ==================== 辅助数据 ====================

/** 查询所有分类 */
export async function getCategories(): Promise<Category[]> {
  return invokeWithLog("get_categories");
}

/** 创建新分类 */
export async function createCategory(name: string, color?: string): Promise<Category> {
  return invokeWithLog("create_category", { name, color: color || null });
}

/** 更新分类（重命名或改颜色） */
export async function updateCategory(id: string, name?: string, color?: string): Promise<Category> {
  return invokeWithLog("update_category", { id, name: name || null, color: color || null });
}

/** 删除分类 */
export async function deleteCategory(id: string): Promise<void> {
  return invokeWithLog("delete_category", { id });
}

/** 查询统计摘要（提示词数、分类数、收藏数、优化数） */
export async function getStats(): Promise<StatsResult> {
  return invokeWithLog("get_stats");
}

// ==================== AI 优化 ====================

export async function optimizePrompt(params: {
  rawRequirement: string;
  mode: string;
  language?: string;
  outputFormat?: string;
  apiKey?: string;
  promptId?: string;
  images?: { mime_type: string; data: string }[];
  skipLog?: boolean;
  /** AI Provider 选择："gemini"(default) | "openai_compat" | "codebuddy" */
  provider?: string;
  /** OpenAI 兼容 Provider 的模型名称 */
  openaiModel?: string;
  /** OpenAI 兼容 Provider 的端点 URL */
  openaiEndpoint?: string;
  /** CodeBuddy Provider 的模型名称 */
  codebuddyModel?: string;
  /** Gemini 模型名称（开发者模式下可切换） */
  geminiModel?: string;
  /** 用户自定义系统提示词（追加到 system prompt 末尾） */
  customSystemPrompt?: string;
}): Promise<OptimizeResult> {
  // 推送 AI 日志（pending 状态）
  const aiLogId = DEBUG_IPC ? pushAiLog({
    requestType: params.mode,
    promptSummary: params.rawRequirement.slice(0, 100) + (params.rawRequirement.length > 100 ? "..." : ""),
    model: params.provider || "gemini",
    status: "pending",
    startTime: new Date(),
  }) : 0;
  const aiStartTime = performance.now();

  try {
    // Rust 后端返回 OptimizationLog，需要映射到前端 OptimizeResult
    const log: OptimizationLog = await invokeWithLog("optimize_prompt", {
      req: {
        raw_requirement: params.rawRequirement,
        mode: params.mode,
        language: params.language || "zh-CN",
        output_format: params.outputFormat || "plain_text",
        api_key: params.apiKey || null,
        model: params.geminiModel || null,
        prompt_id: params.promptId || null,
        images: params.images && params.images.length > 0 ? params.images : null,
        skip_log: params.skipLog || false,
        provider: params.provider || null,
        openai_model: params.openaiModel || null,
        openai_endpoint: params.openaiEndpoint || null,
        codebuddy_model: params.codebuddyModel || null,
        custom_system_prompt: params.customSystemPrompt || null,
      },
    });

    // 更新 AI 日志为成功
    if (DEBUG_IPC) {
      updateAiLog(aiLogId, {
        status: "success",
        duration: Math.round(performance.now() - aiStartTime),
        responseSummary: (log.output_text || "").slice(0, 100) + ((log.output_text || "").length > 100 ? "..." : ""),
      });
    }

    return {
      optimized_prompt: log.output_text || "",
      model: log.model_name,
      usage: {
        input_tokens: log.token_in ?? undefined,
        output_tokens: log.token_out ?? undefined,
      },
    };
  } catch (error) {
    // 更新 AI 日志为失败
    if (DEBUG_IPC) {
      updateAiLog(aiLogId, {
        status: "error",
        duration: Math.round(performance.now() - aiStartTime),
        error: String(error),
      });
    }
    throw error;
  }
}

/** 查询优化日志列表 */
export async function getOptimizationLogs(
  limit?: number
): Promise<OptimizationLog[]> {
  return invokeWithLog("get_optimization_logs", { limit: limit || null });
}

/** 分页查询优化日志（支持 offset + status/mode 过滤） */
export async function getOptimizationLogsPaged(
  limit: number,
  offset: number,
  statusFilter?: string,
  excludeMode?: string,
): Promise<OptimizationLog[]> {
  return invokeWithLog("get_optimization_logs_paged", {
    limit,
    offset,
    statusFilter: statusFilter || null,
    excludeMode: excludeMode || null,
  });
}

// ==================== AI 流式优化 ====================

/** 流式 chunk 事件 payload 类型 */
export interface StreamChunkPayload {
  type: "chunk" | "done" | "error";
  /** 将事件限定到发起该流式请求的调用方，避免并发请求串流。 */
  request_id?: string;
  text?: string;
  full_text?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  message?: string;
}

/**
 * 流式优化：启动流式 AI 优化请求
 * 通过 Tauri 事件 "optimize-stream" 接收逐块内容
 * @returns invoke 的 Promise（流结束后 resolve 为 OptimizationLog）
 */
export async function optimizePromptStream(params: {
  requestId?: string;
  rawRequirement: string;
  mode: string;
  language?: string;
  outputFormat?: string;
  apiKey?: string;
  promptId?: string;
  images?: { mime_type: string; data: string }[];
  skipLog?: boolean;
  provider?: string;
  openaiModel?: string;
  openaiEndpoint?: string;
  codebuddyModel?: string;
  geminiModel?: string;
  customSystemPrompt?: string;
}): Promise<OptimizeResult> {
  const aiLogId = DEBUG_IPC ? pushAiLog({
    requestType: `${params.mode} (stream)`,
    promptSummary: params.rawRequirement.slice(0, 100) + (params.rawRequirement.length > 100 ? "..." : ""),
    model: params.provider || "gemini",
    status: "pending",
    startTime: new Date(),
  }) : 0;
  const aiStartTime = performance.now();

  try {
    const log: OptimizationLog = await invokeWithLog("optimize_prompt_stream", {
      req: {
        request_id: params.requestId || null,
        raw_requirement: params.rawRequirement,
        mode: params.mode,
        language: params.language || "zh-CN",
        output_format: params.outputFormat || "plain_text",
        api_key: params.apiKey || null,
        model: params.geminiModel || null,
        prompt_id: params.promptId || null,
        images: params.images && params.images.length > 0 ? params.images : null,
        skip_log: params.skipLog || false,
        provider: params.provider || null,
        openai_model: params.openaiModel || null,
        openai_endpoint: params.openaiEndpoint || null,
        codebuddy_model: params.codebuddyModel || null,
        custom_system_prompt: params.customSystemPrompt || null,
      },
    });

    if (DEBUG_IPC) {
      updateAiLog(aiLogId, {
        status: "success",
        duration: Math.round(performance.now() - aiStartTime),
        responseSummary: (log.output_text || "").slice(0, 100) + ((log.output_text || "").length > 100 ? "..." : ""),
      });
    }

    return {
      optimized_prompt: log.output_text || "",
      model: log.model_name,
      usage: {
        input_tokens: log.token_in ?? undefined,
        output_tokens: log.token_out ?? undefined,
      },
    };
  } catch (error) {
    if (DEBUG_IPC) {
      updateAiLog(aiLogId, {
        status: "error",
        duration: Math.round(performance.now() - aiStartTime),
        error: String(error),
      });
    }
    throw error;
  }
}

// ==================== 导入导出 ====================

export interface ImportResult {
  imported_categories: number;
  imported_prompts: number;
  skipped_prompts: number;
}

/** 导出提示词库为 JSON 字符串 */
export async function exportPrompts(): Promise<string> {
  return invokeWithLog("export_prompts");
}

/** 导入提示词库（合并模式：跳过已存在的 ID） */
export async function importPrompts(jsonStr: string): Promise<ImportResult> {
  return invokeWithLog("import_prompts", { jsonStr });
}

// ==================== 窗口管理 ====================

export async function getWindowMode(): Promise<string> {
  return invokeWithLog("get_window_mode");
}

export async function setWindowMode(mode: string): Promise<void> {
  return invokeWithLog("set_window_mode", { mode });
}

export async function prepareSwitch(targetMode: string): Promise<string> {
  return invokeWithLog("prepare_switch", { targetMode });
}

export async function finishSwitch(): Promise<void> {
  return invokeWithLog("finish_switch");
}

export async function windowMinimize(): Promise<void> {
  return invokeWithLog("window_minimize");
}

export async function windowMaximize(): Promise<void> {
  return invokeWithLog("window_maximize");
}

export async function windowClose(closeBehavior?: string): Promise<void> {
  return invokeWithLog("window_close", { closeBehavior: closeBehavior || "minimize" });
}

// ==================== API Key 管理 ====================

/** 保存默认 API Key */
export async function setApiKey(key: string): Promise<void> {
  return invokeWithLog("set_api_key", { key });
}

/** 获取默认 API Key */
export async function getApiKey(): Promise<string> {
  return invokeWithLog("get_api_key");
}

/** 检查默认 API Key 是否已配置 */
export async function getApiKeyStatus(): Promise<boolean> {
  return invokeWithLog("get_api_key_status");
}

/** 清除默认 API Key */
export async function clearApiKey(): Promise<void> {
  return invokeWithLog("clear_api_key");
}

// ==================== 多 Provider API Key 管理 ====================

/** 保存指定 Provider 的 API Key */
export async function setApiKeyForProvider(key: string, provider: string): Promise<void> {
  return invokeWithLog("set_api_key_for_provider", { key, provider });
}

/** 获取指定 Provider 的 API Key */
export async function getApiKeyForProvider(provider: string): Promise<string> {
  return invokeWithLog("get_api_key_for_provider", { provider });
}

/** 检查指定 Provider 是否已配置 API Key */
export async function getApiKeyStatusForProvider(provider: string): Promise<boolean> {
  return invokeWithLog("get_api_key_status_for_provider", { provider });
}

/** 清除指定 Provider 的 API Key */
export async function clearApiKeyForProvider(provider: string): Promise<void> {
  return invokeWithLog("clear_api_key_for_provider", { provider });
}

// ==================== OpenAI 端点 URL 管理 ====================

/** 保存 OpenAI 兼容 Provider 的端点 URL */
export async function saveOpenaiEndpoint(url: string): Promise<void> {
  return invokeWithLog("save_openai_endpoint", { url });
}

/** 获取 OpenAI 兼容 Provider 的端点 URL */
export async function getOpenaiEndpoint(): Promise<string> {
  return invokeWithLog("get_openai_endpoint");
}

// ==================== OpenAI 模型列表 ====================

/** 从 OpenAI 兼容 API 的 /v1/models 端点获取可用模型列表 */
export async function fetchOpenaiModels(endpoint: string, apiKey: string): Promise<string[]> {
  return invokeWithLog("fetch_openai_models", { endpoint, apiKey });
}

/** 从 Rust 端固定的 CodeBuddy 模型目录获取可用模型列表 */
export async function fetchCodebuddyModels(): Promise<string[]> {
  return invokeWithLog("fetch_codebuddy_models");
}

// ==================== Debug 工具 ====================

/**
 * Debug Echo 命令 —— 快速验证 IPC 层是否正常
 * 发送任意 JSON 数据到 Rust 端，Rust 原样返回并在终端打印
 * 用法：在浏览器控制台执行 `import('@/lib/tauri-api').then(m => m.debugEcho({ test: 123 }))`
 */
export async function debugEcho(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return invokeWithLog("debug_echo", { data });
}

/**
 * SQLite 健康检查 —— 一键检查数据库完整性
 * 返回包含完整性检查、表信息、索引、外键违规等的健康报告
 */
export async function dbHealthCheck(): Promise<DbHealthReport> {
  return invokeWithLog("db_health_check");
}

/** SQLite 健康检查报告类型 */
export interface DbHealthReport {
  integrity_check: string;
  tables: { name: string; row_count: number }[];
  db_size_bytes: number;
  journal_mode: string;
  foreign_keys_enabled: boolean;
  foreign_key_violations: { table: string; rowid: number; parent: string; fkid: number }[];
  migration_version: number;
  indexes: { name: string; table: string }[];
  wal_pages: number;
  freelist_count: number;
  page_size: number;
  page_count: number;
}

// ==================== 图片生成 ====================

/** AI 生成的图片记录 */
export interface GeneratedImage {
  id: string;
  user_id: string | null;
  prompt: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  provider: string;
  model: string;
  size_param: string | null;
  generation_time: number | null;
  prompt_id: string | null;
  is_favorite: boolean;
  created_at: string;
}

/** 图片列表分页结果 */
export interface GeneratedImagesResult {
  items: GeneratedImage[];
  total: number;
  page: number;
  page_size: number;
}

/** AI 图片生成 */
export async function generateImage(params: {
  prompt: string;
  size: string;
  provider: string;
  model?: string;
  promptId?: string;
  images?: string[];
}): Promise<GeneratedImage> {
  return invokeWithLog("generate_image", {
    prompt: params.prompt,
    size: params.size,
    provider: params.provider,
    model: params.model || null,
    promptId: params.promptId || null,
    images: params.images || null,
  });
}

/** 查询图片列表（分页 + 搜索） */
export async function listGeneratedImages(
  page: number,
  pageSize: number,
  search?: string,
): Promise<GeneratedImagesResult> {
  return invokeWithLog("list_generated_images", {
    page,
    pageSize,
    search: search || null,
  });
}

/** 删除图片 */
export async function deleteGeneratedImage(id: string): Promise<void> {
  return invokeWithLog("delete_generated_image", { id });
}

/** 获取图片详情 */
export async function getGeneratedImage(id: string): Promise<GeneratedImage> {
  return invokeWithLog("get_generated_image", { id });
}

/** 获取图片文件的完整本地路径 */
export async function getImageFilePath(fileName: string): Promise<string> {
  return invokeWithLog("get_image_file_path", { fileName });
}
