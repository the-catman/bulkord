/**
 * Read and repair Chat Exporter JSON files for resuming an export.
 *
 * Exports are a flat JSON array, one message per element, pretty-printed at
 * 4-space indent and sorted newest-first. That deterministic shape lets us work
 * on huge (or truncated) files without parsing them: a top-level message's own
 * "id" is the only one indented exactly 4 spaces, and a top-level object's
 * closing brace is the only "}" at column 0 ("\n}").
 */

const fs = require("node:fs");

const DISCORD_EPOCH = 1420070400000n;

const idToTimestamp = id => new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));

/** Top-level message IDs, in file order (newest first). */
function scanIds(text) {
    const ids = [];
    const re = /\n {4}"id": "(\d+)"/g;
    let m;
    while ((m = re.exec(text)) !== null) ids.push(m[1]);
    return ids;
}

/** Slice off everything after the last complete top-level object. */
function validPrefix(text) {
    const lastBrace = text.lastIndexOf("\n}");
    return lastBrace === -1 ? "" : text.slice(0, lastBrace + 2);
}

/**
 * Non-destructive summary of a previous export for the resume dialog.
 * @returns {{ count: number, oldestId: string, oldestTimestamp: string } | null}
 */
function inspect(path) {
    const ids = scanIds(validPrefix(fs.readFileSync(path, "utf-8")));
    if (ids.length === 0) return null;
    const oldestId = ids[ids.length - 1];
    return { count: ids.length, oldestId, oldestTimestamp: idToTimestamp(oldestId).toISOString() };
}

/**
 * Repair a file in place so new messages can be appended: drop the closing "]"
 * and any half-written trailing object, leaving it ending at the last complete
 * message. Returns the oldest surviving message ID to resume below.
 * @returns {{ oldestId: string | null, count: number }}
 */
function prepareAppend(path) {
    const text = fs.readFileSync(path, "utf-8");
    const valid = validPrefix(text);
    if (valid === "") {
        fs.writeFileSync(path, "[\n");
        return { oldestId: null, count: 0 };
    }
    fs.truncateSync(path, Buffer.byteLength(valid, "utf-8"));
    const ids = scanIds(valid);
    return { oldestId: ids[ids.length - 1], count: ids.length };
}

module.exports = { idToTimestamp, inspect, prepareAppend };
