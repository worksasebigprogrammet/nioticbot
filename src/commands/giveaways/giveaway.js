// Commande pour gérer les giveaways (création, fin anticipée, reroll)
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');
const Giveaway = require('../../../database/models/giveaway');
const logger = require('../../utils/logger');
const { createEmbed } = require('../../utils/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Gérer les giveaways')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Créer un nouveau giveaway')
                .addStringOption(option =>
                    option
                        .setName('duration')
                        .setDescription('Durée du giveaway (ex: 1h, 30m, 1d, 2j)')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('winners')
                        .setDescription('Nombre de gagnants')
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addStringOption(option =>
                    option
                        .setName('prize')
                        .setDescription('Le prix à gagner')
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Salon où envoyer le giveaway')
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Rôle requis pour participer')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('Terminer un giveaway en avance')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('ID du message du giveaway')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reroll')
                .setDescription('Retirer au sort de nouveaux gagnants')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('ID du message du giveaway')
                        .setRequired(true)
                )
        ),

    module: 'giveaways',
    adminOnly: true,

    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await handleCreate(interaction, client);
                break;
            case 'end':
                await handleEnd(interaction, client);
                break;
            case 'reroll':
                await handleReroll(interaction, client);
                break;
        }
    },

    /**
     * Gérer le clic sur le bouton de participation au giveaway
     * @param {Object} interaction - L'interaction du bouton
     * @param {Object} client - Le client Discord
     * @param {Array} args - Arguments supplémentaires du bouton
     */
    async handleGiveawayButton(interaction, client, args) {
        try {
            const messageId = interaction.message.id;

            // Récupérer le giveaway depuis la base de données
            const giveaway = await Giveaway.findOne({
                messageId: messageId,
                guildId: interaction.guild.id,
                ended: false
            });

            if (!giveaway) {
                return interaction.reply({
                    content: 'Ce giveaway n\'existe plus ou est déjà terminé.',
                    ephemeral: true
                });
            }

            // Vérifier le rôle requis si défini
            if (giveaway.requiredRoleId) {
                const hasRole = interaction.member.roles.cache.has(giveaway.requiredRoleId);
                if (!hasRole) {
                    return interaction.reply({
                        content: `Vous devez avoir le rôle <@&${giveaway.requiredRoleId}> pour participer à ce giveaway.`,
                        ephemeral: true
                    });
                }
            }

            const userId = interaction.user.id;
            const isParticipating = giveaway.participants.includes(userId);

            if (isParticipating) {
                // Retirer la participation
                giveaway.participants = giveaway.participants.filter(id => id !== userId);
                await giveaway.save();

                // Mettre à jour l'embed avec le nouveau nombre de participants
                await updateGiveawayEmbed(interaction.message, giveaway);

                return interaction.reply({
                    content: 'Vous ne participez plus au giveaway.',
                    ephemeral: true
                });
            } else {
                // Ajouter la participation
                giveaway.participants.push(userId);
                await giveaway.save();

                // Mettre à jour l'embed avec le nouveau nombre de participants
                await updateGiveawayEmbed(interaction.message, giveaway);

                return interaction.reply({
                    content: 'Vous participez maintenant au giveaway ! Bonne chance !',
                    ephemeral: true
                });
            }

        } catch (error) {
            logger.error(`Erreur lors de la gestion du bouton giveaway: ${error.message}`);
            return interaction.reply({
                content: 'Une erreur est survenue. Veuillez réessayer.',
                ephemeral: true
            });
        }
    }
};

/**
 * Analyser une chaîne de durée et retourner les millisecondes
 * Formats supportés : 1h, 30m, 1d, 2j, 1h30m, etc.
 * @param {string} durationStr - La chaîne de durée
 * @returns {number|null} La durée en millisecondes ou null si invalide
 */
