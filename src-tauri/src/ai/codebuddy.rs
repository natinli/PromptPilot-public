//! Tencent CodeBuddy Provider 适配层。
//!
//! CodeBuddy 主要使用 OpenAI Chat Completions 的请求/响应格式，部分模型
//! 可能返回 Responses 风格的流式事件；地址、路由头和模型目录都属于
//! Provider 内部实现，不应交给前端配置。

use std::collections::BTreeSet;

use serde_json::Value;

use super::openai_compat::OpenAICompatProvider;
use super::types::{ImageData, OptimizeMode, OptimizeOutput};

const CODEBUDDY_CHAT_URL: &str = "https://copilot.tencent.com/v2/chat/completions";
const CODEBUDDY_MODEL_CONFIG_URL: &str = "https://copilot.tencent.com/v3/config";

/// CodeBuddy AI Provider。
pub struct CodeBuddyProvider {
    api_key: String,
    model: String,
}

impl CodeBuddyProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self { api_key, model }
    }

    fn compat_provider(&self) -> OpenAICompatProvider {
        OpenAICompatProvider::new(super::openai_compat::OpenAICompatConfig {
            api_key: String::new(),
            model: self.model.clone(),
            endpoint: CODEBUDDY_CHAT_URL.to_string(),
        })
    }

    /// 构建非流式请求体，沿用 PromptPilot 现有的系统提示词、多模态和参数规则。
    pub fn build_request_body(
        &self,
        raw_requirement: &str,
        mode: OptimizeMode,
        language: Option<&str>,
        output_format: Option<&str>,
        images: Option<&[ImageData]>,
        custom_system_prompt: Option<&str>,
    ) -> Value {
        let mut body = self.compat_provider().build_request_body(
            raw_requirement,
            mode,
            language,
            output_format,
            images,
            custom_system_prompt,
        );
        Self::normalize_request_body(&mut body);
        body
    }

    /// 构建流式请求体。
    pub fn build_stream_request_body(
        &self,
        raw_requirement: &str,
        mode: OptimizeMode,
        language: Option<&str>,
        output_format: Option<&str>,
        images: Option<&[ImageData]>,
        custom_system_prompt: Option<&str>,
    ) -> Value {
        let mut body = self.compat_provider().build_stream_request_body(
            raw_requirement,
            mode,
            language,
            output_format,
            images,
            custom_system_prompt,
        );
        Self::normalize_request_body(&mut body);
        body
    }

    fn with_headers(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        builder
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("X-API-Key", &self.api_key)
            .header("X-Product", "SaaS")
            .header("X-CodeBuddy-Request", "1")
            .header("X-Agent-Intent", "craft")
            .header("X-Agent-Purpose", "conversation")
            .header("X-Private-Data", "false")
            .header("X-IDE-Type", "CLI")
            .header("X-IDE-Name", "PromptPilot")
            .header("X-IDE-Version", env!("CARGO_PKG_VERSION"))
    }

    /// 发起非流式请求。
    pub async fn optimize_with_body(&self, body: Value) -> Result<OptimizeOutput, String> {
        let response = self
            .with_headers(super::http_client::client().post(CODEBUDDY_CHAT_URL))
            .header("Content-Type", "application/json")
            .json(&body)
            .timeout(super::http_client::ai_timeout())
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    format!(
                        "CodeBuddy 请求超时（{}秒），请检查网络连接",
                        super::http_client::AI_REQUEST_TIMEOUT_SECS
                    )
                } else if e.is_connect() {
                    "无法连接到 CodeBuddy 服务，请检查网络设置".to_string()
                } else {
                    "CodeBuddy 网络请求失败，请稍后重试".to_string()
                }
            })?;

        let status = response.status().as_u16();
        let response_text = response
            .text()
            .await
            .map_err(|_| "读取 CodeBuddy 响应失败，请稍后重试".to_string())?;

        let response_body: Value = serde_json::from_str(&response_text).unwrap_or(Value::Null);
        if status != 200 {
            return Err(Self::parse_error_response(&response_body, status));
        }

        let mut output = OpenAICompatProvider::parse_response(&response_body)
            .map_err(|_| "CodeBuddy 返回了无法识别的优化结果".to_string())?;
        output.model = self.model.clone();
        Ok(output)
    }

    /// 发起流式请求，返回响应供统一 SSE 读取器消费。
    pub async fn start_stream_with_body(&self, body: Value) -> Result<reqwest::Response, String> {
        let response = self
            .with_headers(super::http_client::stream_client().post(CODEBUDDY_CHAT_URL))
            .header("Content-Type", "application/json")
            // CodeBuddy 的流式接口使用 Chat Completions SSE；显式声明响应类型，
            // 避免上游或中间层按普通 JSON 响应处理并等待完整结果。
            .header("Accept", "text/event-stream")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() || e.is_connect() {
                    format!(
                        "无法连接到 CodeBuddy 服务（{}秒内未建立连接），请检查网络设置",
                        super::http_client::STREAM_CONNECT_TIMEOUT_SECS
                    )
                } else {
                    "CodeBuddy 网络请求失败，请稍后重试".to_string()
                }
            })?;

        let status = response.status().as_u16();
        if status != 200 {
            let response_text = response.text().await.unwrap_or_default();
            let response_body: Value = serde_json::from_str(&response_text).unwrap_or(Value::Null);
            return Err(Self::parse_error_response(&response_body, status));
        }

        Ok(response)
    }

    /// 解析 CodeBuddy 的错误响应，避免把内部地址或 Key 写入用户错误。
    pub fn parse_error_response(_error_body: &Value, status_code: u16) -> String {
        match status_code {
            401 => "CodeBuddy API Key 无效或已过期，请重新配置".to_string(),
            403 => "CodeBuddy API Key 没有访问权限".to_string(),
            404 => "CodeBuddy 模型不存在，请重新获取模型列表".to_string(),
            429 => "CodeBuddy API 调用频率超限，请稍后重试".to_string(),
            500..=599 => format!("CodeBuddy 服务暂时不可用（HTTP {}）", status_code),
            _ => format!("CodeBuddy 请求失败（HTTP {}）", status_code),
        }
    }

    /// 解析 CodeBuddy 流式 chunk。
    ///
    /// CodeBuddy 常规模型使用 Chat Completions 的
    /// `choices[0].delta.content`，部分新模型可能返回 Responses 风格的
    /// `response.output_text.delta` 事件。两种格式都在 Provider 层收敛，
    /// 避免把 CodeBuddy 的协议差异扩散到统一流式读取器。
    pub fn parse_stream_chunk(
        chunk_json: &Value,
    ) -> (Option<String>, Option<i64>, Option<i64>, Option<String>) {
        let text =
            parse_chat_stream_text(chunk_json).or_else(|| parse_responses_stream_text(chunk_json));
        let (input_tokens, output_tokens) = parse_stream_usage(chunk_json);
        let error = parse_stream_error(chunk_json);
        (text, input_tokens, output_tokens, error)
    }

    /// 获取 CodeBuddy 模型目录。
    ///
    /// CodeBuddy 客户端使用配置目录而不是稳定的 OpenAI `/models` 路由。
    /// 目录按当前 Key 的 `cli` 权限返回，不能使用跨账号的静态模型列表兜底。
    pub async fn fetch_models(api_key: &str) -> Result<Vec<String>, String> {
        let client = super::http_client::client();
        let response = Self::with_headers_static(client.get(CODEBUDDY_MODEL_CONFIG_URL), api_key)
            .timeout(super::http_client::models_timeout())
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    format!(
                        "获取 CodeBuddy 模型列表超时（{}秒），请稍后重试",
                        super::http_client::MODELS_REQUEST_TIMEOUT_SECS
                    )
                } else if e.is_connect() {
                    "无法连接到 CodeBuddy 服务，请检查网络设置".to_string()
                } else {
                    "获取 CodeBuddy 模型列表失败，请稍后重试".to_string()
                }
            })?;

        let status = response.status().as_u16();
        let response_text = response
            .text()
            .await
            .map_err(|_| "读取 CodeBuddy 模型列表失败，请稍后重试".to_string())?;

        if status == 401 || status == 403 {
            return Err("CodeBuddy API Key 无效或没有访问权限".to_string());
        }
        if !(200..300).contains(&status) {
            return Err(format!("获取 CodeBuddy 模型列表失败（HTTP {}）", status));
        }

        let body: Value = serde_json::from_str(&response_text)
            .map_err(|_| "CodeBuddy 模型列表响应格式无法识别".to_string())?;
        if body
            .get("code")
            .and_then(Value::as_i64)
            .is_some_and(|code| code != 0)
        {
            return Err("CodeBuddy 模型目录返回业务错误".to_string());
        }
        let models = parse_model_ids(&body);
        if models.is_empty() {
            return Err("CodeBuddy 未返回当前 Key 可用的模型列表".to_string());
        }

        Ok(models)
    }

    /// 对齐 CodeBuddy 客户端的 Chat Completions 预处理规则。
    /// CodeBuddy 接收 `max_tokens`，即使上游兼容层按 GPT-5 规则生成了
    /// `max_completion_tokens`，也要在专属适配层完成转换，避免把差异扩散到通用 Provider。
    fn normalize_request_body(body: &mut Value) {
        if let Some(max_completion_tokens) = body.get("max_completion_tokens").cloned() {
            body["max_tokens"] = max_completion_tokens;
            if let Some(object) = body.as_object_mut() {
                object.remove("max_completion_tokens");
            }
        }
    }

    fn with_headers_static(
        builder: reqwest::RequestBuilder,
        api_key: &str,
    ) -> reqwest::RequestBuilder {
        builder
            .header("Authorization", format!("Bearer {}", api_key))
            .header("X-API-Key", api_key)
            .header("User-Agent", "CLI/unknown CodeBuddy/2.136.0")
            .header("Accept", "application/json")
            .header("X-Product", "SaaS")
    }
}

