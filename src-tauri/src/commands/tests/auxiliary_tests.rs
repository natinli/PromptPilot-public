/// 分类、统计 Commands 测试
use crate::db::connection::Database;
use crate::commands::{prompts, categories, stats};

/// 创建测试数据库（内存 + 已迁移）
fn setup_test_db() -> Database {
    let db = Database::new_in_memory().expect("数据库连接失败");
    db.run_migrations().expect("迁移执行失败");
    db
}

#[test]
fn test_cmd_get_categories_returns_list() {
    let db = setup_test_db();

    crate::db::queries::create_category(db.connection(), "编程", Some("#FF5733")).unwrap();
    crate::db::queries::create_category(db.connection(), "写作", Some("#33FF57")).unwrap();

    let result = categories::cmd_get_categories(db.connection()).expect("查询分类失败");
    assert_eq!(result.len(), 4); // 预置 2 个 + 新建 2 个
}

#[test]
fn test_cmd_get_stats_returns_summary() {
    let db = setup_test_db();

    prompts::cmd_create_prompt(
        db.connection(),
        "统计测试".to_string(),
        "内容".to_string(),
        None, None, None,
    ).unwrap();

    let prompt2 = prompts::cmd_create_prompt(
        db.connection(),
        "收藏测试".to_string(),
        "内容".to_string(),
        None, None, None,
    ).unwrap();

    prompts::cmd_update_prompt(
        db.connection(),
        prompt2.id,
        None, None, None,
        Some(true),
        None,
    ).unwrap();

    crate::db::queries::create_category(db.connection(), "分类1", None).unwrap();

    let result = stats::cmd_get_stats(db.connection()).expect("查询统计失败");
    assert_eq!(result.total_prompts, 2);
    assert_eq!(result.total_favorites, 1);
    assert_eq!(result.total_categories, 3); // 预置 2 个 + 新建 1 个
    assert_eq!(result.total_optimizations, 0);
}

#[test]
fn test_cmd_get_stats_empty_database() {
    let db = setup_test_db();

    let result = stats::cmd_get_stats(db.connection()).expect("查询统计失败");
    assert_eq!(result.total_prompts, 0);
    assert_eq!(result.total_favorites, 0);
    assert_eq!(result.total_categories, 2); // 迁移预置 2 个默认分类
    assert_eq!(result.total_optimizations, 0);
}
