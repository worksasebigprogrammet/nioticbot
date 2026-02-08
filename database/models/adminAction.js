// Modèle pour stocker toutes les actions administratives
const { Schema, model } = require('mongoose');

const adminActionSchema = new Schema({
    guildId: { type: String, required: true, index: true },
    adminId: { type: String, required: true, index: true },
    adminTag: { type: String, required: true },
    action: {
        type: String,
        required: true,
        enum: ['BAN', 'KICK', 'MUTE', 'WARN', 'UNBAN', 'UNMUTE', 'CLEARWARNS', 'CONFIG_CHANGE', 'ROLE_CHANGE', 'CHANNEL_EDIT', 'ANTIRAID_TRIGGER', 'SETUP_RUN', 'MODULE_TOGGLE', 'LOG_CONFIG', 'PURGE', 'SOFTBAN']
    },
    targetId: { type: String, default: null },
    targetTag: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true }
});

adminActionSchema.index({ guildId: 1, timestamp: -1 });

module.exports = model('AdminAction', adminActionSchema);