/// 从 Chat Completions 流式 chunk 中提取回答文本。
///
/// `content` 既可能是字符串，也可能是带 `text` 字段的内容片段数组。
fn parse_chat_stream_text(chunk_json: &Value) -> Option<String> {
    let choice = chunk_json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())?;

    choice
        .get("delta")
        .and_then(|delta| delta.get("content"))
        .and_then(extract_text_value)
        .or_else(|| {
            choice
                .get("message")
                .and_then(|message| message.get("content"))
                .and_then(extract_text_value)
        })
}

/// 从 Responses 风格流式事件中提取文本增量。
fn parse_responses_stream_text(chunk_json: &Value) -> Option<String> {
    let event_type = chunk_json.get("type").and_then(Value::as_str)?;
    match event_type {
        "response.output_text.delta" | "response.content_part.delta" => chunk_json
            .get("delta")
            .and_then(extract_text_value)
            .or_else(|| chunk_json.get("text").and_then(extract_text_value)),
        _ => None,
    }
}

/// 从字符串、内容片段数组或 `{ "text": ... }` 对象中提取文本。
fn extract_text_value(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => {
            let mut text = String::new();
            for part in parts {
                if let Some(part_text) = extract_text_value(part) {
                    text.push_str(&part_text);
                }
            }
            (!text.is_empty()).then_some(text)
        }
        Value::Object(object) => object
            .get("text")
            .and_then(extract_text_value)
            .or_else(|| object.get("content").and_then(extract_text_value)),
        _ => None,
    }
}

