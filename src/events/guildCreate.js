// Événement déclenché quand le bot rejoint un nouveau serveur
// Crée automatiquement la configuration par défaut avec tous les modules activés
const Logger = require('../utils/logger');
const Guild = require('../../database/models/guild');

module.exports = {
    name: 'guildCreate',
    once: false,

    async execute(guild, client) {
        try {
            // Vérifier si une configuration existe déjà
            const existing = await Guild.findOne({ guildId: guild.id });
            if (existing) {
                Logger.info(`Configuration existante trouvée pour ${guild.name} (${guild.id})`);
                return;
            }

            // Créer la configuration par défaut avec tous les modules activés
            await Guild.create({
                guildId: guild.id,
                language: 'fr',
                modules: {
                    moderation: true,
                    logs: true,
                    antiraid: true,
                    automod: true,
                    tickets: true,
                    levels: true,
                    economy: true,
                    music: true,
                    voiceTracking: true,
                    giveaways: true,
                    autoroles: true,
                    suggestions: true,
                    stats: true,
                    backup: true
                }
            });

            Logger.info(`Configuration créée pour le serveur ${guild.name} (${guild.id}) avec tous les modules activés`);

        } catch (error) {
            Logger.error(`Erreur lors de la création de la configuration pour ${guild.name}:`, error);
        }
    },
};
