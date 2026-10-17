// Prompt Commands — 查询、创建、更新、删除、复制、创建副本
use rusqlite::Connection;

use crate::db::models::*;
use crate::db::queries;
use super::error::{AppError, AppResult};

/// 查询 Prompt 列表（分页 + 筛选 + 搜索）
#[allow(clippy::too_many_arguments)]
pub fn cmd_get_prompts(
    conn: &Connection,
    page: u32,
    page_size: u32,
    search: Option<String>,
    category_id: Option<String>,
    is_favorite: Option<bool>,
    is_archived: Option<bool>,
    sort: Option<String>,
) -> AppResult<PaginatedResult<Prompt>> {
    let query = ListPromptsQuery {
        page: if page == 0 { 1 } else { page },
        page_size: page_size.clamp(1, 100),
        search,
        category_id,
        is_favorite,
        is_archived,
        sort,
    };

    Ok(queries::list_prompts(conn, &query)?)
}

/// 根据 ID 查询单个 Prompt
pub fn cmd_get_prompt(conn: &Connection, id: String) -> AppResult<Prompt> {
    queries::get_prompt_by_id(conn, &id)?
        .ok_or_else(|| AppError::NotFound { resource: "Prompt", id })
}

/// 创建 Prompt
pub fn cmd_create_prompt(
    conn: &Connection,
    title: String,
    content: String,
    category_id: Option<String>,
    raw_requirement: Option<String>,
    source_type: Option<String>,
) -> AppResult<Prompt> {
    if title.trim().is_empty() {
        return Err(AppError::Validation("标题不能为空".into()));
    }
    if content.trim().is_empty() {
        return Err(AppError::Validation("内容不能为空".into()));
    }

    let input = CreatePromptInput {
        title: title.trim().to_string(),
        content: content.trim().to_string(),
        category_id,
        raw_requirement,
        source_type,
    };

    Ok(queries::create_prompt(conn, &input)?)
}

/// 更新 Prompt
pub fn cmd_update_prompt(
    conn: &Connection,
    id: String,
    title: Option<String>,
    content: Option<String>,
    category_id: Option<String>,
    is_favorite: Option<bool>,
    is_archived: Option<bool>,
) -> AppResult<Prompt> {
    queries::get_prompt_by_id(conn, &id)?
        .ok_or_else(|| AppError::NotFound { resource: "Prompt", id: id.clone() })?;

    let input = UpdatePromptInput {
        title,
        content,
        category_id,
        is_favorite,
        is_archived,
    };

    Ok(queries::update_prompt(conn, &id, &input)?)
}

/// 软删除 Prompt
pub fn cmd_delete_prompt(conn: &Connection, id: String) -> AppResult<()> {
    queries::get_prompt_by_id(conn, &id)?
        .ok_or_else(|| AppError::NotFound { resource: "Prompt", id: id.clone() })?;

    Ok(queries::delete_prompt(conn, &id)?)
}

/// 复制 Prompt 内容到剪贴板（递增 usage_count）
pub fn cmd_copy_prompt(conn: &Connection, id: String) -> AppResult<String> {
    let prompt = queries::get_prompt_by_id(conn, &id)?
        .ok_or_else(|| AppError::NotFound { resource: "Prompt", id: id.clone() })?;

    queries::increment_usage_count(conn, &id)?;

    Ok(prompt.content)
}

/// 创建 Prompt 副本
pub fn cmd_duplicate_prompt(conn: &Connection, id: String) -> AppResult<Prompt> {
    let original = queries::get_prompt_by_id(conn, &id)?
        .ok_or_else(|| AppError::NotFound { resource: "Prompt", id })?;

    let input = CreatePromptInput {
        title: format!("{} (副本)", original.title),
        content: original.content,
        category_id: original.category_id,
        raw_requirement: original.raw_requirement,
        source_type: Some(original.source_type),
    };

    Ok(queries::create_prompt(conn, &input)?)
}

/// 批量更新提示词排序顺序
pub fn cmd_update_sort_order(
    conn: &Connection,
    updates: Vec<(String, i32)>,
) -> AppResult<()> {
    if updates.is_empty() {
        return Ok(());
    }
    Ok(queries::update_sort_order(conn, &updates)?)
}