/// 兼容 Chat Completions 和 Responses 的 usage 字段命名。
fn parse_stream_usage(chunk_json: &Value) -> (Option<i64>, Option<i64>) {
    let mut input_tokens = None;
    let mut output_tokens = None;

    for usage in [
        chunk_json.get("usage"),
        chunk_json.pointer("/response/usage"),
    ]
    .into_iter()
    .flatten()
    {
        input_tokens = input_tokens
            .or_else(|| usage.get("prompt_tokens").and_then(Value::as_i64))
            .or_else(|| usage.get("input_tokens").and_then(Value::as_i64));
        output_tokens = output_tokens
            .or_else(|| usage.get("completion_tokens").and_then(Value::as_i64))
            .or_else(|| usage.get("output_tokens").and_then(Value::as_i64));
    }

    (input_tokens, output_tokens)
}

/// 解析流式错误事件，避免错误被当成“空响应”吞掉。
fn parse_stream_error(chunk_json: &Value) -> Option<String> {
    let message = chunk_json
        .pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| {
            chunk_json
                .pointer("/response/error/message")
                .and_then(Value::as_str)
        })?;
    if message.is_empty() {
        None
    } else {
        Some(format!("CodeBuddy 流式响应错误: {}", message))
    }
}

/// 从配置响应中提取当前 Key 对 CLI 可用的模型 ID。
///
/// CodeBuddy 的 `data.models` 是全量模型定义，真正的授权列表位于
/// `data.agents[name=cli].models`（旧响应也可能嵌套在 `data.agent.agents`）。
/// 只有在响应没有 Agent 授权信息时，才回退到通用字段解析，以兼容历史响应。
fn parse_model_ids(body: &Value) -> Vec<String> {
    let data = body.get("data").unwrap_or(body);
    if let Some(models) = parse_cli_model_ids(data) {
        return models;
    }

    let mut ids = BTreeSet::new();
    collect_model_nodes(body, &mut ids);
    ids.into_iter().collect()
}

