// OpenAI 兼容 API Provider — 支持任何 OpenAI 格式的中转服务
// 包括 GPT、DeepSeek、Claude 中转等

use serde_json::Value;

use super::system_prompts;
use super::types::{ImageData, OptimizeMode, OptimizeOutput};

/// 按字符边界截断响应预览，避免把中文等多字节字符切成非法 UTF-8。
pub(crate) fn preview_text(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }

    let mut end = max_bytes;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", &text[..end])
}

/// OpenAI 兼容 Provider 配置
#[derive(Debug, Clone)]
pub struct OpenAICompatConfig {
    pub api_key: String,
    pub model: String,
    /// API 端点 URL，如 https://api.example.com/v1/chat/completions
    pub endpoint: String,
}

/// OpenAI 兼容 AI Provider
pub struct OpenAICompatProvider {
    config: OpenAICompatConfig,
}

impl OpenAICompatProvider {
    pub fn new(config: OpenAICompatConfig) -> Self {
        Self { config }
    }

    /// 构建请求体（支持多模态：文本 + 图片）
    pub fn build_request_body(
        &self,
        raw_requirement: &str,
        mode: OptimizeMode,
        language: Option<&str>,
        output_format: Option<&str>,
        images: Option<&[ImageData]>,
        custom_system_prompt: Option<&str>,
    ) -> Value {
        let has_images = images.as_ref().is_some_and(|imgs| !imgs.is_empty());
        let system_prompt = system_prompts::get_system_prompt(mode, custom_system_prompt);
        let user_prompt = system_prompts::get_user_prompt(raw_requirement, language, output_format, has_images, mode);

        // 构建 messages 数组
        let mut messages = Vec::new();

        // system message（Raw 模式下不添加）
        if !system_prompt.is_empty() {
            messages.push(serde_json::json!({
                "role": "system",
                "content": system_prompt
            }));
        }

        // user message（支持纯文本和多模态）
        if has_images {
            // 多模态：content 为数组，包含 text 和 image_url 类型
            let mut content_parts = vec![serde_json::json!({
                "type": "text",
                "text": user_prompt
            })];

            if let Some(imgs) = images {
                for img in imgs {
                    // 注意：不要附加 `detail` 字段。OpenAI 官方虽然支持 detail: low/high/auto，
                    // 但部分国内 OpenAI 兼容中转商对未知/扩展字段做严格校验，
                    // 一旦带上 detail 会把整个 image_url 对象静默丢弃 ——
                    // 表现就是"图片字节传过去了，但模型实际什么都没看到"。
                    // 不带 detail 时中转商一律按 vision 默认行为处理，反而最稳。
                    // v0.3.4 没传 detail 时大图能识别，加上 detail 后回归 ——
                    // 所以这里保持 v0.3.4 的极简 image_url 结构。
                    content_parts.push(serde_json::json!({
                        "type": "image_url",
                        "image_url": {
                            "url": format!("data:{};base64,{}", img.mime_type, img.data)
                        }
                    }));
                }
            }

            messages.push(serde_json::json!({
                "role": "user",
                "content": content_parts
            }));
        } else {
            // 纯文本：content 为字符串
            messages.push(serde_json::json!({
                "role": "user",
                "content": user_prompt
            }));
        }

        // GPT-4o/GPT-5 等新模型要求使用 max_completion_tokens 而非 max_tokens
        // 通过模型名称判断：gpt-4o、gpt-5、o1、o3 等新模型用 max_completion_tokens
        let model_lower = self.config.model.to_lowercase();
        let use_new_param = model_lower.starts_with("gpt-4o")
            || model_lower.starts_with("gpt-5")
            || model_lower.starts_with("o1")
            || model_lower.starts_with("o3")
            || model_lower.starts_with("o4");

        let mut body = serde_json::json!({
            "model": self.config.model,
            "messages": messages,
            "temperature": mode.temperature()
        });

        if use_new_param {
            body["max_completion_tokens"] = serde_json::json!(4096);
        } else {
            body["max_tokens"] = serde_json::json!(4096);
        }

        body
    }