function parseDuration(durationStr) {
    const regex = /(\d+)\s*(s|sec|secondes?|m|min|minutes?|h|heures?|hours?|d|j|jours?|days?|w|sem|semaines?|weeks?)/gi;
    let totalMs = 0;
    let match;

    while ((match = regex.exec(durationStr)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 's':
            case 'sec':
            case 'seconde':
            case 'secondes':
                totalMs += value * 1000;
                break;
            case 'm':
            case 'min':
            case 'minute':
            case 'minutes':
                totalMs += value * 60 * 1000;
                break;
            case 'h':
            case 'heure':
            case 'heures':
            case 'hour':
            case 'hours':
                totalMs += value * 60 * 60 * 1000;
                break;
            case 'd':
            case 'j':
            case 'jour':
            case 'jours':
            case 'day':
            case 'days':
                totalMs += value * 24 * 60 * 60 * 1000;
                break;
            case 'w':
            case 'sem':
            case 'semaine':
            case 'semaines':
            case 'week':
            case 'weeks':
                totalMs += value * 7 * 24 * 60 * 60 * 1000;
                break;
        }
    }

    return totalMs > 0 ? totalMs : null;
}

/**
 * Formater une durée en millisecondes en texte lisible
 * @param {number} ms - La durée en millisecondes
 * @returns {string} La durée formatée
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days} jour(s)`);
    if (hours % 24 > 0) parts.push(`${hours % 24} heure(s)`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60} minute(s)`);
    if (seconds % 60 > 0 && days === 0 && hours === 0) parts.push(`${seconds % 60} seconde(s)`);

    return parts.join(', ') || '0 seconde';
}

/**
 * Mettre à jour l'embed du giveaway avec le nombre actuel de participants
 * @param {Object} message - Le message du giveaway
 * @param {Object} giveaway - Le document du giveaway
 */
async function updateGiveawayEmbed(message, giveaway) {
    try {
        const embed = EmbedBuilder.from(message.embeds[0]);

        // Mettre à jour le champ des participants
        const fields = embed.data.fields || [];
        const participantsFieldIndex = fields.findIndex(f => f.name === 'Participants');

        if (participantsFieldIndex !== -1) {
            fields[participantsFieldIndex].value = `${giveaway.participants.length}`;
        }

        embed.setFields(fields);
        await message.edit({ embeds: [embed] });
    } catch (error) {
        logger.error(`Erreur lors de la mise à jour de l'embed du giveaway: ${error.message}`);
    }
}

/**
 * Gérer la création d'un giveaway
 * @param {Object} interaction - L'interaction Discord
 * @param {Object} client - Le client Discord
 */