fn parse_cli_model_ids(data: &Value) -> Option<Vec<String>> {
    let agents = data.get("agents").and_then(Value::as_array).or_else(|| {
        data.get("agent")
            .and_then(|agent| agent.get("agents"))
            .and_then(Value::as_array)
    })?;
    let cli_agent = agents
        .iter()
        .find(|agent| agent.get("name").and_then(Value::as_str) == Some("cli"))?;
    let mut ids = BTreeSet::new();
    if let Some(Value::Array(models)) = cli_agent.get("models") {
        for model in models {
            if let Some(model) = model.as_str() {
                insert_model_id(model, &mut ids);
            } else if let Some(model) = model
                .as_object()
                .and_then(|object| object.get("id"))
                .and_then(Value::as_str)
            {
                insert_model_id(model, &mut ids);
            }
        }
    }
    Some(ids.into_iter().collect())
}

fn collect_model_nodes(value: &Value, ids: &mut BTreeSet<String>) {
    match value {
        Value::Object(object) => {
            for key in [
                "models",
                "modelIds",
                "model_ids",
                "providerModels",
                "provider_models",
                "data",
            ] {
                if let Some(child) = object.get(key) {
                    collect_model_container(child, ids);
                }
            }

            for key in ["agent", "agents", "config", "features"] {
                if let Some(child) = object.get(key) {
                    collect_model_nodes(child, ids);
                }
            }
        }
        Value::Array(_) => collect_model_container(value, ids),
        _ => {}
    }
}

fn collect_model_container(value: &Value, ids: &mut BTreeSet<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_model_container(item, ids);
            }
        }
        Value::Object(object) => {
            for key in [
                "id",
                "model",
                "modelId",
                "model_id",
                "providerModel",
                "provider_model",
            ] {
                if let Some(Value::String(model)) = object.get(key) {
                    insert_model_id(model, ids);
                }
            }
            collect_model_nodes(&Value::Object(object.clone()), ids);
        }
        Value::String(model) => insert_model_id(model, ids),
        _ => {}
    }
}

