// Category Commands
use rusqlite::Connection;

use crate::db::models::Category;
use crate::db::queries;
use super::error::{AppError, AppResult};

/// 查询所有分类
pub fn cmd_get_categories(conn: &Connection) -> AppResult<Vec<Category>> {
    Ok(queries::list_categories(conn)?)
}

/// 创建分类
pub fn cmd_create_category(conn: &Connection, name: &str, color: Option<&str>) -> AppResult<Category> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("分类名称不能为空".to_string()));
    }
    Ok(queries::create_category(conn, trimmed, color)?)
}

/// 更新分类（重命名 / 改颜色）
pub fn cmd_update_category(conn: &Connection, id: &str, name: Option<&str>, color: Option<&str>) -> AppResult<Category> {
    if let Some(n) = name {
        let trimmed = n.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation("分类名称不能为空".to_string()));
        }
    }
    Ok(queries::update_category(conn, id, name, color)?)
}

/// 删除分类
pub fn cmd_delete_category(conn: &Connection, id: &str) -> AppResult<()> {
    Ok(queries::delete_category(conn, id)?)
}
