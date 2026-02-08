// Événement déclenché quand un membre est banni
// Utilisé pour détecter les actions admin excessives (anti-raid)
const Logger = require('../utils/logger');

module.exports = {
    name: 'guildBanAdd',
    once: false,

    async execute(ban, client) {
        try {
            // Vérification anti-raid (admin compromis)
            if (client.systems.antiraid) {
                await client.systems.antiraid.handleAdminAction(ban.guild, 'ban');
            }
        } catch (error) {
            Logger.error('Erreur guildBanAdd:', error);
        }
    },
};
