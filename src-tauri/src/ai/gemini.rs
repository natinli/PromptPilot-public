// Gemini AI Provider — Rust 实现
// 从原 TypeScript GeminiProvider 精准迁移

use serde_json::Value;

use super::system_prompts;
use super::types::{ImageData, OptimizeMode, OptimizeOutput};

const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

/// Gemini Provider 配置
#[derive(Debug, Clone)]
pub struct GeminiConfig {
    pub api_key: String,
    pub model: String,
}

impl Default for GeminiConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: "gemini-3.1-flash-lite-preview".to_string(),
        }
    }
}

/// Gemini AI Provider
pub struct GeminiProvider {
    config: GeminiConfig,
}

impl GeminiProvider {
    pub fn new(config: GeminiConfig) -> Self {
        Self { config }
    }

    /// 获取 API URL
    pub fn get_api_url(&self) -> String {
        format!(
            "{}/models/{}:generateContent?key={}",
            GEMINI_API_BASE, self.config.model, self.config.api_key
        )
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

        // 构建 parts 数组：先放文本，再放图片
        let mut parts = vec![serde_json::json!({"text": user_prompt})];

        if let Some(imgs) = images {
            for img in imgs {
                parts.push(serde_json::json!({
                    "inline_data": {
                        "mime_type": img.mime_type,
                        "data": img.data
                    }
                }));
            }
        }

        // 思考模型（2.5-pro/2.5-flash）需要更大的 token 限制，因为思考过程会消耗大量 token
        let max_tokens = if self.config.model.contains("2.5-pro") || self.config.model.contains("2.5-flash") {
            8192
        } else {
            4096
        };

        // Raw 模式下不添加 system_instruction，让用户消息直接作为唯一指令
        let mut body = serde_json::json!({
            "contents": [{
                "role": "user",
                "parts": parts
            }],
            "generationConfig": {
                "temperature": mode.temperature(),
                "maxOutputTokens": max_tokens
            }
        });

        if !system_prompt.is_empty() {
            body["system_instruction"] = serde_json::json!({
                "parts": [{"text": system_prompt}]
            });
        }

        body
    }

    /// 解析成功响应
    /// 注意：Gemini 2.5 系列思考模型的 parts 数组中，第一个 part 可能是思考过程（thought: true），
    /// 实际输出在最后一个非 thought 的 part 中。需要从后往前找第一个非 thought 的 text。
    pub fn parse_response(response: &Value) -> Result<OptimizeOutput, String> {
        let parts = response
            .get("candidates")
            .and_then(|c| c.as_array())
            .and_then(|arr| {
                if arr.is_empty() {
                    None
                } else {
                    Some(&arr[0])
                }
            })
            .and_then(|candidate| candidate.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|parts| parts.as_array())
            .ok_or_else(|| "Gemini API returned empty response".to_string())?;

        // 从后往前找第一个非 thought 的 text part（兼容思考模型和普通模型）
        let text = parts
            .iter()
            .rev()
            .find(|part| {
                // 跳过 thought: true 的 part
                let is_thought = part.get("thought").and_then(|t| t.as_bool()).unwrap_or(false);
                !is_thought && part.get("text").is_some()
            })
            .and_then(|part| part.get("text"))
            .and_then(|text| text.as_str())
            .ok_or_else(|| "Gemini API returned empty response".to_string())?;

        let input_tokens = response
            .get("usageMetadata")
            .and_then(|m| m.get("promptTokenCount"))
            .and_then(|v| v.as_i64());

        let output_tokens = response
            .get("usageMetadata")
            .and_then(|m| m.get("candidatesTokenCount"))
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
            429 => format!("API 调用额度已耗尽，请稍后重试: {}", api_message),
            500..=599 => format!("Gemini 服务暂时不可用 ({}): {}", status_code, api_message),
            _ => format!("Gemini API 错误 ({}): {}", status_code, api_message),
        }
    }

    /// 调用 Gemini API（异步，支持多模态）
    pub async fn optimize(
        &self,
        raw_requirement: &str,
        mode: OptimizeMode,
        language: Option<&str>,
        output_format: Option<&str>,
        images: Option<&[ImageData]>,
        custom_system_prompt: Option<&str>,
    ) -> Result<OptimizeOutput, String> {
        let url = self.get_api_url();
        let body = self.build_request_body(raw_requirement, mode, language, output_format, images, custom_system_prompt);

        let client = super::http_client::client();
        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .timeout(super::http_client::ai_timeout())
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    format!("Gemini API 请求超时（{}秒），请检查网络连接",
                        super::http_client::AI_REQUEST_TIMEOUT_SECS)
                } else if e.is_connect() {
                    "无法连接到 Gemini API，请检查网络或代理设置".to_string()
                } else {
                    format!("网络请求失败: {}", e)
                }
            })?;

        let status = response.status().as_u16();

        if status != 200 {
            let error_body: Value = response.json().await.unwrap_or(serde_json::json!({}));
            return Err(Self::parse_error_response(&error_body, status));
        }

        let response_body: Value = response
            .json()
            .await
            .map_err(|e| format!("解析 Gemini 响应失败: {}", e))?;

        let mut output = Self::parse_response(&response_body)?;
        output.model = self.config.model.clone();

        Ok(output)
    }

    // ==================== 流式输出 ====================

    /// 获取流式 API URL（streamGenerateContent + alt=sse）
    pub fn get_stream_api_url(&self) -> String {
        format!(
            "{}/models/{}:streamGenerateContent?alt=sse&key={}",
            GEMINI_API_BASE, self.config.model, self.config.api_key
        )
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
        let url = self.get_stream_api_url();
        let body = self.build_request_body(raw_requirement, mode, language, output_format, images, custom_system_prompt);

        // 流式请求使用专用 client（仅 connect_timeout，无总超时）
        // 避免长文本生成时被总超时截断
        let client = super::http_client::stream_client();
        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() || e.is_connect() {
                    format!("无法连接到 Gemini API（{}秒内未建立连接），请检查网络或代理设置",
                        super::http_client::STREAM_CONNECT_TIMEOUT_SECS)
                } else {
                    format!("网络请求失败: {}", e)
                }
            })?;

        let status = response.status().as_u16();
        if status != 200 {
            let error_body: Value = response.json().await.unwrap_or(serde_json::json!({}));
            return Err(Self::parse_error_response(&error_body, status));
        }

        Ok(response)
    }

    /// 从 Gemini SSE chunk 的 JSON 中提取增量文本
    /// 跳过 thought: true 的 part（思考模型兼容）
    pub fn parse_stream_chunk(chunk_json: &Value) -> (Option<String>, Option<i64>, Option<i64>, Option<String>) {
        let text = chunk_json
            .get("candidates")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|candidate| candidate.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|parts| parts.as_array())
            .and_then(|parts| {
                // 从后往前找第一个非 thought 的 text
                parts.iter().rev().find(|part| {
                    let is_thought = part.get("thought").and_then(|t| t.as_bool()).unwrap_or(false);
                    !is_thought && part.get("text").is_some()
                })
            })
            .and_then(|part| part.get("text"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string());

        let input_tokens = chunk_json
            .get("usageMetadata")
            .and_then(|m| m.get("promptTokenCount"))
            .and_then(|v| v.as_i64());

        let output_tokens = chunk_json
            .get("usageMetadata")
            .and_then(|m| m.get("candidatesTokenCount"))
            .and_then(|v| v.as_i64());

        (text, input_tokens, output_tokens, None)
    }

    /// 获取模型名称
    pub fn model_name(&self) -> &str {
        &self.config.model
    }
}
