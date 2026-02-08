// Événement déclenché quand un membre rejoint le serveur
// Gère : logs, anti-raid, auto-rôles, message de bienvenue
const Logger = require('../utils/logger');
const Guild = require('../../database/models/guild');

module.exports = {
    name: 'guildMemberAdd',
    once: false,

    async execute(member, client) {
        try {
            const guildSettings = await Guild.findOne({ guildId: member.guild.id });

            // Système Anti-Raid : vérification des joins
            if (guildSettings?.modules?.antiraid && client.systems.antiraid) {
                await client.systems.antiraid.handleJoin(member, guildSettings);
            }

            // Log du join
            if (client.systems.logs) {
                const accountAge = Date.now() - member.user.createdTimestamp;
                const accountAgeDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));

                await client.systems.logs.log(member.guild.id, 'member.join', {
                    user: member.user,
                    accountCreated: member.user.createdAt,
                    accountAge: `${accountAgeDays} jours`,
                    memberCount: member.guild.memberCount,
                    suspicious: accountAgeDays < 7
                });
            }

            // Auto-rôles à l'arrivée
            if (guildSettings?.modules?.autoroles && guildSettings?.autoroles?.joinRoles?.length > 0) {
                try {
                    for (const roleId of guildSettings.autoroles.joinRoles) {
                        const role = member.guild.roles.cache.get(roleId);
                        if (role) {
                            await member.roles.add(role);
                        }
                    }
                } catch (error) {
                    Logger.error(`Erreur auto-rôle pour ${member.user.tag}:`, error);
                }
            }

        } catch (error) {
            Logger.error('Erreur guildMemberAdd:', error);
        }
    },
};
