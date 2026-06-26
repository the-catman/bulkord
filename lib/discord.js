/**
 * Discord API operations for searching and deleting messages.
 * A lot of code is taken from https://github.com/victornpb/undiscord/blob/master/src/undiscord-core.js
 */

const fs = require("node:fs");

const { initDatabase } = require("./database");
const { sleep, randMinMax, queryString } = require("./utils");
const { DISCORD_API_BASE, UNDELETABLE_MESSAGE_TYPES } = require("./constants");

/**
 * Create a Discord operations instance.
 * @param {Object} config - Configuration object
 * @param {string} [dbPath="messages.db"] - Path to the SQLite database
 * @returns {Object} Instance with search, delete, and utility methods
 */
function createInstance(config, dbPath = "messages.db") {
    const API_SEARCH_URL = config.guildId
        ? `${DISCORD_API_BASE}/guilds/${config.guildId}/messages/search?`
        : `${DISCORD_API_BASE}/channels/${config.channelId}/messages/search?`;

    // Global cross-DM search ("search all DMs at once"). No guild/channel needed.
    const API_DM_SEARCH_URL = `${DISCORD_API_BASE}/users/@me/messages/search/tabs`;

    const { statements, insertMany, getCount, close } = initDatabase(dbPath);

    let cancelled = false;

    /**
     * Dispatch to the right search backend.
     * Returns a normalized { messages, total_results } shape either way.
     * maxId is the keyset cursor (inclusive upper bound on message ID).
     */
    async function search(maxId) {
        return config.dmSearch ? searchDms(maxId) : searchScoped(maxId);
    }

    /** Search within a single guild or channel (GET). */
    async function searchScoped(maxId) {
        const params = [
            ['sort_order', 'desc'],
            ['sort_by', 'timestamp'],
            ['min_id', config.startMessageId || undefined],
            ['max_id', maxId || undefined],
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
                return searchScoped(maxId);
            }

            if (!response.ok) {
                await response.json().catch(() => null);
                throw new Error("Error in searching for messages.");
            }

            return await response.json();
        } catch (err) {
            await sleep(randMinMax(5000, 7000));
            console.error(err);
            console.log("Retrying search...");
            return searchScoped(maxId);
        }
    }

    /** Search across every DM and group DM at once (POST). */
    async function searchDms(maxId) {
        const messagesTab = {
            sort_by: 'timestamp',
            sort_order: 'desc',
            limit: 25
        };
        if (config.authorId) messagesTab.author_id = [config.authorId];
        if (config.content) messagesTab.content = config.content;
        if (config.startMessageId) messagesTab.min_id = config.startMessageId;
        if (maxId) messagesTab.max_id = maxId;

        const body = JSON.stringify({
            tabs: { messages: messagesTab },
            track_exact_total_hits: true
        });

        try {
            const response = await fetch(API_DM_SEARCH_URL, {
                method: 'POST',
                headers: {
                    Authorization: config.authToken,
                    'Content-Type': 'application/json'
                },
                body
            });

            if (response.status === 429) {
                const json = await response.json();
                const ratelimit = json.retry_after * 1000 + randMinMax(100, 200);
                await sleep(ratelimit);
                return searchDms(maxId);
            }

            if (!response.ok) {
                await response.json().catch(() => null);
                throw new Error("Error in searching DMs.");
            }

            const json = await response.json();
            const tab = json.tabs?.messages ?? {};
            return {
                messages: tab.messages ?? [],
                total_results: tab.total_results ?? 0
            };
        } catch (err) {
            await sleep(randMinMax(5000, 7000));
            console.error(err);
            console.log("Retrying DM search...");
            return searchDms(maxId);
        }
    }

    // Keyset pagination: walk max_id backwards through message IDs instead of
    // bumping offset, which Discord caps at ~10k. Snowflake IDs are time-ordered,
    // so stepping the cursor to (oldest_in_page - 1) advances by date. total is
    // captured from the first page; later pages report a shrinking windowed total.
    async function* paginate(startCursor) {
        let cursor = startCursor || config.endMessageId || undefined;
        let total = null;
        let fetched = 0;
        while (!cancelled) {
            const page = await search(cursor);
            if (total === null) total = page.total_results || 0;

            const groups = page.messages
                .filter(m => m.length && m[0]?.channel_id && m[0]?.id);
            if (groups.length === 0) return;

            fetched += groups.length;
            yield { groups, total, fetched };

            let oldest = BigInt(groups[0][0].id);
            for (const m of groups) {
                const id = BigInt(m[0].id);
                if (id < oldest) oldest = id;
            }
            cursor = (oldest - 1n).toString();
            await sleep(randMinMax(5000, 7000));
        }
    }

    async function deleteMessage(channelId, messageId) {
        const API_DELETE_URL = `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`;

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
        for await (const { groups, total, fetched } of paginate()) {
            const messages = groups
                .filter(m => !(config.skipPinned && m[0]?.pinned))
                .filter(m => !UNDELETABLE_MESSAGE_TYPES.includes(m[0]?.type))
                .map(m => [m[0].channel_id, m[0].id]);

            if (messages.length > 0) insertMany(messages);

            if (progressCallback) {
                progressCallback(fetched, total);
            } else {
                console.log(`Fetched ${fetched}/${total} total messages.`);
            }
        }
    }

    // Same keyset pagination as search, but stream each full message object into a
    // JSON array on disk instead of reducing to (channel_id, message_id) pairs. No
    // pinned/system filtering: this is a true export of everything matched. The
    // seen set guards against the boundary message ever being written twice.
    //
    // options.startCursor seeds the keyset cursor (resume below an earlier point).
    // options.append opens the existing file and continues its array instead of
    // starting a fresh one; options.leadingComma is set when that file already
    // holds messages, so the first new one needs a separating comma.
    async function handleExportMode(outputPath, options = {}, progressCallback) {
        const { startCursor, append = false, leadingComma = false } = options;
        const stream = fs.createWriteStream(outputPath, { encoding: "utf-8", flags: append ? "a" : "w" });
        const write = chunk => new Promise((resolve, reject) => {
            stream.once("error", reject);
            if (stream.write(chunk)) return resolve();
            stream.once("drain", resolve);
        });

        const seen = new Set();
        let exported = 0;
        let first = !leadingComma;
        try {
            if (!append) await write("[\n");
            for await (const { groups, total } of paginate(startCursor)) {
                for (const m of groups) {
                    if (seen.has(m[0].id)) continue;
                    seen.add(m[0].id);
                    await write((first ? "" : ",\n") + JSON.stringify(m[0], null, 4));
                    first = false;
                    exported++;
                }

                if (progressCallback) {
                    progressCallback(exported, total, exported);
                } else {
                    console.log(`Exported ${exported}/${total} messages.`);
                }
            }
            await write("\n]\n");
        } finally {
            await new Promise((resolve, reject) => stream.end(err => err ? reject(err) : resolve()));
        }
        return exported;
    }

    async function handleDeleteMode(progressCallback) {
        let deleted = 0;
        while (true) {
            if (cancelled) break;
            const batch = statements.selectBatch.all(25);
            if (!batch.length) break;

            for (const { channel_id, message_id } of batch) {
                if (cancelled) break;
                const result = await deleteMessage(channel_id, message_id);
                statements.delete.run(channel_id, message_id);
                deleted++;
                if (progressCallback) {
                    progressCallback(deleted, result);
                }
                await sleep(randMinMax(1500, 2000));
            }
        }
    }

    function getMessageCount() {
        return getCount();
    }

    function cancel() {
        cancelled = true;
    }

    return { handleSearchMode, handleExportMode, handleDeleteMode, getMessageCount, cancel, close };
}

module.exports = { createInstance };
