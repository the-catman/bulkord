/**
 * Re-export from lib/discord.js for backward compatibility.
 * A lot of code is taken from https://github.com/victornpb/undiscord/blob/master/src/undiscord-core.js
 */

const fs = require("node:fs");

const { createInstance } = require("./lib/discord");
const { prepareAppend } = require("./lib/exportfile");

module.exports = { createInstance };

if (require.main === module) {
    const config = require("./config.json");
    const instance = createInstance(config);

    (async () => {
        if (config.mode === "search") {
            await instance.handleSearchMode();
        } else if (config.mode === "export") {
            const outputPath = config.exportPath || "export.json";
            let options = {};
            if (config.exportResume && fs.existsSync(outputPath)) {
                const { oldestId, count } = prepareAppend(outputPath);
                if (oldestId) {
                    options = { startCursor: (BigInt(oldestId) - 1n).toString(), append: true, leadingComma: count > 0 };
                    console.log(`Resuming export below ${count} existing messages.`);
                }
            }
            const exported = await instance.handleExportMode(outputPath, options);
            console.log(`\nExported ${exported} messages to ${outputPath}.`);
        } else if (config.mode === "delete") {
            await instance.handleDeleteMode();
        }
        instance.close();
    })();
}
