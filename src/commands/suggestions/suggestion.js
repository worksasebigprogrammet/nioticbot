// Commande pour gérer les suggestions (accepter, refuser, considérer, implémenter)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Suggestion = require('../../../database/models/suggestion');
const logger = require('../../utils/logger');
const { createEmbed } = require('../../utils/embed');

// Correspondance des statuts avec leurs couleurs et libellés
const STATUS_CONFIG = {
    accept: {
        color: '#2ecc71',
        label: '✅ Acceptée',
        dbValue: 'accepted',
        pastTense: 'acceptée'
    },
    deny: {
        color: '#e74c3c',
        label: '❌ Refusée',
        dbValue: 'denied',
        pastTense: 'refusée'
    },
    consider: {
        color: '#f39c12',
        label: '🤔 En considération',
        dbValue: 'considered',
        pastTense: 'mise en considération'
    },
    implement: {
        color: '#9b59b6',
        label: '🚀 Implémentée',
        dbValue: 'implemented',
        pastTense: 'marquée comme implémentée'
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Gérer une suggestion')
        .addSubcommand(subcommand =>
            subcommand
                .setName('accept')
                .setDescription('Accepter une suggestion')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('L\'identifiant de la suggestion')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Raison de l\'acceptation')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('deny')
                .setDescription('Refuser une suggestion')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('L\'identifiant de la suggestion')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Raison du refus')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('consider')
                .setDescription('Mettre une suggestion en considération')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('L\'identifiant de la suggestion')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Raison de la mise en considération')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('implement')
                .setDescription('Marquer une suggestion comme implémentée')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('L\'identifiant de la suggestion')
                        .setRequired(true)
                )
        ),

    module: 'suggestions',
    adminOnly: true,

    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        const suggestionId = interaction.options.getInteger('id');
        const reason = interaction.options.getString('reason');

        await interaction.deferReply({ ephemeral: true });

        try {
            // Récupérer la suggestion depuis la base de données
            const suggestion = await Suggestion.findOne({
                guildId: interaction.guild.id,
                suggestionId: suggestionId
            });

            if (!suggestion) {
                return interaction.editReply({
                    embeds: [createEmbed('error', `Aucune suggestion trouvée avec l'identifiant #${suggestionId}.`)]
                });
            }

            // Récupérer la configuration du statut
            const statusConfig = STATUS_CONFIG[subcommand];

            // Mettre à jour le statut dans la base de données
            suggestion.status = statusConfig.dbValue;
            suggestion.reviewedBy = interaction.user.id;
            suggestion.reviewedAt = new Date();
            if (reason) {
                suggestion.reason = reason;
            }
            await suggestion.save();

            // Récupérer le message original de la suggestion
            const channel = await interaction.guild.channels.fetch(suggestion.channelId).catch(() => null);

            if (channel) {
                try {
                    const message = await channel.messages.fetch(suggestion.messageId);

                    // Reconstruire l'embed avec le nouveau statut et la nouvelle couleur
                    const updatedEmbed = new EmbedBuilder()
                        .setColor(statusConfig.color)
                        .setTitle(`Suggestion #${suggestion.suggestionId}`)
                        .setDescription(suggestion.content)
                        .addFields(
                            { name: 'Statut', value: statusConfig.label, inline: true },
                            { name: 'Auteur', value: `<@${suggestion.authorId}>`, inline: true },
                            { name: 'Révisée par', value: `${interaction.user}`, inline: true }
                        )
                        .setFooter({ text: `ID: ${suggestion.suggestionId} | Mise à jour par ${interaction.user.tag}` })
                        .setTimestamp();

                    // Ajouter la raison si elle est fournie
                    if (reason) {
                        updatedEmbed.addFields({
                            name: 'Raison',
                            value: reason
                        });
                    }

                    await message.edit({ embeds: [updatedEmbed] });

                } catch (editError) {
                    logger.warn(`Impossible de modifier le message de la suggestion #${suggestionId}: ${editError.message}`);
                }
            }

            // Confirmer l'action à l'administrateur
            await interaction.editReply({
                embeds: [createEmbed('success', `La suggestion #${suggestionId} a été ${statusConfig.pastTense} avec succès.${reason ? `\n**Raison :** ${reason}` : ''}`)]
            });

            // Notifier l'auteur de la suggestion par message privé
            try {
                const author = await client.users.fetch(suggestion.authorId);
                const dmEmbed = new EmbedBuilder()
                    .setColor(statusConfig.color)
                    .setTitle(`Votre suggestion #${suggestion.suggestionId} a été mise à jour`)
                    .setDescription(`**Suggestion :** ${suggestion.content}`)
                    .addFields(
                        { name: 'Nouveau statut', value: statusConfig.label, inline: true },
                        { name: 'Serveur', value: interaction.guild.name, inline: true }
                    )
                    .setTimestamp();

                if (reason) {
                    dmEmbed.addFields({ name: 'Raison', value: reason });
                }

                await author.send({ embeds: [dmEmbed] });
            } catch (dmError) {
                // L'utilisateur a peut-être désactivé les messages privés
                logger.warn(`Impossible d'envoyer un message privé à l'auteur de la suggestion #${suggestionId}: ${dmError.message}`);
            }

            logger.info(`Suggestion #${suggestionId} ${statusConfig.pastTense} par ${interaction.user.tag} sur ${interaction.guild.name}`);

        } catch (error) {
            logger.error(`Erreur lors de la gestion de la suggestion #${suggestionId}: ${error.message}`);
            await interaction.editReply({
                embeds: [createEmbed('error', `Une erreur est survenue lors de la gestion de la suggestion: ${error.message}`)]
            });
        }
    }
};
