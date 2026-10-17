// Stats Commands
use rusqlite::Connection;

use crate::db::models::Stats;
use crate::db::queries;
use super::error::AppResult;

/// 查询统计摘要
pub fn cmd_get_stats(conn: &Connection) -> AppResult<Stats> {
    Ok(queries::get_stats(conn)?)
}