    /// 构建请求体的脱敏版本，用于日志/Debug 面板展示
    /// 把 image_url 里的超长 base64 截成短预览，避免日志爆炸
    pub fn redact_body_for_log(body: &Value) -> Value {
        let mut redacted = body.clone();
        if let Some(messages) = redacted.get_mut("messages").and_then(|v| v.as_array_mut()) {
            for msg in messages.iter_mut() {
                if let Some(content) = msg.get_mut("content").and_then(|v| v.as_array_mut()) {
                    for part in content.iter_mut() {
                        if let Some(url) = part.pointer_mut("/image_url/url").and_then(|v| v.as_str().map(String::from)) {
                            let redacted_url = format!(
                                "{}<base64 total {} bytes truncated>",
                                preview_text(&url, 80), url.len()
                            );
                            if let Some(image_url) = part.get_mut("image_url") {
                                image_url["url"] = serde_json::Value::String(redacted_url);
                            }
                        }
                    }
                }
            }
        }
        redacted
    }

    /// 生成请求体的"结构骨架"摘要，专门用于排查多模态请求
    /// 只输出关键字段（role / content 类型 / image_url 元数据），不输出长文本和 base64
    /// 即使 Debug 面板有显示长度限制，关键诊断信息也不会被截断
    pub fn build_structure_summary(body: &Value) -> Value {
        let mut summary = serde_json::json!({
            "model": body.get("model").cloned().unwrap_or(Value::Null),
            "stream": body.get("stream").cloned().unwrap_or(Value::Null),
            "temperature": body.get("temperature").cloned().unwrap_or(Value::Null),
            "max_tokens": body.get("max_tokens").cloned().unwrap_or(Value::Null),
            "max_completion_tokens": body.get("max_completion_tokens").cloned().unwrap_or(Value::Null),
        });

        let mut messages_summary = Vec::new();
        if let Some(messages) = body.get("messages").and_then(|v| v.as_array()) {
            for (i, msg) in messages.iter().enumerate() {
                let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("?");
                let content = msg.get("content");
                let content_summary = match content {
                    Some(Value::String(s)) => serde_json::json!({
                        "kind": "string",
                        "length": s.len(),
                    }),
                    Some(Value::Array(arr)) => {
                        let mut parts_info = Vec::new();
                        for part in arr.iter() {
                            let part_type = part.get("type").and_then(|t| t.as_str()).unwrap_or("?");
                            match part_type {
                                "text" => {
                                    let len = part.get("text").and_then(|t| t.as_str()).map(|s| s.len()).unwrap_or(0);
                                    parts_info.push(serde_json::json!({
                                        "type": "text",
                                        "text_length": len,
                                    }));
                                }
                                "image_url" => {
                                    let image_url = part.get("image_url");
                                    let url_str = image_url.and_then(|iu| iu.get("url")).and_then(|u| u.as_str()).unwrap_or("");
                                    let url_prefix = preview_text(url_str, 50);
                                    let detail = image_url.and_then(|iu| iu.get("detail")).and_then(|d| d.as_str()).unwrap_or("<missing>");
                                    parts_info.push(serde_json::json!({
                                        "type": "image_url",
                                        "url_prefix": url_prefix,
                                        "url_total_bytes": url_str.len(),
                                        "detail": detail,
                                    }));
                                }
                                _ => {
                                    parts_info.push(serde_json::json!({ "type": part_type }));
                                }
                            }
                        }
                        serde_json::json!({
                            "kind": "array",
                            "parts": parts_info,
                        })
                    }
                    _ => serde_json::json!({ "kind": "unknown" }),
                };
                messages_summary.push(serde_json::json!({
                    "index": i,
                    "role": role,
                    "content": content_summary,
                }));
            }
        }
        summary["messages"] = serde_json::Value::Array(messages_summary);
        summary
    }

