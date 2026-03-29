/**
 * Extract messages from Discord data package into the database.
 */

const fs = require("node:fs");
const path = require("node:path");
const JSONbig = require("json-bigint")({ useNativeBigInt: true });
const { initDatabase } = require("./database");

/**
 * Extract messages from a Discord data package.
 * @param {string} packagePath - Path to the Messages folder in the data package
 * @param {string} dbPath - Path to the SQLite database file
 * @param {Function} [progressCallback] - Optional callback(current, totalFolders, messagesExtracted)
 * @returns {{ success: boolean, messages?: number, channels?: number, error?: string }}
 */
function extractFromPackage(packagePath, dbPath, progressCallback) {
    const { insertMany, close } = initDatabase(dbPath);

    try {
        const folders = fs.readdirSync(packagePath).filter(f => f.startsWith("c"));
        
        if (folders.length === 0) {
            close();
            return { 
                success: false, 
                error: "No channel folders found. Make sure you selected the Messages folder from your Discord data package." 
            };
        }

        let total = 0;
        
        for (let i = 0; i < folders.length; i++) {
            const folder = folders[i];
            const channelFile = path.join(packagePath, folder, "channel.json");
            const messagesFile = path.join(packagePath, folder, "messages.json");

            if (!fs.existsSync(channelFile) || !fs.existsSync(messagesFile)) continue;

            const channelId = JSON.parse(fs.readFileSync(channelFile, "utf-8")).id;
            const messages = JSONbig.parse(fs.readFileSync(messagesFile, "utf-8"))
                .map(message => [channelId, String(message.ID)]);

            if (messages.length === 0) continue;

            insertMany(messages);
            total += messages.length;

            if (progressCallback) {
                progressCallback(i + 1, folders.length, total);
            }
        }

        close();
        return { success: true, messages: total, channels: folders.length };
    } catch (err) {
        close();
        return { success: false, error: err.message };
    }
}

module.exports = { extractFromPackage };
