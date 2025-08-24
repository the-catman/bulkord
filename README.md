# Bulkord - Bulk Delete Discord Messages

⚠️ Work in Progress

Discretion: Using self-bots or user tokens violates Discord's Terms of Service and may result in account termination.

This tool is not safe for script kiddies. Use at your own risk.

## Info

\- This tool lets you search and delete your own messages in bulk from Discord.

\- It operates in two modes: Search (search messages only) or Delete (delete messages from stored files).

\- It supports filtering by author, channel, message content, and message IDs (min/max) to narrow down what messages are searched or deleted.

\- It's recommended that your Discord client is running while this is happening (maintains a WebSocket gateway to reduce termination risk). It's also recommended that you do not **send messages**, as this is known to trigger Discord's anti-bot.

\- After each search/delete, there is a randomized cooldown that exists to prevent tripping Discord's ratelimits. Despite this, the tool automatically handles rate limits and will retry searching or deleting messages if a 429 response is received.

(Search cooldown: 500ms - 1500ms, deletion cooldown: 1250ms - 2000ms).

## Search mode

\- In search mode, messages are first searched in bulk and stored in the `./messages` folder, alongside their respective channel IDs. Each search yields around 25 messages, which are then stored in a file in `./messages`.

\- The reason for this is simply because it's more manageable than storing all messages in a single huge file.

(The name of the file is simply the SHA-256 hash of the file contents).

## Delete mode

\- In delete mode, a file in `./messages` will be picked, and messages in that file are deleted one by one. When a file has run out of messages, it will simply be deleted.

\- You can safely stop the script at any time with Ctrl+C, and progress will be saved automatically.

\- In the event that custom files are put in `./messages`, with number of messages above 100, progress is automatically saved every 100 messages.

\- This protects against losing a large amount of progress if the script is interrupted for whatever reason.

(For normal 25-message files, this counter never triggers because when all messages are deleted, the corresponding file is also deleted, and the counter resets back to 0).

## Coming up

\- Mass deletion using data packages.  
