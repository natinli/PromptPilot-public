// 全局共享 HTTP Client — 避免每次请求都创建新的连接池
// P2-13: reqwest::Client 全局共享
// P2-14: 统一超时配置

use once_cell::sync::Lazy;
use std::time::Duration;

/// AI 请求统一超时时间（秒）— 用于非流式请求的总超时
/// 前端已做图片预处理（大图缩放到 ≤768×2000），实际 base64 通常只有几百 KB
/// 90s 足够覆盖上传 + AI 视觉处理，同时避免网络断开时用户等待过久
pub const AI_REQUEST_TIMEOUT_SECS: u64 = 90;

/// 流式请求连接超时时间（秒）— 仅限制 TCP 握手的时间，不包含 body 上传
pub const STREAM_CONNECT_TIMEOUT_SECS: u64 = 30;

/// 流式请求单个 chunk 读取超时时间（秒）— 两个 chunk 之间的最大等待时间
/// 90s 足以容忍思考型模型的首 token 延迟（通常 30-60s），同时避免连接断开后等待过久
pub const STREAM_CHUNK_TIMEOUT_SECS: u64 = 90;

/// 模型列表请求超时时间（秒）
pub const MODELS_REQUEST_TIMEOUT_SECS: u64 = 15;

/// 图片生成请求超时时间（秒）— 图片生成比文本慢得多
pub const IMAGE_GEN_TIMEOUT_SECS: u64 = 120;

/// 全局共享的 HTTP Client（带连接池复用）
/// 不设置默认超时，由各调用点根据场景指定
static SHARED_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .pool_max_idle_per_host(5)
        .build()
        .expect("Failed to create HTTP client")
});

/// 流式请求专用 HTTP Client
/// 只设置 connect_timeout（连接超时），不设置总超时
/// 避免长文本流式输出被总超时截断
static STREAM_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .pool_max_idle_per_host(5)
        .connect_timeout(Duration::from_secs(STREAM_CONNECT_TIMEOUT_SECS))
        .build()
        .expect("Failed to create streaming HTTP client")
});

/// 获取全局共享的 HTTP Client
pub fn client() -> &'static reqwest::Client {
    &SHARED_CLIENT
}

/// 获取流式请求专用的 HTTP Client（无总超时，仅连接超时）
pub fn stream_client() -> &'static reqwest::Client {
    &STREAM_CLIENT
}

/// AI 请求超时 Duration（非流式）
pub fn ai_timeout() -> Duration {
    Duration::from_secs(AI_REQUEST_TIMEOUT_SECS)
}

/// 流式请求单个 chunk 的读取超时 Duration
pub fn stream_chunk_timeout() -> Duration {
    Duration::from_secs(STREAM_CHUNK_TIMEOUT_SECS)
}

/// 模型列表请求超时 Duration
pub fn models_timeout() -> Duration {
    Duration::from_secs(MODELS_REQUEST_TIMEOUT_SECS)
}

/// 图片生成请求超时 Duration
pub fn image_gen_timeout() -> Duration {
    Duration::from_secs(IMAGE_GEN_TIMEOUT_SECS)
}
