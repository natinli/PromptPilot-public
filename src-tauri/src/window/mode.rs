// 窗口模式管理 — MINI/FULL 双模式切换
//
// 设计原则（v0.3.5+ 自适应方案）：
// 1. 默认窗口尺寸按**屏幕工作区百分比**计算，保证不同分辨率/缩放下比例一致
// 2. 百分比计算结果用 DIP 上下限（min/max clamp）夹值，防止极端屏幕下过大或过小
// 3. 约束（min_size / max_size）也用 DIP 固定值，不再依赖物理像素转换
// 4. savedBounds 以 DIP 存储（Tauri outer_size 返回物理像素，保存时自动转换）
// 5. tauri.conf.json 中的初始值是 DIP（适配常见 scaleFactor 的近似值）

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ==================== 数据类型 ====================

/// 窗口模式枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowMode {
    Mini,
    Full,
}

impl WindowMode {
    /// 切换到另一个模式
    pub fn toggle(&self) -> Self {
        match self {
            Self::Mini => Self::Full,
            Self::Full => Self::Mini,
        }
    }

    /// 获取对应的前端路由
    pub fn route(&self) -> &'static str {
        match self {
            Self::Mini => "/mini",
            Self::Full => "/dashboard",
        }
    }
}

/// 窗口位置和尺寸（单位：逻辑像素/DIP）
/// - x, y: outer position（窗口外框左上角，与 set_position 语义一致）
/// - width, height: inner size（内容区域尺寸，与 set_size 语义一致）
///
/// ⚠ 不能用 outer_size 保存！否则 set_size 恢复时会累积标题栏高度，窗口逐渐变大
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// 窗口尺寸约束（单位：DIP）
#[derive(Debug, Clone)]
pub struct WindowConstraints {
    pub min_width: u32,
    pub min_height: u32,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
}

// ==================== 模式配置常量（屏幕百分比方案） ====================
//
// 默认尺寸 = 屏幕工作区 DIP × 百分比
// 所有分辨率/缩放/尺寸的屏幕上窗口占屏幕的比例一致，视觉上"差不多大"
// 安全限制：不超过屏幕工作区 - 40px
//
// 基准：4K 150%（2560×1370 DIP）上的实际效果
//   Full: 2560×70%=1792, 1370×75%=1028 → 1792×1028 DIP ✅
//   Mini: 2560×15%=384, 1370×40%=548 → 384×548 DIP ✅

/// 百分比配置
struct PctConfig {
    /// 默认宽度 = 屏幕工作区宽度 × 此百分比
    width_pct: f64,
    /// 默认高度 = 屏幕工作区高度 × 此百分比
    height_pct: f64,
    /// 约束：最小可缩放尺寸（DIP）
    constraint_min_width: u32,
    constraint_min_height: u32,
    /// 约束：最大可缩放尺寸（DIP，None = 无限制）
    constraint_max_width: Option<u32>,
    constraint_max_height: Option<u32>,
    /// 窗口属性
    always_on_top: bool,
    resizable: bool,
}

/// Mini 模式：屏幕宽 14.5% × 高 40%
const MINI_CONFIG: PctConfig = PctConfig {
    width_pct: 0.145,
    height_pct: 0.40,
    constraint_min_width: 320,
    constraint_min_height: 450,
    constraint_max_width: Some(520),
    constraint_max_height: Some(750),
    always_on_top: false,
    resizable: true,
};

/// Full 模式：屏幕宽 70% × 高 75%
const FULL_CONFIG: PctConfig = PctConfig {
    width_pct: 0.70,
    height_pct: 0.75,
    constraint_min_width: 800,
    constraint_min_height: 500,
    constraint_max_width: None,
    constraint_max_height: None,
    always_on_top: false,
    resizable: true,
};

// ==================== DIP 工具 ====================

/// 将物理像素值转换为 DIP（逻辑像素）
/// 保留用于 bounds 保存/恢复时的坐标转换
pub fn physical_to_dip(physical_px: u32, scale_factor: f64) -> u32 {
    (physical_px as f64 / scale_factor).round() as u32
}

// ==================== 公共查询函数 ====================

/// 获取指定模式的配置引用
fn get_config(mode: WindowMode) -> &'static PctConfig {
    match mode {
        WindowMode::Mini => &MINI_CONFIG,
        WindowMode::Full => &FULL_CONFIG,
    }
}

/// 获取窗口模式的属性（always_on_top, resizable）
pub fn get_mode_properties(mode: WindowMode) -> (bool, bool) {
    let config = get_config(mode);
    (config.always_on_top, config.resizable)
}

