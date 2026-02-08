// Commande d'expulsion - Permet d'expulser un membre du serveur
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre à expulser')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('La raison de l\'expulsion')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { client, guild, member } = interaction;
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'Aucune raison fournie';

        // Récupérer le membre du serveur
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        // Vérifier que le membre existe bien dans le serveur
        if (!targetMember) {
            return interaction.reply({
                embeds: [errorEmbed('Ce membre n\'est pas dans le serveur.')],
                ephemeral: true
            });
        }

        // Vérifier que l'utilisateur cible n'est pas le modérateur lui-même
        if (targetUser.id === member.id) {
            return interaction.reply({
                embeds: [errorEmbed('Vous ne pouvez pas vous expulser vous-même.')],
                ephemeral: true
            });
        }

        // Vérifier que le bot peut expulser ce membre
        if (!targetMember.kickable) {
            return interaction.reply({
                embeds: [errorEmbed('Je ne peux pas expulser ce membre. Vérifiez ma position dans la hiérarchie des rôles.')],
                ephemeral: true
            });
        }

        // Vérifier la hiérarchie des rôles entre le modérateur et la cible
        if (targetMember.roles.highest.position >= member.roles.highest.position) {
            return interaction.reply({
                embeds: [errorEmbed('Vous ne pouvez pas expulser un membre ayant un rôle supérieur ou égal au vôtre.')],
                ephemeral: true
            });
        }

        // Créer le numéro de cas en incrémentant le dernier cas du serveur
        const lastCase = await Case.findOne({ guildId: guild.id }).sort({ caseId: -1 });
        const caseId = lastCase ? lastCase.caseId + 1 : 1;

        // Envoyer un message privé à l'utilisateur avant l'expulsion
        try {
            await targetUser.send({
                embeds: [moderationEmbed({
                    title: `Vous avez été expulsé de ${guild.name}`,
                    reason: reason,
                    moderator: member.user.tag
                })]
            });
        } catch (err) {
            // Impossible d'envoyer un MP à l'utilisateur (MPs désactivés)
            Logger.warn(`Impossible d'envoyer un MP à ${targetUser.tag} pour l'expulsion.`);
        }

        try {
            // Exécuter l'expulsion
            await targetMember.kick(`[${member.user.tag}] ${reason}`);

            // Enregistrer le cas dans la base de données
            await Case.create({
                guildId: guild.id,
                caseId: caseId,
                type: 'kick',
                userId: targetUser.id,
                userTag: targetUser.tag,
                moderatorId: member.id,
                moderatorTag: member.user.tag,
                reason: reason,
                timestamp: new Date(),
                active: true
            });

            // Journaliser l'action de modération
            client.systems?.logs?.log(guild.id, 'moderation.kick', {
                user: targetUser,
                moderator: member.user,
                reason: reason,
                caseId: caseId
            });

            // Journaliser dans les logs admin
            await client.systems?.adminLogs?.logAdminAction(guild, member.user, 'KICK', targetUser, { reason, caseId });

            // Répondre avec un embed de succès
            return interaction.reply({
                embeds: [successEmbed(
                    `**${targetUser.tag}** a été expulsé du serveur.\n` +
                    `**Raison:** ${reason}\n` +
                    `**Cas #${caseId}**`
                )]
            });

        } catch (error) {
            Logger.error(`Erreur lors de l'expulsion de ${targetUser.tag}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors de l'expulsion: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
