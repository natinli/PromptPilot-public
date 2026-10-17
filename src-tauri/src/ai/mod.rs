// AI 集成模块
//! AI Provider 模块（Gemini + OpenAI 兼容 + CodeBuddy）

pub mod codebuddy;
pub mod gemini;
pub mod http_client;
pub mod image_gen;
pub mod openai_compat;
pub mod sse;
pub mod system_prompts;
pub mod types;

pub use types::{ImageData, OptimizeMode, OptimizeOutput, StreamChunk};

#[cfg(test)]
mod tests;
