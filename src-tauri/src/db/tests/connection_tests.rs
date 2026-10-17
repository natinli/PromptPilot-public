/// 数据库连接与迁移测试
use crate::db::connection::Database;

#[test]
fn test_database_connection_creates_successfully() {
    // 使用内存数据库测试连接
    let db = Database::new_in_memory();
    assert!(db.is_ok(), "数据库连接应成功创建: {:?}", db.err());
}

#[test]
fn test_migration_creates_all_tables() {
    let db = Database::new_in_memory().expect("数据库连接失败");
    db.run_migrations().expect("迁移执行失败");

    // 验证所有业务表都存在；tags/prompt_tags 虽已不再由现行功能使用，仍由历史迁移保留。
    let expected_tables = vec![
        "users",
        "prompts",
        "categories",
        "tags",
        "prompt_tags",
        "prompt_versions",
        "optimization_logs",
        "templates",
        "generated_images",
    ];

    let conn = db.connection();
    for table_name in &expected_tables {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                [table_name],
                |row: &rusqlite::Row| row.get(0),
            )
            .unwrap_or(false);
        assert!(exists, "表 '{}' 应该在迁移后存在", table_name);
    }
}

#[test]
fn test_migration_is_idempotent() {
    let db = Database::new_in_memory().expect("数据库连接失败");

    // 执行两次迁移不应报错
    db.run_migrations().expect("第一次迁移失败");
    db.run_migrations().expect("第二次迁移应幂等执行成功");
}

#[test]
fn test_migration_creates_expected_table_set() {
    let db = Database::new_in_memory().expect("数据库连接失败");
    db.run_migrations().expect("迁移执行失败");

    let conn = db.connection();
    let actual_tables: Vec<String> = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .expect("准备表查询失败")
        .query_map([], |row| row.get(0))
        .expect("查询表名称失败")
        .collect::<Result<_, _>>()
        .expect("读取表名称失败");

    assert_eq!(
        actual_tables,
        vec![
            "_migrations",
            "categories",
            "generated_images",
            "optimization_logs",
            "prompt_tags",
            "prompt_versions",
            "prompts",
            "tags",
            "templates",
            "users",
        ],
        "迁移后的表集合应与当前 Schema 一致"
    );
}
