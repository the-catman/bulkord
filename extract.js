const fs = require("node:fs");
const JSONbig = require("json-bigint")({ useNativeBigInt: true });
const Database = require("better-sqlite3");

const dbPath = process.argv[2] || "messages.db";
const db = new Database(dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS messages (
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    PRIMARY KEY (channel_id, message_id)
);
`);

const insertStmt = db.prepare(
    "INSERT OR IGNORE INTO messages (channel_id, message_id) VALUES (?, ?)"
);

const insertTx = db.transaction(rows => {
    for (const [c, m] of rows) insertStmt.run(c, m);
});

const packagePath = process.argv[3] || "./Package/Messages";
const folders = fs.readdirSync(packagePath).filter(folder => folder.startsWith("c"));

let total = 0;

for (const folder of folders) {
    const channelId = JSON.parse(fs.readFileSync(`${packagePath}/${folder}/channel.json`, "utf-8")).id;
    const messages = JSONbig.parse(fs.readFileSync(`${packagePath}/${folder}/messages.json`, "utf-8"))
        .map(message => [channelId, String(message.ID)]);

    if (messages.length === 0) continue;

    insertTx(messages);
    total += messages.length;
}

console.log(`Extracted ${total} messages from ${folders.length} channels into ${dbPath}.`);
db.close();
