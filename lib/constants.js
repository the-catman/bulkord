/**
 * Shared constants used across the application.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v9';

// Message types that cannot be deleted by users
const UNDELETABLE_MESSAGE_TYPES = [1, 2, 3, 4, 5, 21];

// Default configuration template
const DEFAULT_CONFIG = {
    authToken: "",
    authorId: "",
    guildId: "",
    channelId: "",
    mode: "search",
    startMessageId: "",
    endMessageId: "",
    content: "",
    skipPinned: false
};

module.exports = {
    DISCORD_API_BASE,
    UNDELETABLE_MESSAGE_TYPES,
    DEFAULT_CONFIG
};
