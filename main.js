/* A lot of code is taken from https://github.com/victornpb/undiscord/blob/master/src/undiscord-core.js */

const Database = require("better-sqlite3");

const sleep = ms => new Promise(res => setTimeout(res, ms));
const randMinMax = (min, max) => Math.random() * (max - min) + min;

/** Function from https://github.com/victornpb/undiscord/blob/master/src/undiscord-core.js */
const queryString = params => params
    .filter(p => p[1] !== undefined)
    .map(p => p[0] + '=' + encodeURIComponent(p[1]))
    .join('&');

function createInstance(config, dbPath = "messages.db") {
    const API_SEARCH_URL = config.guildId
        ? `https://discord.com/api/v9/guilds/${config.guildId}/messages/search?`
        : `https://discord.com/api/v9/channels/${config.channelId}/messages/search?`;

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
    const selectBatchStmt = db.prepare(
        "SELECT channel_id, message_id FROM messages LIMIT ?"
    );
    const deleteStmt = db.prepare(
        "DELETE FROM messages WHERE channel_id = ? AND message_id = ?"
    );
    const countStmt = db.prepare(
        "SELECT COUNT(*) as count FROM messages"
    );

    let offset = 0;
    let cancelled = false;

    async function search() {
        const params = [
            ['sort_order', 'desc'],
            ['sort_by', 'timestamp'],
            ['min_id', config.startMessageId || undefined],
            ['max_id', config.endMessageId || undefined],
            ['offset', offset || undefined],
            ['content', config.content || undefined],
            ['author_id', config.authorId || undefined],
            ['channel_id', config.channelId || undefined]
        ];

        const url = API_SEARCH_URL + queryString(params);

        try {
            const response = await fetch(url, { headers: { Authorization: config.authToken } });
            if (response.status === 429) {
                const json = await response.json();
                const ratelimit = json.retry_after * 1000 + randMinMax(100, 200);
                await sleep(ratelimit);
                return search();
            }

            if (!response.ok) {
                await response.json().catch(() => null);
                throw new Error("Error in searching for messages.");
            }

            return await response.json();
        } catch (err) {
            await sleep(randMinMax(1000, 2000));
            console.error(err);
            console.log("Retrying search...");
            return search();
        }
    }

    async function deleteMessage(channelId, messageId) {
        const API_DELETE_URL = `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`;

        try {
            const response = await fetch(API_DELETE_URL, {
                method: 'DELETE',
                headers: { Authorization: config.authToken }
            });

            if (response.status === 429) {
                const json = await response.json();
                const ratelimit = json.retry_after * 1000 + randMinMax(100, 200);
                await sleep(ratelimit);
                return deleteMessage(channelId, messageId);
            }

            if (response.status === 404) {
                console.log("Skipping unknown message.");
                return { skipped: true, reason: "unknown" };
            }

            if (response.status === 403) {
                const json = await response.json().catch(() => ({}));
                if (json.code === 50021) {
                    console.log("Skipping system message.");
                    return { skipped: true, reason: "system" };
                }
            }

            if (!response.ok) {
                await response.json().catch(() => null);
                throw new Error("Error deleting a message");
            }

            console.log(`Deleted message ID ${messageId}.`);
            return { skipped: false };
        } catch (err) {
            await sleep(randMinMax(1500, 2000));
            console.error(err);
            console.log("Retrying deletion...");
            return deleteMessage(channelId, messageId);
        }
    }

    async function handleSearchMode(progressCallback) {
        let searchPage;
        do {
            if (cancelled) break;
            searchPage = await search();

            const allMessages = searchPage.messages
                .filter(m => m.length && m[0]?.channel_id && m[0]?.id);
            const messages = allMessages
                .filter(m => !(config.skipPinned && m[0]?.pinned))
                .map(m => [m[0].channel_id, m[0].id]);

            if (allMessages.length === 0) break;

            offset += allMessages.length;

            if (messages.length > 0) {
                const tx = db.transaction(rows => {
                    for (const [c, m] of rows) insertStmt.run(c, m);
                });
                tx(messages);
            }

            await sleep(randMinMax(1000, 2000));
            if (progressCallback) {
                progressCallback(offset, searchPage.total_results);
            } else {
                console.log(`Fetched ${offset}/${searchPage.total_results} total messages.`);
            }
        } while (searchPage.total_results > offset);
    }

    async function handleDeleteMode(progressCallback) {
        let deleted = 0;
        while (true) {
            if (cancelled) break;
            const batch = selectBatchStmt.all(25);
            if (!batch.length) break;

            for (const { channel_id, message_id } of batch) {
                if (cancelled) break;
                const result = await deleteMessage(channel_id, message_id);
                deleteStmt.run(channel_id, message_id);
                deleted++;
                if (progressCallback) {
                    progressCallback(deleted, result);
                }
                await sleep(randMinMax(1500, 2000));
            }
        }
    }

    function getMessageCount() {
        return countStmt.get().count;
    }

    function cancel() {
        cancelled = true;
    }

    function close() {
        db.close();
    }

    return { handleSearchMode, handleDeleteMode, getMessageCount, cancel, close };
}

module.exports = { createInstance };

if (require.main === module) {
    const config = require("./config.json");
    const instance = createInstance(config);

    (async () => {
        if (config.mode === "search") {
            await instance.handleSearchMode();
        } else if (config.mode === "delete") {
            await instance.handleDeleteMode();
        }
        instance.close();
    })();
}
