//! AI 图片生成模块
//! 支持 OpenAI (gpt-image-1) 和 Gemini (imagen-4.0-generate-001) 双 Provider

use base64::Engine;
use serde_json::Value;

use super::http_client;
use super::openai_compat::preview_text;

const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

/// 图片生成请求参数
#[derive(Debug, Clone)]
pub struct ImageGenRequest {
    /// 图片描述提示词
    pub prompt: String,
    /// 尺寸：前端传 "1024x1024" / "1024x1536" / "1536x1024" 等
    pub size: String,
    /// Provider："openai" / "gemini"
    pub provider: String,
    /// 可选指定模型（不指定则使用默认）
    pub model: Option<String>,
    /// 可选参考图（base64 编码列表）
    pub images: Option<Vec<String>>,
}

/// 图片生成结果（解码后的图片二进制数据）
pub struct ImageGenResult {
    /// 解码后的图片二进制数据（PNG/JPEG）
    pub image_data: Vec<u8>,
    /// MIME 类型
    pub mime_type: String,
    /// 实际使用的模型名称
    pub model: String,
}

// ==================== OpenAI 图片生成 ====================

/// 通过 OpenAI 兼容 API 生成图片
///
/// 无参考图时：POST {base_url}/v1/images/generations（JSON）
/// 有参考图时：POST {base_url}/v1/images/edits（multipart，gpt-image-1 支持）
pub async fn openai_generate(
    api_key: &str,
    endpoint: &str,
    request: &ImageGenRequest,
) -> Result<ImageGenResult, String> {
    let model = request.model.as_deref().unwrap_or("gpt-image-1");
    let base_url = extract_openai_base_url(endpoint);

    if let Some(images) = request.images.as_ref().filter(|v| !v.is_empty()) {
        // 有参考图 → 使用 /images/edits 端点（multipart/form-data）
        let url = format!("{}/images/edits", base_url);
        log::info!("[image_gen::openai] POST {} (edits) model={} size={} images={}", url, model, request.size, images.len());

        let client = http_client::client();

        // 构建 multipart form
        let mut form = reqwest::multipart::Form::new()
            .text("model", model.to_string())
            .text("prompt", request.prompt.clone())
            .text("size", request.size.clone())
            .text("n", "1".to_string())
            .text("response_format", "b64_json".to_string());

        // 添加参考图片
        // OpenAI /images/edits 多图传输：重复 "image" 字段名（标准 multipart 数组方式）
        for (i, img_b64) in images.iter().enumerate() {
            log::info!("[image_gen::openai] 参考图 {}: base64 长度={}", i + 1, img_b64.len());
            let img_data = base64::engine::general_purpose::STANDARD
                .decode(img_b64)
                .map_err(|e| format!("参考图 {} Base64 解码失败: {}", i + 1, e))?;
            log::info!("[image_gen::openai] 参考图 {} 解码成功: {} bytes", i + 1, img_data.len());
            let part = reqwest::multipart::Part::bytes(img_data)
                .file_name(format!("image_{}.png", i))
                .mime_str("image/png")
                .map_err(|e| format!("构建图片 Part 失败: {}", e))?;
            form = form.part("image", part);
        }

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .multipart(form)
            .timeout(http_client::image_gen_timeout())
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    format!("图片生成超时（{}秒），请稍后重试", http_client::IMAGE_GEN_TIMEOUT_SECS)
                } else if e.is_connect() {
                    format!("无法连接到 API 端点 {}，请检查网络设置", url)
                } else {
                    format!("图片生成网络请求失败: {}", e)
                }
            })?;

        let status = response.status().as_u16();
        let response_text = response.text().await
            .map_err(|e| format!("读取图片生成响应失败: {}", e))?;

        log::info!("[image_gen::openai] edits 响应: status={}, body_len={}, preview={}", 
            status, response_text.len(), preview_text(&response_text, 300));

        if status != 200 {
            let error_body: Value = serde_json::from_str(&response_text).unwrap_or(serde_json::json!({}));
            let api_message = error_body
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("未知错误");
            return Err(format!("OpenAI 图片编辑失败 ({}): {}", status, api_message));
        }

        let response_body: Value = serde_json::from_str(&response_text)
            .map_err(|e| format!("解析图片生成响应失败: {}", e))?;

        let b64_data = response_body
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("b64_json"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "OpenAI 图片编辑返回了空数据".to_string())?;

        let image_data = base64::engine::general_purpose::STANDARD
            .decode(b64_data)
            .map_err(|e| format!("Base64 解码失败: {}", e))?;

        log::info!("[image_gen::openai] 编辑生成成功: {} bytes", image_data.len());

        Ok(ImageGenResult {
            image_data,
            mime_type: "image/png".to_string(),
            model: model.to_string(),
        })
    } else {
        // 无参考图 → 原有的 /images/generations 逻辑
        let url = format!("{}/images/generations", base_url);

        let body = serde_json::json!({
            "model": model,
            "prompt": request.prompt,
            "size": request.size,
            "n": 1,
            "response_format": "b64_json",
        });

        log::info!("[image_gen::openai] POST {} model={} size={}", url, model, request.size);

        let client = http_client::client();
        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&body)
            .timeout(http_client::image_gen_timeout())
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    format!("图片生成超时（{}秒），请稍后重试", http_client::IMAGE_GEN_TIMEOUT_SECS)
                } else if e.is_connect() {
                    format!("无法连接到 API 端点 {}，请检查网络设置", url)
                } else {
                    format!("图片生成网络请求失败: {}", e)
                }
            })?;

        let status = response.status().as_u16();
        let response_text = response.text().await
            .map_err(|e| format!("读取图片生成响应失败: {}", e))?;

        if status != 200 {
            let error_body: Value = serde_json::from_str(&response_text).unwrap_or(serde_json::json!({}));
            let api_message = error_body
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("未知错误");
            return Err(format!("OpenAI 图片生成失败 ({}): {}", status, api_message));
        }

        let response_body: Value = serde_json::from_str(&response_text)
            .map_err(|e| format!("解析图片生成响应失败: {}", e))?;

        let b64_data = response_body
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("b64_json"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "OpenAI 图片生成返回了空数据".to_string())?;

        let image_data = base64::engine::general_purpose::STANDARD
            .decode(b64_data)
            .map_err(|e| format!("Base64 解码失败: {}", e))?;

        log::info!("[image_gen::openai] 生成成功: {} bytes", image_data.len());

        Ok(ImageGenResult {
            image_data,
            mime_type: "image/png".to_string(),
            model: model.to_string(),
        })
    }
}

