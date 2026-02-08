// Commande pour faire une suggestion sur le serveur
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Suggestion = require('../../../database/models/suggestion');
const GuildSettings = require('../../../database/models/guild');
const logger = require('../../utils/logger');
const { successEmbed, errorEmbed } = require('../../utils/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Faire une suggestion')
        .addStringOption(option =>
            option
                .setName('suggestion')
                .setDescription('Votre suggestion')
                .setRequired(true)
        ),

    module: 'suggestions',
    adminOnly: false,

    async execute(interaction, client) {
        const suggestionText = interaction.options.getString('suggestion');

        await interaction.deferReply({ ephemeral: true });

        try {
            // Récupérer les paramètres du serveur pour le salon de suggestions
            const guildSettings = await GuildSettings.findOne({ guildId: interaction.guild.id });

            if (!guildSettings || !guildSettings.suggestions?.channelId) {
                return interaction.editReply({
                    embeds: [errorEmbed('Le salon de suggestions n\'est pas configuré. Demandez à un administrateur de le configurer.')]
                });
            }

            // Récupérer le salon de suggestions
            const suggestionChannel = await interaction.guild.channels.fetch(guildSettings.suggestions.channelId).catch(() => null);

            if (!suggestionChannel) {
                return interaction.editReply({
                    embeds: [errorEmbed('Le salon de suggestions configuré est introuvable. Veuillez contacter un administrateur.')]
                });
            }

            // Incrémenter le compteur de suggestions
            const suggestionNumber = (guildSettings.suggestions.counter || 0) + 1;
            guildSettings.suggestions.counter = suggestionNumber;
            await guildSettings.save();

            // Créer l'embed de suggestion
            const suggestionEmbed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`Suggestion #${suggestionNumber}`)
                .setDescription(suggestionText)
                .addFields(
                    { name: 'Statut', value: '⏳ En attente', inline: true },
                    { name: 'Auteur', value: `${interaction.user}`, inline: true }
                )
                .setFooter({ text: `ID: ${suggestionNumber} | Utilisez /suggestion pour gérer cette suggestion` })
                .setTimestamp();

            // Envoyer l'embed dans le salon de suggestions
            const suggestionMessage = await suggestionChannel.send({ embeds: [suggestionEmbed] });

            // Ajouter les réactions de vote
            await suggestionMessage.react('👍');
            await suggestionMessage.react('👎');

            // Sauvegarder la suggestion dans la base de données
            const suggestionData = new Suggestion({
                guildId: interaction.guild.id,
                suggestionId: suggestionNumber,
                messageId: suggestionMessage.id,
                channelId: suggestionChannel.id,
                authorId: interaction.user.id,
                content: suggestionText,
                status: 'pending',
                createdAt: new Date()
            });

            await suggestionData.save();

            // Confirmer la soumission à l'utilisateur
            await interaction.editReply({
                embeds: [successEmbed(`Votre suggestion #${suggestionNumber} a été soumise avec succès dans ${suggestionChannel} !`)]
            });

            logger.info(`Nouvelle suggestion #${suggestionNumber} créée par ${interaction.user.tag} sur ${interaction.guild.name}`);

        } catch (error) {
            logger.error(`Erreur lors de la création de la suggestion: ${error.message}`);
            await interaction.editReply({
                embeds: [errorEmbed(`Une erreur est survenue lors de la soumission de votre suggestion: ${error.message}`)]
            });
        }
    }
};
