// 数据库模块
//! SQLite 数据库模块（连接管理、迁移、查询、数据模型）

pub mod connection;
pub mod migration;
pub mod models;
pub mod queries;

pub use models::{Prompt, Category, OptimizationLog, Stats, PaginatedResult, GeneratedImage};

#[cfg(test)]
mod tests;
