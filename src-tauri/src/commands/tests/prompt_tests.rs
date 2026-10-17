/// Prompt 查询与创建 Commands 测试
use crate::db::connection::Database;
use crate::db::models::*;
use crate::commands::prompts;

/// 创建测试数据库（内存 + 已迁移）
fn setup_test_db() -> Database {
    let db = Database::new_in_memory().expect("数据库连接失败");
    db.run_migrations().expect("迁移执行失败");
    db
}

#[test]
fn test_cmd_get_prompts_returns_paginated_data() {
    let db = setup_test_db();

    // 创建测试数据
    for i in 0..3 {
        let input = CreatePromptInput {
            title: format!("提示词 {}", i),
            content: format!("内容 {}", i),
            category_id: None,
            raw_requirement: None,
            source_type: None,
        };
        crate::db::queries::create_prompt(db.connection(), &input).expect("创建失败");
    }

    let result = prompts::cmd_get_prompts(
        db.connection(), 1, 10, None, None, None, Some(false), None,
    ).expect("查询失败");

    assert_eq!(result.total, 3, "应有 3 条数据");
    assert_eq!(result.items.len(), 3);
    assert_eq!(result.page, 1);
}

#[test]
fn test_cmd_create_prompt_success() {
    let db = setup_test_db();

    let result = prompts::cmd_create_prompt(
        db.connection(),
        "新建提示词".to_string(),
        "提示词内容".to_string(),
        None,
        None,
        None,
    ).expect("创建失败");

    assert!(!result.id.is_empty());
    assert_eq!(result.title, "新建提示词");
    assert_eq!(result.content, "提示词内容");
    assert_eq!(result.source_type, "manual");
}

#[test]
fn test_cmd_create_prompt_with_empty_title_fails() {
    let db = setup_test_db();

    let result = prompts::cmd_create_prompt(
        db.connection(),
        "".to_string(), // 空标题
        "内容".to_string(),
        None,
        None,
        None,
    );

    assert!(result.is_err(), "空标题应返回错误");
    let err_msg = result.unwrap_err().to_string();
    assert!(err_msg.contains("标题"), "错误信息应包含 '标题': {}", err_msg);
}

#[test]
fn test_cmd_create_prompt_with_empty_content_fails() {
    let db = setup_test_db();

    let result = prompts::cmd_create_prompt(
        db.connection(),
        "标题".to_string(),
        "".to_string(), // 空内容
        None,
        None,
        None,
    );

    assert!(result.is_err(), "空内容应返回错误");
    let err_msg = result.unwrap_err().to_string();
    assert!(err_msg.contains("内容"), "错误信息应包含 '内容': {}", err_msg);
}

#[test]
fn test_cmd_get_prompt_by_id() {
    let db = setup_test_db();

    let created = prompts::cmd_create_prompt(
        db.connection(),
        "查询测试".to_string(),
        "内容".to_string(),
        None, None, None,
    ).expect("创建失败");

    let found = prompts::cmd_get_prompt(db.connection(), created.id.clone())
        .expect("查询失败");
    assert_eq!(found.title, "查询测试");
}

#[test]
fn test_cmd_get_prompt_not_found() {
    let db = setup_test_db();

    let result = prompts::cmd_get_prompt(db.connection(), "non-existent-id".to_string());
    assert!(result.is_err(), "查询不存在的 ID 应返回错误");
}
