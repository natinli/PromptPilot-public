// SQL 查询函数
use rusqlite::{params, Connection, Result as SqliteResult};
use uuid::Uuid;

use super::models::*;

// ==================== Prompt CRUD ====================

/// 创建 Prompt
pub fn create_prompt(conn: &Connection, input: &CreatePromptInput) -> SqliteResult<Prompt> {
    let id = Uuid::new_v4().to_string();
    let source_type = input.source_type.as_deref().unwrap_or("manual");
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    // 新提示词的 sort_order = 当前最大值 + 1（0 表示未排序，新建时自动排到末尾）
    let max_sort: i32 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) FROM prompts WHERE is_archived = 0",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    conn.execute(
        "INSERT INTO prompts (id, title, content, category_id, raw_requirement, source_type, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, input.title, input.content, input.category_id, input.raw_requirement, source_type, max_sort + 1, now, now],
    )?;

    get_prompt_by_id(conn, &id).map(|opt| opt.expect("刚创建的 Prompt 应存在"))
}

/// 根据 ID 查询 Prompt
pub fn get_prompt_by_id(conn: &Connection, id: &str) -> SqliteResult<Option<Prompt>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, title, content, raw_requirement, optimized_by_model,
                category_id, is_favorite, is_archived, source_type, usage_count,
                optimize_count, last_used_at, created_at, updated_at, sort_order
         FROM prompts WHERE id = ?1"
    )?;

    let mut rows = stmt.query_map(params![id], row_to_prompt)?;
    match rows.next() {
        Some(Ok(prompt)) => Ok(Some(prompt)),
        Some(Err(e)) => Err(e),
        None => Ok(None),
    }
}

/// 更新 Prompt
pub fn update_prompt(conn: &Connection, id: &str, input: &UpdatePromptInput) -> SqliteResult<Prompt> {
    let current = get_prompt_by_id(conn, id)?
        .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;

    let title = input.title.as_deref().unwrap_or(&current.title);
    let content = input.content.as_deref().unwrap_or(&current.content);
    let is_favorite = input.is_favorite.unwrap_or(current.is_favorite);
    let is_archived = input.is_archived.unwrap_or(current.is_archived);
    // category_id 处理：None = 不更新（保持原值），Some("") = 清除分类，Some("xxx") = 设置新分类
    let category_id: Option<&str> = match input.category_id.as_deref() {
        None => current.category_id.as_deref(),       // 不更新，保持原值
        Some("") => None,                              // 空字符串 = 清除分类
        Some(cat) => Some(cat),                        // 设置新分类
    };
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    conn.execute(
        "UPDATE prompts SET title = ?1, content = ?2, is_favorite = ?3, is_archived = ?4,
         category_id = ?5, updated_at = ?6 WHERE id = ?7",
        params![title, content, is_favorite, is_archived, category_id, now, id],
    )?;

    get_prompt_by_id(conn, id).map(|opt| opt.expect("刚更新的 Prompt 应存在"))
}

