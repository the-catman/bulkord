# Bulkord

Bulk Delete Discord Messages.

## ⚠️ Warning ⚠️

Using self-bots or user tokens violates Discord’s Terms of Service and may result in account termination. This tool is unsafe for script kiddies and should be used entirely at your own risk.

## Overview

Bulkord allows you to search and bulk delete your own Discord messages.

The tool operates in two modes: Search mode retrieves messages and stores them locally, while delete mode reads previously stored messages and deletes them from Discord.

Searching can be filtered by author ID, channel ID, message content, and minimum or maximum message IDs. After each search or delete action, a randomized cooldown is applied to reduce the likelihood of triggering rate limits.

Running a Discord client during the operation is strongly recommended, as this reduces the risk of termination. Sending messages while the script is running should be avoided.

## Search Mode

In search mode, messages are retrieved in batches of roughly 25 and written to the messages.db SQLite database.

## Delete Mode

In delete mode, rows inside the database are processed sequentially (one by one). Although the script can be safely stopped at any time using Ctrl+C, any messages that were being processed when it was interrupted may be retried on the next run.

Note that you must still have access to the guilds and channels in order to delete messages. Messages from servers or channels you no longer have access to cannot be deleted.

## Usage

First, run `npm install` to install the required dependencies. Then, run `node config.js` to generate a `config.json` file, and edit that file with the appropriate values. After configuration, run `node main.js`.

## Configuration

All IDs in the configuration file are expected to be ***strings***, not ints.

`authToken` is the Discord user token (mandatory).

`guildId`, `channelId`, and `authorId` are only necessary when running search mode.

If you are searching in a DM, leave `guildId` blank.

`minId` and `maxId` are optional IDs that specify the message IDs. Messages before and after these IDs respectively won't be searched. They can be left blank unless you want to delete in a specific timeframe. 

## Special: Discord Data Package Extraction

Bulkord can also delete messages extracted from your official Discord data package.

First, place your Discord data export in the same directory as `extract.js`. The folder must be named `Package` and must contain a subfolder named `Messages`. Then, run `node extract.js` to extract all messages into the database. After extraction, run `node main.js` in delete mode to delete the messages.

## A Token of Appreciation

Thanks to Victornpb (https://github.com/victornpb/undiscord) for his idea of automatically deleting discord messages, as these scripts are mostly just an extention of his work.

Some of the code in the deleter is taken verbatim from him.