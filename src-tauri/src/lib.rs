//! PromptPilot - Tauri 2 桌面应用核心库

use std::sync::Mutex;
use tauri::{Manager, Emitter, State};

// 功能模块
pub mod db;
pub mod commands;
pub mod ai;
pub mod window;
pub mod tray;

/// 数据库状态（线程安全包装）
pub struct DbState(pub Mutex<db::connection::Database>);

/// 窗口模式状态（线程安全包装）
pub struct ModeState(pub Mutex<window::mode::ModeStore>);

/// API Key 状态（线程安全包装）
pub struct ApiKeyState(pub Mutex<commands::apikey::ApiKeyStore>);

/// 启动 Tauri 应用
pub fn run() {
    // 初始化日志
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // 初始化数据库
            let app_data_dir = app.path().app_data_dir()
                .expect("无法获取应用数据目录");
            std::fs::create_dir_all(&app_data_dir)
                .expect("无法创建应用数据目录");
            let db_path = app_data_dir.join("promptpilot.db");

            log::info!("数据库路径: {:?}", db_path);
            let database = db::connection::Database::new(&db_path)
                .expect("数据库连接失败");
            database.run_migrations()
                .expect("数据库迁移失败");

            app.manage(DbState(Mutex::new(database)));

            // 初始化窗口模式存储
            // 读取上次保存的模式，首次启动默认 Mini
            let mode_store = window::mode::ModeStore::new(app_data_dir.clone());
            let initial_mode = mode_store.load_mode();
            app.manage(ModeState(Mutex::new(mode_store)));

            // 初始化 API Key 存储
            let apikey_store = commands::apikey::ApiKeyStore::new(app_data_dir.clone());
            app.manage(ApiKeyState(Mutex::new(apikey_store)));

            // 恢复上次保存的窗口位置和尺寸
            // 配置值为物理像素，通过 physical_to_dip 转为 DIP 后传给 Tauri API
            if let Some(main_window) = app.get_webview_window("main") {
                let store = app.state::<ModeState>();
                let store = store.0.lock().unwrap();
                let scale_factor = main_window.scale_factor().unwrap_or(1.0);
                let (always_on_top, resizable) = window::mode::get_mode_properties(initial_mode);
                let constraints = window::mode::get_mode_constraints(initial_mode, scale_factor);

                // 获取屏幕工作区 DIP 尺寸
                let (screen_w, screen_h) = main_window.current_monitor()
                    .ok()
                    .flatten()
                    .map(|m| {
                        let size = m.size();
                        let sf = m.scale_factor();
                        ((size.width as f64 / sf) as u32, (size.height as f64 / sf) as u32)
                    })
                    .unwrap_or((1920, 1080));

                // 获取目标 bounds（优先使用保存值，否则用默认物理像素配置转 DIP 后居中）
                let saved_bounds = store.load_bounds(initial_mode);
                let bounds = window::mode::get_target_bounds(
                    initial_mode, saved_bounds.as_ref(), screen_w, screen_h, scale_factor,
                );

                // 设置窗口属性
                let _ = main_window.set_always_on_top(always_on_top);
                let _ = main_window.set_resizable(resizable);

                // 设置尺寸和位置（逻辑像素）
                let _ = main_window.set_size(tauri::LogicalSize::new(
                    bounds.width as f64, bounds.height as f64,
                ));
                let _ = main_window.set_position(tauri::LogicalPosition::new(
                    bounds.x as f64, bounds.y as f64,
                ));

                // 应用尺寸约束（逻辑像素）
                let _ = main_window.set_min_size(Some(tauri::LogicalSize::new(
                    constraints.min_width as f64, constraints.min_height as f64,
                )));
                if let (Some(max_w), Some(max_h)) = (constraints.max_width, constraints.max_height) {
                    let _ = main_window.set_max_size(Some(tauri::LogicalSize::new(
                        max_w as f64, max_h as f64,
                    )));
                }

                // 窗口配置完成后再显示（配合 tauri.conf.json 的 visible: false，避免启动白屏闪烁）
                // 应用 Windows 11 Mica 效果：仅 Win11（Build ≥ 22000）才应用
                // Win10 不支持 Mica，强行调用会导致窗口透明异常
                #[cfg(target_os = "windows")]
                {
                    if is_win11() {
                        use window_vibrancy::apply_mica;
                        let _ = apply_mica(&main_window, Some(false))
                            .map_err(|e| log::warn!("Mica 效果应用失败: {}", e));
                        log::info!("Windows 11 检测通过，Mica 效果已应用");
                    } else {
                        log::info!("非 Windows 11，跳过 Mica 效果");
                    }
                }

                // 设置窗口图标（确保开发模式和生产模式都使用自定义图标）
                let icon_bytes = include_bytes!("../icons/icon.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    let _ = main_window.set_icon(icon);
                }
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }

            // 初始化系统托盘
            let app_handle = app.handle().clone();
            tray::create_tray(&app_handle)
                .unwrap_or_else(|e| log::error!("创建系统托盘失败: {}", e));

            // 注册全局快捷键（从配置文件读取，支持 "none" 禁用）
            let saved_shortcut = tray::load_shortcut_config(&app_data_dir)
                .unwrap_or_else(|| "Alt+T".to_string());
            log::info!("快捷键配置: {}", saved_shortcut);
            tray::register_global_shortcut(&app_handle, &saved_shortcut)
                .unwrap_or_else(|e| log::error!("注册全局快捷键失败: {}", e));

            log::info!("启动模式: {:?}", initial_mode);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Prompt CRUD
            get_prompts,
            get_prompt,
            create_prompt,
            update_prompt,
            delete_prompt,
            copy_prompt,
            duplicate_prompt,
            update_prompt_sort_order,
            // 分类、统计
            get_categories,
            create_category,
            update_category,
            delete_category,
            get_stats,
            // AI 优化
            optimize_prompt,
            optimize_prompt_stream,
            get_optimization_logs,
            get_optimization_logs_paged,
            clear_optimization_logs,
            unregister_global_shortcut,
            update_global_shortcut,
            // 导入导出
            export_prompts,
            import_prompts,
            // API Key 管理
            set_api_key,
            get_api_key,
            get_api_key_status,
            clear_api_key,
            // 多 Provider API Key 管理
            set_api_key_for_provider,
            get_api_key_for_provider,
            get_api_key_status_for_provider,
            clear_api_key_for_provider,
            // OpenAI 兼容 Provider 端点 URL 管理
            save_openai_endpoint,
            get_openai_endpoint,
            // OpenAI 兼容 Provider 模型列表
            fetch_openai_models,
            // CodeBuddy 模型列表（端点与 Key 均由 Rust 端管理）
            fetch_codebuddy_models,
            // 图片生成
            generate_image,
            list_generated_images,
            delete_generated_image,
            get_generated_image,
            get_image_file_path,
            // 窗口管理
            get_window_mode,
            set_window_mode,
            prepare_switch,
            finish_switch,
            window_minimize,
            window_maximize,
            window_close,
            // Debug 工具
            debug_echo,
            db_health_check,
            // Mica 效果
            set_mica_dark,
            is_mica_supported,
        ])
        .run(tauri::generate_context!())
        .expect("启动 PromptPilot 时发生错误");
}

