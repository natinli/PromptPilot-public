//! 共享 SSE 行解码器。
//!
//! 网络层的 bytes chunk 不保证按 UTF-8 字符或 SSE 行边界切分，因此先在
//! 字节缓冲区中拼接，再按完整行解码，避免 `from_utf8_lossy` 把跨 chunk 的
//! 多字节字符替换成�。

use serde_json::Value;

#[derive(Default)]
pub struct SseDecoder {
    buffer: Vec<u8>,
}

impl SseDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    /// 追加网络分片，返回其中已经完整的 `data:` JSON 行。
    pub fn push(&mut self, bytes: &[u8]) -> Vec<Result<Value, String>> {
        self.buffer.extend_from_slice(bytes);
        self.drain_lines(false)
    }

    /// 流结束时冲刷没有换行符结尾的最后一行。
    pub fn finish(&mut self) -> Vec<Result<Value, String>> {
        self.drain_lines(true)
    }

    fn drain_lines(&mut self, flush_tail: bool) -> Vec<Result<Value, String>> {
        let mut events = Vec::new();
        while let Some(line_end) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let mut line = self.buffer.drain(..=line_end).collect::<Vec<_>>();
            line.pop();
            events.extend(parse_line(&line));
        }

        if flush_tail && !self.buffer.is_empty() {
            let line = std::mem::take(&mut self.buffer);
            events.extend(parse_line(&line));
        }

        events
    }
}

fn parse_line(line: &[u8]) -> Option<Result<Value, String>> {
    let line = line.strip_suffix(b"\r").unwrap_or(line);
    let data = line.strip_prefix(b"data:")?;
    let data = data.strip_prefix(b" ").unwrap_or(data);

    if data == b"[DONE]" {
        return None;
    }

    let data = std::str::from_utf8(data).map_err(|_| "SSE data 不是有效的 UTF-8".to_string());
    Some(data.and_then(|data| {
        serde_json::from_str::<Value>(data.trim())
            .map_err(|error| format!("SSE data 不是有效 JSON: {}", error))
    }))
}

#[cfg(test)]
mod tests {
    use super::SseDecoder;
    use serde_json::json;

    #[test]
    fn preserves_utf8_when_character_is_split_between_chunks() {
        let payload = "data: {\"text\":\"中文\"}\n";
        let chinese_start = payload.find('中').expect("测试 payload 应包含中文");
        let bytes = payload.as_bytes();
        let mut decoder = SseDecoder::new();

        assert!(decoder.push(&bytes[..chinese_start + 1]).is_empty());
        let events = decoder.push(&bytes[chinese_start + 1..]);

        assert_eq!(events, vec![Ok(json!({"text": "中文"}))]);
    }

    #[test]
    fn finish_flushes_a_complete_line_without_newline() {
        let mut decoder = SseDecoder::new();
        assert!(decoder.push(br#"data: {"ok":true}"#).is_empty());

        assert_eq!(decoder.finish(), vec![Ok(json!({"ok": true}))]);
    }

    #[test]
    fn ignores_done_and_reports_invalid_json() {
        let mut decoder = SseDecoder::new();
        let events = decoder.push(b"data: [DONE]\ndata: not-json\n");

        assert_eq!(events.len(), 1);
        assert!(events[0].is_err());
    }
}