    /// 解析成功响应
    pub fn parse_response(response: &Value) -> Result<OptimizeOutput, String> {
        let text = response
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(extract_text_value)
            .ok_or_else(|| "OpenAI 兼容 API 返回了空响应".to_string())?;

        let input_tokens = response
            .get("usage")
            .and_then(|u| u.get("prompt_tokens"))
            .and_then(|v| v.as_i64());

        let output_tokens = response
            .get("usage")
            .and_then(|u| u.get("completion_tokens"))
            .and_then(|v| v.as_i64());

        Ok(OptimizeOutput {
            optimized_prompt: text.trim().to_string(),
            model: String::new(), // 由调用方设置
            input_tokens,
            output_tokens,
        })
    }

    /// 解析错误响应
    pub fn parse_error_response(error_body: &Value, status_code: u16) -> String {
        let api_message = error_body
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");

        match status_code {
            401 => format!("API Key 无效或已过期: {}", api_message),
            403 => format!("API Key 权限不足: {}", api_message),
            404 => format!("模型不存在或端点 URL 错误: {}", api_message),
            429 => format!("API 调用频率超限，请稍后重试: {}", api_message),
            500..=599 => format!("API 服务暂时不可用 ({}): {}", status_code, api_message),
            _ => format!("API 错误 ({}): {}", status_code, api_message),
        }
    }

    /// 规范化端点 URL：自动补全 /chat/completions 路径
    fn normalize_endpoint(endpoint: &str) -> String {
        let url = endpoint.trim_end_matches('/');
        let lower = url.to_lowercase();
        // 如果已经包含 /chat/completions，直接使用
        if lower.ends_with("/chat/completions") {
            return url.to_string();
        }
        // 如果以 /v1 结尾（大小写不敏感），补全 /chat/completions
        if lower.ends_with("/v1") {
            return format!("{}/chat/completions", url);
        }
        // 如果以 /v1/chat 结尾（大小写不敏感），补全 /completions
        if lower.ends_with("/v1/chat") {
            return format!("{}/completions", url);
        }
        // 默认直接使用用户提供的 URL
        url.to_string()
    }

    /// 调用 OpenAI 兼容 API（异步，支持多模态）
    pub async fn optimize(
        &self,
        raw_requirement: &str,
        mode: OptimizeMode,
        language: Option<&str>,
        output_format: Option<&str>,
        images: Option<&[ImageData]>,
        custom_system_prompt: Option<&str>,
    ) -> Result<OptimizeOutput, String> {
        let body = self.build_request_body(raw_requirement, mode, language, output_format, images, custom_system_prompt);
        self.optimize_with_body(body).await
    }

