const fs = require("node:fs");
const { createHash } = require("node:crypto");

fs.mkdirSync("./messages", { recursive: true });

const sleep = ms => new Promise(res => setTimeout(res, ms));
const randMinMax = (min, max) => Math.random() * (max - min) + min;
const sha256 = message => createHash("sha256").update(message).digest("hex");
const queryString = params => params
    .filter(p => p[1] !== undefined)
    .map(p => p[0] + '=' + encodeURIComponent(p[1]))
    .join('&');

const config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
const state = {
    // Note: all IDs should be in the form of strings, NOT ints
    authToken: config.authToken,
    authorId: config.authorId,
    guildId: config.guildId, // Leave blank when searching DMs
    channelId: config.channelId,
    mode: config.mode, // 'search' or 'delete'.
    minId: config.minId,
    maxId: config.maxId,
    content: config.content,

    offset: 0, // In messages, NOT pages
    
    currentFile: undefined,
    data: []
};

const API_SEARCH_URL = (() => state.guildId
    ? `https://discord.com/api/v9/guilds/${state.guildId}/messages/search?`
    : `https://discord.com/api/v9/channels/${state.channelId}/messages/search?`
)();

async function search() {
    const response = await fetch(API_SEARCH_URL + queryString([
        ['sort_order', 'desc'],
        ['sort_by', 'timestamp'],
        ['min_id', state.minId || undefined],
        ['max_id', state.maxId || undefined],
        ['offset', state.offset || undefined],
        ['content', state.content || undefined],
        ['author_id', state.authorId || undefined],
        ['channel_id', state.channelId || undefined]
    ]), { headers: { Authorization: state.authToken } }); // Nothing can be done if the search fails, so no try/catch

    const json = await response.json();
    const { status, ok } = response;

    if (ok) return json;

    if (status === 429) {
        const ratelimit = json.retry_after * 1000 + randMinMax(100, 200);
        console.log(`Searching messages too fast, cooling down for ${ratelimit}ms.`);
        await sleep(ratelimit);
        return search(); // Retry
    }

    console.error(`Error searching for messages, API response: ${status}`, json);
    throw new Error("Error in searching for messages.");
}

async function deleteMessage(channelId, messageId) {
    const API_DELETE_URL = `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`;
    let response;

    try {
        response = await fetch(API_DELETE_URL, {
            method: 'DELETE',
            headers: { Authorization: state.authToken }
        });
    } catch (err) {
        state.data.push([channelId, messageId]); // Network error
        saveProgress();
        throw err;
    }

    const { status, ok } = response;

    if (ok) {
        console.log(`Deleted message ID ${messageId}.`);
    } else {
        const json = await response.json();

        if (status === 404) { // Unknown message
            console.log("Skipping unknown message.");
        } else if (status === 403 && json.code === 50021) { // System message
            console.log("Skipping system message.");
        } else if (status === 429) { // Ratelimited
            state.data.push([channelId, messageId]);

            const ratelimit = json.retry_after * 1000 + randMinMax(100, 200);
            console.log(`Deleting messages too fast, cooling down for ${ratelimit}ms.`);
            await sleep(ratelimit);
        } else { // Unhandled error
            state.data.push([channelId, messageId]);
            saveProgress();
            console.log(`Error deleting a message, API response: ${status}`, json);
            throw new Error("Error deleting a message");
        }
    }
}

async function handleSearchMode() {
    let searchPage;
    do {
        searchPage = await search();

        let messages = searchPage.messages
            .filter(m => m.length && m[0]?.channel_id && m[0]?.id)
            .map(m => [m[0].channel_id, m[0].id]);

        if (messages.length === 0) break;

        state.offset += messages.length;

        const serialized = JSON.stringify(messages);
        fs.writeFileSync(`./messages/${state.channelId}_${sha256(serialized)}.json`, serialized);

        await sleep(randMinMax(500, 1500)); // Average: 1 second
        console.log(`Fetched ${state.offset}/${searchPage.total_results} total messages.`);
    } while (searchPage.total_results > state.offset);
}

async function handleDeleteMode() {
    const files = fs.readdirSync("./messages");

    for (const file of files) {
        console.log(`Deleting in ${file}`);
        state.currentFile = file;
        state.data = JSON.parse(fs.readFileSync(`./messages/${file}`, "utf-8"));

        let ctr = 0;

        while (state.data.length) {
            const [channelId, messageId] = state.data.pop();

            await deleteMessage(channelId, messageId);
            await sleep(randMinMax(1000, 2000)); // Average: 1.5 seconds

            if(++ctr === 100) {
                saveProgress();
                ctr = 0;
            }
        }

        saveProgress();
    }
}

function saveProgress() {
    if (state.currentFile) {
        if (state.data.length) {
            fs.writeFileSync(`./messages/${state.currentFile}`, JSON.stringify(state.data));
            console.log(`\nSaved progress for ${state.currentFile} with ${state.data.length} remaining messages.`);
        } else {
            fs.rmSync(`./messages/${state.currentFile}`);
            console.log(`Deleted ${state.currentFile}`);
        }
    }
}

process.on("SIGINT", () => { // Control + C failsafe.
    saveProgress();
    process.exit();
});

(async () => {
    switch (config.mode.toLowerCase()) {
        case "search":
            await handleSearchMode();
            break;
        case "delete":
            await handleDeleteMode();
            break;
        default:
            console.error(`Unexpected mode! Mode needs to be either 'search' or 'delete'.`);
            break;
    }
})();