//! 数据模型定义
//! 对应 SQLite 数据库中的表结构，用于 Rust 与前端之间的数据传输。

use serde::{Deserialize, Serialize};

// ==================== Prompt ====================

/// 提示词
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    /// 唯一标识（UUID）
    pub id: String,
    /// 用户 ID（预留多用户支持）
    pub user_id: Option<String>,
    /// 提示词标题
    pub title: String,
    /// 提示词内容（可能包含优化思路 + 分隔符 + 纯提示词）
    pub content: String,
    /// 用户原始输入（优化前的需求）
    pub raw_requirement: Option<String>,
    /// 优化时使用的 AI 模型名称
    pub optimized_by_model: Option<String>,
    /// 所属分类 ID
    pub category_id: Option<String>,
    /// 是否收藏
    pub is_favorite: bool,
    /// 是否归档（软删除）
    pub is_archived: bool,
    /// 来源类型："manual"（手动创建）| "optimized"（AI 优化生成）
    pub source_type: String,
    /// 使用次数（复制时递增）
    pub usage_count: i32,
    /// 优化次数
    pub optimize_count: i32,
    /// 最后使用时间（ISO 8601 UTC）
    pub last_used_at: Option<String>,
    /// 创建时间（ISO 8601 UTC）
    pub created_at: String,
    /// 更新时间（ISO 8601 UTC）
    pub updated_at: String,
    /// 自定义排序顺序（越小越靠前，0 表示未排序）
    pub sort_order: i32,
}

/// 创建提示词的输入参数
#[derive(Debug, Deserialize)]
pub struct CreatePromptInput {
    pub title: String,
    pub content: String,
    pub category_id: Option<String>,
    pub raw_requirement: Option<String>,
    pub source_type: Option<String>,
}

/// 更新提示词的输入参数（所有字段可选，仅更新传入的字段）
#[derive(Debug, Deserialize)]
pub struct UpdatePromptInput {
    pub title: Option<String>,
    pub content: Option<String>,
    pub category_id: Option<String>,
    pub is_favorite: Option<bool>,
    pub is_archived: Option<bool>,
}

/// 提示词列表查询参数
#[derive(Debug)]
pub struct ListPromptsQuery {
    pub page: u32,
    pub page_size: u32,
    pub search: Option<String>,
    pub category_id: Option<String>,
    pub is_favorite: Option<bool>,
    pub is_archived: Option<bool>,
    pub sort: Option<String>,
}

/// 分页查询结果
#[derive(Debug, Serialize)]
pub struct PaginatedResult<T> {
    /// 当前页的数据列表
    pub items: Vec<T>,
    /// 符合条件的总记录数
    pub total: i64,
    /// 当前页码（从 1 开始）
    pub page: u32,
    /// 每页大小
    pub page_size: u32,
}

// ==================== Category ====================

/// 分类
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    /// 唯一标识（UUID）
    pub id: String,
    /// 用户 ID（预留多用户支持）
    pub user_id: Option<String>,
    /// 分类名称
    pub name: String,
    /// 分类颜色（CSS 颜色值）
    pub color: Option<String>,
    /// 创建时间（ISO 8601 UTC）
    pub created_at: String,
}

// ==================== OptimizationLog ====================

/// 优化日志（记录每次 AI 优化的输入输出和元数据）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationLog {
    /// 唯一标识（UUID）
    pub id: String,
    /// 用户 ID（预留多用户支持）
    pub user_id: Option<String>,
    /// 用户输入的原始文本
    pub input_text: String,
    /// AI 生成的优化结果
    pub output_text: Option<String>,
    /// 使用的 AI 模型名称
    pub model_name: String,
    /// 优化模式（standard/professional/concise/structured/creative/raw）
    pub mode: String,
    /// 输入 token 数
    pub token_in: Option<i32>,
    /// 输出 token 数
    pub token_out: Option<i32>,
    /// 状态："success" | "error"
    pub status: String,
    /// 错误信息（仅 status="error" 时有值）
    pub error_message: Option<String>,
    /// 创建时间（ISO 8601 UTC）
    pub created_at: String,
}

// ==================== Stats ====================

/// 统计摘要
#[derive(Debug, Serialize)]
pub struct Stats {
    /// 提示词总数
    pub total_prompts: i64,
    /// 分类总数
    pub total_categories: i64,
    /// 收藏提示词数
    pub total_favorites: i64,
    /// 优化总次数
    pub total_optimizations: i64,
}

// ==================== GeneratedImage ====================

/// AI 生成的图片（元信息记录）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedImage {
    /// 唯一标识（UUID）
    pub id: String,
    /// 用户 ID（预留多用户支持）
    pub user_id: Option<String>,
    /// 生成提示词
    pub prompt: String,
    /// 本地文件相对路径（images/{uuid}.png）
    pub file_path: String,
    /// 文件名（如 abc123.png）
    pub file_name: String,
    /// MIME 类型
    pub mime_type: String,
    /// 文件大小（字节）
    pub file_size: Option<i64>,
    /// 图片宽度
    pub width: Option<i32>,
    /// 图片高度
    pub height: Option<i32>,
    /// AI Provider："openai" / "gemini"
    pub provider: String,
    /// 模型名称
    pub model: String,
    /// 请求的尺寸参数（如 "1024x1024"）
    pub size_param: Option<String>,
    /// 生成耗时（毫秒）
    pub generation_time: Option<i64>,
    /// 关联的提示词 ID（可选，双向关联）
    pub prompt_id: Option<String>,
    /// 是否收藏（预留）
    pub is_favorite: bool,
    /// 创建时间（ISO 8601 UTC）
    pub created_at: String,
}
