// Événement déclenché quand un membre est mis à jour (rôles, pseudo, etc.)
const Logger = require('../utils/logger');

module.exports = {
    name: 'guildMemberUpdate',
    once: false,

    async execute(oldMember, newMember, client) {
        try {
            if (!client.systems.logs) return;

            // Vérification des changements de rôles
            const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
            const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

            for (const [, role] of addedRoles) {
                await client.systems.logs.log(newMember.guild.id, 'member.role_add', {
                    user: newMember.user,
                    role: role.toString(),
                    roleName: role.name
                });
            }

            for (const [, role] of removedRoles) {
                await client.systems.logs.log(newMember.guild.id, 'member.role_remove', {
                    user: newMember.user,
                    role: role.toString(),
                    roleName: role.name
                });
            }

            // Vérification du changement de pseudo
            if (oldMember.nickname !== newMember.nickname) {
                await client.systems.logs.log(newMember.guild.id, 'member.nickname', {
                    user: newMember.user,
                    oldNickname: oldMember.nickname || newMember.user.username,
                    newNickname: newMember.nickname || newMember.user.username
                });
            }

            // Vérification du changement d'avatar serveur
            if (oldMember.avatar !== newMember.avatar) {
                await client.systems.logs.log(newMember.guild.id, 'member.avatar', {
                    user: newMember.user,
                    oldAvatar: oldMember.displayAvatarURL(),
                    newAvatar: newMember.displayAvatarURL()
                });
            }

        } catch (error) {
            Logger.error('Erreur guildMemberUpdate:', error);
        }
    },
};
