//! Window Mode 测试
//! 测试 MINI/FULL 双窗口模式的参数配置、持久化、模式切换逻辑

use crate::window::mode::{
    WindowMode, ModeStore,
    get_mode_properties, get_mode_constraints, get_target_bounds,
};

// ==================== 窗口参数测试 ====================

#[test]
fn test_mini_mode_properties() {
    let (always_on_top, resizable) = get_mode_properties(WindowMode::Mini);
    assert!(!always_on_top, "Mini 不应置顶");
    assert!(resizable, "Mini 应可调整大小");
}

#[test]
fn test_full_mode_properties() {
    let (always_on_top, resizable) = get_mode_properties(WindowMode::Full);
    assert!(!always_on_top, "Full 不应置顶");
    assert!(resizable, "Full 应可调整大小");
}

#[test]
fn test_mini_mode_constraints() {
    let constraints = get_mode_constraints(WindowMode::Mini, 1.0);
    assert_eq!(constraints.min_width, 320, "Mini 最小宽度应为 320");
    assert_eq!(constraints.min_height, 450, "Mini 最小高度应为 450");
    assert!(constraints.max_width.is_some(), "Mini 应有最大宽度限制");
    assert_eq!(constraints.max_width.unwrap(), 520, "Mini 最大宽度应为 520");
    assert!(constraints.max_height.is_some(), "Mini 应有最大高度限制");
    assert_eq!(constraints.max_height.unwrap(), 750, "Mini 最大高度应为 750");
}

#[test]
fn test_full_mode_constraints() {
    let constraints = get_mode_constraints(WindowMode::Full, 1.0);
    assert_eq!(constraints.min_width, 800, "Full 最小宽度应为 800");
    assert_eq!(constraints.min_height, 500, "Full 最小高度应为 500");
    assert!(constraints.max_width.is_none(), "Full 不应有最大宽度限制");
    assert!(constraints.max_height.is_none(), "Full 不应有最大高度限制");
}

// ==================== 默认 bounds 测试（自适应百分比） ====================

#[test]
fn test_default_bounds_mini_1080p() {
    // 1080p 100%: 1920×1080 DIP → Mini = 14.5%×40% = 278×432。
    let bounds = get_target_bounds(WindowMode::Mini, None, 1920, 1080, 1.0);
    assert_eq!(bounds.width, 278, "Mini 默认宽度应按 14.5% 计算");
    assert_eq!(bounds.height, 432, "Mini 默认高度应按 40% 计算");
    // 应居中
    let expected_x = (1920 - bounds.width) / 2;
    let expected_y = (1080 - bounds.height) / 2;
    assert!((bounds.x - expected_x as i32).abs() <= 1, "Mini 应水平居中");
    assert!((bounds.y - expected_y as i32).abs() <= 1, "Mini 应垂直居中");
}

#[test]
fn test_default_bounds_full_2k() {
    // 2K 125%: 2048×1126 DIP → Full = 75%×80% = 1536×901
    let bounds = get_target_bounds(WindowMode::Full, None, 2048, 1126, 1.25);
    assert!(bounds.width >= 900, "Full 宽度应 >= 900: {}", bounds.width);
    assert!(bounds.height >= 500, "Full 高度应 >= 500: {}", bounds.height);
    // 应居中
    let expected_x = (2048 - bounds.width) / 2;
    assert!((bounds.x - expected_x as i32).abs() <= 1, "Full 应水平居中");
}

#[test]
fn test_default_bounds_clamp_to_screen() {
    // 小屏幕：800×600，窗口不应超出
    let bounds = get_target_bounds(WindowMode::Mini, None, 800, 600, 1.0);
    assert!(bounds.width <= 760, "宽度不应超过屏幕宽度-40: {}", bounds.width);
    assert!(bounds.height <= 560, "高度不应超过屏幕高度-40: {}", bounds.height);
}

