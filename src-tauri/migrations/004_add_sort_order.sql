-- 为 prompts 表添加自定义排序字段
-- sort_order 越小越靠前，默认 0 表示未排序（按时间排序）
ALTER TABLE prompts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- 为 sort_order 创建索引，加速排序查询
CREATE INDEX IF NOT EXISTS idx_prompts_sort_order ON prompts(sort_order);
