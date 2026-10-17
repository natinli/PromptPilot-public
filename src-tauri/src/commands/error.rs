// 统一错误处理类型
// P1-8: 使用 thiserror 定义结构化错误枚举，替代全项目散落的 format!("...") 字符串错误

use thiserror::Error;

/// 应用统一错误类型
/// 
/// 所有 commands 模块的业务逻辑函数应返回 `Result<T, AppError>`，
/// 在 lib.rs 的 `#[tauri::command]` 包装层通过 `map_err(|e| e.to_string())`
/// 或 `From<AppError> for String` 自动转换为 Tauri 需要的 `Result<T, String>`。
#[derive(Debug, Error)]
pub enum AppError {
    /// 数据库操作错误
    #[error("数据库错误: {0}")]
    Database(#[from] rusqlite::Error),

    /// 数据库锁获取失败
    #[error("获取数据库锁失败: {0}")]
    LockError(String),

    /// 资源未找到
    #[error("{resource}未找到: {id}")]
    NotFound {
        resource: &'static str,
        id: String,
    },

    /// 输入验证错误
    #[error("输入验证失败: {0}")]
    Validation(String),

    /// AI Provider 错误
    #[error("AI 请求失败: {0}")]
    AiProvider(String),

    /// API Key 相关错误
    #[error("API Key 错误: {0}")]
    ApiKey(String),

    /// IO 操作错误
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    /// JSON 序列化/反序列化错误
    #[error("JSON 解析错误: {0}")]
    Json(#[from] serde_json::Error),

    /// 通用业务错误（兜底）
    #[error("{0}")]
    General(String),
}

/// 允许 `AppError` 自动转换为 `String`，兼容现有的 `Result<T, String>` 签名
impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

/// 便捷类型别名
pub type AppResult<T> = Result<T, AppError>;
