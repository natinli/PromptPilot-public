/// Gemini AI Provider 测试
///
/// 注意：这些测试使用 mock HTTP 响应，不需要真实 API Key
use crate::ai::gemini::{GeminiProvider, GeminiConfig};
use crate::ai::types::OptimizeMode;
use crate::ai::system_prompts;

// ==================== 请求构造测试 ====================

#[test]
fn test_build_request_body_standard_mode() {
    let provider = GeminiProvider::new(GeminiConfig {
        api_key: "test-key".to_string(),
        model: "gemini-3.1-flash-lite".to_string(),
    });

    let body = provider.build_request_body(
        "帮我写一个Python脚本",
        OptimizeMode::Standard,
        None,
        None,
        None,
        None,
    );

    // 验证请求体结构
    assert!(body.get("system_instruction").is_some(), "应包含 system_instruction");
    assert!(body.get("contents").is_some(), "应包含 contents");
    assert!(body.get("generationConfig").is_some(), "应包含 generationConfig");

    // 验证 temperature
    let config = body.get("generationConfig").unwrap();
    let temp = config.get("temperature").unwrap().as_f64().unwrap();
    assert!((temp - 0.7).abs() < 0.01, "标准模式 temperature 应为 0.7");

    // 验证 maxOutputTokens
    let max_tokens = config.get("maxOutputTokens").unwrap().as_i64().unwrap();
    assert_eq!(max_tokens, 4096);
}

#[test]
fn test_build_request_body_creative_mode_higher_temperature() {
    let provider = GeminiProvider::new(GeminiConfig {
        api_key: "test-key".to_string(),
        model: "gemini-3.1-flash-lite".to_string(),
    });

    let body = provider.build_request_body(
        "想一个创意故事",
        OptimizeMode::Creative,
        None,
        None,
        None,
        None,
    );

    let config = body.get("generationConfig").unwrap();
    let temp = config.get("temperature").unwrap().as_f64().unwrap();
    assert!((temp - 0.9).abs() < 0.01, "创意模式 temperature 应为 0.9");
}

#[test]
fn test_build_request_body_includes_user_prompt_with_language() {
    let provider = GeminiProvider::new(GeminiConfig {
        api_key: "test-key".to_string(),
        model: "gemini-3.1-flash-lite".to_string(),
    });

    let body = provider.build_request_body(
        "Write a script",
        OptimizeMode::Standard,
        Some("English"),
        Some("Markdown"),
        None,
        None,
    );

    // 验证 user prompt 包含语言和格式
    let contents = body.get("contents").unwrap().as_array().unwrap();
    let user_parts = contents[0].get("parts").unwrap().as_array().unwrap();
    let user_text = user_parts[0].get("text").unwrap().as_str().unwrap();

    assert!(user_text.contains("Write a script"), "应包含原始需求");
    assert!(user_text.contains("English"), "应包含语言设定");
    assert!(user_text.contains("Markdown"), "应包含输出格式");
}

// ==================== 响应解析测试 ====================

#[test]
fn test_parse_response_success() {
    let response_json = serde_json::json!({
        "candidates": [{
            "content": {
                "parts": [{"text": "优化后的提示词内容"}]
            }
        }],
        "usageMetadata": {
            "promptTokenCount": 50,
            "candidatesTokenCount": 100
        }
    });

    let result = GeminiProvider::parse_response(&response_json);
    assert!(result.is_ok(), "解析应成功");

    let output = result.unwrap();
    assert_eq!(output.optimized_prompt, "优化后的提示词内容");
    assert_eq!(output.model, ""); // 模型名在外层设置
    assert_eq!(output.input_tokens, Some(50));
    assert_eq!(output.output_tokens, Some(100));
}

#[test]
fn test_parse_response_empty_candidates() {
    let response_json = serde_json::json!({
        "candidates": [],
        "usageMetadata": {}
    });

    let result = GeminiProvider::parse_response(&response_json);
    assert!(result.is_err(), "空 candidates 应返回错误");
    let err = result.unwrap_err();
    assert!(err.contains("empty"), "错误信息应提到 empty: {}", err);
}

