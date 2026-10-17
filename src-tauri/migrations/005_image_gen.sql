-- Migration v5: AI 图片生成功能
-- 新增 generated_images 表，用于存储图片生成的元信息

CREATE TABLE IF NOT EXISTS generated_images (
    id              TEXT PRIMARY KEY,                           -- UUID
    user_id         TEXT,                                       -- 预留多用户
    prompt          TEXT NOT NULL,                              -- 生成提示词
    file_path       TEXT NOT NULL,                              -- 本地文件相对路径（images/{uuid}.png）
    file_name       TEXT NOT NULL,                              -- 文件名（如 abc123.png）
    mime_type       TEXT NOT NULL DEFAULT 'image/png',          -- MIME 类型
    file_size       INTEGER,                                    -- 文件大小（字节）
    width           INTEGER,                                    -- 图片宽度
    height          INTEGER,                                    -- 图片高度
    provider        TEXT NOT NULL,                              -- "openai" / "gemini"
    model           TEXT NOT NULL,                              -- 模型名称
    size_param      TEXT,                                       -- 请求的尺寸参数（如 "1024x1024"）
    generation_time INTEGER,                                    -- 生成耗时（毫秒）
    prompt_id       TEXT,                                       -- 关联的提示词 ID（可选，双向关联）
    is_favorite     INTEGER NOT NULL DEFAULT 0,                 -- 是否收藏（预留）
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),    -- 创建时间 UTC

    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE SET NULL
);

-- 索引：按创建时间倒序（图片库默认排序）
CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON generated_images(created_at DESC);

-- 索引：按提示词搜索
CREATE INDEX IF NOT EXISTS idx_generated_images_prompt ON generated_images(prompt);

-- 索引：按 Provider 过滤
CREATE INDEX IF NOT EXISTS idx_generated_images_provider ON generated_images(provider);