// ==================== Win11 检测 ====================

/// 检测当前系统是否为 Windows 11（Build ≥ 22000）
/// Mica 材质仅在 Windows 11 上可用
///
/// 使用纯 Rust Windows API 读取注册表，不调用任何外部进程（cmd/powershell）
/// 避免触发公司安全软件的进程创建风控
#[cfg(target_os = "windows")]
fn is_win11() -> bool {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion") {
        // Windows 10 1809+ 使用 CurrentBuildNumber（字符串类型）
        if let Ok(build_str) = key.get_value::<String, _>("CurrentBuildNumber") {
            if let Ok(build) = build_str.parse::<u32>() {
                log::info!("Windows Build 号: {} (Win11 需要 ≥ 22000)", build);
                return build >= 22000;
            }
        }
    }
    log::warn!("无法读取 Windows 版本号，默认判定为非 Win11");
    false
}

// ==================== Mica 效果控制 ====================

/// 查询当前系统是否支持 Mica 材质（即是否为 Windows 11）
/// 前端用此命令决定是否显示 Mica 开关、是否自动开启 Mica
#[tauri::command]
fn is_mica_supported() -> bool {
    #[cfg(target_os = "windows")]
    {
        is_win11()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// 动态切换 Mica 效果的明暗模式
/// 暗色模式不使用 Mica（效果不佳），浅色模式应用 Mica
/// dark=true → 清除 Mica，dark=false → 应用浅色 Mica
#[tauri::command]
fn set_mica_dark(app: tauri::AppHandle, dark: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::{apply_mica, clear_mica};
        if let Some(window) = app.get_webview_window("main") {
            if dark {
                // 清除 Mica 效果（暗色模式或用户禁用 Mica 时调用）
                let _ = clear_mica(&window);
                log::info!("[set_mica_dark] Mica 已清除");
                emit_rust_log(&app, "set_mica_dark", "Mica 已清除（暗色模式或用户禁用）", None);
            } else {
                // 应用 Mica 效果（浅色模式 + 用户启用 Mica）
                apply_mica(&window, Some(false))
                    .map_err(|e| format!("Mica 效果应用失败: {}", e))?;
                log::info!("[set_mica_dark] Mica 已应用（浅色模式）");
                emit_rust_log(&app, "set_mica_dark", "Mica 已应用（浅色模式）", None);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, dark); // 非 Windows 平台忽略
    }
    Ok(())
}

// ==================== Debug 工具 ====================

/// 向前端 Debug 面板推送 Rust 端日志
/// 通过 Tauri 事件 "rust-log" 发送，前端监听后显示在面板的「Rust 日志」Tab 中
pub fn emit_rust_log(app: &tauri::AppHandle, command: &str, message: &str, data: Option<&serde_json::Value>) {
    let payload = serde_json::json!({
        "command": command,
        "message": message,
        "data": data,
        "timestamp": chrono::Local::now().format("%H:%M:%S%.3f").to_string(),
    });
    let _ = app.emit("rust-log", payload);
}

/// Debug Echo 命令 —— 快速验证 IPC 层是否正常
/// 接收任意 JSON 数据，在终端打印后原样返回
/// 用于排查前端→Rust 的数据传输问题（序列化/反序列化/camelCase 映射等）
#[tauri::command]
fn debug_echo(app: tauri::AppHandle, data: serde_json::Value) -> Result<serde_json::Value, String> {
    let pretty = serde_json::to_string_pretty(&data).unwrap_or_default();
    log::info!("[debug_echo] 收到数据: {}", pretty);
    emit_rust_log(&app, "debug_echo", &format!("收到数据: {}", pretty), Some(&data));
    Ok(data)
}

/// SQLite 健康检查命令 —— 一键检查数据库完整性
/// 返回 JSON 格式的健康报告，包含：
/// - integrity_check: PRAGMA integrity_check 结果
/// - tables: 所有表及其行数
/// - db_size: 数据库文件大小
/// - journal_mode: 当前日志模式
/// - foreign_keys: 外键约束状态
/// - migration_version: 当前迁移版本
/// - indexes: 所有索引列表
#[tauri::command]
fn db_health_check(app: tauri::AppHandle, db: State<DbState>) -> Result<serde_json::Value, String> {
    emit_rust_log(&app, "db_health_check", "开始 SQLite 健康检查", None);
    let database = db.0.lock().map_err(|e| format!("获取数据库锁失败: {}", e))?;
    let conn = database.connection();

    // 1. PRAGMA integrity_check
    let integrity: String = conn.query_row(
        "PRAGMA integrity_check",
        [],
        |row| row.get(0),
    ).unwrap_or_else(|e| format!("检查失败: {}", e));

    // 2. 获取所有表及行数
    let mut tables_info = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).map_err(|e| format!("查询表列表失败: {}", e))?;
        let table_names: Vec<String> = stmt.query_map([], |row| row.get(0))
            .map_err(|e| format!("遍历表列表失败: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
        for name in &table_names {
            let count: i64 = conn.query_row(
                &format!("SELECT COUNT(*) FROM \"{}\"", name),
                [],
                |row| row.get(0),
            ).unwrap_or(-1);
            tables_info.push(serde_json::json!({
                "name": name,
                "row_count": count,
            }));
        }
    }

    // 3. 数据库文件大小（page_count * page_size）
    let page_count: i64 = conn.query_row("PRAGMA page_count", [], |row| row.get(0)).unwrap_or(0);
    let page_size: i64 = conn.query_row("PRAGMA page_size", [], |row| row.get(0)).unwrap_or(0);
    let db_size_bytes = page_count * page_size;

    // 4. 日志模式
    let journal_mode: String = conn.query_row("PRAGMA journal_mode", [], |row| row.get(0)).unwrap_or_default();

    // 5. 外键约束状态
    let foreign_keys: bool = conn.query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i32>(0))
        .map(|v| v == 1).unwrap_or(false);

    // 6. 外键完整性检查
    let mut fk_violations = Vec::new();
    {
        let mut stmt = conn.prepare("PRAGMA foreign_key_check").map_err(|e| format!("外键检查失败: {}", e))?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "table": row.get::<_, String>(0)?,
                "rowid": row.get::<_, i64>(1)?,
                "parent": row.get::<_, String>(2)?,
                "fkid": row.get::<_, i64>(3)?,
            }))
        }).map_err(|e| format!("遍历外键检查结果失败: {}", e))?;
        for v in rows.flatten() {
            fk_violations.push(v);
        }
    }

    // 7. 当前迁移版本
    let migration_version: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM _migrations",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    // 8. 索引列表
    let mut indexes = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name"
        ).map_err(|e| format!("查询索引列表失败: {}", e))?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "name": row.get::<_, String>(0)?,
                "table": row.get::<_, String>(1)?,
            }))
        }).map_err(|e| format!("遍历索引列表失败: {}", e))?;
        for v in rows.flatten() {
            indexes.push(v);
        }
    }

    // 9. WAL 检查点状态
    let wal_pages: i64 = conn.query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |row| row.get::<_, i64>(1)).unwrap_or(0);

    // 10. freelist 页数（碎片化指标）
    let freelist_count: i64 = conn.query_row("PRAGMA freelist_count", [], |row| row.get(0)).unwrap_or(0);

    let report = serde_json::json!({
        "integrity_check": integrity,
        "tables": tables_info,
        "db_size_bytes": db_size_bytes,
        "journal_mode": journal_mode,
        "foreign_keys_enabled": foreign_keys,
        "foreign_key_violations": fk_violations,
        "migration_version": migration_version,
        "indexes": indexes,
        "wal_pages": wal_pages,
        "freelist_count": freelist_count,
        "page_size": page_size,
        "page_count": page_count,
    });

    let is_healthy = integrity == "ok" && fk_violations.is_empty();
    emit_rust_log(&app, "db_health_check",
        &format!("健康检查完成: integrity={}, tables={}, fk_violations={}, size={}KB",
            integrity, tables_info.len(), fk_violations.len(), db_size_bytes / 1024),
        Some(&report));

    if !is_healthy {
        emit_rust_log(&app, "db_health_check", "⚠️ 数据库存在问题！请查看详细报告", None);
    }

    Ok(report)
}

// ==================== Tauri Command 包装函数 ====================
// P1-7: 已提取到 handlers.rs，lib.rs 仅保留模块引用
mod handlers;
use handlers::*;