#[test]
fn test_default_bounds_full_small_screen() {
    // 笔记本 1366×768 100%: Full = 75%×80% = 1025×614 → clamp min 900×600 → 都在范围内
    let bounds = get_target_bounds(WindowMode::Full, None, 1366, 728, 1.0);
    assert!(bounds.width >= 900, "Full 小屏宽度应至少 900: {}", bounds.width);
    assert!(bounds.height >= 500, "Full 小屏高度应至少 500: {}", bounds.height);
    assert!(bounds.width <= 1326, "不超过屏幕宽度-40");
    assert!(bounds.height <= 688, "不超过屏幕高度-40");
}

#[test]
fn test_default_bounds_4k_150pct() {
    // 4K 150%: 屏幕工作区 ~2560×1400 DIP → Mini = 480×700(上限) → Full = 1920×1120
    let mini = get_target_bounds(WindowMode::Mini, None, 2560, 1400, 1.5);
    assert!(mini.width <= 480, "4K Mini 宽度应 <= 480: {}", mini.width);
    assert!(mini.height <= 700, "4K Mini 高度应 <= 700: {}", mini.height);

    let full = get_target_bounds(WindowMode::Full, None, 2560, 1400, 1.5);
    assert!(full.width >= 900, "4K Full 宽度应 >= 900: {}", full.width);
}

// ==================== 模式持久化测试 ====================

#[test]
fn test_mode_store_save_and_load() {
    let dir = tempfile::tempdir().unwrap();
    let store = ModeStore::new(dir.path().to_path_buf());

    // 初始应返回默认值 Mini
    assert_eq!(store.load_mode(), WindowMode::Mini);

    // 保存 Full 模式
    store.save_mode(WindowMode::Full);
    assert_eq!(store.load_mode(), WindowMode::Full);

    // 重新创建 store 实例，验证持久化
    let store2 = ModeStore::new(dir.path().to_path_buf());
    assert_eq!(store2.load_mode(), WindowMode::Full);
}

#[test]
fn test_mode_store_save_and_load_bounds() {
    let dir = tempfile::tempdir().unwrap();
    let store = ModeStore::new(dir.path().to_path_buf());

    // 初始无保存的 bounds
    assert!(store.load_bounds(WindowMode::Mini).is_none());
    assert!(store.load_bounds(WindowMode::Full).is_none());

    // 保存 Mini bounds
    let mini_bounds = crate::window::mode::WindowBounds {
        x: 100, y: 200, width: 500, height: 700,
    };
    store.save_bounds(WindowMode::Mini, &mini_bounds);

    // 验证读取
    let loaded = store.load_bounds(WindowMode::Mini).unwrap();
    assert_eq!(loaded.x, 100);
    assert_eq!(loaded.y, 200);
    assert_eq!(loaded.width, 500);
    assert_eq!(loaded.height, 700);

    // Full 应仍然为空
    assert!(store.load_bounds(WindowMode::Full).is_none());
}

#[test]
fn test_mode_store_corrupt_file_returns_default() {
    let dir = tempfile::tempdir().unwrap();

    // 写入损坏的 JSON
    let mode_path = dir.path().join("mode-config.json");
    std::fs::write(&mode_path, "{{invalid json}}").unwrap();

    let store = ModeStore::new(dir.path().to_path_buf());
    // 应返回默认值而非 panic
    assert_eq!(store.load_mode(), WindowMode::Mini);
}

// ==================== WindowMode 枚举测试 ====================

#[test]
fn test_window_mode_serialization() {
    assert_eq!(serde_json::to_string(&WindowMode::Mini).unwrap(), "\"mini\"");
    assert_eq!(serde_json::to_string(&WindowMode::Full).unwrap(), "\"full\"");
}

#[test]
fn test_window_mode_deserialization() {
    let mini: WindowMode = serde_json::from_str("\"mini\"").unwrap();
    assert_eq!(mini, WindowMode::Mini);
    let full: WindowMode = serde_json::from_str("\"full\"").unwrap();
    assert_eq!(full, WindowMode::Full);
}

#[test]
fn test_window_mode_toggle() {
    assert_eq!(WindowMode::Mini.toggle(), WindowMode::Full);
    assert_eq!(WindowMode::Full.toggle(), WindowMode::Mini);
}

#[test]
fn test_window_mode_route() {
    assert_eq!(WindowMode::Mini.route(), "/mini");
    assert_eq!(WindowMode::Full.route(), "/dashboard");
}
