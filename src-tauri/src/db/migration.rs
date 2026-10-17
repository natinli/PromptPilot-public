// 数据库迁移管理
use rusqlite::{Connection, Result as SqliteResult};

/// 迁移脚本定义
struct Migration {
    version: i32,
    name: &'static str,
    sql: &'static str,
}

/// 所有迁移脚本列表
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            name: "initial_schema",
            sql: include_str!("../../migrations/001_initial.sql"),
        },
        Migration {
            version: 2,
            name: "seed_categories",
            sql: include_str!("../../migrations/002_seed_categories.sql"),
        },
        Migration {
            version: 3,
            name: "reset_categories",
            sql: include_str!("../../migrations/003_reset_categories.sql"),
        },
        Migration {
            version: 4,
            name: "add_sort_order",
            sql: include_str!("../../migrations/004_add_sort_order.sql"),
        },
        Migration {
            version: 5,
            name: "image_gen",
            sql: include_str!("../../migrations/005_image_gen.sql"),
        },
    ]
}

/// 执行所有待运行的迁移
pub fn run_all(conn: &Connection) -> SqliteResult<()> {
    // 创建迁移记录表
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    )?;

    for m in migrations() {
        let already_applied: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM _migrations WHERE version = ?1",
            [m.version],
            |row: &rusqlite::Row| row.get(0),
        )?;

        if !already_applied {
            // 事务包裹：确保迁移 SQL 和版本记录原子执行
            conn.execute_batch("BEGIN;")?;
            match conn.execute_batch(m.sql) {
                Ok(_) => {
                    conn.execute(
                        "INSERT INTO _migrations (version, name) VALUES (?1, ?2)",
                        rusqlite::params![m.version, m.name],
                    )?;
                    conn.execute_batch("COMMIT;")?;
                    log::info!("迁移 v{} ({}) 已执行", m.version, m.name);
                }
                Err(e) => {
                    let _ = conn.execute_batch("ROLLBACK;");
                    return Err(e);
                }
            }
        }
    }

    Ok(())
}