    /// 使用预构建的请求体发起非流式请求（避免重复构建 body）
    pub async fn optimize_with_body(&self, body: Value) -> Result<OptimizeOutput, String> {
        let actual_endpoint = Self::normalize_endpoint(&self.config.endpoint);

        log::debug!("[openai_compat] 实际请求: POST {}", actual_endpoint);

        let client = super::http_client::client();
        let response = client
            .post(&actual_endpoint)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&body)
            .timeout(super::http_client::ai_timeout())
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
format!("API 请求超时（{}秒），请检查网络连接或端点 URL 是否正确。实际请求: {}",
                        super::http_client::AI_REQUEST_TIMEOUT_SECS, actual_endpoint)
                } else if e.is_connect() {
                    format!("无法连接到 API 端点 {}，请检查端点 URL 和网络设置", actual_endpoint)
                } else {
                    format!("网络请求失败: {}", e)
                }
            })?;

        let status = response.status().as_u16();

        // 先获取原始文本，再手动解析 JSON（便于诊断非 JSON 响应）
        let response_text = response
            .text()
            .await
            .map_err(|e| format!("读取 API 响应失败: {}", e))?;

        if status != 200 {
            let error_body: Value = serde_json::from_str(&response_text).unwrap_or(serde_json::json!({}));
            return Err(Self::parse_error_response(&error_body, status));
        }

        let response_body: Value = serde_json::from_str(&response_text)
            .map_err(|e| {
                let preview = preview_text(&response_text, 200);
                format!(
                    "解析 API 响应失败（返回内容不是有效 JSON）: {}\n端点: {}\n响应预览: {}",
                    e, actual_endpoint, preview
                )
            })?;

        let mut output = Self::parse_response(&response_body)?;
        output.model = self.config.model.clone();

        Ok(output)
    }

    // ==================== 流式输出 ====================

    /// 构建流式请求体（在原有请求体基础上加 stream: true）
    pub fn build_stream_request_body(
        &self,
        raw_requirement: &str,
        mode: OptimizeMode,
        language: Option<&str>,
        output_format: Option<&str>,
        images: Option<&[ImageData]>,
        custom_system_prompt: Option<&str>,
    ) -> Value {
        let mut body = self.build_request_body(raw_requirement, mode, language, output_format, images, custom_system_prompt);
        body["stream"] = serde_json::json!(true);
        // 请求流式时同时返回 usage 统计
        body["stream_options"] = serde_json::json!({"include_usage": true});
        body
    }

    /// 发起流式请求，返回 reqwest::Response（由调用方负责读取 SSE 流）
    pub async fn start_stream(
        &self,
        raw_requirement: &str,
        mode: OptimizeMode,
        language: Option<&str>,
        output_format: Option<&str>,
        images: Option<&[ImageData]>,
        custom_system_prompt: Option<&str>,
    ) -> Result<reqwest::Response, String> {
        let body = self.build_stream_request_body(raw_requirement, mode, language, output_format, images, custom_system_prompt);
        self.start_stream_with_body(body).await
    }

    /// 使用预构建的请求体发起流式请求（避免重复构建 body）
    pub async fn start_stream_with_body(&self, body: Value) -> Result<reqwest::Response, String> {
        let actual_endpoint = Self::normalize_endpoint(&self.config.endpoint);

        log::debug!("[openai_compat] 流式请求: POST {}", actual_endpoint);

        // 流式请求使用专用 client（仅 connect_timeout，无总超时）
        // 避免长文本生成时被总超时截断
        let client = super::http_client::stream_client();
        let response = client
            .post(&actual_endpoint)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() || e.is_connect() {
                    format!("无法连接到 API 端点（{}秒内未建立连接），请检查端点 URL 和网络设置。实际请求: {}",
                        super::http_client::STREAM_CONNECT_TIMEOUT_SECS, actual_endpoint)
                } else {
                    format!("网络请求失败: {}", e)
                }
            })?;

        let status = response.status().as_u16();
        if status != 200 {
            let response_text = response.text().await.unwrap_or_default();
            let error_body: Value = serde_json::from_str(&response_text).unwrap_or(serde_json::json!({}));
            return Err(Self::parse_error_response(&error_body, status));
        }

        Ok(response)
    }

    /// 从 OpenAI SSE chunk 的 JSON 中提取增量文本和 usage
    /// 返回 (增量文本, input_tokens, output_tokens)
    pub fn parse_stream_chunk(chunk_json: &Value) -> (Option<String>, Option<i64>, Option<i64>, Option<String>) {
        // 增量文本在 choices[0].delta.content
        let text = chunk_json
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(extract_text_value);

        // usage 统计（通常只在最后一个 chunk 出现）
        let input_tokens = chunk_json
            .get("usage")
            .and_then(|u| u.get("prompt_tokens"))
            .and_then(|v| v.as_i64());

        let output_tokens = chunk_json
            .get("usage")
            .and_then(|u| u.get("completion_tokens"))
            .and_then(|v| v.as_i64());

        (text, input_tokens, output_tokens, None)
    }

    /// 获取模型名称
    pub fn model_name(&self) -> &str {
        &self.config.model
    }

    /// 从 /v1/models 端点获取可用模型列表
    /// 返回模型 ID 列表，按字母排序
    pub async fn fetch_models(endpoint: &str, api_key: &str) -> Result<Vec<String>, String> {
        // 规范化端点：提取 base URL（去掉 /chat/completions 等后缀，保留到 /v1）
        let base_url = Self::extract_base_url(endpoint);
        let models_url = format!("{}/models", base_url);

        log::debug!("[fetch_models] 最终请求 URL: {}", models_url);

        let client = super::http_client::client();
        let response = client
            .get(&models_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .timeout(super::http_client::models_timeout())
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    format!("获取模型列表超时（{}秒），请求地址: {}",
                        super::http_client::MODELS_REQUEST_TIMEOUT_SECS, models_url)
                } else if e.is_connect() {
                    format!("无法连接到 {}，请检查端点 URL", models_url)
                } else {
                    format!("获取模型列表失败: {}，请求地址: {}", e, models_url)
                }
            })?;

        let status = response.status().as_u16();
        let response_text = response
            .text()
            .await
            .map_err(|e| format!("读取模型列表响应失败: {}", e))?;

        if status != 200 {
            // 尝试解析 JSON 错误
            let error_body: Value = serde_json::from_str(&response_text).unwrap_or(serde_json::json!({}));
            let msg = error_body
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .map(str::to_owned)
                .unwrap_or_else(|| preview_text(&response_text, 200));
            return Err(format!("获取模型列表失败 (HTTP {}): {}，请求地址: {}", status, msg, models_url));
        }

        let body: Value = serde_json::from_str(&response_text)
            .map_err(|e| {
                let preview = preview_text(&response_text, 200);
                format!("解析模型列表失败: {}，请求地址: {}，响应预览: {}", e, models_url, preview)
            })?;

        // OpenAI 标准格式：{ "data": [{ "id": "gpt-4.1-mini", ... }, ...] }
        let models = body
            .get("data")
            .and_then(|d| d.as_array())
            .ok_or_else(|| {
                let preview = preview_text(&response_text, 200);
                format!("模型列表格式异常（缺少 data 字段），请求地址: {}，响应预览: {}", models_url, preview)
            })?;

        let mut model_ids: Vec<String> = models
            .iter()
            .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(|s| s.to_string()))
            .collect();

        model_ids.sort();
        Ok(model_ids)
    }

    /// 从端点 URL 提取 base URL（到 /v1 为止）
    fn extract_base_url(endpoint: &str) -> String {
        let url = endpoint.trim_end_matches('/');
        let lower = url.to_lowercase();

        // 查找 /v1 的位置（大小写不敏感）
        if let Some(pos) = lower.find("/v1") {
            // 保留到 /v1 为止（包含 /v1）
            url.get(..pos + 3).unwrap_or(url).to_string()
        } else {
            // 没有 /v1，直接在末尾加 /v1
            format!("{}/v1", url)
        }
    }
}

