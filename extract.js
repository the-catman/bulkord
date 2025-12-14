const fs = require("node:fs");
const JSONbig = require("json-bigint")({ useNativeBigInt: true });

fs.mkdirSync("./messages", { recursive: true });

const folders = fs.readdirSync("./Package/Messages").filter(folder => folder.startsWith("c"));

for (const folder of folders) {
    const channelId = JSON.parse(fs.readFileSync(`./Package/Messages/${folder}/channel.json`, "utf-8")).id;
    const messages = JSONbig.parse(fs.readFileSync(`./Package/Messages/${folder}/messages.json`, "utf-8"))
        .map(message => [channelId, String(message.ID)]);

    if (messages.length === 0) continue;

    fs.writeFileSync(`./messages/${channelId}_package.json`, JSON.stringify(messages));
}