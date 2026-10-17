/// 数据模型 CRUD 操作测试
use crate::db::connection::Database;
use crate::db::models::*;
use crate::db::queries;

/// 创建测试数据库（内存 + 已迁移）
fn setup_test_db() -> Database {
    let db = Database::new_in_memory().expect("数据库连接失败");
    db.run_migrations().expect("迁移执行失败");
    db
}

// ==================== Prompt CRUD 测试 ====================

#[test]
fn test_create_prompt() {
    let db = setup_test_db();
    let input = CreatePromptInput {
        title: "测试提示词".to_string(),
        content: "这是一个测试内容".to_string(),
        category_id: None,
        raw_requirement: None,
        source_type: Some("manual".to_string()),
    };

    let prompt = queries::create_prompt(db.connection(), &input).expect("创建 Prompt 失败");
    assert!(!prompt.id.is_empty(), "Prompt ID 不应为空");
    assert_eq!(prompt.title, "测试提示词");
    assert_eq!(prompt.content, "这是一个测试内容");
    assert_eq!(prompt.source_type, "manual");
    assert_eq!(prompt.usage_count, 0);
    assert!(!prompt.is_favorite);
    assert!(!prompt.is_archived);
}

#[test]
fn test_get_prompt_by_id() {
    let db = setup_test_db();
    let input = CreatePromptInput {
        title: "查询测试".to_string(),
        content: "查询内容".to_string(),
        category_id: None,
        raw_requirement: None,
        source_type: None,
    };

    let created = queries::create_prompt(db.connection(), &input).expect("创建失败");
    let found = queries::get_prompt_by_id(db.connection(), &created.id).expect("查询失败");
    assert!(found.is_some(), "应能找到刚创建的 Prompt");
    assert_eq!(found.unwrap().title, "查询测试");
}

#[test]
fn test_update_prompt() {
    let db = setup_test_db();
    let input = CreatePromptInput {
        title: "原始标题".to_string(),
        content: "原始内容".to_string(),
        category_id: None,
        raw_requirement: None,
        source_type: None,
    };

    let created = queries::create_prompt(db.connection(), &input).expect("创建失败");

    let update = UpdatePromptInput {
        title: Some("更新后标题".to_string()),
        content: Some("更新后内容".to_string()),
        category_id: None,
        is_favorite: None,
        is_archived: None,
    };

    let updated = queries::update_prompt(db.connection(), &created.id, &update).expect("更新失败");
    assert_eq!(updated.title, "更新后标题");
    assert_eq!(updated.content, "更新后内容");
}

#[test]
fn test_soft_delete_prompt() {
    let db = setup_test_db();
    let input = CreatePromptInput {
        title: "待删除".to_string(),
        content: "内容".to_string(),
        category_id: None,
        raw_requirement: None,
        source_type: None,
    };

    let created = queries::create_prompt(db.connection(), &input).expect("创建失败");
    queries::delete_prompt(db.connection(), &created.id).expect("删除失败");

    let found = queries::get_prompt_by_id(db.connection(), &created.id).expect("查询失败");
    assert!(found.is_some(), "软删除后仍应存在于数据库");
    assert!(found.unwrap().is_archived, "软删除后 is_archived 应为 true");
}

#[test]
fn test_list_prompts_with_pagination() {
    let db = setup_test_db();

    // 创建 5 条记录
    for i in 0..5 {
        let input = CreatePromptInput {
            title: format!("提示词 {}", i),
            content: format!("内容 {}", i),
            category_id: None,
            raw_requirement: None,
            source_type: None,
        };
        queries::create_prompt(db.connection(), &input).expect("创建失败");
    }

    let query = ListPromptsQuery {
        page: 1,
        page_size: 2,
        search: None,
        category_id: None,
        is_favorite: None,
        is_archived: Some(false),
        sort: None,
    };

    let result = queries::list_prompts(db.connection(), &query).expect("查询失败");
    assert_eq!(result.items.len(), 2, "分页应返回 2 条");
    assert_eq!(result.total, 5, "总数应为 5");
}

#[test]
fn test_search_prompts() {
    let db = setup_test_db();

    queries::create_prompt(db.connection(), &CreatePromptInput {
        title: "React 组件开发".to_string(),
        content: "帮我写一个 React 组件".to_string(),
        category_id: None,
        raw_requirement: None,
        source_type: None,
    }).expect("创建失败");

    queries::create_prompt(db.connection(), &CreatePromptInput {
        title: "Python 脚本".to_string(),
        content: "写一个 Python 脚本".to_string(),
        category_id: None,
        raw_requirement: None,
        source_type: None,
    }).expect("创建失败");

    let query = ListPromptsQuery {
        page: 1,
        page_size: 10,
        search: Some("React".to_string()),
        category_id: None,
        is_favorite: None,
        is_archived: Some(false),
        sort: None,
    };

    let result = queries::list_prompts(db.connection(), &query).expect("查询失败");
    assert_eq!(result.total, 1, "搜索 React 应只返回 1 条");
    assert_eq!(result.items[0].title, "React 组件开发");
}

#[test]
fn test_toggle_favorite() {
    let db = setup_test_db();
    let input = CreatePromptInput {
        title: "收藏测试".to_string(),
        content: "内容".to_string(),
        category_id: None,
        raw_requirement: None,
        source_type: None,
    };

    let created = queries::create_prompt(db.connection(), &input).expect("创建失败");
    assert!(!created.is_favorite);

    let update = UpdatePromptInput {
        title: None,
        content: None,
        category_id: None,
        is_favorite: Some(true),
        is_archived: None,
    };

    let updated = queries::update_prompt(db.connection(), &created.id, &update).expect("更新失败");
    assert!(updated.is_favorite, "收藏后应为 true");
}

// ==================== Category 测试 ====================

#[test]
fn test_create_and_list_categories() {
    let db = setup_test_db();

    queries::create_category(db.connection(), "编程", Some("#FF5733")).expect("创建分类失败");
    queries::create_category(db.connection(), "写作", Some("#33FF57")).expect("创建分类失败");

    let categories = queries::list_categories(db.connection()).expect("查询分类失败");
    assert_eq!(categories.len(), 4); // 预置 2 个 + 新建 2 个
    let names: Vec<&str> = categories.iter().map(|c| c.name.as_str()).collect();
    assert!(names.contains(&"编程"), "应包含新建的「编程」分类");
    assert!(names.contains(&"写作"), "应包含新建的「写作」分类");
}
