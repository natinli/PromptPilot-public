// 提示词库导入导出功能
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::db::models::*;
use crate::db::queries;
use super::error::{AppError, AppResult};

/// 导出数据结构
#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    /// 格式版本号
    pub version: u32,
    /// 导出时间
    pub exported_at: String,
    /// 应用名称
    pub app: String,
    /// 分类列表
    pub categories: Vec<ExportCategory>,
    /// 提示词列表
    pub prompts: Vec<ExportPrompt>,
    /// 以下字段保留用于向后兼容旧导出文件的反序列化，不再主动导出
    #[serde(default)]
    pub tags: Vec<serde_json::Value>,
    #[serde(default)]
    pub prompt_tags: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportCategory {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportPrompt {
    pub id: String,
    pub title: String,
    pub content: String,
    pub raw_requirement: Option<String>,
    pub optimized_by_model: Option<String>,
    pub category_id: Option<String>,
    pub is_favorite: bool,
    /// 是否已归档（旧导出文件无此字段，反序列化时默认 false）
    #[serde(default)]
    pub is_archived: bool,
    pub source_type: String,
    pub usage_count: i32,
    pub optimize_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// 导出提示词库为 JSON 字符串
pub fn cmd_export_prompts(conn: &Connection) -> AppResult<String> {
    let categories = queries::list_categories(conn)?
        .into_iter()
        .map(|c| ExportCategory {
            id: c.id,
            name: c.name,
            color: c.color,
        })
        .collect::<Vec<_>>();

    // 导出全部提示词（含已归档）：分页拉取直到取满总数，避免单页上限截断造成备份丢数据
    const EXPORT_PAGE_SIZE: u32 = 1000;
    let mut all_prompts: Vec<Prompt> = Vec::new();
    let mut page: u32 = 1;
    loop {
        let query = ListPromptsQuery {
            page,
            page_size: EXPORT_PAGE_SIZE,
            search: None,
            category_id: None,
            is_favorite: None,
            is_archived: None,
            sort: None,
        };
        let result = queries::list_prompts(conn, &query)?;
        let total = result.total;
        let fetched = result.items.len();
        all_prompts.extend(result.items);
        if fetched == 0 || (all_prompts.len() as i64) >= total {
            break;
        }
        page += 1;
    }

    let prompts = all_prompts.into_iter().map(|p| ExportPrompt {
        id: p.id,
        title: p.title,
        content: p.content,
        raw_requirement: p.raw_requirement,
        optimized_by_model: p.optimized_by_model,
        category_id: p.category_id,
        is_favorite: p.is_favorite,
        is_archived: p.is_archived,
        source_type: p.source_type,
        usage_count: p.usage_count,
        optimize_count: p.optimize_count,
        created_at: p.created_at,
        updated_at: p.updated_at,
    }).collect::<Vec<_>>();

    let export_data = ExportData {
        version: 1,
        exported_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        app: "PromptPilot".to_string(),
        categories,
        prompts,
        tags: vec![],
        prompt_tags: vec![],
    };

    Ok(serde_json::to_string_pretty(&export_data)?)
}

/// 导入提示词库（合并模式：跳过已存在的 ID）
pub fn cmd_import_prompts(conn: &Connection, json_str: &str) -> AppResult<ImportResult> {
    let data: ExportData = serde_json::from_str(json_str)?;

    if data.app != "PromptPilot" {
        return Err(AppError::Validation("无效的导入文件：不是 PromptPilot 导出的数据。".into()));
    }

    let mut imported_categories = 0u32;
    let mut imported_prompts = 0u32;
    let mut skipped_prompts = 0u32;

    let tx = conn.unchecked_transaction()?;

    // 导入分类
    for cat in &data.categories {
        let exists: bool = tx.query_row(
            "SELECT COUNT(*) > 0 FROM categories WHERE id = ?1",
            params![cat.id],
            |row| row.get(0),
        )?;

        if !exists {
            let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
            tx.execute(
                "INSERT INTO categories (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![cat.id, cat.name, cat.color, now],
            )?;
            imported_categories += 1;
        }
    }

    // 导入提示词
    for prompt in &data.prompts {
        let exists: bool = tx.query_row(
            "SELECT COUNT(*) > 0 FROM prompts WHERE id = ?1",
            params![prompt.id],
            |row| row.get(0),
        )?;

        if exists {
            skipped_prompts += 1;
            continue;
        }

        tx.execute(
            "INSERT INTO prompts (id, title, content, raw_requirement, optimized_by_model, category_id, is_favorite, is_archived, source_type, usage_count, optimize_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                prompt.id, prompt.title, prompt.content, prompt.raw_requirement,
                prompt.optimized_by_model, prompt.category_id, prompt.is_favorite,
                prompt.is_archived, prompt.source_type, prompt.usage_count,
                prompt.optimize_count, prompt.created_at, prompt.updated_at,
            ],
        )?;
        imported_prompts += 1;
    }

    tx.commit()?;

    Ok(ImportResult {
        imported_categories,
        imported_prompts,
        skipped_prompts,
    })
}

/// 导入结果统计
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported_categories: u32,
    pub imported_prompts: u32,
    pub skipped_prompts: u32,
}
