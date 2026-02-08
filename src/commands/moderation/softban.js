// Commande de softban - Ban puis unban immédiat pour nettoyer les messages d'un membre
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Ban + unban immédiat (nettoie les messages)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre à softban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('La raison du softban')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { client, guild, member } = interaction;
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'Aucune raison fournie';

        // Récupérer le membre du serveur
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        // Vérifier que l'utilisateur cible n'est pas le modérateur lui-même
        if (targetUser.id === member.id) {
            return interaction.reply({
                embeds: [errorEmbed('Vous ne pouvez pas vous softban vous-même.')],
                ephemeral: true
            });
        }

        // Vérifier que le bot peut bannir ce membre
        if (targetMember) {
            if (!targetMember.bannable) {
                return interaction.reply({
                    embeds: [errorEmbed('Je ne peux pas softban ce membre. Vérifiez ma position dans la hiérarchie des rôles.')],
                    ephemeral: true
                });
            }

            // Vérifier la hiérarchie des rôles entre le modérateur et la cible
            if (targetMember.roles.highest.position >= member.roles.highest.position) {
                return interaction.reply({
                    embeds: [errorEmbed('Vous ne pouvez pas softban un membre ayant un rôle supérieur ou égal au vôtre.')],
                    ephemeral: true
                });
            }
        }

        // Créer le numéro de cas en incrémentant le dernier cas du serveur
        const lastCase = await Case.findOne({ guildId: guild.id }).sort({ caseId: -1 });
        const caseId = lastCase ? lastCase.caseId + 1 : 1;

        // Envoyer un message privé à l'utilisateur avant le softban
        try {
            await targetUser.send({
                embeds: [moderationEmbed({
                    title: `Vous avez été softban de ${guild.name}`,
                    reason: reason,
                    moderator: member.user.tag
                })]
            });
        } catch (err) {
            // Impossible d'envoyer un MP à l'utilisateur (MPs désactivés)
            Logger.warn(`Impossible d'envoyer un MP à ${targetUser.tag} pour le softban.`);
        }

        try {
            // Bannir le membre en supprimant 7 jours de messages (604800 secondes)
            await guild.members.ban(targetUser.id, {
                reason: `[Softban par ${member.user.tag}] ${reason}`,
                deleteMessageSeconds: 604800
            });

            // Débannir immédiatement après le bannissement
            await guild.members.unban(targetUser.id, `Softban par ${member.user.tag} - Débannissement automatique`);

            // Enregistrer le cas dans la base de données
            await Case.create({
                guildId: guild.id,
                caseId: caseId,
                type: 'softban',
                userId: targetUser.id,
                userTag: targetUser.tag,
                moderatorId: member.id,
                moderatorTag: member.user.tag,
                reason: reason,
                timestamp: new Date(),
                active: true
            });

            // Journaliser l'action de modération
            client.systems?.logs?.log(guild.id, 'moderation.softban', {
                user: targetUser,
                moderator: member.user,
                reason: reason,
                caseId: caseId
            });

            // Journaliser dans les logs admin
            await client.systems?.adminLogs?.logAdminAction(guild, member.user, 'SOFTBAN', targetUser, { reason, caseId });

            // Répondre avec un embed de succès
            return interaction.reply({
                embeds: [successEmbed(
                    `**${targetUser.tag}** a été softban (messages des 7 derniers jours supprimés).\n` +
                    `**Raison:** ${reason}\n` +
                    `**Cas #${caseId}**`
                )]
            });

        } catch (error) {
            Logger.error(`Erreur lors du softban de ${targetUser.tag}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors du softban: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
