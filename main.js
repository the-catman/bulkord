/**
 * Re-export from lib/discord.js for backward compatibility.
 * A lot of code is taken from https://github.com/victornpb/undiscord/blob/master/src/undiscord-core.js
 */

const { createInstance } = require("./lib/discord");

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