async function handleCreate(interaction, client) {
    const durationStr = interaction.options.getString('duration');
    const winnersCount = interaction.options.getInteger('winners');
    const prize = interaction.options.getString('prize');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const requiredRole = interaction.options.getRole('role');

    // Analyser la durée
    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
        return interaction.reply({
            embeds: [createEmbed('error', 'Durée invalide. Exemples valides : `1h`, `30m`, `1d`, `2j`, `1h30m`')],
            ephemeral: true
        });
    }

    // Vérifier la durée maximale (30 jours)
    if (durationMs > 30 * 24 * 60 * 60 * 1000) {
        return interaction.reply({
            embeds: [createEmbed('error', 'La durée maximale d\'un giveaway est de 30 jours.')],
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const endDate = new Date(Date.now() + durationMs);

        // Créer l'embed du giveaway
        const giveawayEmbed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('🎉 Giveaway')
            .setDescription(`**${prize}**`)
            .addFields(
                { name: 'Organisé par', value: `${interaction.user}`, inline: true },
                { name: 'Gagnant(s)', value: `${winnersCount}`, inline: true },
                { name: 'Participants', value: '0', inline: true },
                { name: 'Fin', value: `<t:${Math.floor(endDate.getTime() / 1000)}:R>`, inline: true }
            )
            .setTimestamp(endDate);

        // Ajouter le rôle requis si défini
        if (requiredRole) {
            giveawayEmbed.addFields({
                name: 'Rôle requis',
                value: `${requiredRole}`,
                inline: true
            });
        }

        // Créer le bouton de participation
        const participateButton = new ButtonBuilder()
            .setCustomId('giveaway_participate')
            .setLabel('Participer')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎉');

        const actionRow = new ActionRowBuilder().addComponents(participateButton);

        // Envoyer le message du giveaway
        const giveawayMessage = await channel.send({
            embeds: [giveawayEmbed],
            components: [actionRow]
        });

        // Sauvegarder le giveaway dans la base de données
        const giveawayData = new Giveaway({
            messageId: giveawayMessage.id,
            channelId: channel.id,
            guildId: interaction.guild.id,
            hostId: interaction.user.id,
            prize: prize,
            winnersCount: winnersCount,
            participants: [],
            requiredRoleId: requiredRole?.id || null,
            endDate: endDate,
            ended: false
        });

        await giveawayData.save();

        // Programmer la fin automatique du giveaway
        const timeout = setTimeout(async () => {
            await endGiveaway(giveawayData.messageId, interaction.guild.id, client);
        }, durationMs);

        // Stocker le timeout pour pouvoir l'annuler si nécessaire
        if (!client.giveawayTimeouts) {
            client.giveawayTimeouts = new Map();
        }
        client.giveawayTimeouts.set(giveawayMessage.id, timeout);

        await interaction.editReply({
            embeds: [createEmbed('success', `Le giveaway pour **${prize}** a été créé dans ${channel} ! Il se terminera <t:${Math.floor(endDate.getTime() / 1000)}:R>.`)]
        });

    } catch (error) {
        logger.error(`Erreur lors de la création du giveaway: ${error.message}`);
        await interaction.editReply({
            embeds: [createEmbed('error', `Une erreur est survenue lors de la création du giveaway: ${error.message}`)]
        });
    }
}

/**
 * Terminer un giveaway et annoncer les gagnants
 * @param {string} messageId - L'ID du message du giveaway
 * @param {string} guildId - L'ID du serveur
 * @param {Object} client - Le client Discord
 */
async function endGiveaway(messageId, guildId, client) {
    try {
        // Récupérer le giveaway depuis la base de données
        const giveaway = await Giveaway.findOne({ messageId, guildId, ended: false });
        if (!giveaway) return;

        // Marquer comme terminé
        giveaway.ended = true;
        await giveaway.save();

        // Annuler le timeout si existant
        if (client.giveawayTimeouts?.has(messageId)) {
            clearTimeout(client.giveawayTimeouts.get(messageId));
            client.giveawayTimeouts.delete(messageId);
        }

        // Récupérer le salon et le message
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(giveaway.channelId);
        const message = await channel.messages.fetch(giveaway.messageId);

        // Sélectionner les gagnants aléatoirement
        const winners = pickWinners(giveaway.participants, giveaway.winnersCount);

        // Mettre à jour l'embed du giveaway
        const endedEmbed = new EmbedBuilder()
            .setColor('#95a5a6')
            .setTitle('🎉 Giveaway terminé')
            .setDescription(`**${giveaway.prize}**`)
            .addFields(
                { name: 'Organisé par', value: `<@${giveaway.hostId}>`, inline: true },
                { name: 'Participants', value: `${giveaway.participants.length}`, inline: true }
            )
            .setTimestamp();

        if (winners.length > 0) {
            const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
            endedEmbed.addFields({ name: 'Gagnant(s)', value: winnerMentions });

            // Désactiver le bouton
            const disabledButton = new ButtonBuilder()
                .setCustomId('giveaway_participate')
                .setLabel('Giveaway terminé')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎉')
                .setDisabled(true);

            const actionRow = new ActionRowBuilder().addComponents(disabledButton);
            await message.edit({ embeds: [endedEmbed], components: [actionRow] });

            // Annoncer les gagnants
            await channel.send({
                content: `🎉 Félicitations ${winnerMentions} ! Vous avez gagné **${giveaway.prize}** !`
            });
        } else {
            endedEmbed.addFields({ name: 'Gagnant(s)', value: 'Aucun participant' });

            const disabledButton = new ButtonBuilder()
                .setCustomId('giveaway_participate')
                .setLabel('Giveaway terminé')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎉')
                .setDisabled(true);

            const actionRow = new ActionRowBuilder().addComponents(disabledButton);
            await message.edit({ embeds: [endedEmbed], components: [actionRow] });

            await channel.send({
                content: `Le giveaway pour **${giveaway.prize}** est terminé, mais personne n'a participé.`
            });
        }

    } catch (error) {
        logger.error(`Erreur lors de la fin du giveaway ${messageId}: ${error.message}`);
    }
}

/**
 * Gérer la fin anticipée d'un giveaway
 * @param {Object} interaction - L'interaction Discord
 * @param {Object} client - Le client Discord
 */
async function handleEnd(interaction, client) {
    const messageId = interaction.options.getString('message_id');

    await interaction.deferReply({ ephemeral: true });

    try {
        // Vérifier que le giveaway existe
        const giveaway = await Giveaway.findOne({
            messageId,
            guildId: interaction.guild.id,
            ended: false
        });

        if (!giveaway) {
            return interaction.editReply({
                embeds: [createEmbed('error', 'Aucun giveaway actif trouvé avec cet ID de message.')]
            });
        }

        // Terminer le giveaway
        await endGiveaway(messageId, interaction.guild.id, client);

        await interaction.editReply({
            embeds: [createEmbed('success', `Le giveaway pour **${giveaway.prize}** a été terminé avec succès.`)]
        });

    } catch (error) {
        logger.error(`Erreur lors de la fin anticipée du giveaway: ${error.message}`);
        await interaction.editReply({
            embeds: [createEmbed('error', `Une erreur est survenue: ${error.message}`)]
        });
    }
}

/**
 * Gérer le reroll des gagnants d'un giveaway
 * @param {Object} interaction - L'interaction Discord
 * @param {Object} client - Le client Discord
 */
async function handleReroll(interaction, client) {
    const messageId = interaction.options.getString('message_id');

    await interaction.deferReply({ ephemeral: true });

    try {
        // Récupérer le giveaway terminé
        const giveaway = await Giveaway.findOne({
            messageId,
            guildId: interaction.guild.id,
            ended: true
        });

        if (!giveaway) {
            return interaction.editReply({
                embeds: [createEmbed('error', 'Aucun giveaway terminé trouvé avec cet ID de message.')]
            });
        }

        if (giveaway.participants.length === 0) {
            return interaction.editReply({
                embeds: [createEmbed('error', 'Ce giveaway n\'avait aucun participant.')]
            });
        }

        // Sélectionner de nouveaux gagnants
        const newWinners = pickWinners(giveaway.participants, giveaway.winnersCount);
        const winnerMentions = newWinners.map(id => `<@${id}>`).join(', ');

        // Récupérer le salon du giveaway
        const channel = await interaction.guild.channels.fetch(giveaway.channelId);

        // Annoncer les nouveaux gagnants
        await channel.send({
            content: `🎉 Reroll ! Les nouveaux gagnants pour **${giveaway.prize}** sont : ${winnerMentions} ! Félicitations !`
        });

        // Mettre à jour l'embed du message original
        try {
            const message = await channel.messages.fetch(giveaway.messageId);
            const updatedEmbed = EmbedBuilder.from(message.embeds[0]);

            // Remplacer le champ des gagnants
            const fields = updatedEmbed.data.fields || [];
            const winnersFieldIndex = fields.findIndex(f => f.name === 'Gagnant(s)');
            if (winnersFieldIndex !== -1) {
                fields[winnersFieldIndex].value = `${winnerMentions} (reroll)`;
            }
            updatedEmbed.setFields(fields);

            await message.edit({ embeds: [updatedEmbed] });
        } catch (editError) {
            logger.warn(`Impossible de modifier le message du giveaway: ${editError.message}`);
        }

        await interaction.editReply({
            embeds: [createEmbed('success', `Les nouveaux gagnants pour **${giveaway.prize}** ont été tirés au sort : ${winnerMentions}`)]
        });

    } catch (error) {
        logger.error(`Erreur lors du reroll du giveaway: ${error.message}`);
        await interaction.editReply({
            embeds: [createEmbed('error', `Une erreur est survenue: ${error.message}`)]
        });
    }
}

/**
 * Sélectionner des gagnants aléatoires parmi les participants
 * @param {Array<string>} participants - Liste des ID des participants
 * @param {number} count - Nombre de gagnants à sélectionner
 * @returns {Array<string>} Liste des ID des gagnants
 */
function pickWinners(participants, count) {
    if (participants.length === 0) return [];

    // Ne pas sélectionner plus de gagnants qu'il n'y a de participants
    const winnersCount = Math.min(count, participants.length);
    const shuffled = [...participants].sort(() => Math.random() - 0.5);

    return shuffled.slice(0, winnersCount);
}