// ==================== Gemini Imagen 图片生成 ====================

/// 通过 Gemini Imagen API 生成图片
///
/// 端点：POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predict
/// 认证：URL query 参数 ?key=
/// 响应：{ predictions: [{ bytesBase64Encoded: "...", mimeType: "image/png" }] }
pub async fn gemini_generate(
    api_key: &str,
    request: &ImageGenRequest,
) -> Result<ImageGenResult, String> {
    let model = request.model.as_deref().unwrap_or("imagen-4.0-generate-001");

    // 将前端尺寸参数映射为 Gemini aspectRatio
    let aspect_ratio = size_to_aspect_ratio(&request.size);

    let url = format!(
        "{}/models/{}:predict?key={}",
        GEMINI_API_BASE, model, api_key
    );

    let has_images = request.images.as_ref().is_some_and(|v| !v.is_empty());

    let body = if has_images {
        // 有参考图时，将图片嵌入到 instance 中
        let mut instance = serde_json::json!({
            "prompt": request.prompt
        });

        // 添加第一张参考图到 instance（Gemini 通常只支持单张参考图）
        if let Some(first_img) = request.images.as_ref().and_then(|v| v.first()) {
            instance["image"] = serde_json::json!({
                "bytesBase64Encoded": first_img
            });
        }

        serde_json::json!({
            "instances": [instance],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": aspect_ratio
            }
        })
    } else {
        serde_json::json!({
            "instances": [{
                "prompt": request.prompt
            }],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": aspect_ratio
            }
        })
    };

    log::info!("[image_gen::gemini] POST modelo={} aspectRatio={} hasImages={}", model, aspect_ratio, has_images);

    let client = http_client::client();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(http_client::image_gen_timeout())
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                format!("Gemini 图片生成超时（{}秒），请稍后重试", http_client::IMAGE_GEN_TIMEOUT_SECS)
            } else if e.is_connect() {
                "无法连接到 Gemini API，请检查网络或代理设置".to_string()
            } else {
                format!("Gemini 图片生成网络请求失败: {}", e)
            }
        })?;

    let status = response.status().as_u16();
    let response_text = response.text().await
        .map_err(|e| format!("读取 Gemini 图片生成响应失败: {}", e))?;

    if status != 200 {
        let error_body: Value = serde_json::from_str(&response_text).unwrap_or(serde_json::json!({}));
        let api_message = error_body
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        return Err(format!("Gemini 图片生成失败 ({}): {}", status, api_message));
    }

    let response_body: Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("解析 Gemini 图片生成响应失败: {}", e))?;

    // 提取 Base64 数据
    let prediction = response_body
        .get("predictions")
        .and_then(|p| p.as_array())
        .and_then(|arr| arr.first())
        .ok_or_else(|| "Gemini 图片生成返回了空数据".to_string())?;

    let b64_data = prediction
        .get("bytesBase64Encoded")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Gemini 图片生成响应缺少 bytesBase64Encoded 字段".to_string())?;

    let mime_type = prediction
        .get("mimeType")
        .and_then(|v| v.as_str())
        .unwrap_or("image/png");

    // 解码 Base64
    let image_data = base64::engine::general_purpose::STANDARD
        .decode(b64_data)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    log::info!("[image_gen::gemini] 生成成功: {} bytes, mime={}", image_data.len(), mime_type);

    Ok(ImageGenResult {
        image_data,
        mime_type: mime_type.to_string(),
        model: model.to_string(),
    })
}

// ==================== 辅助函数 ====================

/// 将前端尺寸参数映射为 Gemini 的 aspectRatio
fn size_to_aspect_ratio(size: &str) -> &str {
    match size {
        "1024x1024" => "1:1",
        "768x1024" | "1024x1536" => "3:4",
        "1024x768" | "1536x1024" => "4:3",
        "768x1152" => "2:3",
        "1152x768" => "3:2",
        "832x1024" => "4:5",
        "1024x832" => "5:4",
        "576x1024" => "9:16",
        "1024x576" => "16:9",
        "1024x440" => "21:9",
        "512x1024" => "1:2",
        "1024x512" => "2:1",
        _ => "1:1",
    }
}

/// 从 OpenAI 兼容端点 URL 提取 base URL（到 /v1 为止）
/// 复用 OpenAICompatProvider::extract_base_url 的逻辑
fn extract_openai_base_url(endpoint: &str) -> String {
    let url = endpoint.trim_end_matches('/');
    let lower = url.to_lowercase();

    if let Some(pos) = lower.find("/v1") {
        url.get(..pos + 3).unwrap_or(url).to_string()
    } else {
        format!("{}/v1", url)
    }
}
