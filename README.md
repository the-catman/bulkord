# Bulkord

Bulk Delete Discord Messages

⚠️ Work in Progress

## Warning

Using self-bots or user tokens violates Discord’s Terms of Service and may result in account termination. This tool is unsafe for script kiddies and should be used entirely at your own risk.

## Overview

Bulkord allows you to search and bulk delete your own Discord messages.

The tool operates in two modes. Search mode retrieves messages and stores them locally without deleting anything. Delete mode reads previously stored message files and deletes those messages from Discord.

Filtering is supported by author ID, channel ID, message content, and minimum or maximum message IDs. After each search or delete action, a randomized cooldown is applied to reduce the likelihood of triggering rate limits. HTTP 429 responses are handled automatically and retried as needed.

Running a Discord client during operation is strongly recommended, as maintaining a WebSocket connection reduces termination risk. Sending messages while the script is running is known to trigger Discord’s anti-bot systems and should be avoided.

## Search Mode

In search mode, messages are retrieved in batches of roughly 25 and written to the `./messages` directory. No deletions occur during this process.

## Delete Mode

In delete mode, files inside the `./messages` directory are processed sequentially. Messages within each file are deleted one by one. Once a file has no remaining messages, it is automatically removed. The script can be safely stopped at any time using Ctrl+C, and progress is saved automatically.

If a custom file in `./messages` contains more than 100 messages, progress is saved every 100 deletions to prevent significant data loss in the event of interruption.

Note that you must still have access to the guilds and channels in order to delete messages. Messages from servers or channels you no longer have access to cannot be deleted.

## Usage

Run `node setup.js` to generate a `config.json` file, then edit that file with the appropriate values. After configuration, run `node main.js`.

If you are only deleting messages, only the token is required. Guild ID, channel ID, and author ID are only necessary when running search mode.

## Special: Discord Data Package Extraction

Bulkord can also delete messages extracted from your official Discord data package.

First, run `npm install` to install the required dependencies. Place your Discord data export in the same directory as `extract.js`. The folder must be named `Package` and must contain a subfolder named `Messages`. Run `node extract.js` to extract all messages into the `./messages` directory. After extraction, run Bulkord in delete mode to delete the messages.
