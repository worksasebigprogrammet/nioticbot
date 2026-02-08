// Commande de mise en sourdine - Utilise le timeout intégré de Discord pour rendre muet un membre
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');
const ms = require('ms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Rendre muet un membre')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre à rendre muet')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Durée de la mise en sourdine (ex: 10m, 1h, 1d)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('La raison de la mise en sourdine')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { client, guild, member } = interaction;
        const targetUser = interaction.options.getUser('user');
        const durationStr = interaction.options.getString('duration');
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
                embeds: [errorEmbed('Vous ne pouvez pas vous rendre muet vous-même.')],
                ephemeral: true
            });
        }

        // Vérifier que le bot peut appliquer un timeout à ce membre
        if (!targetMember.moderatable) {
            return interaction.reply({
                embeds: [errorEmbed('Je ne peux pas rendre muet ce membre. Vérifiez ma position dans la hiérarchie des rôles.')],
                ephemeral: true
            });
        }

        // Vérifier la hiérarchie des rôles entre le modérateur et la cible
        if (targetMember.roles.highest.position >= member.roles.highest.position) {
            return interaction.reply({
                embeds: [errorEmbed('Vous ne pouvez pas rendre muet un membre ayant un rôle supérieur ou égal au vôtre.')],
                ephemeral: true
            });
        }

        // Analyser la durée fournie
        const duration = ms(durationStr);
        if (!duration || duration < 0) {
            return interaction.reply({
                embeds: [errorEmbed('Durée invalide. Utilisez un format valide (ex: 10m, 1h, 1d).')],
                ephemeral: true
            });
        }

        // Vérifier la limite de timeout Discord (28 jours maximum)
        const maxTimeout = ms('28d');
        if (duration > maxTimeout) {
            return interaction.reply({
                embeds: [errorEmbed('La durée maximale de mise en sourdine est de 28 jours.')],
                ephemeral: true
            });
        }

        // Créer le numéro de cas en incrémentant le dernier cas du serveur
        const lastCase = await Case.findOne({ guildId: guild.id }).sort({ caseId: -1 });
        const caseId = lastCase ? lastCase.caseId + 1 : 1;

        // Envoyer un message privé à l'utilisateur avant la mise en sourdine
        try {
            await targetUser.send({
                embeds: [moderationEmbed({
                    title: `Vous avez été rendu muet dans ${guild.name}`,
                    reason: reason,
                    duration: durationStr,
                    moderator: member.user.tag
                })]
            });
        } catch (err) {
            // Impossible d'envoyer un MP à l'utilisateur (MPs désactivés)
            Logger.warn(`Impossible d'envoyer un MP à ${targetUser.tag} pour la mise en sourdine.`);
        }

        try {
            // Appliquer le timeout Discord intégré
            await targetMember.timeout(duration, `[${member.user.tag}] ${reason}`);

            // Enregistrer le cas dans la base de données
            await Case.create({
                guildId: guild.id,
                caseId: caseId,
                type: 'mute',
                userId: targetUser.id,
                userTag: targetUser.tag,
                moderatorId: member.id,
                moderatorTag: member.user.tag,
                reason: reason,
                duration: durationStr,
                timestamp: new Date(),
                active: true
            });

            // Journaliser l'action de modération
            client.systems?.logs?.log(guild.id, 'moderation.mute', {
                user: targetUser,
                moderator: member.user,
                reason: reason,
                caseId: caseId,
                duration: durationStr
            });

            // Répondre avec un embed de succès
            return interaction.reply({
                embeds: [successEmbed(
                    `**${targetUser.tag}** a été rendu muet pour **${durationStr}**.\n` +
                    `**Raison:** ${reason}\n` +
                    `**Cas #${caseId}**`
                )]
            });

        } catch (error) {
            Logger.error(`Erreur lors de la mise en sourdine de ${targetUser.tag}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors de la mise en sourdine: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
