// API Key 安全管理模块
// 将 API Key 存储在 Rust 端（应用数据目录），避免前端 localStorage 明文存储

use std::path::PathBuf;
use super::error::AppResult;

/// API Key 存储管理器
pub struct ApiKeyStore {
    dir: PathBuf,
}

impl ApiKeyStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn key_path(&self) -> PathBuf {
        self.dir.join(".apikey")
    }

    /// 根据 Provider 名称获取对应的 Key 存储路径
    /// - "gemini" (默认) → .apikey
    /// - "openai_compat" → .apikey_openai
    /// - "codebuddy" → .apikey_codebuddy
    fn key_path_for_provider(&self, provider: &str) -> PathBuf {
        match provider {
            "openai_compat" => self.dir.join(".apikey_openai"),
            "codebuddy" => self.dir.join(".apikey_codebuddy"),
            _ => self.dir.join(".apikey"),
        }
    }

    /// OpenAI 兼容 Provider 的端点 URL 存储路径
    fn endpoint_path(&self) -> PathBuf {
        self.dir.join(".openai_endpoint")
    }

    /// 保存 API Key（Base64 编码存储，避免明文）
    pub fn save_key(&self, key: &str) -> AppResult<()> {
        use std::io::Write;
        let encoded = base64_encode(key);
        let path = self.key_path();
        let _ = std::fs::create_dir_all(&self.dir);
        let mut file = std::fs::File::create(&path)?;
        file.write_all(encoded.as_bytes())?;
        Ok(())
    }

    /// 读取 API Key
    pub fn load_key(&self) -> Option<String> {
        let path = self.key_path();
        let encoded = std::fs::read_to_string(&path).ok()?;
        base64_decode(&encoded)
    }

    /// 清除 API Key
    pub fn clear_key(&self) -> AppResult<()> {
        let path = self.key_path();
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        Ok(())
    }

    /// 检查是否已配置 API Key
    pub fn is_configured(&self) -> bool {
        self.load_key().map(|k| !k.is_empty()).unwrap_or(false)
    }

    /// 保存指定 Provider 的 API Key
    pub fn save_key_for_provider(&self, key: &str, provider: &str) -> AppResult<()> {
        use std::io::Write;
        let encoded = base64_encode(key);
        let path = self.key_path_for_provider(provider);
        let _ = std::fs::create_dir_all(&self.dir);
        let mut file = std::fs::File::create(&path)?;
        file.write_all(encoded.as_bytes())?;
        Ok(())
    }

    /// 读取指定 Provider 的 API Key
    pub fn load_key_for_provider(&self, provider: &str) -> Option<String> {
        let path = self.key_path_for_provider(provider);
        let encoded = std::fs::read_to_string(&path).ok()?;
        base64_decode(&encoded)
    }

    /// 清除指定 Provider 的 API Key
    pub fn clear_key_for_provider(&self, provider: &str) -> AppResult<()> {
        let path = self.key_path_for_provider(provider);
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        Ok(())
    }

    /// 检查指定 Provider 是否已配置 API Key
    pub fn is_configured_for_provider(&self, provider: &str) -> bool {
        self.load_key_for_provider(provider).map(|k| !k.is_empty()).unwrap_or(false)
    }

    /// 保存 OpenAI 兼容 Provider 的端点 URL（Base64 编码存储）
    pub fn save_openai_endpoint(&self, url: &str) -> AppResult<()> {
        use std::io::Write;
        let encoded = base64_encode(url);
        let path = self.endpoint_path();
        let _ = std::fs::create_dir_all(&self.dir);
        let mut file = std::fs::File::create(&path)?;
        file.write_all(encoded.as_bytes())?;
        Ok(())
    }

    /// 读取 OpenAI 兼容 Provider 的端点 URL
    pub fn load_openai_endpoint(&self) -> Option<String> {
        let path = self.endpoint_path();
        let encoded = std::fs::read_to_string(&path).ok()?;
        base64_decode(&encoded)
    }

    /// 清除 OpenAI 兼容 Provider 的端点 URL
    pub fn clear_openai_endpoint(&self) -> AppResult<()> {
        let path = self.endpoint_path();
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        Ok(())
    }
}

// ==================== Base64 编码/解码（使用标准 base64 crate） ====================

fn base64_encode(input: &str) -> String {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    STANDARD.encode(input.as_bytes())
}

fn base64_decode(input: &str) -> Option<String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let input = input.trim();
    if input.is_empty() {
        return None;
    }
    let bytes = STANDARD.decode(input).ok()?;
    String::from_utf8(bytes).ok()
}
