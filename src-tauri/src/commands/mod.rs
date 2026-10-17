// Tauri Commands 模块
//! Tauri Command 业务逻辑模块

pub mod error;
pub mod prompts;
pub mod categories;
pub mod stats;
pub mod optimize;
pub mod apikey;
pub mod import_export;
pub mod images;

// 重导出统一错误类型，方便各子模块使用
pub use error::{AppError, AppResult};

#[cfg(test)]
mod tests;
