// Commande de consultation de cas - Permet de consulter les détails d'un cas de modération
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

// Correspondance des types de cas vers des libellés lisibles en français
const caseTypeLabels = {
    ban: 'Bannissement',
    tempban: 'Bannissement temporaire',
    kick: 'Expulsion',
    mute: 'Mise en sourdine',
    unmute: 'Retrait de sourdine',
    warn: 'Avertissement',
    softban: 'Softban'
};

// Correspondance des types de cas vers des couleurs d'embed
const caseTypeColors = {
    ban: 0xFF0000,
    tempban: 0xFF4500,
    kick: 0xFF8C00,
    mute: 0xFFD700,
    unmute: 0x00FF00,
    warn: 0xFFA500,
    softban: 0xFF6347
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('case')
        .setDescription('Consulter un cas de modération')
        .addIntegerOption(option =>
            option
                .setName('id')
                .setDescription('Le numéro du cas à consulter')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { guild } = interaction;
        const caseId = interaction.options.getInteger('id');

        try {
            // Récupérer le cas depuis la base de données
            const caseData = await Case.findOne({ guildId: guild.id, caseId: caseId });

            // Vérifier que le cas existe
            if (!caseData) {
                return interaction.reply({
                    embeds: [errorEmbed(`Le cas #${caseId} n'existe pas dans ce serveur.`)],
                    ephemeral: true
                });
            }

            // Formater la date du cas
            const date = new Date(caseData.timestamp).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            // Déterminer le libellé et la couleur du type de cas
            const typeLabel = caseTypeLabels[caseData.type] || caseData.type;
            const typeColor = caseTypeColors[caseData.type] || 0x808080;

            // Construire l'embed de détails du cas
            const embed = new EmbedBuilder()
                .setTitle(`Cas #${caseData.caseId} — ${typeLabel}`)
                .setColor(typeColor)
                .addFields(
                    {
                        name: 'Utilisateur',
                        value: `${caseData.userTag} (\`${caseData.userId}\`)`,
                        inline: true
                    },
                    {
                        name: 'Modérateur',
                        value: `${caseData.moderatorTag} (\`${caseData.moderatorId}\`)`,
                        inline: true
                    },
                    {
                        name: 'Raison',
                        value: caseData.reason || 'Aucune raison fournie',
                        inline: false
                    },
                    {
                        name: 'Date',
                        value: date,
                        inline: true
                    },
                    {
                        name: 'Statut',
                        value: caseData.active ? 'Actif' : 'Inactif',
                        inline: true
                    }
                )
                .setTimestamp();

            // Ajouter le champ de durée si applicable
            if (caseData.duration) {
                embed.addFields({
                    name: 'Durée',
                    value: caseData.duration,
                    inline: true
                });
            }

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            Logger.error(`Erreur lors de la récupération du cas #${caseId}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors de la récupération du cas: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
