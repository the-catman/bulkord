/**
 * Database initialization and prepared statements.
 */

const Database = require("better-sqlite3");

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS messages (
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    PRIMARY KEY (channel_id, message_id)
);
`;

/**
 * Initialize the database with schema and return prepared statements.
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {Object} Database instance and prepared statements
 */
function initDatabase(dbPath) {
    const db = new Database(dbPath);
    db.exec(SCHEMA_SQL);

    const statements = {
        insert: db.prepare(
            "INSERT OR IGNORE INTO messages (channel_id, message_id) VALUES (?, ?)"
        ),
        selectBatch: db.prepare(
            "SELECT channel_id, message_id FROM messages LIMIT ?"
        ),
        delete: db.prepare(
            "DELETE FROM messages WHERE channel_id = ? AND message_id = ?"
        ),
        count: db.prepare(
            "SELECT COUNT(*) as count FROM messages"
        )
    };

    /**
     * Insert multiple messages in a transaction.
     * @param {Array<[string, string]>} rows - Array of [channel_id, message_id] pairs
     */
    const insertMany = db.transaction(rows => {
        for (const [channelId, messageId] of rows) {
            statements.insert.run(channelId, messageId);
        }
    });

    return {
        db,
        statements,
        insertMany,
        getCount: () => statements.count.get().count,
        close: () => db.close()
    };
}

module.exports = { initDatabase };
