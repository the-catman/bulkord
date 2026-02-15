const fs = require("node:fs");

fs.writeFileSync("config.json", `{
    "authToken": "",
    "authorId": "",
    "guildId": "",
    "channelId": "",
    "mode": "search",
    "minId": "",
    "maxId": "",
    "content": ""
}`);