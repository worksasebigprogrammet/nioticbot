// Système de journalisation des actions administratives
const { EmbedBuilder } = require('discord.js');
const Guild = require('../../database/models/guild');
const AdminAction = require('../../database/models/adminAction');
const Logger = require('../utils/logger');

class AdminLogsSystem {
    constructor(client) {
        this.client = client;
    }

    // Log une action administrative
    async logAdminAction(guild, admin, action, target, details = {}) {
        try {
            await AdminAction.create({
                guildId: guild.id,
                adminId: admin.id,
                adminTag: admin.tag,
                action,
                targetId: target?.id || null,
                targetTag: target?.tag || null,
                details,
                timestamp: new Date()
            });

            // Envoyer dans le salon de logs admin si configuré
            const guildConfig = await Guild.findOne({ guildId: guild.id });
            const adminLogChannelId = guildConfig?.logs?.moderation?.channelId;
            if (!adminLogChannelId) return;

            const channel = guild.channels.cache.get(adminLogChannelId);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor(this._getColor(action))
                .setTitle(`${this._getEmoji(action)} Action Admin : ${action}`)
                .addFields(
                    { name: '👤 Administrateur', value: `${admin.tag} (<@${admin.id}>)`, inline: true },
                    { name: '🎯 Cible', value: target ? `${target.tag} (<@${target.id}>)` : 'Aucune', inline: true },
                    { name: '⏰ Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setTimestamp();

            if (details.reason) {
                embed.addFields({ name: '📝 Raison', value: details.reason });
            }
            if (details.duration) {
                embed.addFields({ name: '⏱️ Durée', value: details.duration, inline: true });
            }

            await channel.send({ embeds: [embed] });
        } catch (error) {
            Logger.error('Erreur log admin:', error);
        }
    }

    _getColor(action) {
        const colors = { BAN: '#FF0000', KICK: '#FF6600', MUTE: '#FFAA00', WARN: '#FFFF00', UNBAN: '#00FF00', UNMUTE: '#00FFAA', CONFIG_CHANGE: '#0099FF', ROLE_CHANGE: '#9B59B6', CHANNEL_EDIT: '#3498DB', ANTIRAID_TRIGGER: '#E74C3C', PURGE: '#FF6600', SOFTBAN: '#FF4444' };
        return colors[action] || '#95A5A6';
    }

    _getEmoji(action) {
        const emojis = { BAN: '🔨', KICK: '👢', MUTE: '🔇', WARN: '⚠️', UNBAN: '🔓', UNMUTE: '🔊', CONFIG_CHANGE: '⚙️', ROLE_CHANGE: '🎭', CHANNEL_EDIT: '📝', ANTIRAID_TRIGGER: '🚨', PURGE: '🧹', SOFTBAN: '👋' };
        return emojis[action] || '📋';
    }

    // Générer un rapport d'activité administrative
    async generateReport(guildId, startDate, endDate, adminId = null) {
        const query = { guildId, timestamp: { $gte: startDate, $lte: endDate } };
        if (adminId) query.adminId = adminId;

        const actions = await AdminAction.find(query).sort({ timestamp: -1 });
        const stats = { total: actions.length, byAction: {}, byAdmin: {} };

        for (const action of actions) {
            stats.byAction[action.action] = (stats.byAction[action.action] || 0) + 1;
            stats.byAdmin[action.adminTag] = (stats.byAdmin[action.adminTag] || 0) + 1;
        }

        return { actions, stats, period: { start: startDate, end: endDate } };
    }
}

module.exports = AdminLogsSystem;