/// 兼容 OpenAI 新旧响应中字符串、内容片段数组和嵌套 text 对象。
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

#[cfg(test)]
mod tests {
    use super::{preview_text, OpenAICompatProvider};
    use serde_json::json;

    #[test]
    fn parses_content_part_arrays_in_non_stream_response() {
        let output = OpenAICompatProvider::parse_response(&json!({
            "choices": [{
                "message": {
                    "content": [
                        { "type": "output_text", "text": "第一段" },
                        { "type": "output_text", "text": "第二段" }
                    ]
                }
            }]
        }))
        .expect("内容片段数组应该可解析");

        assert_eq!(output.optimized_prompt, "第一段第二段");
    }

    #[test]
    fn parses_content_part_arrays_in_stream_chunk() {
        let (text, _, _, _) = OpenAICompatProvider::parse_stream_chunk(&json!({
            "choices": [{
                "delta": {
                    "content": [
                        { "text": "增量一" },
                        { "text": "增量二" }
                    ]
                }
            }]
        }));

        assert_eq!(text.as_deref(), Some("增量一增量二"));
    }

    #[test]
    fn truncates_preview_at_a_utf8_boundary() {
        assert_eq!(preview_text("中文响应", 6), "中文...");
        assert_eq!(preview_text("abc", 10), "abc");
    }
}