/// 获取指定模式的尺寸约束（DIP 固定值）
pub fn get_mode_constraints(mode: WindowMode, _scale_factor: f64) -> WindowConstraints {
    let config = get_config(mode);
    WindowConstraints {
        min_width: config.constraint_min_width,
        min_height: config.constraint_min_height,
        max_width: config.constraint_max_width,
        max_height: config.constraint_max_height,
    }
}

/// 获取指定模式的目标 bounds（返回 DIP 值）
///
/// 优先级：
/// 1. 用户上次保存的 bounds（已经是 DIP，直接使用）
/// 2. 屏幕工作区 DIP × 百分比 + 居中
///
/// screen_width / screen_height 是屏幕工作区的 DIP 尺寸
pub fn get_target_bounds(
    mode: WindowMode,
    saved_bounds: Option<&WindowBounds>,
    screen_width: u32,
    screen_height: u32,
    _scale_factor: f64,
) -> WindowBounds {
    // 优先使用用户保存的 bounds（已经是 DIP）
    if let Some(bounds) = saved_bounds {
        return bounds.clone();
    }

    let config = get_config(mode);

    // 屏幕工作区 × 百分比
    let w = (screen_width as f64 * config.width_pct).round() as u32;
    let h = (screen_height as f64 * config.height_pct).round() as u32;

    // 安全限制：不超过屏幕工作区（留 40px 边距）
    let w = w.min(screen_width.saturating_sub(40));
    let h = h.min(screen_height.saturating_sub(40));

    // 居中显示
    let x = ((screen_width.saturating_sub(w)) / 2) as i32;
    let y = ((screen_height.saturating_sub(h)) / 2) as i32;

    WindowBounds {
        x,
        y,
        width: w,
        height: h,
    }
}

// ==================== 持久化存储 ====================

/// 模式配置文件内容
#[derive(Serialize, Deserialize)]
struct ModeConfigData {
    mode: WindowMode,
}

/// Bounds 配置文件内容（DIP 值）
#[derive(Serialize, Deserialize, Default)]
struct BoundsConfigData {
    mini: Option<WindowBounds>,
    full: Option<WindowBounds>,
}

/// 模式和 bounds 持久化存储
pub struct ModeStore {
    dir: PathBuf,
}

impl ModeStore {
    /// 创建新的 ModeStore，指定数据目录
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn mode_path(&self) -> PathBuf {
        self.dir.join("mode-config.json")
    }

    fn bounds_path(&self) -> PathBuf {
        self.dir.join("bounds-config.json")
    }

    /// 加载上次使用的模式，失败时返回默认 Mini
    pub fn load_mode(&self) -> WindowMode {
        let path = self.mode_path();
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                serde_json::from_str::<ModeConfigData>(&content)
                    .map(|data| data.mode)
                    .unwrap_or(WindowMode::Mini)
            }
            Err(_) => WindowMode::Mini,
        }
    }

    /// 保存当前模式
    pub fn save_mode(&self, mode: WindowMode) {
        let data = ModeConfigData { mode };
        if let Ok(json) = serde_json::to_string(&data) {
            let _ = std::fs::create_dir_all(&self.dir);
            let _ = std::fs::write(self.mode_path(), json);
        }
    }

    /// 加载指定模式的窗口 bounds（DIP 值）
    pub fn load_bounds(&self, mode: WindowMode) -> Option<WindowBounds> {
        let path = self.bounds_path();
        let content = std::fs::read_to_string(&path).ok()?;
        let data: BoundsConfigData = serde_json::from_str(&content).ok()?;
        match mode {
            WindowMode::Mini => data.mini,
            WindowMode::Full => data.full,
        }
    }

    /// 保存指定模式的窗口 bounds（DIP 值）
    pub fn save_bounds(&self, mode: WindowMode, bounds: &WindowBounds) {
        let path = self.bounds_path();

        // 读取现有数据（如果有）
        let mut data = std::fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str::<BoundsConfigData>(&content).ok())
            .unwrap_or_default();

        // 更新对应模式的 bounds
        match mode {
            WindowMode::Mini => data.mini = Some(bounds.clone()),
            WindowMode::Full => data.full = Some(bounds.clone()),
        }

        if let Ok(json) = serde_json::to_string(&data) {
            let _ = std::fs::create_dir_all(&self.dir);
            let _ = std::fs::write(path, json);
        }
    }
}
