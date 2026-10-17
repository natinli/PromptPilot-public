/// Prompt 更新、删除、复制、收藏 Commands 测试
use crate::db::connection::Database;
use crate::db::models::*;
use crate::commands::prompts;

/// 创建测试数据库（内存 + 已迁移）
fn setup_test_db() -> Database {
    let db = Database::new_in_memory().expect("数据库连接失败");
    db.run_migrations().expect("迁移执行失败");
    db
}

/// 创建一条测试 Prompt
fn create_test_prompt(db: &Database) -> Prompt {
    prompts::cmd_create_prompt(
        db.connection(),
        "测试提示词".to_string(),
        "测试内容".to_string(),
        None, None, None,
    ).expect("创建测试 Prompt 失败")
}

#[test]
fn test_cmd_create_prompt_trims_values_and_preserves_manual_source() {
    let db = setup_test_db();

    let prompt = prompts::cmd_create_prompt(
        db.connection(),
        "  手动提示词  ".to_string(),
        "  有效内容  ".to_string(),
        None,
        None,
        Some("manual".to_string()),
    )
    .expect("创建手动 Prompt 失败");

    assert_eq!(prompt.title, "手动提示词");
    assert_eq!(prompt.content, "有效内容");
    assert_eq!(prompt.source_type, "manual");
}

#[test]
fn test_cmd_update_prompt_fields() {
    let db = setup_test_db();
    let prompt = create_test_prompt(&db);

    let updated = prompts::cmd_update_prompt(
        db.connection(),
        prompt.id.clone(),
        Some("新标题".to_string()),
        Some("新内容".to_string()),
        None, None, None,
    ).expect("更新失败");

    assert_eq!(updated.title, "新标题");
    assert_eq!(updated.content, "新内容");
}

#[test]
fn test_cmd_delete_prompt_soft_delete() {
    let db = setup_test_db();
    let prompt = create_test_prompt(&db);

    prompts::cmd_delete_prompt(db.connection(), prompt.id.clone())
        .expect("删除失败");

    // 应仍可查到（软删除）
    let found = prompts::cmd_get_prompt(db.connection(), prompt.id.clone())
        .expect("查询失败");
    assert!(found.is_archived, "软删除后 is_archived 应为 true");
}

#[test]
fn test_cmd_copy_prompt_increments_usage_count() {
    let db = setup_test_db();
    let prompt = create_test_prompt(&db);

    let content = prompts::cmd_copy_prompt(db.connection(), prompt.id.clone())
        .expect("复制失败");
    assert_eq!(content, "测试内容", "应返回 Prompt 内容");

    // 验证 usage_count 已递增
    let updated = prompts::cmd_get_prompt(db.connection(), prompt.id.clone())
        .expect("查询失败");
    assert_eq!(updated.usage_count, 1, "使用次数应递增为 1");
}

#[test]
fn test_cmd_duplicate_prompt_creates_copy() {
    let db = setup_test_db();
    let prompt = create_test_prompt(&db);

    let duplicate = prompts::cmd_duplicate_prompt(db.connection(), prompt.id.clone())
        .expect("复制失败");

    assert_ne!(duplicate.id, prompt.id, "副本应有不同的 ID");
    assert_eq!(duplicate.title, "测试提示词 (副本)");
    assert_eq!(duplicate.content, "测试内容");
}

#[test]
fn test_cmd_toggle_favorite() {
    let db = setup_test_db();
    let prompt = create_test_prompt(&db);
    assert!(!prompt.is_favorite);

    // 收藏
    let fav = prompts::cmd_update_prompt(
        db.connection(),
        prompt.id.clone(),
        None, None, None,
        Some(true), // is_favorite
        None,
    ).expect("收藏失败");
    assert!(fav.is_favorite, "应已收藏");

    // 取消收藏
    let unfav = prompts::cmd_update_prompt(
        db.connection(),
        prompt.id.clone(),
        None, None, None,
        Some(false),
        None,
    ).expect("取消收藏失败");
    assert!(!unfav.is_favorite, "应已取消收藏");
}
