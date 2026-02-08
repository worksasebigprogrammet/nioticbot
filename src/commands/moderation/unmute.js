// Commande de retrait de la mise en sourdine - Retire le timeout d'un membre
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Démuter un membre')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre à démuter')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { client, guild, member } = interaction;
        const targetUser = interaction.options.getUser('user');

        // Récupérer le membre du serveur
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        // Vérifier que le membre existe bien dans le serveur
        if (!targetMember) {
            return interaction.reply({
                embeds: [errorEmbed('Ce membre n\'est pas dans le serveur.')],
                ephemeral: true
            });
        }

        // Vérifier que le membre est actuellement en sourdine
        if (!targetMember.isCommunicationDisabled()) {
            return interaction.reply({
                embeds: [errorEmbed('Ce membre n\'est pas actuellement en sourdine.')],
                ephemeral: true
            });
        }

        // Vérifier que le bot peut modifier le timeout de ce membre
        if (!targetMember.moderatable) {
            return interaction.reply({
                embeds: [errorEmbed('Je ne peux pas démuter ce membre. Vérifiez ma position dans la hiérarchie des rôles.')],
                ephemeral: true
            });
        }

        // Créer le numéro de cas en incrémentant le dernier cas du serveur
        const lastCase = await Case.findOne({ guildId: guild.id }).sort({ caseId: -1 });
        const caseId = lastCase ? lastCase.caseId + 1 : 1;

        try {
            // Retirer le timeout (passer null pour supprimer)
            await targetMember.timeout(null, `[${member.user.tag}] Démute`);

            // Mettre à jour les anciens cas de mute comme inactifs
            await Case.updateMany(
                { guildId: guild.id, userId: targetUser.id, type: 'mute', active: true },
                { active: false }
            );

            // Enregistrer le cas de démute dans la base de données
            await Case.create({
                guildId: guild.id,
                caseId: caseId,
                type: 'unmute',
                userId: targetUser.id,
                userTag: targetUser.tag,
                moderatorId: member.id,
                moderatorTag: member.user.tag,
                reason: 'Démute manuel',
                timestamp: new Date(),
                active: true
            });

            // Journaliser l'action de modération
            client.systems?.logs?.log(guild.id, 'moderation.unmute', {
                user: targetUser,
                moderator: member.user,
                reason: 'Démute manuel',
                caseId: caseId
            });

            // Répondre avec un embed de succès
            return interaction.reply({
                embeds: [successEmbed(
                    `**${targetUser.tag}** a été démuté avec succès.\n` +
                    `**Cas #${caseId}**`
                )]
            });

        } catch (error) {
            Logger.error(`Erreur lors du démute de ${targetUser.tag}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors du démute: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
