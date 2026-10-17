// Optimize Commands — AI 优化与日志
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::db::models::OptimizationLog;
use crate::ai::types::OptimizeMode;
use super::error::{AppError, AppResult};

/// 创建日志的输入参数
pub struct CreateLogInput {
    pub input_text: String,
    pub output_text: Option<String>,
    pub model_name: String,
    pub mode: String,
    pub token_in: Option<i32>,
    pub token_out: Option<i32>,
    pub status: String,
    pub error_message: Option<String>,
}

/// 验证优化输入
pub fn validate_optimize_input(raw_requirement: &str, mode: &str, has_images: bool) -> AppResult<OptimizeMode> {
    if raw_requirement.trim().is_empty() && !has_images {
        return Err(AppError::Validation("需求内容不能为空".into()));
    }

    OptimizeMode::parse(mode)
        .ok_or_else(|| AppError::Validation(format!(
            "无效的优化模式 '{}'。支持的模式: standard, professional, concise, structured, creative, raw",
            mode
        )))
}

/// 创建优化日志
pub fn cmd_create_optimization_log(
    conn: &Connection,
    input: CreateLogInput,
) -> AppResult<OptimizationLog> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    conn.execute(
        "INSERT INTO optimization_logs (id, input_text, output_text, model_name, mode, token_in, token_out, status, error_message, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, input.input_text, input.output_text, input.model_name, input.mode, input.token_in, input.token_out, input.status, input.error_message, now],
    )?;

    Ok(OptimizationLog {
        id,
        user_id: None,
        input_text: input.input_text,
        output_text: input.output_text,
        model_name: input.model_name,
        mode: input.mode,
        token_in: input.token_in,
        token_out: input.token_out,
        status: input.status,
        error_message: input.error_message,
        created_at: now,
    })
}

/// 查询优化日志列表
pub fn cmd_get_optimization_logs(
    conn: &Connection,
    limit: Option<u32>,
) -> AppResult<Vec<OptimizationLog>> {
    let limit = limit.unwrap_or(20).min(100);

    let mut stmt = conn.prepare(
        "SELECT id, user_id, input_text, output_text, model_name, mode,
                token_in, token_out, status, error_message, created_at
         FROM optimization_logs
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?1"
    )?;

    let rows = stmt.query_map(params![limit], |row| {
        Ok(OptimizationLog {
            id: row.get(0)?,
            user_id: row.get(1)?,
            input_text: row.get(2)?,
            output_text: row.get(3)?,
            model_name: row.get(4)?,
            mode: row.get(5)?,
            token_in: row.get(6)?,
            token_out: row.get(7)?,
            status: row.get(8)?,
            error_message: row.get(9)?,
            created_at: row.get(10)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(AppError::Database)
}

/// 分页查询优化日志（支持 offset + status/mode 过滤）
pub fn cmd_get_optimization_logs_paged(
    conn: &Connection,
    limit: u32,
    offset: u32,
    status_filter: Option<&str>,
    exclude_mode: Option<&str>,
) -> AppResult<Vec<OptimizationLog>> {
    let mut conditions: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    let mut param_idx = 3u32;

    if let Some(status) = status_filter {
        conditions.push(format!("status = ?{}", param_idx));
        param_values.push(Box::new(status.to_string()));
        param_idx += 1;
    }
    if let Some(mode) = exclude_mode {
        conditions.push(format!("mode != ?{}", param_idx));
        param_values.push(Box::new(mode.to_string()));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let sql = format!(
        "SELECT id, user_id, input_text, output_text, model_name, mode,
                token_in, token_out, status, error_message, created_at
         FROM optimization_logs
         {}
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?1 OFFSET ?2",
        where_clause
    );

    let mut stmt = conn.prepare(&sql)?;

    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    all_params.push(Box::new(limit));
    all_params.push(Box::new(offset));
    all_params.extend(param_values);

    let rows = stmt.query_map(
        rusqlite::params_from_iter(all_params.iter().map(|p| p.as_ref())),
        |row| {
        Ok(OptimizationLog {
            id: row.get(0)?,
            user_id: row.get(1)?,
            input_text: row.get(2)?,
            output_text: row.get(3)?,
            model_name: row.get(4)?,
            mode: row.get(5)?,
            token_in: row.get(6)?,
            token_out: row.get(7)?,
            status: row.get(8)?,
            error_message: row.get(9)?,
            created_at: row.get(10)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(AppError::Database)
}

/// 递增 Prompt 的 optimize_count
pub fn cmd_increment_optimize_count(conn: &Connection, prompt_id: String) -> AppResult<()> {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    conn.execute(
        "UPDATE prompts SET optimize_count = optimize_count + 1, updated_at = ?1 WHERE id = ?2",
        params![now, prompt_id],
    )?;
    Ok(())
}

/// 清除所有优化日志
pub fn cmd_clear_optimization_logs(conn: &Connection) -> AppResult<u64> {
    let deleted = conn.execute("DELETE FROM optimization_logs", [])?;
    Ok(deleted as u64)
}
