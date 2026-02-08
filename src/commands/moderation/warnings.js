// Commande de consultation des avertissements - Affiche la liste des avertissements d'un membre
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Voir les avertissements d\'un membre')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre dont vous voulez voir les avertissements')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { guild } = interaction;
        const targetUser = interaction.options.getUser('user');

        try {
            // Récupérer les données de l'utilisateur depuis la base de données
            const userData = await User.findOne({ guildId: guild.id, userId: targetUser.id });

            // Vérifier si l'utilisateur a des avertissements
            if (!userData || !userData.warnings || userData.warnings.length === 0) {
                return interaction.reply({
                    embeds: [successEmbed(`**${targetUser.tag}** n'a aucun avertissement.`)],
                    ephemeral: true
                });
            }

            const warnings = userData.warnings;

            // Construire la liste des avertissements pour l'embed
            const warningList = warnings.map((warn, index) => {
                const date = new Date(warn.date).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return `**#${index + 1}** — ${date}\n` +
                       `> **Raison:** ${warn.reason}\n` +
                       `> **Modérateur:** ${warn.moderatorTag}\n` +
                       `> **Cas:** #${warn.caseId || 'N/A'}`;
            }).join('\n\n');

            // Créer l'embed d'affichage des avertissements
            const embed = new EmbedBuilder()
                .setTitle(`Avertissements de ${targetUser.tag}`)
                .setDescription(warningList)
                .setColor(0xFFA500)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Total: ${warnings.length} avertissement(s)` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            Logger.error(`Erreur lors de la récupération des avertissements de ${targetUser.tag}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors de la récupération des avertissements: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
