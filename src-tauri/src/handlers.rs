//! Tauri Command 包装函数
//! 从 lib.rs 提取到独立模块，保持 lib.rs 精简。
//! 这些函数是 `#[tauri::command]` 的入口点，负责从 State 获取数据库连接
//! 并调用 commands 模块中的逻辑函数。

use tauri::{Manager, State, Emitter};

use crate::{DbState, ModeState, ApiKeyState, emit_rust_log};
use crate::{db, commands, ai, window, tray};

// ==================== Prompt CRUD Commands ====================

/// 分页查询提示词列表（支持搜索、分类、收藏、归档过滤和排序）
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn get_prompts(
    app: tauri::AppHandle,
    db: State<DbState>,
    page: Option<u32>,
    page_size: Option<u32>,
    search: Option<String>,
    category_id: Option<String>,
    is_favorite: Option<String>,
    is_archived: Option<String>,
    sort: Option<String>,
) -> Result<db::models::PaginatedResult<db::models::Prompt>, String> {
    // 前端传字符串 "true"/"false"/null，后端自行解析
    // 彻底避免 Tauri 2 对 bool/number 类型的隐式转换问题
    let is_favorite_bool = is_favorite.as_deref().and_then(|s| match s {
        "true" | "1" => Some(true),
        "false" | "0" => Some(false),
        _ => None,
    });
    let is_archived_bool = is_archived.as_deref().and_then(|s| match s {
        "true" | "1" => Some(true),
        "false" | "0" => Some(false),
        _ => None,
    });
    let log_msg = format!("is_favorite={:?}(原始:{:?}), is_archived={:?}(原始:{:?}), sort={:?}, search={:?}",
        is_favorite_bool, is_favorite, is_archived_bool, is_archived, sort, search);
    log::info!("[get_prompts] 收到参数: {}", log_msg);
    emit_rust_log(&app, "get_prompts", &format!("收到参数: {}", log_msg), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::prompts::cmd_get_prompts(
        database.connection(),
        page.unwrap_or(1),
        page_size.unwrap_or(20),
        search, category_id, is_favorite_bool, is_archived_bool, sort,
    );
    if let Ok(ref r) = result {
        emit_rust_log(&app, "get_prompts", &format!("返回 {} 条记录 (共 {})", r.items.len(), r.total), None);
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_prompt(app: tauri::AppHandle, db: State<DbState>, id: String) -> Result<db::models::Prompt, String> {
    emit_rust_log(&app, "get_prompt", &format!("查询提示词: id={}", id), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::prompts::cmd_get_prompt(database.connection(), id);
    match &result {
        Ok(p) => emit_rust_log(&app, "get_prompt", &format!("查询成功: title={}", p.title), None),
        Err(e) => emit_rust_log(&app, "get_prompt", &format!("查询失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_prompt(
    app: tauri::AppHandle,
    db: State<DbState>,
    title: String,
    content: String,
    category_id: Option<String>,
    raw_requirement: Option<String>,
    source_type: Option<String>,
) -> Result<db::models::Prompt, String> {
    emit_rust_log(&app, "create_prompt", &format!("创建提示词: title={}, category_id={:?}", title, category_id), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::prompts::cmd_create_prompt(
        database.connection(), title, content, category_id, raw_requirement, source_type,
    );
    match &result {
        Ok(p) => emit_rust_log(&app, "create_prompt", &format!("创建成功: id={}", p.id), None),
        Err(e) => emit_rust_log(&app, "create_prompt", &format!("创建失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

/// 更新提示词（支持部分更新）
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_prompt(
    app: tauri::AppHandle,
    db: State<DbState>,
    id: String,
    title: Option<String>,
    content: Option<String>,
    category_id: Option<String>,
    is_favorite: Option<String>,
    is_archived: Option<String>,
) -> Result<db::models::Prompt, String> {
    let is_favorite_bool = is_favorite.as_deref().and_then(|s| match s {
        "true" | "1" => Some(true),
        "false" | "0" => Some(false),
        _ => None,
    });
    let is_archived_bool = is_archived.as_deref().and_then(|s| match s {
        "true" | "1" => Some(true),
        "false" | "0" => Some(false),
        _ => None,
    });
    let log_msg = format!("id={}, title={:?}, content_len={:?}, category_id={:?}, is_favorite={:?}→{:?}, is_archived={:?}→{:?}",
        id, title, content.as_ref().map(|c| c.len()), category_id, is_favorite, is_favorite_bool, is_archived, is_archived_bool);
    log::debug!("[update_prompt] {}", log_msg);
    emit_rust_log(&app, "update_prompt", &log_msg, None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::prompts::cmd_update_prompt(
        database.connection(), id, title, content, category_id, is_favorite_bool, is_archived_bool,
    );
    match &result {
        Ok(p) => emit_rust_log(&app, "update_prompt", &format!("更新成功: id={}, title={}", p.id, p.title), None),
        Err(e) => emit_rust_log(&app, "update_prompt", &format!("更新失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_prompt(app: tauri::AppHandle, db: State<DbState>, id: String) -> Result<(), String> {
    emit_rust_log(&app, "delete_prompt", &format!("删除提示词: id={}", id), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::prompts::cmd_delete_prompt(database.connection(), id);
    match &result {
        Ok(_) => emit_rust_log(&app, "delete_prompt", "删除成功", None),
        Err(e) => emit_rust_log(&app, "delete_prompt", &format!("删除失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_prompt(app: tauri::AppHandle, db: State<DbState>, id: String) -> Result<String, String> {
    emit_rust_log(&app, "copy_prompt", &format!("复制提示词: id={}", id), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::prompts::cmd_copy_prompt(database.connection(), id);
    match &result {
        Ok(content) => emit_rust_log(&app, "copy_prompt", &format!("复制成功: content_len={}", content.len()), None),
        Err(e) => emit_rust_log(&app, "copy_prompt", &format!("复制失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn duplicate_prompt(app: tauri::AppHandle, db: State<DbState>, id: String) -> Result<db::models::Prompt, String> {
    emit_rust_log(&app, "duplicate_prompt", &format!("复制提示词: id={}", id), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::prompts::cmd_duplicate_prompt(database.connection(), id);
    match &result {
        Ok(p) => emit_rust_log(&app, "duplicate_prompt", &format!("复制成功: new_id={}", p.id), None),
        Err(e) => emit_rust_log(&app, "duplicate_prompt", &format!("复制失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

/// 批量更新提示词排序顺序
#[tauri::command]
pub fn update_prompt_sort_order(
    app: tauri::AppHandle,
    db: State<DbState>,
    updates: Vec<(String, i32)>,
) -> Result<(), String> {
    emit_rust_log(&app, "update_prompt_sort_order", &format!("批量更新排序: {} 条", updates.len()), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::prompts::cmd_update_sort_order(database.connection(), updates);
    match &result {
        Ok(_) => emit_rust_log(&app, "update_prompt_sort_order", "更新成功", None),
        Err(e) => emit_rust_log(&app, "update_prompt_sort_order", &format!("更新失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

// ==================== 分类 Commands ====================

#[tauri::command]
pub fn get_categories(app: tauri::AppHandle, db: State<DbState>) -> Result<Vec<db::models::Category>, String> {
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::categories::cmd_get_categories(database.connection())
        .map_err(|e| e.to_string());
    match &result {
        Ok(cats) => emit_rust_log(&app, "get_categories", &format!("返回 {} 个分类", cats.len()), None),
        Err(e) => emit_rust_log(&app, "get_categories", &format!("查询失败: {}", e), None),
    }
    result
}

#[tauri::command]
pub fn create_category(app: tauri::AppHandle, db: State<DbState>, name: String, color: Option<String>) -> Result<db::models::Category, String> {
    emit_rust_log(&app, "create_category", &format!("创建分类: name={}", name), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::categories::cmd_create_category(database.connection(), &name, color.as_deref())
        .map_err(|e| e.to_string());
    match &result {
        Ok(c) => emit_rust_log(&app, "create_category", &format!("创建成功: id={}", c.id), None),
        Err(e) => emit_rust_log(&app, "create_category", &format!("创建失败: {}", e), None),
    }
    result
}

#[tauri::command]
pub fn update_category(app: tauri::AppHandle, db: State<DbState>, id: String, name: Option<String>, color: Option<String>) -> Result<db::models::Category, String> {
    emit_rust_log(&app, "update_category", &format!("更新分类: id={}, name={:?}, color={:?}", id, name, color), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::categories::cmd_update_category(database.connection(), &id, name.as_deref(), color.as_deref())
        .map_err(|e| e.to_string());
    match &result {
        Ok(c) => emit_rust_log(&app, "update_category", &format!("更新成功: name={}", c.name), None),
        Err(e) => emit_rust_log(&app, "update_category", &format!("更新失败: {}", e), None),
    }
    result
}

/// 删除分类
#[tauri::command]
pub fn delete_category(app: tauri::AppHandle, db: State<DbState>, id: String) -> Result<(), String> {
    emit_rust_log(&app, "delete_category", &format!("删除分类: id={}", id), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::categories::cmd_delete_category(database.connection(), &id)
        .map_err(|e| e.to_string());
    match &result {
        Ok(_) => emit_rust_log(&app, "delete_category", "删除成功", None),
        Err(e) => emit_rust_log(&app, "delete_category", &format!("删除失败: {}", e), None),
    }
    result
}

// ==================== 统计 Commands ====================

#[tauri::command]
pub fn get_stats(app: tauri::AppHandle, db: State<DbState>) -> Result<db::models::Stats, String> {
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::stats::cmd_get_stats(database.connection())
        .map_err(|e| e.to_string());
    match &result {
        Ok(s) => emit_rust_log(&app, "get_stats", &format!("统计: prompts={}, categories={}, favorites={}",
            s.total_prompts, s.total_categories, s.total_favorites), None),
        Err(e) => emit_rust_log(&app, "get_stats", &format!("查询失败: {}", e), None),
    }
    result
}

// ==================== AI 优化 Commands ====================

/// AI 优化请求参数
#[derive(serde::Deserialize)]
pub struct OptimizeRequest {
    /// 前端为流式事件生成的关联 ID，避免并发请求串收彼此的分片。
    request_id: Option<String>,
    raw_requirement: String,
    mode: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    language: Option<String>,
    output_format: Option<String>,
    prompt_id: Option<String>,
    /// Base64 编码的图片列表（可选），用于多模态优化
    images: Option<Vec<ai::types::ImageData>>,
    /// 是否跳过写入 optimization_logs（词云翻译等内部调用使用）
    skip_log: Option<bool>,
    /// AI Provider 选择："gemini"(default) | "openai_compat" | "codebuddy"
    provider: Option<String>,
    /// OpenAI 兼容 Provider 的模型名称（如 "gpt-4.1-mini"）
    openai_model: Option<String>,
    /// OpenAI 兼容 Provider 的端点 URL
    openai_endpoint: Option<String>,
    /// CodeBuddy Provider 的模型名称
    codebuddy_model: Option<String>,
    /// 用户自定义系统提示词（追加到默认 system prompt 末尾）
    custom_system_prompt: Option<String>,
}

/// 执行 AI 提示词优化（支持 Gemini 和 OpenAI 兼容 Provider）
#[tauri::command]
pub async fn optimize_prompt(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    apikey_state: State<'_, ApiKeyState>,
    req: OptimizeRequest,
) -> Result<db::models::OptimizationLog, String> {
    let mode_str = req.mode.as_deref().unwrap_or("standard");
    let provider_str = req.provider.as_deref().unwrap_or("gemini");
    let has_images = req.images.as_ref().is_some_and(|v| !v.is_empty());

    // 图片体积诊断 — 帮助定位"模型识别不到图片"类问题
    if let Some(ref imgs) = req.images {
        for (i, img) in imgs.iter().enumerate() {
            let b64_len = img.data.len();
            let approx_bytes = b64_len * 3 / 4;
            let msg = format!(
                "图片 {}/{}: mime={}, base64_len={}KB, approx_decoded={}KB",
                i + 1, imgs.len(), img.mime_type, b64_len / 1024, approx_bytes / 1024
            );
            log::info!("[optimize_prompt] {}", msg);
            emit_rust_log(&app, "optimize_prompt", &msg, None);
        }
    }

    emit_rust_log(&app, "optimize_prompt", &format!(
        "开始优化: provider={}, mode={}, input_len={}, has_images={}, image_count={}",
        provider_str, mode_str, req.raw_requirement.len(), has_images,
        req.images.as_ref().map_or(0, |v| v.len())
    ), None);
    let optimize_mode = commands::optimize::validate_optimize_input(&req.raw_requirement, mode_str, has_images)
        .map_err(|e| e.to_string())?;

    // 将 images 转为引用切片
    let images_ref = req.images.as_deref();
    let custom_sp = req.custom_system_prompt.as_deref();

    // 根据 provider 分发到不同的 AI Provider
    let (result, model_name) = match provider_str {
        "openai_compat" => {
            // OpenAI 兼容 Provider：从前端参数或后端存储获取配置
            let key = req.api_key
                .or_else(|| {
                    let store = apikey_state.0.lock().ok()?;
                    store.load_key_for_provider("openai_compat")
                })
                .ok_or_else(|| "未配置 OpenAI 兼容 API Key。请在设置中配置。".to_string())?;

            let endpoint = req.openai_endpoint
                .or_else(|| {
                    let store = apikey_state.0.lock().ok()?;
                    store.load_openai_endpoint()
                })
                .ok_or_else(|| "未配置 API 端点 URL。请在设置中配置。".to_string())?;

            if endpoint.is_empty() {
                return Err("未配置 API 端点 URL。请在设置中配置。".to_string());
            }

            let model = req.openai_model.unwrap_or_else(|| "gpt-4.1-mini".to_string());
            let model_clone = model.clone();

            emit_rust_log(&app, "optimize_prompt", &format!("OpenAI 兼容: endpoint={}, model={}", endpoint, model), None);

            let oai_provider = ai::openai_compat::OpenAICompatProvider::new(ai::openai_compat::OpenAICompatConfig {
                api_key: key,
                model,
                endpoint,
            });

            // 构建请求体（仅一次），同时用于诊断日志和实际请求
            let body = oai_provider.build_request_body(
                &req.raw_requirement, optimize_mode,
                req.language.as_deref(), req.output_format.as_deref(),
                images_ref, custom_sp,
            );
            // 诊断日志：结构摘要 + 脱敏预览，帮助排查"图片传过去了但模型识别不到"类问题
            let summary = ai::openai_compat::OpenAICompatProvider::build_structure_summary(&body);
            emit_rust_log(&app, "optimize_prompt", "[openai_compat] 请求结构摘要", Some(&summary));
            let redacted = ai::openai_compat::OpenAICompatProvider::redact_body_for_log(&body);
            emit_rust_log(&app, "optimize_prompt", "[openai_compat] 请求体预览（脱敏）", Some(&redacted));

            // 复用已构建的 body 发起请求，避免重复构建（大图 base64 clone 开销大）
            let r = oai_provider.optimize_with_body(body).await;

            (r, model_clone)
        }
        "codebuddy" => {
            let key = req.api_key
                .or_else(|| {
                    let store = apikey_state.0.lock().ok()?;
                    store.load_key_for_provider("codebuddy")
                })
                .ok_or_else(|| "未配置 CodeBuddy API Key。请在设置中配置。".to_string())?;

            let model = req.codebuddy_model.unwrap_or_else(|| "gpt-5.6-luna".to_string());
            let model_clone = model.clone();
            let provider = ai::codebuddy::CodeBuddyProvider::new(key, model);
            let body = provider.build_request_body(
                &req.raw_requirement,
                optimize_mode,
                req.language.as_deref(),
                req.output_format.as_deref(),
                images_ref,
                custom_sp,
            );
            let r = provider.optimize_with_body(body).await;

            (r, model_clone)
        }
        "gemini" => {
            // Gemini Provider（默认）：保持现有逻辑不变
            let key = req.api_key
                .or_else(|| {
                    let store = apikey_state.0.lock().ok()?;
                    store.load_key()
                })
                .or_else(|| std::env::var("GEMINI_API_KEY").ok())
                .ok_or_else(|| "未配置 Gemini API Key。请在设置中配置，或设置 GEMINI_API_KEY 环境变量。".to_string())?;

            let model = req.model.unwrap_or_else(|| {
                std::env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-3.1-flash-lite-preview".to_string())
            });
            let model_clone = model.clone();

            let gemini_provider = ai::gemini::GeminiProvider::new(ai::gemini::GeminiConfig {
                api_key: key,
                model,
            });

            let r = gemini_provider.optimize(
                &req.raw_requirement,
                optimize_mode,
                req.language.as_deref(),
                req.output_format.as_deref(),
                images_ref,
                custom_sp,
            ).await;

            (r, model_clone)
        }
        other => {
            return Err(format!("不支持的 AI Provider: '{}'。请检查设置。", other));
        }
    };

    let skip_log = req.skip_log.unwrap_or(false);

    match result {
        Ok(output) => {
            emit_rust_log(&app, "optimize_prompt", &format!("优化成功: output_len={}, tokens_in={:?}, tokens_out={:?}, skip_log={}",
                output.optimized_prompt.len(), output.input_tokens, output.output_tokens, skip_log), None);

            // skip_log 模式：不写入 optimization_logs，直接构造返回值（用于词云翻译等内部调用）
            if skip_log {
                return Ok(db::models::OptimizationLog {
                    id: String::new(),
                    user_id: None,
                    input_text: req.raw_requirement,
                    output_text: Some(output.optimized_prompt),
                    model_name,
                    mode: mode_str.to_string(),
                    token_in: output.input_tokens.map(|v| v as i32),
                    token_out: output.output_tokens.map(|v| v as i32),
                    status: "success".to_string(),
                    error_message: None,
                    created_at: chrono::Utc::now().to_rfc3339(),
                });
            }

            let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;

            // 如果关联了 prompt，递增 optimize_count
            if let Some(ref pid) = req.prompt_id {
                let _ = commands::optimize::cmd_increment_optimize_count(database.connection(), pid.clone());
            }

            commands::optimize::cmd_create_optimization_log(
                database.connection(),
                commands::optimize::CreateLogInput {
                    input_text: req.raw_requirement,
                    output_text: Some(output.optimized_prompt),
                    model_name,
                    mode: mode_str.to_string(),
                    token_in: output.input_tokens.map(|v| v as i32),
                    token_out: output.output_tokens.map(|v| v as i32),
                    status: "success".to_string(),
                    error_message: None,
                },
            ).map_err(|e| e.to_string())
        }
        Err(err) => {
            emit_rust_log(&app, "optimize_prompt", &format!("优化失败: {}, skip_log={}", err, skip_log), None);

            // skip_log 模式：不写入日志，直接返回错误
            if skip_log {
                return Err(err);
            }

            let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
            // 记录错误日志但仍返回日志对象
            let _log = commands::optimize::cmd_create_optimization_log(
                database.connection(),
                commands::optimize::CreateLogInput {
                    input_text: req.raw_requirement,
                    output_text: None,
                    model_name,
                    mode: mode_str.to_string(),
                    token_in: None,
                    token_out: None,
                    status: "error".to_string(),
                    error_message: Some(err.clone()),
                },
            ).map_err(|e| e.to_string())?;
            // 返回错误让前端知道失败了
            Err(err)
        }
    }
}

/// 执行 AI 提示词优化 — 流式输出模式
/// 通过 Tauri 事件 "optimize-stream" 逐块推送内容到前端
/// Payload 格式: StreamChunk { type: "chunk"|"done"|"error", ... }
#[tauri::command]
pub async fn optimize_prompt_stream(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    apikey_state: State<'_, ApiKeyState>,
    req: OptimizeRequest,
) -> Result<db::models::OptimizationLog, String> {
    use futures_util::StreamExt;
    use ai::StreamChunk;
    use std::time::Instant;

    let mode_str = req.mode.as_deref().unwrap_or("standard");
    let provider_str = req.provider.as_deref().unwrap_or("gemini");
    let has_images = req.images.as_ref().is_some_and(|v| !v.is_empty());
    let stream_request_id = req.request_id.clone();

    // 图片体积诊断 — 帮助定位"模型识别不到图片"类问题
    // base64 字段长度大致等于实际字节数 × 4/3，逐张推送到前端 Debug 面板
    if let Some(ref imgs) = req.images {
        for (i, img) in imgs.iter().enumerate() {
            let b64_len = img.data.len();
            let approx_bytes = b64_len * 3 / 4;
            let msg = format!(
                "图片 {}/{}: mime={}, base64_len={}KB, approx_decoded={}KB",
                i + 1, imgs.len(), img.mime_type, b64_len / 1024, approx_bytes / 1024
            );
            log::info!("[optimize_prompt_stream] {}", msg);
            emit_rust_log(&app, "optimize_prompt_stream", &msg, None);
        }
    }

    emit_rust_log(&app, "optimize_prompt_stream", &format!(
        "开始流式优化: provider={}, mode={}, input_len={}, has_images={}, image_count={}",
        provider_str, mode_str, req.raw_requirement.len(), has_images,
        req.images.as_ref().map_or(0, |v| v.len())
    ), None);

    let optimize_mode = commands::optimize::validate_optimize_input(&req.raw_requirement, mode_str, has_images)
        .map_err(|e| e.to_string())?;

    let images_ref = req.images.as_deref();
    let custom_sp = req.custom_system_prompt.as_deref();

    // 根据 provider 发起流式请求
    let (response, model_name) = match provider_str {
        "openai_compat" => {
            let key = req.api_key
                .or_else(|| {
                    let store = apikey_state.0.lock().ok()?;
                    store.load_key_for_provider("openai_compat")
                })
                .ok_or_else(|| "未配置 OpenAI 兼容 API Key。请在设置中配置。".to_string())?;

            let endpoint = req.openai_endpoint
                .or_else(|| {
                    let store = apikey_state.0.lock().ok()?;
                    store.load_openai_endpoint()
                })
                .ok_or_else(|| "未配置 API 端点 URL。请在设置中配置。".to_string())?;

            if endpoint.is_empty() {
                return Err("未配置 API 端点 URL。请在设置中配置。".to_string());
            }

            let model = req.openai_model.unwrap_or_else(|| "gpt-4.1-mini".to_string());
            let model_clone = model.clone();

            let provider = ai::openai_compat::OpenAICompatProvider::new(ai::openai_compat::OpenAICompatConfig {
                api_key: key,
                model,
                endpoint,
            });

            // 构建流式请求体（仅一次），同时用于诊断日志和实际请求
            let body = provider.build_stream_request_body(
                &req.raw_requirement, optimize_mode,
                req.language.as_deref(), req.output_format.as_deref(),
                images_ref, custom_sp,
            );
            // 诊断日志：结构摘要 + 脱敏预览
            let summary = ai::openai_compat::OpenAICompatProvider::build_structure_summary(&body);
            emit_rust_log(&app, "optimize_prompt_stream", "[openai_compat] 流式请求结构摘要", Some(&summary));
            let redacted = ai::openai_compat::OpenAICompatProvider::redact_body_for_log(&body);
            emit_rust_log(&app, "optimize_prompt_stream", "[openai_compat] 流式请求体预览（脱敏）", Some(&redacted));

            // 复用已构建的 body 发起请求，避免重复构建（大图 base64 clone 开销大）
            let resp = provider
                .start_stream_with_body(body)
                .await
                .inspect_err(|e| {
                    let _ = app.emit(
                        "optimize-stream",
                        StreamChunk::error(stream_request_id.as_deref(), e.clone()),
                    );
                })?;

            (resp, model_clone)
        }
        "codebuddy" => {
            let key = req.api_key
                .or_else(|| {
                    let store = apikey_state.0.lock().ok()?;
                    store.load_key_for_provider("codebuddy")
                })
                .ok_or_else(|| "未配置 CodeBuddy API Key。请在设置中配置。".to_string())?;

            let model = req.codebuddy_model.unwrap_or_else(|| "gpt-5.6-luna".to_string());
            let model_clone = model.clone();
            let provider = ai::codebuddy::CodeBuddyProvider::new(key, model);
            let body = provider.build_stream_request_body(
                &req.raw_requirement,
                optimize_mode,
                req.language.as_deref(),
                req.output_format.as_deref(),
                images_ref,
                custom_sp,
            );
            let resp = provider
                .start_stream_with_body(body)
                .await
                .inspect_err(|e| {
                    let _ = app.emit(
                        "optimize-stream",
                        StreamChunk::error(stream_request_id.as_deref(), e.clone()),
                    );
                })?;

            (resp, model_clone)
        }
        "gemini" => {
            let key = req.api_key
                .or_else(|| {
                    let store = apikey_state.0.lock().ok()?;
                    store.load_key()
                })
                .or_else(|| std::env::var("GEMINI_API_KEY").ok())
                .ok_or_else(|| "未配置 Gemini API Key。请在设置中配置，或设置 GEMINI_API_KEY 环境变量。".to_string())?;

            let model = req.model.unwrap_or_else(|| {
                std::env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-3.1-flash-lite-preview".to_string())
            });
            let model_clone = model.clone();

            let provider = ai::gemini::GeminiProvider::new(ai::gemini::GeminiConfig {
                api_key: key,
                model,
            });

            let resp = provider
                .start_stream(
                    &req.raw_requirement,
                    optimize_mode,
                    req.language.as_deref(),
                    req.output_format.as_deref(),
                    images_ref,
                    custom_sp,
                )
                .await
                .inspect_err(|e| {
                    let _ = app.emit(
                        "optimize-stream",
                        StreamChunk::error(stream_request_id.as_deref(), e.clone()),
                    );
                })?;

            (resp, model_clone)
        }
        other => {
            return Err(format!("不支持的 AI Provider: '{}'。请检查设置。", other));
        }
    };

    // 读取 SSE 流并逐块推送到前端
    let mut full_text = String::new();
    let mut input_tokens: Option<i64> = None;
    let mut output_tokens: Option<i64> = None;
    let mut decoder = ai::sse::SseDecoder::new();
    let mut stream_error: Option<String> = None;
    let stream_started_at = Instant::now();
    let mut sse_event_count = 0usize;
    let mut text_chunk_count = 0usize;
    let mut first_text_at_ms: Option<u128> = None;
    let mut stream = response.bytes_stream();
    let chunk_timeout = ai::http_client::stream_chunk_timeout();

    let request_id = stream_request_id.as_deref();
    let mut process_event = |chunk_json: serde_json::Value| -> Result<(), String> {
        sse_event_count += 1;
        // Provider 层负责收敛各自的响应格式，handler 只负责统一事件生命周期。
        let (chunk_text, in_tok, out_tok, error_msg) = match provider_str {
            "openai_compat" => ai::openai_compat::OpenAICompatProvider::parse_stream_chunk(&chunk_json),
            "codebuddy" => ai::codebuddy::CodeBuddyProvider::parse_stream_chunk(&chunk_json),
            _ => ai::gemini::GeminiProvider::parse_stream_chunk(&chunk_json),
        };

        if let Some(err) = error_msg {
            return Err(err);
        }

        if let Some(text) = chunk_text.filter(|text| !text.is_empty()) {
            text_chunk_count += 1;
            first_text_at_ms.get_or_insert_with(|| stream_started_at.elapsed().as_millis());
            full_text.push_str(&text);
            let _ = app.emit("optimize-stream", StreamChunk::chunk(request_id, text));
        }

        if in_tok.is_some() {
            input_tokens = in_tok;
        }
        if out_tok.is_some() {
            output_tokens = out_tok;
        }
        Ok(())
    };

    'stream: loop {
        // 对每个 chunk 的读取设置超时，防止连接卡死
        // 但不限制整个流的总时间，允许长文本完整输出
        let chunk_result = match tokio::time::timeout(chunk_timeout, stream.next()).await {
            Ok(Some(result)) => result,
            Ok(None) => break, // 流正常结束
            Err(_) => {
                let msg = format!(
                    "流式响应超时：{}秒内未收到新数据，连接可能已断开",
                    ai::http_client::STREAM_CHUNK_TIMEOUT_SECS
                );
                let _ = app.emit("optimize-stream", StreamChunk::error(request_id, msg.clone()));
                return Err(msg);
            }
        };

        let bytes = match chunk_result {
            Ok(b) => b,
            Err(e) => {
                let msg = format!("读取流式响应失败: {}", e);
                let _ = app.emit("optimize-stream", StreamChunk::error(request_id, msg.clone()));
                return Err(msg);
            }
        };

        for event in decoder.push(&bytes) {
            let chunk_json = match event {
                Ok(value) => value,
                Err(error) => {
                    log::error!("[optimize_prompt_stream] SSE 解析失败: {}", error);
                    let _ = app.emit("optimize-stream", StreamChunk::error(request_id, error.clone()));
                    stream_error = Some(error);
                    break 'stream;
                }
            };
            if let Err(error) = process_event(chunk_json) {
                log::error!("[optimize_prompt_stream] AI 返回错误: {}", error);
                let _ = app.emit("optimize-stream", StreamChunk::error(request_id, error.clone()));
                stream_error = Some(error);
                break 'stream;
            }
        }
    }

    // 有些服务会在连接关闭前发送没有换行符结尾的最后一个 data 行。
    if stream_error.is_none() {
        for event in decoder.finish() {
            let chunk_json = match event {
                Ok(value) => value,
                Err(error) => {
                    log::error!("[optimize_prompt_stream] SSE 尾包解析失败: {}", error);
                    let _ = app.emit("optimize-stream", StreamChunk::error(request_id, error.clone()));
                    stream_error = Some(error);
                    break;
                }
            };
            if let Err(error) = process_event(chunk_json) {
                log::error!("[optimize_prompt_stream] AI 返回错误: {}", error);
                let _ = app.emit("optimize-stream", StreamChunk::error(request_id, error.clone()));
                stream_error = Some(error);
                break;
            }
        }
    }

    // 流结束：检测错误或空输出
    let is_empty_output = full_text.trim().is_empty();
    if stream_error.is_none() && is_empty_output {
        // 没有明确的 RUN_ERROR，但输出为空 — 区分两种情况：
        // 1) 有 output_tokens 但 full_text 为空 → 真实的解析失败（例如新的事件类型）
        // 2) 没有 output_tokens 也没有 full_text → 通常是上游早断或网络问题
        //    （大图场景在此之前最容易因为超时/连接复用问题落到这里）
        let err_msg = if output_tokens.unwrap_or(0) > 0 {
            format!(
                "AI 模型 ({}) 实际生成了 {} 个 token 但本地未解析出文本。可能原因：响应格式异常或 AG-UI 事件类型未被识别。请查看 Rust 日志排查。",
                model_name, output_tokens.unwrap_or(0)
            )
        } else {
            format!(
                "AI 模型 ({}) 没有返回任何内容。常见原因：上传的图片过大导致网络超时、上游服务端中断、或模型拒绝了本次请求。请尝试缩小图片或稍后重试。",
                model_name
            )
        };
        log::warn!("[optimize_prompt_stream] 流式输出为空: provider={}, model={}, output_tokens={:?}",
            provider_str, model_name, output_tokens);
        let _ = app.emit("optimize-stream", StreamChunk::error(request_id, err_msg.clone()));
        stream_error = Some(err_msg);
    }

    // 错误事件是终态，不再追加 done，避免前端先收到错误又被完成事件覆盖。
    let has_error = stream_error.is_some();
    if !has_error {
        let _ = app.emit(
            "optimize-stream",
            StreamChunk::done(
                request_id,
                full_text.clone(),
                model_name.clone(),
                input_tokens,
                output_tokens,
            ),
        );
    }

    emit_rust_log(&app, "optimize_prompt_stream", &format!(
        "流式优化完成: provider={}, sse_events={}, text_chunks={}, first_text_ms={:?}, total_ms={}, output_len={}, tokens_in={:?}, tokens_out={:?}, stream_error={:?}",
        provider_str, sse_event_count, text_chunk_count, first_text_at_ms,
        stream_started_at.elapsed().as_millis(), full_text.len(), input_tokens, output_tokens, stream_error
    ), None);

    // 确定最终状态
    let is_failed = has_error || is_empty_output;
    let final_status = if is_failed { "error" } else { "success" };
    let final_error = if let Some(ref err) = stream_error {
        Some(err.clone())
    } else if is_empty_output {
        // 与上面 emit 给前端的提示保持一致 — 区分"有 token 没文本"和"什么都没有"
        if output_tokens.unwrap_or(0) > 0 {
            Some(format!(
                "AI 模型 ({}) 实际生成了 {} 个 token 但本地未解析出文本",
                model_name, output_tokens.unwrap_or(0)
            ))
        } else {
            Some(format!(
                "AI 模型 ({}) 没有返回任何内容（可能是图片过大导致超时或上游中断）",
                model_name
            ))
        }
    } else {
        None
    };

    // 写入日志（与非流式逻辑一致）
    let skip_log = req.skip_log.unwrap_or(false);
    if skip_log {
        // skip_log 模式下也要检查错误
        if let Some(err) = final_error {
            return Err(err);
        }
        return Ok(db::models::OptimizationLog {
            id: String::new(),
            user_id: None,
            input_text: req.raw_requirement,
            output_text: Some(full_text),
            model_name,
            mode: mode_str.to_string(),
            token_in: input_tokens.map(|v| v as i32),
            token_out: output_tokens.map(|v| v as i32),
            status: "success".to_string(),
            error_message: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        });
    }

    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;

    if let Some(ref pid) = req.prompt_id {
        let _ = commands::optimize::cmd_increment_optimize_count(database.connection(), pid.clone());
    }

    // 无论成功失败都写入日志
    let _ = commands::optimize::cmd_create_optimization_log(
        database.connection(),
        commands::optimize::CreateLogInput {
            input_text: req.raw_requirement,
            output_text: if is_failed { None } else { Some(full_text.clone()) },
            model_name: model_name.clone(),
            mode: mode_str.to_string(),
            token_in: input_tokens.map(|v| v as i32),
            token_out: output_tokens.map(|v| v as i32),
            status: final_status.to_string(),
            error_message: final_error.clone(),
        },
    );

    // 如果有错误，return Err 让前端 invoke reject，确保前端能显示错误提示
    if let Some(err) = final_error {
        return Err(err);
    }

    Ok(db::models::OptimizationLog {
        id: String::new(),
        user_id: None,
        input_text: String::new(),
        output_text: Some(full_text),
        model_name,
        mode: mode_str.to_string(),
        token_in: input_tokens.map(|v| v as i32),
        token_out: output_tokens.map(|v| v as i32),
        status: "success".to_string(),
        error_message: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// 查询优化日志列表
#[tauri::command]
pub fn get_optimization_logs(
    app: tauri::AppHandle,
    db: State<DbState>,
    limit: Option<u32>,
) -> Result<Vec<db::models::OptimizationLog>, String> {
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::optimize::cmd_get_optimization_logs(database.connection(), limit);
    match &result {
        Ok(logs) => emit_rust_log(&app, "get_optimization_logs", &format!("返回 {} 条优化日志", logs.len()), None),
        Err(e) => emit_rust_log(&app, "get_optimization_logs", &format!("查询失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

/// 分页查询优化日志（支持 offset + status/mode 过滤）
#[tauri::command]
pub fn get_optimization_logs_paged(
    app: tauri::AppHandle,
    db: State<DbState>,
    limit: u32,
    offset: u32,
    status_filter: Option<String>,
    exclude_mode: Option<String>,
) -> Result<Vec<db::models::OptimizationLog>, String> {
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::optimize::cmd_get_optimization_logs_paged(
        database.connection(),
        limit,
        offset,
        status_filter.as_deref(),
        exclude_mode.as_deref(),
    );
    match &result {
        Ok(logs) => emit_rust_log(&app, "get_optimization_logs_paged", &format!("返回 {} 条日志 (offset={})", logs.len(), offset), None),
        Err(e) => emit_rust_log(&app, "get_optimization_logs_paged", &format!("分页查询失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

/// 清除所有优化日志
#[tauri::command]
pub fn clear_optimization_logs(
    app: tauri::AppHandle,
    db: State<DbState>,
) -> Result<u64, String> {
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::optimize::cmd_clear_optimization_logs(database.connection());
    match &result {
        Ok(count) => emit_rust_log(&app, "clear_optimization_logs", &format!("已清除 {} 条优化日志", count), None),
        Err(e) => emit_rust_log(&app, "clear_optimization_logs", &format!("清除失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

// ==================== 快捷键 Commands ====================

#[tauri::command]
pub fn unregister_global_shortcut(
    app: tauri::AppHandle,
) -> Result<(), String> {
    tray::unregister_global_shortcut(&app)
        .map_err(|e| format!("注销快捷键失败: {}", e))?;
    emit_rust_log(&app, "unregister_global_shortcut", "已临时注销全局快捷键（录入模式）", None);
    Ok(())
}

#[tauri::command]
pub fn update_global_shortcut(
    app: tauri::AppHandle,
    shortcut: String,
) -> Result<(), String> {
    tray::update_global_shortcut(&app, &shortcut)
        .map_err(|e| format!("更新快捷键失败: {}", e))?;
    // 持久化快捷键设置到配置文件（启动时读取）
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        tray::save_shortcut_config(&app_data_dir, &shortcut);
    }
    emit_rust_log(&app, "update_global_shortcut", &format!("快捷键已更新为: {}", shortcut), None);
    Ok(())
}

// ==================== 窗口管理 Commands ====================

#[tauri::command]
pub fn get_window_mode(app: tauri::AppHandle, mode_state: State<ModeState>) -> Result<String, String> {
    let store = mode_state.0.lock().map_err(|e| format!("获取模式锁失败: {}", e))?;
    let mode = store.load_mode();
    let mode_str = match mode {
        window::mode::WindowMode::Mini => "mini",
        window::mode::WindowMode::Full => "full",
    };
    emit_rust_log(&app, "get_window_mode", &format!("当前模式: {}", mode_str), None);
    Ok(mode_str.to_string())
}

/// 设置窗口模式（持久化到配置文件）
#[tauri::command]
pub fn set_window_mode(app: tauri::AppHandle, mode_state: State<ModeState>, mode: String) -> Result<(), String> {
    emit_rust_log(&app, "set_window_mode", &format!("设置窗口模式: {}", mode), None);
    let store = mode_state.0.lock().map_err(|e| format!("获取模式锁失败: {}", e))?;
    let window_mode: window::mode::WindowMode = serde_json::from_str(&format!("\"{}\"" , mode))
        .map_err(|_| format!("无效的窗口模式: {}", mode))?;
    store.save_mode(window_mode);
    emit_rust_log(&app, "set_window_mode", "设置成功", None);
    Ok(())
}

/// 准备模式切换：保存当前 bounds，调整窗口尺寸，返回目标路由
#[tauri::command]
pub async fn prepare_switch(
    app: tauri::AppHandle,
    mode_state: State<'_, ModeState>,
    target_mode: String,
) -> Result<String, String> {
    let window_mode: window::mode::WindowMode = serde_json::from_str(&format!("\"{}\"" , target_mode))
        .map_err(|_| format!("无效的窗口模式: {}", target_mode))?;

    emit_rust_log(&app, "prepare_switch", &format!("开始切换: target_mode={}", target_mode), None);

    let window = app.get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;

    // 1. 保存当前 bounds（逻辑像素/DIP）
    //    position: outer_position（与 set_position 语义一致，都是窗口外框左上角）
    //    size: inner_size（与 set_size 语义一致，都是内容区域尺寸）
    //    ⚠ 不能用 outer_size！set_size 设置的是 inner size，
    //      如果保存 outer_size 再用 set_size 恢复，每次会多出标题栏高度，导致窗口逐渐变大
    {
        let store = mode_state.0.lock().map_err(|e| format!("获取模式锁失败: {}", e))?;
        let current_mode = store.load_mode();
        let sf = window.scale_factor().unwrap_or(1.0);
        if let Ok(pos) = window.outer_position() {
            if let Ok(size) = window.inner_size() {
                let bounds = window::mode::WindowBounds {
                    x: (pos.x as f64 / sf).round() as i32,
                    y: (pos.y as f64 / sf).round() as i32,
                    width: (size.width as f64 / sf).round() as u32,
                    height: (size.height as f64 / sf).round() as u32,
                };
                store.save_bounds(current_mode, &bounds);
            }
        }
        // 2. 保存目标模式
        store.save_mode(window_mode);
    }

    // 3. 不再 hide 窗口 — 前端使用遮罩 div 覆盖内容，
    //    避免 WebView2 hide/show 导致的渲染管线冻结和旧帧闪烁

    // 4. 调整窗口参数
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let (always_on_top, resizable) = window::mode::get_mode_properties(window_mode);
    let constraints = window::mode::get_mode_constraints(window_mode, scale_factor);

    // 获取屏幕工作区 DIP 尺寸
    let (screen_w, screen_h) = window.current_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let size = m.size();
            let sf = m.scale_factor();
            ((size.width as f64 / sf) as u32, (size.height as f64 / sf) as u32)
        })
        .unwrap_or((1920, 1080));

    let target_bounds = {
        let store = mode_state.0.lock().map_err(|e| format!("获取模式锁失败: {}", e))?;
        let saved = store.load_bounds(window_mode);
        window::mode::get_target_bounds(window_mode, saved.as_ref(), screen_w, screen_h, scale_factor)
    };

    // 解除旧约束 → 调整尺寸 → 应用新约束
    let _ = window.set_max_size(Some(tauri::LogicalSize::new(10000.0, 10000.0)));
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(0.0, 0.0)));

    let _ = window.set_always_on_top(always_on_top);
    let _ = window.set_resizable(resizable);

    // 设置尺寸和位置（逻辑像素）
    let _ = window.set_size(tauri::LogicalSize::new(
        target_bounds.width as f64,
        target_bounds.height as f64,
    ));
    let _ = window.set_position(tauri::LogicalPosition::new(
        target_bounds.x as f64,
        target_bounds.y as f64,
    ));

    // 应用尺寸约束（逻辑像素）
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(
        constraints.min_width as f64,
        constraints.min_height as f64,
    )));
    if let (Some(max_w), Some(max_h)) = (constraints.max_width, constraints.max_height) {
        let _ = window.set_max_size(Some(tauri::LogicalSize::new(
            max_w as f64,
            max_h as f64,
        )));
    } else {
        let _ = window.set_max_size(None::<tauri::LogicalSize<f64>>);
    }

    // 返回目标路由
    emit_rust_log(&app, "prepare_switch", &format!("切换完成: bounds={}x{} at ({},{})",
        target_bounds.width, target_bounds.height, target_bounds.x, target_bounds.y), None);
    Ok(window_mode.route().to_string())
}

#[tauri::command]
pub async fn finish_switch(app: tauri::AppHandle) -> Result<(), String> {
    emit_rust_log(&app, "finish_switch", "完成窗口切换", None);
    let window = app.get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;

    // 窗口始终可见，不再 show/hide
    // 仅确保窗口获得焦点（resize 后可能失焦）
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub fn window_minimize(app: tauri::AppHandle) -> Result<(), String> {
    emit_rust_log(&app, "window_minimize", "最小化窗口", None);
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| format!("最小化失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn window_maximize(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_max = window.is_maximized().unwrap_or(false);
        emit_rust_log(&app, "window_maximize", if is_max { "取消最大化" } else { "最大化窗口" }, None);
        if is_max {
            window.unmaximize().map_err(|e| format!("取消最大化失败: {}", e))?;
        } else {
            window.maximize().map_err(|e| format!("最大化失败: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn window_close(app: tauri::AppHandle, mode_state: State<ModeState>, close_behavior: Option<String>) -> Result<(), String> {
    let behavior = close_behavior.as_deref().unwrap_or("minimize");
    emit_rust_log(&app, "window_close", &format!("关闭窗口（behavior={}）", behavior), None);
    if let Some(window) = app.get_webview_window("main") {
    // 关闭前保存当前窗口 bounds（逻辑像素/DIP）
        //    size 用 inner_size（与 set_size 语义一致），避免 outer_size 累积标题栏高度
        {
            let store = mode_state.0.lock().map_err(|e| format!("获取模式锁失败: {}", e))?;
            let current_mode = store.load_mode();
            let sf = window.scale_factor().unwrap_or(1.0);
            if let Ok(pos) = window.outer_position() {
                if let Ok(size) = window.inner_size() {
                    let bounds = window::mode::WindowBounds {
                        x: (pos.x as f64 / sf).round() as i32,
                        y: (pos.y as f64 / sf).round() as i32,
                        width: (size.width as f64 / sf).round() as u32,
                        height: (size.height as f64 / sf).round() as u32,
                    };
                    store.save_bounds(current_mode, &bounds);
                }
            }
        }
        if behavior == "quit" {
            // 直接退出应用
            app.exit(0);
        } else {
            // 默认：隐藏到托盘
            window.hide().map_err(|e| format!("隐藏窗口失败: {}", e))?;
        }
    }
    Ok(())
}

// ==================== 导入导出 Commands ====================

#[tauri::command]
pub fn export_prompts(app: tauri::AppHandle, db: State<DbState>) -> Result<String, String> {
    emit_rust_log(&app, "export_prompts", "开始导出", None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::import_export::cmd_export_prompts(database.connection());
    match &result {
        Ok(json) => emit_rust_log(&app, "export_prompts", &format!("导出成功: data_size={} bytes", json.len()), None),
        Err(e) => emit_rust_log(&app, "export_prompts", &format!("导出失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_prompts(app: tauri::AppHandle, db: State<DbState>, json_str: String) -> Result<commands::import_export::ImportResult, String> {
    emit_rust_log(&app, "import_prompts", &format!("开始导入: data_size={} bytes", json_str.len()), None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::import_export::cmd_import_prompts(database.connection(), &json_str);
    match &result {
        Ok(r) => emit_rust_log(&app, "import_prompts", &format!("导入成功: imported={}, skipped={}",
            r.imported_prompts, r.skipped_prompts), None),
        Err(e) => emit_rust_log(&app, "import_prompts", &format!("导入失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

// ==================== API Key 管理 Commands ====================

/// 保存默认 API Key（Base64 编码存储）
#[tauri::command]
pub fn set_api_key(app: tauri::AppHandle, apikey_state: State<ApiKeyState>, key: String) -> Result<(), String> {
    emit_rust_log(&app, "set_api_key", &format!("设置 API Key（长度: {}）", key.len()), None);
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    let result = store.save_key(&key);
    match &result {
        Ok(_) => emit_rust_log(&app, "set_api_key", "设置成功", None),
        Err(e) => emit_rust_log(&app, "set_api_key", &format!("设置失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key(app: tauri::AppHandle, apikey_state: State<ApiKeyState>) -> Result<String, String> {
    emit_rust_log(&app, "get_api_key", "获取 API Key", None);
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    match store.load_key() {
        Some(key) => {
            emit_rust_log(&app, "get_api_key", &format!("获取成功（长度: {}）", key.len()), None);
            Ok(key)
        }
        None => {
            emit_rust_log(&app, "get_api_key", "未找到 API Key", None);
            Err("未配置 API Key".to_string())
        }
    }
}

#[tauri::command]
pub fn get_api_key_status(app: tauri::AppHandle, apikey_state: State<ApiKeyState>) -> Result<bool, String> {
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    let configured = store.is_configured();
    emit_rust_log(&app, "get_api_key_status", &format!("已配置: {}", configured), None);
    Ok(configured)
}

/// 清除默认 API Key
#[tauri::command]
pub fn clear_api_key(app: tauri::AppHandle, apikey_state: State<ApiKeyState>) -> Result<(), String> {
    emit_rust_log(&app, "clear_api_key", "清除 API Key", None);
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    let result = store.clear_key();
    match &result {
        Ok(_) => emit_rust_log(&app, "clear_api_key", "清除成功", None),
        Err(e) => emit_rust_log(&app, "clear_api_key", &format!("清除失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

// ==================== 多 Provider API Key 管理 Commands ====================

#[tauri::command]
pub fn set_api_key_for_provider(app: tauri::AppHandle, apikey_state: State<ApiKeyState>, key: String, provider: String) -> Result<(), String> {
    emit_rust_log(&app, "set_api_key_for_provider", &format!("设置 {} API Key（长度: {}）", provider, key.len()), None);
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    let result = store.save_key_for_provider(&key, &provider);
    match &result {
        Ok(_) => emit_rust_log(&app, "set_api_key_for_provider", "设置成功", None),
        Err(e) => emit_rust_log(&app, "set_api_key_for_provider", &format!("设置失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key_for_provider(app: tauri::AppHandle, apikey_state: State<ApiKeyState>, provider: String) -> Result<String, String> {
    emit_rust_log(&app, "get_api_key_for_provider", &format!("获取 {} API Key", provider), None);
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    match store.load_key_for_provider(&provider) {
        Some(key) => {
            emit_rust_log(&app, "get_api_key_for_provider", &format!("获取成功（长度: {}）", key.len()), None);
            Ok(key)
        }
        None => {
            emit_rust_log(&app, "get_api_key_for_provider", "未找到 API Key", None);
            Err(format!("未配置 {} API Key", provider))
        }
    }
}

#[tauri::command]
pub fn get_api_key_status_for_provider(app: tauri::AppHandle, apikey_state: State<ApiKeyState>, provider: String) -> Result<bool, String> {
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    let configured = store.is_configured_for_provider(&provider);
    emit_rust_log(&app, "get_api_key_status_for_provider", &format!("{} 已配置: {}", provider, configured), None);
    Ok(configured)
}

#[tauri::command]
pub fn clear_api_key_for_provider(app: tauri::AppHandle, apikey_state: State<ApiKeyState>, provider: String) -> Result<(), String> {
    emit_rust_log(&app, "clear_api_key_for_provider", &format!("清除 {} API Key", provider), None);
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    let result = store.clear_key_for_provider(&provider);
    match &result {
        Ok(_) => emit_rust_log(&app, "clear_api_key_for_provider", "清除成功", None),
        Err(e) => emit_rust_log(&app, "clear_api_key_for_provider", &format!("清除失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

// ==================== OpenAI 模型列表 Commands ====================

/// 从 OpenAI 兼容 API 获取可用模型列表
#[tauri::command]
pub async fn fetch_openai_models(app: tauri::AppHandle, endpoint: String, api_key: String) -> Result<Vec<String>, String> {
    emit_rust_log(&app, "fetch_openai_models", &format!("获取模型列表，端点: {}，Key长度: {}", endpoint, api_key.len()), None);
    match ai::openai_compat::OpenAICompatProvider::fetch_models(&endpoint, &api_key).await {
        Ok(models) => {
            emit_rust_log(&app, "fetch_openai_models", &format!("获取成功，共 {} 个模型", models.len()), None);
            Ok(models)
        }
        Err(e) => {
            emit_rust_log(&app, "fetch_openai_models", &format!("获取失败: {}", e), None);
            Err(e)
        }
    }
}

// ==================== CodeBuddy 模型列表 Commands ====================

/// 获取 CodeBuddy 模型列表。
/// Key 从 Rust 端的 CodeBuddy 专属存储读取，前端不传递端点或 Key。
#[tauri::command]
pub async fn fetch_codebuddy_models(
    app: tauri::AppHandle,
    apikey_state: State<'_, ApiKeyState>,
) -> Result<Vec<String>, String> {
    let key = {
        let store = apikey_state
            .0
            .lock()
            .map_err(|e| format!("获取 API Key 存储锁失败: {}", e))?;
        store.load_key_for_provider("codebuddy")
    }
    .ok_or_else(|| "未配置 CodeBuddy API Key。请先保存 API Key。".to_string())?;

    match ai::codebuddy::CodeBuddyProvider::fetch_models(&key).await {
        Ok(models) => {
            emit_rust_log(
                &app,
                "fetch_codebuddy_models",
                &format!("获取成功，共 {} 个模型", models.len()),
                None,
            );
            Ok(models)
        }
        Err(error) => {
            emit_rust_log(&app, "fetch_codebuddy_models", &format!("获取失败: {}", error), None);
            Err(error)
        }
    }
}

// ==================== OpenAI 端点 URL 管理 Commands ====================

#[tauri::command]
pub fn save_openai_endpoint(app: tauri::AppHandle, apikey_state: State<ApiKeyState>, url: String) -> Result<(), String> {
    emit_rust_log(&app, "save_openai_endpoint", &format!("保存 OpenAI 端点 URL: {}", url), None);
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    let result = store.save_openai_endpoint(&url);
    match &result {
        Ok(_) => emit_rust_log(&app, "save_openai_endpoint", "保存成功", None),
        Err(e) => emit_rust_log(&app, "save_openai_endpoint", &format!("保存失败: {}", e), None),
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_openai_endpoint(app: tauri::AppHandle, apikey_state: State<ApiKeyState>) -> Result<String, String> {
    emit_rust_log(&app, "get_openai_endpoint", "获取 OpenAI 端点 URL", None);
    let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
    match store.load_openai_endpoint() {
        Some(url) => {
            emit_rust_log(&app, "get_openai_endpoint", &format!("获取成功: {}", url), None);
            Ok(url)
        }
        None => {
            emit_rust_log(&app, "get_openai_endpoint", "未配置端点 URL", None);
            Ok(String::new()) // 未配置时返回空字符串而非错误
        }
    }
}

// ==================== 图片生成 Commands ====================

/// AI 图片生成（支持 OpenAI + Gemini 双 Provider）
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn generate_image(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    apikey_state: State<'_, ApiKeyState>,
    prompt: String,
    size: String,
    provider: String,
    model: Option<String>,
    prompt_id: Option<String>,
    images: Option<Vec<String>>,
) -> Result<db::models::GeneratedImage, String> {
    emit_rust_log(&app, "generate_image", &format!(
        "开始生成图片: provider={}, size={}, prompt_len={}, images_count={}", provider, size, prompt.len(), images.as_ref().map_or(0, |v| v.len())
    ), None);

    let start_time = std::time::Instant::now();

    // 构建请求
    let request = ai::image_gen::ImageGenRequest {
        prompt: prompt.clone(),
        size: size.clone(),
        provider: provider.clone(),
        model: model.clone(),
        images: images.clone(),
    };

    // 根据 provider 获取 API Key 并调用
    let result = match provider.as_str() {
        "openai" => {
            let key = {
                let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
                store.load_key_for_provider("openai_compat")
            }.ok_or_else(|| "未配置 OpenAI API Key。请在设置中配置。".to_string())?;

            let endpoint = {
                let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
                store.load_openai_endpoint()
            }.ok_or_else(|| "未配置 API 端点 URL。请在设置中配置。".to_string())?;

            if endpoint.is_empty() {
                return Err("未配置 API 端点 URL。请在设置中配置。".to_string());
            }

            ai::image_gen::openai_generate(&key, &endpoint, &request).await
        }
        "gemini" => {
            let key = {
                let store = apikey_state.0.lock().map_err(|e| format!("获取密钥锁失败: {}", e))?;
                store.load_key()
                    .or_else(|| std::env::var("GEMINI_API_KEY").ok())
            }.ok_or_else(|| "未配置 Gemini API Key。请在设置中配置。".to_string())?;

            ai::image_gen::gemini_generate(&key, &request).await
        }
        other => {
            return Err(format!("不支持的图片生成 Provider: '{}'", other));
        }
    };

    let gen_result = result.map_err(|e| {
        emit_rust_log(&app, "generate_image", &format!("生成失败: {}", e), None);
        e
    })?;

    let generation_time = start_time.elapsed().as_millis() as i64;

    // 生成文件名并保存
    let file_ext = if gen_result.mime_type.contains("jpeg") { "jpg" } else { "png" };
    let uuid = uuid::Uuid::new_v4().to_string();
    let short_uuid = &uuid[..8];
    let file_name = format!("{}.{}", short_uuid, file_ext);

    let (full_path, file_size) = commands::images::save_image_file(&app, &gen_result.image_data, &file_name)?;

    // 解析图片尺寸（从 size 参数中提取）
    let (width, height) = parse_size_param(&size);

    // 创建 DB 记录
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let image_record = db::models::GeneratedImage {
        id: uuid,
        user_id: None,
        prompt,
        file_path: format!("images/{}", file_name),
        file_name: file_name.clone(),
        mime_type: gen_result.mime_type,
        file_size: Some(file_size as i64),
        width: Some(width),
        height: Some(height),
        provider,
        model: gen_result.model,
        size_param: Some(size),
        generation_time: Some(generation_time),
        prompt_id,
        is_favorite: false,
        created_at: now,
    };

    let db_result = db
        .0
        .lock()
        .map_err(|e| format!("获取数据库锁失败: {}", e))
        .and_then(|database| {
            commands::images::cmd_create_image(database.connection(), &image_record)
        });
    if let Err(db_error) = db_result {
        // 文件已经落盘但数据库记录失败时必须回滚文件，否则下次扫描会留下孤儿图片。
        if let Err(cleanup_error) = commands::images::delete_image_file(&app, &file_name) {
            return Err(format!(
                "{}；清理生成图片文件失败: {}",
                db_error, cleanup_error
            ));
        }
        return Err(db_error);
    }

    emit_rust_log(&app, "generate_image", &format!(
        "生成完成: file={}, size={}B, time={}ms, path={}",
        file_name, file_size, generation_time, full_path
    ), None);

    Ok(image_record)
}

/// 查询图片列表（分页 + 搜索）
#[tauri::command]
pub fn list_generated_images(
    app: tauri::AppHandle,
    db: State<DbState>,
    page: u32,
    page_size: u32,
    search: Option<String>,
) -> Result<db::models::PaginatedResult<db::models::GeneratedImage>, String> {
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::images::cmd_list_images(
        database.connection(), page, page_size, search.as_deref(),
    );
    match &result {
        Ok(r) => emit_rust_log(&app, "list_generated_images",
            &format!("返回 {} 张图片 (共 {})", r.items.len(), r.total), None),
        Err(e) => emit_rust_log(&app, "list_generated_images",
            &format!("查询失败: {}", e), None),
    }
    result
}

/// 删除图片（同时删除本地文件和 DB 记录）
#[tauri::command]
pub fn delete_generated_image(
    app: tauri::AppHandle,
    db: State<DbState>,
    id: String,
) -> Result<(), String> {
    emit_rust_log(&app, "delete_generated_image", &format!("删除图片: id={}", id), None);

    // 先查出文件名
    let file_name = {
        let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
        let image = commands::images::cmd_get_image(database.connection(), &id)?;
        image.file_name
    };

    let full_path = commands::images::get_image_full_path(&app, &file_name)?;
    let original_bytes = match std::fs::read(&full_path) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("读取图片文件失败: {}", error)),
    };

    // 删除本地文件
    commands::images::delete_image_file(&app, &file_name)?;

    // 删除 DB 记录；如果数据库失败，恢复刚才删除的文件，保持文件与记录一致。
    let db_result = db
        .0
        .lock()
        .map_err(|e| format!("获取数据库锁失败: {}", e))
        .and_then(|database| commands::images::cmd_delete_image(database.connection(), &id));
    if let Err(db_error) = db_result {
        return Err(restore_file_after_db_failure(
            std::path::Path::new(&full_path),
            original_bytes.as_deref(),
            db_error,
        ));
    }

    emit_rust_log(&app, "delete_generated_image", "删除成功", None);
    Ok(())
}

/// 获取单张图片详情
#[tauri::command]
pub fn get_generated_image(
    app: tauri::AppHandle,
    db: State<DbState>,
    id: String,
) -> Result<db::models::GeneratedImage, String> {
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let result = commands::images::cmd_get_image(database.connection(), &id);
    match &result {
        Ok(img) => emit_rust_log(&app, "get_generated_image",
            &format!("查询成功: file={}", img.file_name), None),
        Err(e) => emit_rust_log(&app, "get_generated_image",
            &format!("查询失败: {}", e), None),
    }
    result
}

/// 获取图片文件的完整本地路径（前端用 convertFileSrc 转换后展示）
#[tauri::command]
pub fn get_image_file_path(
    app: tauri::AppHandle,
    file_name: String,
) -> Result<String, String> {
    commands::images::get_image_full_path(&app, &file_name)
}

/// 从尺寸参数字符串解析宽高
fn parse_size_param(size: &str) -> (i32, i32) {
    let parts: Vec<&str> = size.split('x').collect();
    if parts.len() == 2 {
        let w = parts[0].parse::<i32>().unwrap_or(1024);
        let h = parts[1].parse::<i32>().unwrap_or(1024);
        (w, h)
    } else {
        (1024, 1024)
    }
}

/// 将数据库删除失败恢复为可诊断的错误，同时尽可能恢复已删除文件。
fn restore_file_after_db_failure(
    file_path: &std::path::Path,
    original_bytes: Option<&[u8]>,
    db_error: String,
) -> String {
    if let Some(bytes) = original_bytes {
        if let Err(restore_error) = std::fs::write(file_path, bytes) {
            return format!(
                "{}；恢复图片文件失败: {}",
                db_error, restore_error
            );
        }
    }
    db_error
}

#[cfg(test)]
mod image_lifecycle_tests {
    use super::restore_file_after_db_failure;

    #[test]
    fn restores_file_when_database_delete_fails() {
        let dir = tempfile::tempdir().expect("创建临时目录失败");
        let file_path = dir.path().join("generated.png");
        let original = b"image-bytes";

        let error = restore_file_after_db_failure(
            &file_path,
            Some(original),
            "删除图片记录失败".to_string(),
        );

        assert_eq!(error, "删除图片记录失败");
        assert_eq!(std::fs::read(file_path).expect("恢复文件失败"), original);
    }

    #[test]
    fn reports_restore_failure_without_hiding_database_error() {
        let dir = tempfile::tempdir().expect("创建临时目录失败");
        let file_path = dir.path().join("missing").join("generated.png");

        let error = restore_file_after_db_failure(
            &file_path,
            Some(b"image-bytes"),
            "删除图片记录失败".to_string(),
        );

        assert!(error.starts_with("删除图片记录失败；恢复图片文件失败:"));
    }
}
