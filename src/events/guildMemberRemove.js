// Événement déclenché quand un membre quitte le serveur
const Logger = require('../utils/logger');

module.exports = {
    name: 'guildMemberRemove',
    once: false,

    async execute(member, client) {
        try {
            // Log du départ
            if (client.systems.logs) {
                const roles = member.roles.cache
                    .filter(r => r.id !== member.guild.id)
                    .map(r => r.toString())
                    .join(', ') || 'Aucun';

                await client.systems.logs.log(member.guild.id, 'member.leave', {
                    user: member.user,
                    roles: roles,
                    joinedAt: member.joinedAt,
                    memberCount: member.guild.memberCount
                });
            }
        } catch (error) {
            Logger.error('Erreur guildMemberRemove:', error);
        }
    },
};
