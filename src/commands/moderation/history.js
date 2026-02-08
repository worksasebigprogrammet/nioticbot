// Commande d'historique de modération - Affiche l'historique complet des actions de modération d'un membre
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

// Correspondance des types de cas vers des emojis pour un affichage lisible
const caseTypeEmojis = {
    ban: '\u{1F528}',
    tempban: '\u{23F3}',
    kick: '\u{1F462}',
    mute: '\u{1F507}',
    unmute: '\u{1F50A}',
    warn: '\u{26A0}',
    softban: '\u{1F4A8}'
};

// Correspondance des types de cas vers des libellés en français
const caseTypeLabels = {
    ban: 'Ban',
    tempban: 'Tempban',
    kick: 'Kick',
    mute: 'Mute',
    unmute: 'Unmute',
    warn: 'Warn',
    softban: 'Softban'
};

// Nombre de cas affichés par page
const CASES_PER_PAGE = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Voir l\'historique de modération d\'un membre')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre dont vous voulez voir l\'historique')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { guild } = interaction;
        const targetUser = interaction.options.getUser('user');

        try {
            // Récupérer tous les cas de modération pour cet utilisateur dans ce serveur
            const cases = await Case.find({
                guildId: guild.id,
                userId: targetUser.id
            }).sort({ caseId: -1 });

            // Vérifier si l'utilisateur a un historique de modération
            if (!cases || cases.length === 0) {
                return interaction.reply({
                    embeds: [successEmbed(`**${targetUser.tag}** n'a aucun historique de modération.`)],
                    ephemeral: true
                });
            }

            // Calculer le nombre total de pages
            const totalPages = Math.ceil(cases.length / CASES_PER_PAGE);
            let currentPage = 0;

            // Fonction pour générer l'embed d'une page donnée
            const generatePage = (page) => {
                const start = page * CASES_PER_PAGE;
                const end = start + CASES_PER_PAGE;
                const pageCases = cases.slice(start, end);

                // Construire la description avec la liste des cas de cette page
                const description = pageCases.map(c => {
                    const emoji = caseTypeEmojis[c.type] || '\u{2753}';
                    const label = caseTypeLabels[c.type] || c.type;
                    const date = new Date(c.timestamp).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    });
                    const status = c.active ? '' : ' *(inactif)*';

                    let line = `${emoji} **Cas #${c.caseId}** — ${label}${status}\n`;
                    line += `> **Raison:** ${c.reason || 'Aucune raison'}\n`;
                    line += `> **Modérateur:** ${c.moderatorTag} | **Date:** ${date}`;
                    if (c.duration) {
                        line += `\n> **Durée:** ${c.duration}`;
                    }
                    return line;
                }).join('\n\n');

                // Créer l'embed de la page
                return new EmbedBuilder()
                    .setTitle(`Historique de modération de ${targetUser.tag}`)
                    .setDescription(description)
                    .setColor(0x5865F2)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setFooter({
                        text: `Page ${page + 1}/${totalPages} | Total: ${cases.length} cas`
                    })
                    .setTimestamp();
            };

            // Fonction pour générer les boutons de navigation
            const generateButtons = (page) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('history_first')
                        .setLabel('<<')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('history_prev')
                        .setLabel('<')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('history_page')
                        .setLabel(`${page + 1}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('history_next')
                        .setLabel('>')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('history_last')
                        .setLabel('>>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages - 1)
                );
            };

            // Envoyer la première page avec les boutons de navigation si nécessaire
            const messageOptions = {
                embeds: [generatePage(currentPage)]
            };

            // Ajouter les boutons uniquement s'il y a plus d'une page
            if (totalPages > 1) {
                messageOptions.components = [generateButtons(currentPage)];
            }

            const reply = await interaction.reply({
                ...messageOptions,
                fetchReply: true
            });

            // Si une seule page, pas besoin de collecteur d'interactions
            if (totalPages <= 1) return;

            // Créer un collecteur d'interactions pour les boutons de navigation
            const collector = reply.createMessageComponentCollector({
                filter: (i) => i.user.id === interaction.user.id,
                time: 120000 // Expiration après 2 minutes d'inactivité
            });

            // Gérer les interactions avec les boutons
            collector.on('collect', async (buttonInteraction) => {
                switch (buttonInteraction.customId) {
                    case 'history_first':
                        currentPage = 0;
                        break;
                    case 'history_prev':
                        currentPage = Math.max(0, currentPage - 1);
                        break;
                    case 'history_next':
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                        break;
                    case 'history_last':
                        currentPage = totalPages - 1;
                        break;
                }

                // Mettre à jour l'embed et les boutons
                await buttonInteraction.update({
                    embeds: [generatePage(currentPage)],
                    components: [generateButtons(currentPage)]
                });
            });

            // Désactiver les boutons à l'expiration du collecteur
            collector.on('end', async () => {
                try {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('history_first')
                            .setLabel('<<')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('history_prev')
                            .setLabel('<')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('history_page')
                            .setLabel(`${currentPage + 1}/${totalPages}`)
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('history_next')
                            .setLabel('>')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('history_last')
                            .setLabel('>>')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );

                    await reply.edit({ components: [disabledRow] });
                } catch (err) {
                    // Le message a peut-être été supprimé entre-temps
                }
            });

        } catch (error) {
            Logger.error(`Erreur lors de la récupération de l'historique de ${targetUser.tag}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors de la récupération de l'historique: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
