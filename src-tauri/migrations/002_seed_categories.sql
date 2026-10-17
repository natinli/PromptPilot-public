-- 清理旧的预设分类（如果存在）
DELETE FROM categories WHERE id IN (
    'cat-programming', 'cat-writing', 'cat-translation',
    'cat-marketing', 'cat-education', 'cat-design',
    'cat-analysis', 'cat-general', 'cat-image'
);

-- 预置 2 个默认分类
INSERT OR IGNORE INTO categories (id, name, color, created_at) VALUES
    ('cat-general', '通用', '#6B7280', datetime('now')),
    ('cat-image', '图像', '#EC4899', datetime('now'));
