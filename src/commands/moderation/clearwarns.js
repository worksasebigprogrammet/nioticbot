// Commande d'effacement des avertissements - Supprime tous les avertissements d'un membre
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearwarns')
        .setDescription('Effacer les avertissements d\'un membre')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre dont vous voulez effacer les avertissements')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { client, guild, member } = interaction;
        const targetUser = interaction.options.getUser('user');

        try {
            // Récupérer les données de l'utilisateur depuis la base de données
            const userData = await User.findOne({ guildId: guild.id, userId: targetUser.id });

            // Vérifier si l'utilisateur a des avertissements à effacer
            if (!userData || !userData.warnings || userData.warnings.length === 0) {
                return interaction.reply({
                    embeds: [errorEmbed(`**${targetUser.tag}** n'a aucun avertissement à effacer.`)],
                    ephemeral: true
                });
            }

            // Sauvegarder le nombre d'avertissements avant la suppression
            const warningCount = userData.warnings.length;

            // Vider le tableau des avertissements dans le modèle User
            await User.findOneAndUpdate(
                { guildId: guild.id, userId: targetUser.id },
                { $set: { warnings: [] } }
            );

            // Journaliser l'action de modération
            client.systems?.logs?.log(guild.id, 'moderation.clearwarns', {
                user: targetUser,
                moderator: member.user,
                reason: `${warningCount} avertissement(s) effacé(s)`
            });

            // Journaliser dans les logs admin
            await client.systems?.adminLogs?.logAdminAction(guild, member.user, 'CLEARWARNS', targetUser, { reason: `${warningCount} avertissement(s) effacé(s)` });

            // Répondre avec un embed de succès
            return interaction.reply({
                embeds: [successEmbed(
                    `Tous les avertissements de **${targetUser.tag}** ont été effacés.\n` +
                    `**${warningCount}** avertissement(s) supprimé(s).`
                )]
            });

        } catch (error) {
            Logger.error(`Erreur lors de l'effacement des avertissements de ${targetUser.tag}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors de l'effacement des avertissements: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
