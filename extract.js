/**
 * CLI tool to extract messages from Discord data package.
 */

const { extractFromPackage } = require("./lib/extractor");

const dbPath = process.argv[2] || "messages.db";
const packagePath = process.argv[3] || "./Package/Messages";

const result = extractFromPackage(packagePath, dbPath, (current, totalFolders, messagesExtracted) => {
    process.stdout.write(`\rProcessing ${current}/${totalFolders} channels (${messagesExtracted} messages)...`);
});

if (result.success) {
    console.log(`\nExtracted ${result.messages} messages from ${result.channels} channels into ${dbPath}.`);
} else {
    console.error(`Error: ${result.error}`);
    process.exit(1);
}
