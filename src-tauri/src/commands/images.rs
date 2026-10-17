//! 图片生成命令模块
//! 负责图片文件的本地存储管理和数据库 CRUD 操作

use std::path::PathBuf;
use rusqlite::Connection;
use tauri::Manager;

use crate::db;

/// 获取图片存储目录路径，不存在则自动创建
pub fn get_images_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    let images_dir = app_data_dir.join("images");
    if !images_dir.exists() {
        std::fs::create_dir_all(&images_dir)
            .map_err(|e| format!("创建图片目录失败: {}", e))?;
    }
    Ok(images_dir)
}

/// 校验图片文件名只能是 images 目录下的单个文件名。
///
/// 图片文件名来自数据库记录或前端请求，不能让路径分隔符、绝对路径或
/// `..` 片段参与 `join`，否则图片读取、保存和删除都会越过预期目录。
pub fn validate_image_file_name(file_name: &str) -> Result<(), String> {
    if file_name.is_empty()
        || file_name == "."
        || file_name == ".."
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains(':')
        || file_name.contains('\0')
        || std::path::Path::new(file_name).is_absolute()
    {
        return Err("图片文件名无效：只能使用 images 目录下的单个文件名".to_string());
    }

    Ok(())
}

/// 保存图片文件到本地
/// 返回 (完整路径字符串, 文件大小)
pub fn save_image_file(
    app: &tauri::AppHandle,
    image_data: &[u8],
    file_name: &str,
) -> Result<(String, u64), String> {
    validate_image_file_name(file_name)?;
    let images_dir = get_images_dir(app)?;
    let file_path = images_dir.join(file_name);

    std::fs::write(&file_path, image_data)
        .map_err(|e| format!("保存图片文件失败: {}", e))?;

    let file_size = image_data.len() as u64;
    let path_str = file_path.to_string_lossy().to_string();

    log::info!("[images] 图片已保存: {} ({} bytes)", path_str, file_size);
    Ok((path_str, file_size))
}

/// 删除本地图片文件
pub fn delete_image_file(
    app: &tauri::AppHandle,
    file_name: &str,
) -> Result<(), String> {
    validate_image_file_name(file_name)?;
    let images_dir = get_images_dir(app)?;
    let file_path = images_dir.join(file_name);

    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("删除图片文件失败: {}", e))?;
        log::info!("[images] 图片已删除: {}", file_path.display());
    }
    Ok(())
}

/// 获取图片文件的完整本地路径
pub fn get_image_full_path(
    app: &tauri::AppHandle,
    file_name: &str,
) -> Result<String, String> {
    validate_image_file_name(file_name)?;
    let images_dir = get_images_dir(app)?;
    let file_path = images_dir.join(file_name);
    Ok(file_path.to_string_lossy().to_string())
}

// ==================== DB CRUD 包装 ====================

/// 创建图片记录
pub fn cmd_create_image(
    conn: &Connection,
    image: &db::models::GeneratedImage,
) -> Result<(), String> {
    db::queries::create_image(conn, image)
        .map_err(|e| format!("创建图片记录失败: {}", e))
}

/// 查询图片列表（分页 + 搜索）
pub fn cmd_list_images(
    conn: &Connection,
    page: u32,
    page_size: u32,
    search: Option<&str>,
) -> Result<db::models::PaginatedResult<db::models::GeneratedImage>, String> {
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);
    db::queries::list_images(conn, page, page_size, search)
        .map_err(|e| format!("查询图片列表失败: {}", e))
}

/// 删除图片记录
pub fn cmd_delete_image(conn: &Connection, id: &str) -> Result<(), String> {
    db::queries::delete_image(conn, id)
        .map_err(|e| format!("删除图片记录失败: {}", e))
}

/// 获取单张图片详情
pub fn cmd_get_image(
    conn: &Connection,
    id: &str,
) -> Result<db::models::GeneratedImage, String> {
    db::queries::get_image_by_id(conn, id)
        .map_err(|e| format!("查询图片失败: {}", e))?
        .ok_or_else(|| format!("图片不存在: {}", id))
}

#[cfg(test)]
mod tests {
    use super::{cmd_list_images, validate_image_file_name};
    use crate::db::connection::Database;

    #[test]
    fn accepts_single_image_file_names() {
        for file_name in ["abc123.png", "image-01.webp", "图片-01.jpeg"] {
            assert!(validate_image_file_name(file_name).is_ok(), "{} 应该合法", file_name);
        }
    }

    #[test]
    fn rejects_path_escape_and_absolute_names() {
        for file_name in [
            "",
            ".",
            "..",
            "../outside.png",
            r"..\outside.png",
            "/tmp/outside.png",
            r"C:\outside.png",
            "C:outside.png",
        ] {
            assert!(validate_image_file_name(file_name).is_err(), "{} 不应该合法", file_name);
        }
    }

    #[test]
    fn clamps_invalid_pagination_before_query() {
        let db = Database::new_in_memory().expect("创建内存数据库失败");
        db.run_migrations().expect("执行数据库迁移失败");

        let result = cmd_list_images(db.connection(), 0, 0, None).expect("查询图片列表失败");

        assert_eq!(result.page, 1);
        assert_eq!(result.page_size, 1);
    }
}
