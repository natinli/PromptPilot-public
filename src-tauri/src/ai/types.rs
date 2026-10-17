// AI 类型定义
use serde::{Deserialize, Serialize};

/// 优化模式枚举
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OptimizeMode {
    Standard,
    Professional,
    Concise,
    Structured,
    Creative,
    /// 直通模式：不添加任何系统提示词包装，rawRequirement 原样作为 user message 发送
    Raw,
}

impl OptimizeMode {
    /// 从字符串解析优化模式
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "standard" => Some(Self::Standard),
            "professional" => Some(Self::Professional),
            "concise" => Some(Self::Concise),
            "structured" => Some(Self::Structured),
            "creative" => Some(Self::Creative),
            "raw" => Some(Self::Raw),
            _ => None,
        }
    }

    /// 获取该模式的 temperature
    pub fn temperature(&self) -> f64 {
        match self {
            Self::Creative => 0.9,
            Self::Raw => 0.5,
            _ => 0.7,
        }
    }
}

/// AI 优化输入
#[derive(Debug, Deserialize)]
pub struct OptimizeInput {
    pub raw_requirement: String,
    pub mode: OptimizeMode,
    pub language: Option<String>,
    pub output_format: Option<String>,
    /// Base64 编码的图片列表（可选），用于多模态优化
    pub images: Option<Vec<ImageData>>,
}

/// 图片数据（Base64 编码）
#[derive(Debug, Clone, Deserialize)]
pub struct ImageData {
    /// MIME 类型，如 "image/png", "image/jpeg", "image/webp"
    pub mime_type: String,
    /// Base64 编码的图片数据
    pub data: String,
}

/// AI 优化输出
#[derive(Debug, Serialize)]
pub struct OptimizeOutput {
    pub optimized_prompt: String,
    pub model: String,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
}

/// 流式输出的事件 Payload（通过 Tauri emit 推送到前端）
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StreamChunk {
    /// 增量文本块
    Chunk {
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        text: String,
    },
    /// 流式完成，携带最终信息
    Done {
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        full_text: String,
        model: String,
        input_tokens: Option<i64>,
        output_tokens: Option<i64>,
    },
    /// 流式过程中发生错误
    Error {
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        message: String,
    },
}

impl StreamChunk {
    pub fn chunk(request_id: Option<&str>, text: String) -> Self {
        Self::Chunk {
            request_id: request_id.map(str::to_owned),
            text,
        }
    }

    pub fn done(
        request_id: Option<&str>,
        full_text: String,
        model: String,
        input_tokens: Option<i64>,
        output_tokens: Option<i64>,
    ) -> Self {
        Self::Done {
            request_id: request_id.map(str::to_owned),
            full_text,
            model,
            input_tokens,
            output_tokens,
        }
    }

    pub fn error(request_id: Option<&str>, message: String) -> Self {
        Self::Error {
            request_id: request_id.map(str::to_owned),
            message,
        }
    }
}
