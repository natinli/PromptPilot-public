// SQLite 连接管理
use rusqlite::{Connection, Result as SqliteResult};
use std::path::Path;

use super::migration;

/// 数据库管理器
pub struct Database {
    conn: Connection,
}

impl Database {
    /// 创建基于文件的数据库连接
    pub fn new(db_path: &Path) -> SqliteResult<Self> {
        let conn = Connection::open(db_path)?;
        // 启用 WAL 模式提升并发性能 + 数据库 PRAGMA 优化
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;
             PRAGMA synchronous=NORMAL;
             PRAGMA cache_size=-8000;"
        )?;
        Ok(Self { conn })
    }

    /// 创建内存数据库（用于测试）
    pub fn new_in_memory() -> SqliteResult<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        Ok(Self { conn })
    }

    /// 执行数据库迁移
    pub fn run_migrations(&self) -> SqliteResult<()> {
        migration::run_all(&self.conn)
    }

    /// 获取数据库连接引用
    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}