#[test]
fn test_parse_response_missing_text() {
    let response_json = serde_json::json!({
        "candidates": [{
            "content": {
                "parts": [{}]
            }
        }]
    });

    let result = GeminiProvider::parse_response(&response_json);
    assert!(result.is_err(), "缺少 text 应返回错误");
}

// ==================== System Prompts 测试 ====================

#[test]
fn test_system_prompt_contains_base_and_mode_instructions() {
    let prompt = system_prompts::get_system_prompt(OptimizeMode::Standard, None);
    assert!(prompt.contains("提示词工程师"), "应包含基础角色");
    assert!(prompt.contains("标准优化"), "应包含模式指令");
}

#[test]
fn test_all_modes_have_system_prompts() {
    let modes = vec![
        OptimizeMode::Standard,
        OptimizeMode::Professional,
        OptimizeMode::Concise,
        OptimizeMode::Structured,
        OptimizeMode::Creative,
    ];

    for mode in modes {
        let prompt = system_prompts::get_system_prompt(mode, None);
        assert!(!prompt.is_empty(), "{:?} 模式应有 system prompt", mode);
    }
}

#[test]
fn test_raw_mode_no_system_prompt() {
    let prompt = system_prompts::get_system_prompt(OptimizeMode::Raw, None);
    assert!(prompt.is_empty(), "Raw 模式不应有 system prompt");
}

#[test]
fn test_raw_mode_user_prompt_passthrough() {
    let raw = "你是一个翻译专家，请提取关键词";
    let user_prompt = system_prompts::get_user_prompt(raw, None, None, false, OptimizeMode::Raw);
    assert_eq!(user_prompt, raw, "Raw 模式应直接透传用户原始内容");
}

#[test]
fn test_raw_mode_request_body_no_system_instruction() {
    let provider = GeminiProvider::new(GeminiConfig {
        api_key: "test-key".to_string(),
        model: "gemini-3.1-flash-lite".to_string(),
    });

    let body = provider.build_request_body(
        "直接执行这个任务",
        OptimizeMode::Raw,
        None,
        None,
        None,
        None,
    );

    assert!(body.get("system_instruction").is_none(), "Raw 模式不应包含 system_instruction");
    assert!(body.get("contents").is_some(), "应包含 contents");

    let config = body.get("generationConfig").unwrap();
    let temp = config.get("temperature").unwrap().as_f64().unwrap();
    assert!((temp - 0.5).abs() < 0.01, "Raw 模式 temperature 应为 0.5");
}

// ==================== URL 构造测试 ====================

#[test]
fn test_api_url_construction() {
    let provider = GeminiProvider::new(GeminiConfig {
        api_key: "test-api-key-123".to_string(),
        model: "gemini-3.1-flash-lite".to_string(),
    });

    let url = provider.get_api_url();
    assert!(url.contains("gemini-3.1-flash-lite"), "URL 应包含模型名称");
    assert!(url.contains("test-api-key-123"), "URL 应包含 API Key");
    assert!(url.contains("generateContent"), "URL 应包含 generateContent 端点");
}

// ==================== 错误处理测试 ====================

#[test]
fn test_parse_api_error_response() {
    let error_json = serde_json::json!({
        "error": {
            "code": 429,
            "message": "Resource exhausted",
            "status": "RESOURCE_EXHAUSTED"
        }
    });

    let result = GeminiProvider::parse_error_response(&error_json, 429);
    assert!(result.contains("额度"), "429 错误应提到额度限制: {}", result);
}

#[test]
fn test_parse_api_error_401() {
    let error_json = serde_json::json!({
        "error": {
            "code": 401,
            "message": "Invalid API key",
            "status": "UNAUTHENTICATED"
        }
    });

    let result = GeminiProvider::parse_error_response(&error_json, 401);
    assert!(result.contains("API Key"), "401 错误应提到 API Key: {}", result);
}