/// 软删除 Prompt（设置 is_archived = true）
pub fn delete_prompt(conn: &Connection, id: &str) -> SqliteResult<()> {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    conn.execute(
        "UPDATE prompts SET is_archived = 1, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

/// 分页查询 Prompts
pub fn list_prompts(conn: &Connection, query: &ListPromptsQuery) -> SqliteResult<PaginatedResult<Prompt>> {
    log::info!("[list_prompts] 查询参数: {:?}", query);
    let mut where_clauses: Vec<String> = Vec::new();
    let mut count_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref search) = query.search {
        where_clauses.push("(title LIKE ?N OR content LIKE ?N)".to_string());
        let search_pattern = format!("%{}%", search);
        count_params.push(Box::new(search_pattern.clone()));
        count_params.push(Box::new(search_pattern));
    }

    if let Some(ref cat_id) = query.category_id {
        where_clauses.push("category_id = ?N".to_string());
        count_params.push(Box::new(cat_id.clone()));
    }

    if let Some(is_fav) = query.is_favorite {
        where_clauses.push("is_favorite = ?N".to_string());
        count_params.push(Box::new(is_fav));
    }

    if let Some(is_arch) = query.is_archived {
        where_clauses.push("is_archived = ?N".to_string());
        count_params.push(Box::new(is_arch));
    }

    // 构建 WHERE 子句，替换 ?N 为实际参数位置
    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        let mut idx = 0;
        let clauses: Vec<String> = where_clauses.iter().map(|clause| {
            let mut result = clause.clone();
            while result.contains("?N") {
                idx += 1;
                result = result.replacen("?N", &format!("?{}", idx), 1);
            }
            result
        }).collect();
        format!("WHERE {}", clauses.join(" AND "))
    };

    // 计算总数
    let count_sql = format!("SELECT COUNT(*) FROM prompts {}", where_sql);
    let total: i64 = conn.query_row(
        &count_sql,
        rusqlite::params_from_iter(count_params.iter().map(|p| p.as_ref())),
        |row: &rusqlite::Row| row.get(0),
    )?;

    // 查询分页数据
    let offset = (query.page - 1) * query.page_size;
    let mut query_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    // 重新构建参数（count_params 已被消耗）
    if let Some(ref search) = query.search {
        let search_pattern = format!("%{}%", search);
        query_params.push(Box::new(search_pattern.clone()));
        query_params.push(Box::new(search_pattern));
    }
    if let Some(ref cat_id) = query.category_id {
        query_params.push(Box::new(cat_id.clone()));
    }
    if let Some(is_fav) = query.is_favorite {
        query_params.push(Box::new(is_fav));
    }
    if let Some(is_arch) = query.is_archived {
        query_params.push(Box::new(is_arch));
    }

    let next_idx = query_params.len() + 1;
    
    // 根据 sort 参数动态生成排序
    let order_sql = match query.sort.as_deref() {
        Some("usage") => "ORDER BY usage_count DESC, updated_at DESC",
        Some("created") => "ORDER BY created_at DESC",
        Some("custom") => "ORDER BY sort_order ASC, updated_at DESC",
        _ => "ORDER BY updated_at DESC",  // 默认按更新时间
    };
    
    let list_sql = format!(
        "SELECT id, user_id, title, content, raw_requirement, optimized_by_model,
                category_id, is_favorite, is_archived, source_type, usage_count,
                optimize_count, last_used_at, created_at, updated_at, sort_order
         FROM prompts {} {} LIMIT ?{} OFFSET ?{}",
        where_sql, order_sql, next_idx, next_idx + 1
    );

    query_params.push(Box::new(query.page_size));
    query_params.push(Box::new(offset));

    log::info!("[list_prompts] SQL: {}", list_sql);
    log::info!("[list_prompts] 参数数量: {}, total: {}", query_params.len(), total);

    let mut stmt = conn.prepare(&list_sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(query_params.iter().map(|p| p.as_ref())),
        row_to_prompt,
    )?;

    let items: Vec<Prompt> = rows.collect::<Result<Vec<_>, _>>()?;

    Ok(PaginatedResult {
        items,
        total,
        page: query.page,
        page_size: query.page_size,
    })
}

// ==================== Category CRUD ====================

/// 创建分类
pub fn create_category(conn: &Connection, name: &str, color: Option<&str>) -> SqliteResult<Category> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    conn.execute(
        "INSERT INTO categories (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, color, now],
    )?;

    Ok(Category {
        id,
        user_id: None,
        name: name.to_string(),
        color: color.map(|s| s.to_string()),
        created_at: now,
    })
}