fn insert_model_id(model: &str, ids: &mut BTreeSet<String>) {
    let model = model.trim();
    if !model.is_empty()
        && model.len() <= 200
        && !model.chars().any(char::is_whitespace)
        && !model.starts_with("http://")
        && !model.starts_with("https://")
    {
        ids.insert(model.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_model_ids, CodeBuddyProvider};
    use crate::ai::types::OptimizeMode;
    use serde_json::{json, Value};

    #[test]
    fn parses_nested_codebuddy_model_catalog() {
        let body = json!({
            "code": 0,
            "data": {
                "models": [
                    { "id": "claude-sonnet-5", "provider_model": "claude-sonnet-5" },
                    { "providerModel": "gpt-5.6-sol" }
                ],
                "agent": {
                    "agents": [{ "models": ["glm-5.3-ioa"] }]
                }
            }
        });

        assert_eq!(
            parse_model_ids(&body),
            vec![
                "claude-sonnet-5".to_string(),
                "glm-5.3-ioa".to_string(),
                "gpt-5.6-sol".to_string()
            ]
        );
    }

    #[test]
    fn prefers_cli_authorized_models_over_global_catalog() {
        let body = json!({
            "code": 0,
            "data": {
                "agents": [
                    { "name": "cli", "models": ["glm-5.3-ioa", "deepseek-v4-flash-ioa"] },
                    { "name": "ide", "models": ["claude-sonnet-5"] }
                ],
                "models": [
                    { "id": "claude-sonnet-5" },
                    { "id": "deepseek-v4-flash-ioa" },
                    { "id": "glm-5.3-ioa" }
                ]
            }
        });

        assert_eq!(
            parse_model_ids(&body),
            vec![
                "deepseek-v4-flash-ioa".to_string(),
                "glm-5.3-ioa".to_string()
            ]
        );
    }

    #[test]
    fn rejects_endpoint_like_model_ids() {
        let body = json!({ "data": { "models": ["https://example.invalid", "valid-model"] } });
        assert_eq!(parse_model_ids(&body), vec!["valid-model"]);
    }

    #[test]
    fn error_message_never_contains_response_body() {
        let error = CodeBuddyProvider::parse_error_response(
            &json!({ "error": { "message": "secret-value" } }),
            400,
        );
        assert!(!error.contains("secret-value"));
        assert!(!error.contains("copilot.tencent.com"));
    }

    #[test]
    fn normalizes_new_openai_token_field_for_codebuddy() {
        let provider = CodeBuddyProvider::new("test-key".to_string(), "gpt-5.6-sol".to_string());
        let body = provider.build_request_body(
            "优化这段提示词",
            OptimizeMode::Standard,
            None,
            None,
            None,
            None,
        );

        assert_eq!(body.get("max_tokens").and_then(Value::as_i64), Some(4096));
        assert!(body.get("max_completion_tokens").is_none());

        let stream_body = provider.build_stream_request_body(
            "优化这段提示词",
            OptimizeMode::Standard,
            None,
            None,
            None,
            None,
        );
        assert_eq!(
            stream_body.get("stream").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            stream_body
                .pointer("/stream_options/include_usage")
                .and_then(Value::as_bool),
            Some(true)
        );

        let (text, input_tokens, output_tokens, error) =
            CodeBuddyProvider::parse_stream_chunk(&json!({
                "choices": [{ "delta": { "content": "增量" } }],
                "usage": { "prompt_tokens": 3, "completion_tokens": 4 }
            }));
        assert_eq!(text.as_deref(), Some("增量"));
        assert_eq!(input_tokens, Some(3));
        assert_eq!(output_tokens, Some(4));
        assert!(error.is_none());
    }

    #[test]
    fn parses_responses_text_delta_and_nested_usage() {
        let (text, input_tokens, output_tokens, error) =
            CodeBuddyProvider::parse_stream_chunk(&json!({
                "type": "response.output_text.delta",
                "delta": "Responses 增量",
                "response": {
                    "usage": {
                        "input_tokens": 12,
                        "output_tokens": 7
                    }
                }
            }));

        assert_eq!(text.as_deref(), Some("Responses 增量"));
        assert_eq!(input_tokens, Some(12));
        assert_eq!(output_tokens, Some(7));
        assert!(error.is_none());
    }

    #[test]
    fn parses_chat_content_part_array_and_stream_error() {
        let (text, input_tokens, output_tokens, error) =
            CodeBuddyProvider::parse_stream_chunk(&json!({
                "choices": [{
                    "delta": {
                        "content": [
                            { "type": "output_text", "text": "第一段" },
                            { "type": "output_text", "text": "第二段" }
                        ]
                    }
                }]
            }));

        assert_eq!(text.as_deref(), Some("第一段第二段"));
        assert!(input_tokens.is_none());
        assert!(output_tokens.is_none());
        assert!(error.is_none());

        let (_, _, _, error) = CodeBuddyProvider::parse_stream_chunk(&json!({
            "type": "error",
            "error": { "message": "上游流式失败" }
        }));
        assert_eq!(
            error.as_deref(),
            Some("CodeBuddy 流式响应错误: 上游流式失败")
        );
    }
}
