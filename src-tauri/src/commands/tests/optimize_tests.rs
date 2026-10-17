/// Optimize Command 测试
///
/// 使用 mock AI provider，不需要真实 API 调用
use crate::db::connection::Database;
use crate::commands::prompts;
use crate::commands::optimize;
use crate::commands::optimize::CreateLogInput;

fn setup_test_db() -> Database {
    let db = Database::new_in_memory().expect("数据库连接失败");
    db.run_migrations().expect("迁移执行失败");
    db
}

// ==================== 日志记录测试 ====================

#[test]
fn test_cmd_create_optimization_log_success() {
    let db = setup_test_db();

    let log = optimize::cmd_create_optimization_log(
        db.connection(),
        CreateLogInput {
            input_text: "帮我写一个Python脚本".to_string(),
            output_text: Some("优化后的提示词".to_string()),
            model_name: "gemini-3.1-flash-lite".to_string(),
            mode: "standard".to_string(),
            token_in: Some(50),
            token_out: Some(100),
            status: "success".to_string(),
            error_message: None,
        },
    ).expect("创建日志失败");

    assert!(!log.id.is_empty());
    assert_eq!(log.input_text, "帮我写一个Python脚本");
    assert_eq!(log.output_text, Some("优化后的提示词".to_string()));
    assert_eq!(log.model_name, "gemini-3.1-flash-lite");
    assert_eq!(log.mode, "standard");
    assert_eq!(log.token_in, Some(50));
    assert_eq!(log.token_out, Some(100));
    assert_eq!(log.status, "success");
    assert!(log.error_message.is_none());
}

#[test]
fn test_cmd_create_optimization_log_error() {
    let db = setup_test_db();

    let log = optimize::cmd_create_optimization_log(
        db.connection(),
        CreateLogInput {
            input_text: "输入内容".to_string(),
            output_text: None,
            model_name: "gemini-3.1-flash-lite".to_string(),
            mode: "standard".to_string(),
            token_in: None,
            token_out: None,
            status: "error".to_string(),
            error_message: Some("API Key 无效".to_string()),
        },
    ).expect("创建错误日志失败");

    assert_eq!(log.status, "error");
    assert_eq!(log.error_message, Some("API Key 无效".to_string()));
    assert!(log.output_text.is_none());
}

// ==================== 日志查询测试 ====================

#[test]
fn test_cmd_get_optimization_logs_returns_recent() {
    let db = setup_test_db();

    // 创建多条日志
    for i in 0..5 {
        optimize::cmd_create_optimization_log(
            db.connection(),
            CreateLogInput {
                input_text: format!("输入 {}", i),
                output_text: Some(format!("输出 {}", i)),
                model_name: "gemini-3.1-flash-lite".to_string(),
                mode: "standard".to_string(),
                token_in: Some(50),
                token_out: Some(100),
                status: "success".to_string(),
                error_message: None,
            },
        ).unwrap();
    }

    let logs = optimize::cmd_get_optimization_logs(db.connection(), Some(3))
        .expect("查询日志失败");

    assert_eq!(logs.len(), 3, "应返回最多 3 条日志");
}

#[test]
fn test_cmd_get_optimization_logs_default_limit() {
    let db = setup_test_db();

    for i in 0..25 {
        optimize::cmd_create_optimization_log(
            db.connection(),
            CreateLogInput {
                input_text: format!("输入 {}", i),
                output_text: Some(format!("输出 {}", i)),
                model_name: "gemini-3.1-flash-lite".to_string(),
                mode: "standard".to_string(),
                token_in: None,
                token_out: None,
                status: "success".to_string(),
                error_message: None,
            },
        ).unwrap();
    }

    let logs = optimize::cmd_get_optimization_logs(db.connection(), None)
        .expect("查询日志失败");

    assert_eq!(logs.len(), 20, "默认应返回最多 20 条日志");
}

// ==================== Prompt optimize_count 递增测试 ====================

#[test]
fn test_cmd_increment_optimize_count() {
    let db = setup_test_db();

    let prompt = prompts::cmd_create_prompt(
        db.connection(),
        "待优化提示词".to_string(),
        "内容".to_string(),
        None, None, None,
    ).expect("创建 Prompt 失败");

    assert_eq!(prompt.optimize_count, 0);

    // 模拟优化后递增计数
    optimize::cmd_increment_optimize_count(db.connection(), prompt.id.clone())
        .expect("递增失败");

    let updated = prompts::cmd_get_prompt(db.connection(), prompt.id.clone())
        .expect("查询失败");
    assert_eq!(updated.optimize_count, 1, "optimize_count 应递增为 1");
}

// ==================== 输入验证测试 ====================

#[test]
fn test_optimize_input_validation_empty_requirement() {
    let result = optimize::validate_optimize_input("", "standard", false);
    assert!(result.is_err(), "空需求且无图片应返回错误");
    assert!(result.unwrap_err().to_string().contains("需求"), "应提到需求");
}

#[test]
fn test_optimize_input_validation_empty_requirement_with_images() {
    let result = optimize::validate_optimize_input("", "standard", true);
    assert!(result.is_ok(), "空需求但有图片应通过验证");
}

#[test]
fn test_optimize_input_validation_invalid_mode() {
    let result = optimize::validate_optimize_input("一些需求", "invalid_mode", false);
    assert!(result.is_err(), "无效模式应返回错误");
    assert!(result.unwrap_err().to_string().contains("模式"), "应提到模式");
}

#[test]
fn test_optimize_input_validation_success() {
    let result = optimize::validate_optimize_input("帮我写一个Python脚本", "standard", false);
    assert!(result.is_ok(), "合法输入应通过验证");
}