/// 查询所有分类
pub fn list_categories(conn: &Connection) -> SqliteResult<Vec<Category>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, name, color, created_at FROM categories ORDER BY created_at"
    )?;

    let rows = stmt.query_map([], |row: &rusqlite::Row| {
        Ok(Category {
            id: row.get(0)?,
            user_id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;

    rows.collect()
}

/// 删除分类（同时将该分类下的提示词的 category_id 置空）
/// 更新分类（重命名 / 改颜色）
pub fn update_category(conn: &Connection, id: &str, name: Option<&str>, color: Option<&str>) -> SqliteResult<Category> {
    // 动态构建 SET 子句
    let mut sets: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(n) = name {
        sets.push(format!("name = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(n.to_string()));
    }
    if let Some(c) = color {
        sets.push(format!("color = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(c.to_string()));
    }

    if sets.is_empty() {
        // 没有要更新的字段，直接返回当前记录
        let mut stmt = conn.prepare(
            "SELECT id, user_id, name, color, created_at FROM categories WHERE id = ?1"
        )?;
        return stmt.query_row(params![id], |row| {
            Ok(Category {
                id: row.get(0)?,
                user_id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        });
    }

    // 添加 WHERE 条件的参数
    let where_idx = params_vec.len() + 1;
    params_vec.push(Box::new(id.to_string()));

    let sql = format!("UPDATE categories SET {} WHERE id = ?{}", sets.join(", "), where_idx);
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;

    // 返回更新后的记录
    let mut stmt = conn.prepare(
        "SELECT id, user_id, name, color, created_at FROM categories WHERE id = ?1"
    )?;
    stmt.query_row(params![id], |row| {
        Ok(Category {
            id: row.get(0)?,
            user_id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
        })
    })
}

pub fn delete_category(conn: &Connection, id: &str) -> SqliteResult<()> {
    // 先将引用该分类的提示词解除关联
    conn.execute(
        "UPDATE prompts SET category_id = NULL WHERE category_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM categories WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

// ==================== 辅助操作 ====================

/// 递增 Prompt 使用次数
pub fn increment_usage_count(conn: &Connection, id: &str) -> SqliteResult<()> {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    conn.execute(
        "UPDATE prompts SET usage_count = usage_count + 1, last_used_at = ?1, updated_at = ?2 WHERE id = ?3",
        params![now, now, id],
    )?;
    Ok(())
}

/// 查询统计摘要
pub fn get_stats(conn: &Connection) -> SqliteResult<super::models::Stats> {
    let total_prompts: i64 = conn.query_row(
        "SELECT COUNT(*) FROM prompts WHERE is_archived = 0",
        [],
        |row: &rusqlite::Row| row.get(0),
    )?;

    let total_favorites: i64 = conn.query_row(
        "SELECT COUNT(*) FROM prompts WHERE is_favorite = 1 AND is_archived = 0",
        [],
        |row: &rusqlite::Row| row.get(0),
    )?;

    let total_categories: i64 = conn.query_row(
        "SELECT COUNT(*) FROM categories",
        [],
        |row: &rusqlite::Row| row.get(0),
    )?;

    let total_optimizations: i64 = conn.query_row(
        "SELECT COUNT(*) FROM optimization_logs",
        [],
        |row: &rusqlite::Row| row.get(0),
    )?;

    Ok(super::models::Stats {
        total_prompts,
        total_categories,
        total_favorites,
        total_optimizations,
    })
}

// ==================== 辅助函数 ====================

/// 将 SQLite 行映射为 Prompt 结构体
fn row_to_prompt(row: &rusqlite::Row) -> rusqlite::Result<Prompt> {
    Ok(Prompt {
        id: row.get(0)?,
        user_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        raw_requirement: row.get(4)?,
        optimized_by_model: row.get(5)?,
        category_id: row.get(6)?,
        is_favorite: row.get(7)?,
        is_archived: row.get(8)?,
        source_type: row.get(9)?,
        usage_count: row.get(10)?,
        optimize_count: row.get(11)?,
        last_used_at: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        sort_order: row.get(15)?,
    })
}

/// 批量更新提示词排序顺序
/// updates: [(id, sort_order), ...]
pub fn update_sort_order(conn: &Connection, updates: &[(String, i32)]) -> SqliteResult<()> {
    let mut stmt = conn.prepare(
        "UPDATE prompts SET sort_order = ?1 WHERE id = ?2"
    )?;
    for (id, order) in updates {
        stmt.execute(params![order, id])?;
    }
    Ok(())
}

// ==================== Generated Image CRUD ====================

/// 创建图片记录
pub fn create_image(conn: &Connection, image: &GeneratedImage) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO generated_images (id, user_id, prompt, file_path, file_name, mime_type, file_size, width, height, provider, model, size_param, generation_time, prompt_id, is_favorite, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            image.id, image.user_id, image.prompt, image.file_path, image.file_name,
            image.mime_type, image.file_size, image.width, image.height,
            image.provider, image.model, image.size_param, image.generation_time,
            image.prompt_id, image.is_favorite, image.created_at,
        ],
    )?;
    Ok(())
}

/// 根据 ID 查询图片
pub fn get_image_by_id(conn: &Connection, id: &str) -> SqliteResult<Option<GeneratedImage>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, prompt, file_path, file_name, mime_type, file_size, width, height,
                provider, model, size_param, generation_time, prompt_id, is_favorite, created_at
         FROM generated_images WHERE id = ?1"
    )?;

    let mut rows = stmt.query_map(params![id], row_to_generated_image)?;
    match rows.next() {
        Some(Ok(image)) => Ok(Some(image)),
        Some(Err(e)) => Err(e),
        None => Ok(None),
    }
}

/// 分页查询图片列表（支持搜索）
pub fn list_images(
    conn: &Connection,
    page: u32,
    page_size: u32,
    search: Option<&str>,
) -> SqliteResult<PaginatedResult<GeneratedImage>> {
    let (where_sql, count_params, query_params) = if let Some(search_str) = search {
        let pattern = format!("%{}%", search_str);
        (
            "WHERE prompt LIKE ?1".to_string(),
            vec![Box::new(pattern.clone()) as Box<dyn rusqlite::types::ToSql>],
            vec![Box::new(pattern) as Box<dyn rusqlite::types::ToSql>],
        )
    } else {
        (String::new(), vec![], vec![])
    };

    // 计算总数
    let count_sql = format!("SELECT COUNT(*) FROM generated_images {}", where_sql);
    let total: i64 = conn.query_row(
        &count_sql,
        rusqlite::params_from_iter(count_params.iter().map(|p| p.as_ref())),
        |row| row.get(0),
    )?;

    // 查询分页数据
    let offset = (page - 1) * page_size;
    let next_idx = query_params.len() + 1;

    let list_sql = format!(
        "SELECT id, user_id, prompt, file_path, file_name, mime_type, file_size, width, height,
                provider, model, size_param, generation_time, prompt_id, is_favorite, created_at
         FROM generated_images {} ORDER BY created_at DESC LIMIT ?{} OFFSET ?{}",
        where_sql, next_idx, next_idx + 1
    );

    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = query_params;
    all_params.push(Box::new(page_size));
    all_params.push(Box::new(offset));

    let mut stmt = conn.prepare(&list_sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(all_params.iter().map(|p| p.as_ref())),
        row_to_generated_image,
    )?;

    let items: Vec<GeneratedImage> = rows.collect::<Result<Vec<_>, _>>()?;

    Ok(PaginatedResult {
        items,
        total,
        page,
        page_size,
    })
}

/// 删除图片记录（仅 DB 记录，文件由 commands/images.rs 删除）
pub fn delete_image(conn: &Connection, id: &str) -> SqliteResult<()> {
    conn.execute("DELETE FROM generated_images WHERE id = ?1", params![id])?;
    Ok(())
}

/// 将 SQLite 行映射为 GeneratedImage 结构体
fn row_to_generated_image(row: &rusqlite::Row) -> rusqlite::Result<GeneratedImage> {
    Ok(GeneratedImage {
        id: row.get(0)?,
        user_id: row.get(1)?,
        prompt: row.get(2)?,
        file_path: row.get(3)?,
        file_name: row.get(4)?,
        mime_type: row.get(5)?,
        file_size: row.get(6)?,
        width: row.get(7)?,
        height: row.get(8)?,
        provider: row.get(9)?,
        model: row.get(10)?,
        size_param: row.get(11)?,
        generation_time: row.get(12)?,
        prompt_id: row.get(13)?,
        is_favorite: row.get(14)?,
        created_at: row.get(15)?,
    })
}
