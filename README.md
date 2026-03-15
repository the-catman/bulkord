# Bulkord

Bulk Delete Discord Messages.

## Warning

Using self-bots or user tokens violates Discord's Terms of Service and may result in account termination. This tool is unsafe for script kiddies and should be used entirely at your own risk.

## Overview

Bulkord allows you to search and bulk delete your own Discord messages. It's available as a desktop app (Electron) or a CLI tool.

The tool operates in two modes: Search mode retrieves messages and stores them locally, while delete mode reads previously stored messages and deletes them from Discord.

Searching can be filtered by author ID, channel ID, message content, and minimum or maximum message IDs. After each search or delete action, a randomized cooldown is applied to reduce the likelihood of triggering rate limits.

Running a Discord client during the operation is strongly recommended, as this reduces the risk of termination. Sending messages while the script is running should be avoided.

## Desktop App

Run the portable `Bulkord.exe`, no installation required.

The app has five panels:

- **Configure:** set your auth token, author ID, guild/channel IDs, and optional filters (message ID range, content, skip pinned).
- **Search:** search for messages and store them in the local database.
- **Delete:** delete all messages currently stored in the database.
- **Extract:** import messages from a Discord data package into the database (see [Discord Data Package Extraction](#discord-data-package-extraction)).
- **Status:** view current configuration and database message count. Includes a **Data Management** section to clear the config file or database.

Config and database are stored in `%APPDATA%/bulkord/`.

#### Data Management

In the **Status** panel, you can use the **Data Management** section to clear your configuration or database:

- **Clear Config:** deletes the `config.json` file (double-click to confirm)
- **Clear Database:** deletes the `messages.db` file (double-click to confirm)

### Building from Source

```
npm install
npm run build
```

The portable exe is output to `dist/Bulkord.exe`.

To run in development without building:

```
npm start
```

## CLI Usage

```
npm install
node config.js
```

Edit the generated `config.json` with the appropriate values, then run:

```
node main.js
```

Set `mode` to `"search"` to find messages, then `"delete"` to remove them.

## Search Mode

In search mode, messages are retrieved in batches of roughly 25 and written to the `messages.db` SQLite database.

## Delete Mode

In delete mode, rows inside the database are processed sequentially (one by one). Although the script can be safely stopped at any time using Ctrl+C, any messages that were being processed when it was interrupted may be retried on the next run.

Note that you must still have access to the guilds and channels in order to delete messages. Messages from servers or channels you no longer have access to cannot be deleted.

## Configuration

| Field | Required | Description |
|---|---|---|
| `authToken` | Yes | Discord user token |
| `authorId` | No | Your Discord user ID (leave blank to search for everyone) |
| `guildId` | Search only | Server ID (leave blank for DMs) |
| `channelId` | Search only | Channel ID (leave blank to search the entire server) |
| `startMessageId` | No | Only search messages after this ID |
| `endMessageId` | No | Only search messages before this ID |
| `content` | No | Filter by message content |
| `skipPinned` | No | If enabled, pinned messages will not be added to the database |

## Discord Data Package Extraction

Bulkord can also delete messages extracted from your official Discord data package.

### Desktop App

Open the **Extract** panel, click **Browse** to select the `Messages` folder from your Discord data package, then click **Start Extraction**. Progress is shown as each channel is processed. After extraction, switch to the **Delete** panel to delete the messages.

### CLI

Place your Discord data export in the same directory as `extract.js`. The folder must be named `Package` and must contain a subfolder named `Messages`. Then run:

```
node extract.js
```

This extracts all messages into the database. After extraction, switch to delete mode to delete the messages.

## Acknowledgements

Thanks to [Victornpb](https://github.com/victornpb/undiscord) for his work on undiscord. Some of the code in this project is taken directly from his work.
