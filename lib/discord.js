/**
 * Discord API operations for searching and deleting messages.
 * A lot of code is taken from https://github.com/victornpb/undiscord/blob/master/src/undiscord-core.js
 */

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

    const { statements, insertMany, getCount, close } = initDatabase(dbPath);

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
        let searchPage;
        do {
            if (cancelled) break;
            searchPage = await search();

            const allMessages = searchPage.messages
                .filter(m => m.length && m[0]?.channel_id && m[0]?.id);

            const messages = allMessages
                .filter(m => !(config.skipPinned && m[0]?.pinned))
                .filter(m => !UNDELETABLE_MESSAGE_TYPES.includes(m[0]?.type))
                .map(m => [m[0].channel_id, m[0].id]);

            if (allMessages.length === 0) break;

            offset += allMessages.length;

            if (messages.length > 0) {
                insertMany(messages);
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

    return { handleSearchMode, handleDeleteMode, getMessageCount, cancel, close };
}

module.exports = { createInstance };
