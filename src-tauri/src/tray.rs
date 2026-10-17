// 系统托盘 — 从 Electron createTray/updateTrayMenu 精准迁移

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
    image::Image,
    AppHandle, Manager,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use std::path::Path;

/// 快捷键配置文件名
const SHORTCUT_CONFIG_FILE: &str = "shortcut-config.json";

/// 从配置文件加载快捷键设置，返回 None 表示文件不存在或读取失败（使用默认值）
pub fn load_shortcut_config(app_data_dir: &Path) -> Option<String> {
    let path = app_data_dir.join(SHORTCUT_CONFIG_FILE);
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                return json.get("shortcut").and_then(|v| v.as_str()).map(|s| s.to_string());
            }
        }
    }
    None
}

/// 保存快捷键设置到配置文件
pub fn save_shortcut_config(app_data_dir: &Path, shortcut: &str) {
    let path = app_data_dir.join(SHORTCUT_CONFIG_FILE);
    let json = serde_json::json!({ "shortcut": shortcut });
    let _ = std::fs::write(&path, serde_json::to_string_pretty(&json).unwrap_or_default());
}

/// 创建系统托盘
pub fn create_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // 菜单项
    let show_item = MenuItemBuilder::with_id("show", "打开 PromptPilot").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // 编译时嵌入图标 PNG，确保开发模式和生产模式都能正确显示
    let icon_bytes = include_bytes!("../icons/icon.png");
    let icon = Image::from_bytes(icon_bytes)
        .unwrap_or_else(|_| app.default_window_icon().cloned().unwrap());

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("PromptPilot")
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "show" => {
                    show_window(app);
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

/// 显示窗口
fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 切换窗口显示/隐藏
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

/// 注册全局快捷键（支持自定义快捷键，"none" 表示不注册）
pub fn register_global_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), Box<dyn std::error::Error>> {
    // "none" 表示用户禁用了快捷键，不注册
    if shortcut == "none" {
        log::info!("全局快捷键已禁用，跳过注册");
        return Ok(());
    }

    use tauri_plugin_global_shortcut::ShortcutState;

    app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_window(app);
        }
    })?;

    Ok(())
}

/// 临时注销所有全局快捷键（用于快捷键录入模式，避免误触）
pub fn unregister_global_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.global_shortcut().unregister_all()?;
    Ok(())
}

/// 更新全局快捷键（先注销所有已注册的快捷键，再注册新的）
/// shortcut 为 "none" 时只注销不注册（禁用快捷键）
pub fn update_global_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), Box<dyn std::error::Error>> {
    // 先注销所有已注册的快捷键
    app.global_shortcut().unregister_all()?;

    // "none" 表示用户禁用了快捷键，只注销不注册
    if shortcut == "none" {
        log::info!("全局快捷键已禁用");
        return Ok(());
    }

    use tauri_plugin_global_shortcut::ShortcutState;

    // 注册新的快捷键
    app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_window(app);
        }
    })?;

    Ok(())
}
