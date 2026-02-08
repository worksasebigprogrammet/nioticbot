// Commande de suppression en masse - Permet de supprimer plusieurs messages avec des filtres optionnels
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Supprimer des messages en masse')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Nombre de messages à supprimer (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Filtrer par utilisateur')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('filter')
                .setDescription('Filtrer les messages')
                .setRequired(false)
                .addChoices(
                    { name: 'Bots uniquement', value: 'bots' },
                    { name: 'Contient un texte', value: 'contains' }
                )
        )
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription('Texte à rechercher (utilisé avec le filtre "contient")')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { client, guild, member, channel } = interaction;
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');
        const filter = interaction.options.getString('filter');
        const text = interaction.options.getString('text');

        // Différer la réponse car la suppression peut prendre du temps
        await interaction.deferReply({ ephemeral: true });

        try {
            // Récupérer les messages du canal
            let messages = await channel.messages.fetch({ limit: amount });

            // Appliquer le filtre par utilisateur si spécifié
            if (targetUser) {
                messages = messages.filter(msg => msg.author.id === targetUser.id);
            }

            // Appliquer le filtre par type si spécifié
            if (filter === 'bots') {
                // Filtrer uniquement les messages des bots
                messages = messages.filter(msg => msg.author.bot);
            } else if (filter === 'contains' && text) {
                // Filtrer les messages contenant le texte spécifié
                messages = messages.filter(msg =>
                    msg.content.toLowerCase().includes(text.toLowerCase())
                );
            }

            // Vérifier qu'il y a des messages à supprimer
            if (messages.size === 0) {
                return interaction.editReply({
                    embeds: [errorEmbed('Aucun message ne correspond aux critères de filtrage.')]
                });
            }

            // Filtrer les messages de plus de 14 jours (limite de bulkDelete)
            const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const deletableMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);

            if (deletableMessages.size === 0) {
                return interaction.editReply({
                    embeds: [errorEmbed('Tous les messages trouvés ont plus de 14 jours et ne peuvent pas être supprimés en masse.')]
                });
            }

            // Supprimer les messages en masse
            const deleted = await channel.bulkDelete(deletableMessages, true);

            // Journaliser l'action de modération
            client.systems?.logs?.log(guild.id, 'moderation.purge', {
                moderator: member.user,
                reason: `${deleted.size} message(s) supprimé(s) dans #${channel.name}`,
                caseId: null
            });

            // Construire le message de réponse avec les détails
            let responseText = `**${deleted.size}** message(s) supprimé(s) avec succès.`;
            if (targetUser) {
                responseText += `\n**Filtre utilisateur:** ${targetUser.tag}`;
            }
            if (filter === 'bots') {
                responseText += `\n**Filtre:** Messages de bots uniquement`;
            } else if (filter === 'contains' && text) {
                responseText += `\n**Filtre:** Messages contenant "${text}"`;
            }

            // Répondre avec le résultat (éphémère pour ne pas encombrer)
            return interaction.editReply({
                embeds: [successEmbed(responseText)]
            });

        } catch (error) {
            Logger.error(`Erreur lors de la suppression en masse dans #${channel.name}: ${error.message}`);
            return interaction.editReply({
                embeds: [errorEmbed(`Une erreur est survenue lors de la suppression: ${error.message}`)]
            });
        }
    }
};
