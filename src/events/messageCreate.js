// Événement déclenché à chaque nouveau message
// Gère : auto-modération, XP, compteur de messages
const Logger = require('../utils/logger');
const Guild = require('../../database/models/guild');

module.exports = {
    name: 'messageCreate',
    once: false,

    async execute(message, client) {
        // Ignorer les messages de bots et les DMs
        if (message.author.bot || !message.guild) return;

        try {
            // Récupération des paramètres du serveur
            const guildSettings = await Guild.findOne({ guildId: message.guild.id });

            // Auto-modération
            if (guildSettings?.modules?.automod && client.systems.automod) {
                const blocked = await client.systems.automod.processMessage(message, guildSettings);
                if (blocked) return; // Message bloqué par l'automod
            }

            // Système de niveaux (XP par message)
            if (guildSettings?.modules?.levels && client.systems.levels) {
                await client.systems.levels.processMessage(message, guildSettings);
            }

            // Système d'économie (gains par message)
            if (guildSettings?.modules?.economy && client.systems.economy) {
                await client.systems.economy.processMessage(message, guildSettings);
            }

        } catch (error) {
            Logger.error('Erreur messageCreate:', error);
        }
    },
};
