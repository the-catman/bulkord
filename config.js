const fs = require("node:fs");

fs.writeFileSync("config.json", `{
    "authToken": "",
    "authorId": "",
    "guildId": "",
    "channelId": "",
    "mode": "search",
    "startMessageId": "",
    "endMessageId": "",
    "content": "",
    "skipPinned": false
}`);