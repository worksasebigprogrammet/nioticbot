// Commande de gestion des tickets — panneau, fermeture, claim, ajout/retrait d'utilisateur, renommage, réouverture, statistiques et classement
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, successEmbed, errorEmbed, infoEmbed } = require('../../utils/embed');
const { isAdmin } = require('../../utils/permissions');
const Ticket = require('../../../database/models/ticket');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

/* ─── Définition de la commande slash avec sous-commandes ─── */
const data = new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestion des tickets de support')

    // Sous-commande : envoyer le panneau de création de tickets (admin)
    .addSubcommand(sub =>
        sub
            .setName('panel')
            .setDescription('Envoyer le panneau de création de tickets')
    )

    // Sous-commande : fermer le ticket actuel
    .addSubcommand(sub =>
        sub
            .setName('close')
            .setDescription('Fermer le ticket actuel')
            .addStringOption(opt =>
                opt
                    .setName('reason')
                    .setDescription('Raison de la fermeture du ticket')
                    .setRequired(false)
            )
    )

    // Sous-commande : prendre en charge le ticket actuel
    .addSubcommand(sub =>
        sub
            .setName('claim')
            .setDescription('Prendre en charge le ticket actuel')
    )

    // Sous-commande : ajouter un utilisateur au ticket
    .addSubcommand(sub =>
        sub
            .setName('add')
            .setDescription('Ajouter un utilisateur au ticket actuel')
            .addUserOption(opt =>
                opt
                    .setName('user')
                    .setDescription('L\'utilisateur à ajouter au ticket')
                    .setRequired(true)
            )
    )

    // Sous-commande : retirer un utilisateur du ticket
    .addSubcommand(sub =>
        sub
            .setName('remove')
            .setDescription('Retirer un utilisateur du ticket actuel')
            .addUserOption(opt =>
                opt
                    .setName('user')
                    .setDescription('L\'utilisateur à retirer du ticket')
                    .setRequired(true)
            )
    )

    // Sous-commande : renommer le salon du ticket
    .addSubcommand(sub =>
        sub
            .setName('rename')
            .setDescription('Renommer le salon du ticket actuel')
            .addStringOption(opt =>
                opt
                    .setName('name')
                    .setDescription('Le nouveau nom du salon')
                    .setRequired(true)
            )
    )

    // Sous-commande : réouvrir un ticket fermé
    .addSubcommand(sub =>
        sub
            .setName('reopen')
            .setDescription('Réouvrir un ticket fermé')
            .addIntegerOption(opt =>
                opt
                    .setName('ticket_id')
                    .setDescription('Le numéro du ticket à réouvrir')
                    .setRequired(true)
            )
    )

    // Sous-commande : afficher les statistiques de tickets
    .addSubcommand(sub =>
        sub
            .setName('stats')
            .setDescription('Afficher les statistiques de tickets')
            .addUserOption(opt =>
                opt
                    .setName('user')
                    .setDescription('L\'utilisateur dont on veut voir les statistiques (optionnel)')
                    .setRequired(false)
            )
    )

    // Sous-commande : afficher le classement du staff
    .addSubcommand(sub =>
        sub
            .setName('leaderboard')
            .setDescription('Afficher le classement du staff par tickets traités')
    );

/**
 * Exécute la commande ticket en fonction de la sous-commande choisie.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - L'interaction slash
 * @param {import('discord.js').Client} client - Le client Discord
 */
async function execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'panel':
            await handlePanel(interaction, client);
            break;
        case 'close':
            await handleClose(interaction, client);
            break;
        case 'claim':
            await handleClaim(interaction, client);
            break;
        case 'add':
            await handleAdd(interaction, client);
            break;
        case 'remove':
            await handleRemove(interaction, client);
            break;
        case 'rename':
            await handleRename(interaction, client);
            break;
        case 'reopen':
            await handleReopen(interaction, client);
            break;
        case 'stats':
            await handleStats(interaction, client);
            break;
        case 'leaderboard':
            await handleLeaderboard(interaction, client);
            break;
        default:
            await interaction.reply({
                embeds: [errorEmbed('Sous-commande inconnue.')],
                ephemeral: true
            });
    }
}

/* ═══════════════════════════════════════════════════
   Sous-commande : panel — Envoyer le panneau de création de tickets
   ═══════════════════════════════════════════════════ */

/**
 * Envoie un embed avec un bouton pour créer un ticket.
 * Réservé aux administrateurs du serveur.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handlePanel(interaction, client) {
    // Vérifier les permissions administrateur
    const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
    if (!isAdmin(interaction.member, guildSettings)) {
        return interaction.reply({
            embeds: [errorEmbed('Vous n\'avez pas la permission d\'utiliser cette commande.')],
            ephemeral: true
        });
    }

    // Construire l'embed du panneau de tickets
    const panelEmbed = createEmbed({
        title: '🎫 Support — Créer un ticket',
        description:
            '**Besoin d\'aide ? Créez un ticket !**\n\n' +
            'Cliquez sur le bouton ci-dessous pour ouvrir un ticket de support.\n' +
            'Un membre de notre équipe vous répondra dans les meilleurs délais.\n\n' +
            '📌 **Avant de créer un ticket :**\n' +
            '> • Vérifiez que votre question n\'a pas déjà été posée\n' +
            '> • Préparez une description détaillée de votre demande\n' +
            '> • Soyez patient, notre équipe vous répondra dès que possible',
        color: 'info',
        footer: { text: `${interaction.guild.name} • Système de tickets` },
        thumbnail: interaction.guild.iconURL({ dynamic: true, size: 256 })
    });

    // Construire le bouton de création de ticket
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_create')
            .setLabel('Créer un ticket')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
    );

    // Envoyer le panneau dans le salon actuel (pas en réponse éphémère)
    await interaction.channel.send({
        embeds: [panelEmbed],
        components: [row]
    });

    // Confirmer l'envoi à l'administrateur
    await interaction.reply({
        embeds: [successEmbed('Le panneau de tickets a été envoyé avec succès.')],
        ephemeral: true
    });
}

/* ═══════════════════════════════════════════════════
   Sous-commande : close — Fermer le ticket actuel
   ═══════════════════════════════════════════════════ */

/**
 * Ferme le ticket associé au salon actuel.
 * Délègue la logique au système de tickets.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleClose(interaction, client) {
    const reason = interaction.options.getString('reason') || 'Aucune raison fournie';

    // Déléguer la fermeture au système de tickets
    const ticketSystem = require('../../systems/tickets');
    await ticketSystem.closeTicket(interaction, client, reason);
}

/* ═══════════════════════════════════════════════════
   Sous-commande : claim — Prendre en charge le ticket
   ═══════════════════════════════════════════════════ */

/**
 * Prend en charge le ticket du salon actuel.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleClaim(interaction, client) {
    // Rechercher le ticket associé à ce salon
    const ticket = await Ticket.findOne({
        channelId: interaction.channel.id,
        status: 'open'
    });

    if (!ticket) {
        return interaction.reply({
            embeds: [errorEmbed('Ce salon n\'est pas un ticket ouvert.')],
            ephemeral: true
        });
    }

    // Vérifier si le ticket est déjà pris en charge
    if (ticket.status === 'claimed') {
        return interaction.reply({
            embeds: [errorEmbed(`Ce ticket est déjà pris en charge par <@${ticket.claimedBy}>.`)],
            ephemeral: true
        });
    }

    // Mettre à jour le statut du ticket
    ticket.status = 'claimed';
    ticket.claimedBy = interaction.user.id;
    await ticket.save();

    await interaction.reply({
        embeds: [successEmbed(
            `${interaction.user} a pris en charge ce ticket.\nLe membre du staff assigné est désormais responsable de cette demande.`,
            '✋ Ticket pris en charge'
        )]
    });

    Logger.info(`Ticket #${ticket.ticketId} pris en charge par ${interaction.user.tag} (commande)`);
}

/* ═══════════════════════════════════════════════════
   Sous-commande : add — Ajouter un utilisateur au ticket
   ═══════════════════════════════════════════════════ */

/**
 * Ajoute un utilisateur au salon du ticket actuel en lui accordant les permissions de lecture et d'écriture.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleAdd(interaction, client) {
    // Vérifier que le salon est bien un ticket
    const ticket = await Ticket.findOne({
        channelId: interaction.channel.id,
        status: { $in: ['open', 'claimed'] }
    });

    if (!ticket) {
        return interaction.reply({
            embeds: [errorEmbed('Ce salon n\'est pas un ticket actif.')],
            ephemeral: true
        });
    }

    const targetUser = interaction.options.getUser('user');

    // Vérifier que l'utilisateur n'est pas un bot
    if (targetUser.bot) {
        return interaction.reply({
            embeds: [errorEmbed('Vous ne pouvez pas ajouter un bot au ticket.')],
            ephemeral: true
        });
    }

    // Ajouter les permissions de lecture et d'écriture pour l'utilisateur
    try {
        await interaction.channel.permissionOverwrites.edit(targetUser.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true
        });

        await interaction.reply({
            embeds: [successEmbed(
                `${targetUser} a été ajouté au ticket.`,
                '➕ Utilisateur ajouté'
            )]
        });

        Logger.info(`${targetUser.tag} ajouté au ticket #${ticket.ticketId} par ${interaction.user.tag}`);
    } catch (error) {
        Logger.error(`Erreur lors de l'ajout de ${targetUser.tag} au ticket : ${error.message}`);
        await interaction.reply({
            embeds: [errorEmbed('Une erreur est survenue lors de l\'ajout de l\'utilisateur.')],
            ephemeral: true
        });
    }
}

/* ═══════════════════════════════════════════════════
   Sous-commande : remove — Retirer un utilisateur du ticket
   ═══════════════════════════════════════════════════ */

/**
 * Retire un utilisateur du salon du ticket actuel en supprimant ses permissions.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleRemove(interaction, client) {
    // Vérifier que le salon est bien un ticket
    const ticket = await Ticket.findOne({
        channelId: interaction.channel.id,
        status: { $in: ['open', 'claimed'] }
    });

    if (!ticket) {
        return interaction.reply({
            embeds: [errorEmbed('Ce salon n\'est pas un ticket actif.')],
            ephemeral: true
        });
    }

    const targetUser = interaction.options.getUser('user');

    // Empêcher de retirer le créateur du ticket
    if (targetUser.id === ticket.userId) {
        return interaction.reply({
            embeds: [errorEmbed('Vous ne pouvez pas retirer le créateur du ticket.')],
            ephemeral: true
        });
    }

    // Supprimer les permissions de l'utilisateur sur ce salon
    try {
        await interaction.channel.permissionOverwrites.delete(targetUser.id);

        await interaction.reply({
            embeds: [successEmbed(
                `${targetUser} a été retiré du ticket.`,
                '➖ Utilisateur retiré'
            )]
        });

        Logger.info(`${targetUser.tag} retiré du ticket #${ticket.ticketId} par ${interaction.user.tag}`);
    } catch (error) {
        Logger.error(`Erreur lors du retrait de ${targetUser.tag} du ticket : ${error.message}`);
        await interaction.reply({
            embeds: [errorEmbed('Une erreur est survenue lors du retrait de l\'utilisateur.')],
            ephemeral: true
        });
    }
}

/* ═══════════════════════════════════════════════════
   Sous-commande : rename — Renommer le salon du ticket
   ═══════════════════════════════════════════════════ */

/**
 * Renomme le salon du ticket actuel avec le nom spécifié.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleRename(interaction, client) {
    // Vérifier que le salon est bien un ticket
    const ticket = await Ticket.findOne({
        channelId: interaction.channel.id,
        status: { $in: ['open', 'claimed'] }
    });

    if (!ticket) {
        return interaction.reply({
            embeds: [errorEmbed('Ce salon n\'est pas un ticket actif.')],
            ephemeral: true
        });
    }

    const newName = interaction.options.getString('name');

    // Valider le nom (longueur entre 1 et 100 caractères)
    if (newName.length > 100) {
        return interaction.reply({
            embeds: [errorEmbed('Le nom du salon ne peut pas dépasser 100 caractères.')],
            ephemeral: true
        });
    }

    try {
        const oldName = interaction.channel.name;
        await interaction.channel.setName(newName, `Renommé par ${interaction.user.tag}`);

        await interaction.reply({
            embeds: [successEmbed(
                `Le salon a été renommé de **#${oldName}** en **#${newName}**.`,
                '✏️ Ticket renommé'
            )]
        });

        Logger.info(`Ticket #${ticket.ticketId} renommé en "${newName}" par ${interaction.user.tag}`);
    } catch (error) {
        Logger.error(`Erreur lors du renommage du ticket : ${error.message}`);
        await interaction.reply({
            embeds: [errorEmbed('Une erreur est survenue lors du renommage du salon.')],
            ephemeral: true
        });
    }
}

/* ═══════════════════════════════════════════════════
   Sous-commande : reopen — Réouvrir un ticket fermé
   ═══════════════════════════════════════════════════ */

/**
 * Réouvre un ticket fermé en recréant un salon avec les mêmes permissions.
 * Réservé aux administrateurs.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleReopen(interaction, client) {
    // Vérifier les permissions administrateur
    const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
    if (!isAdmin(interaction.member, guildSettings)) {
        return interaction.reply({
            embeds: [errorEmbed('Vous n\'avez pas la permission de réouvrir des tickets.')],
            ephemeral: true
        });
    }

    const ticketIdInput = interaction.options.getInteger('ticket_id');

    // Rechercher le ticket fermé dans la base de données
    const ticket = await Ticket.findOne({
        guildId: interaction.guild.id,
        ticketId: ticketIdInput,
        status: 'closed'
    });

    if (!ticket) {
        return interaction.reply({
            embeds: [errorEmbed(`Aucun ticket fermé avec le numéro **#${ticketIdInput}** n'a été trouvé.`)],
            ephemeral: true
        });
    }

    await interaction.deferReply();

    try {
        // Construire les permissions du salon réouvert
        const permissionOverwrites = [
            {
                id: interaction.guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: ticket.userId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            },
            {
                id: client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ManageMessages
                ]
            }
        ];

        // Ajouter le rôle admin si configuré
        if (guildSettings?.permissions?.adminRoleId) {
            permissionOverwrites.push({
                id: guildSettings.permissions.adminRoleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            });
        }

        // Déterminer la catégorie Discord pour le salon
        const ticketCategoryId = guildSettings?.tickets?.categoryId || null;
        const channelName = `ticket-${ticket.ticketId}-${ticket.userTag.split('#')[0]}`.substring(0, 100);

        // Créer le nouveau salon pour le ticket réouvert
        const newChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: ticketCategoryId || undefined,
            permissionOverwrites: permissionOverwrites,
            topic: `Ticket #${ticket.ticketId} (réouvert) | Créé par ${ticket.userTag}`
        });

        // Mettre à jour le ticket dans la base de données
        ticket.status = 'open';
        ticket.channelId = newChannel.id;
        ticket.closedAt = null;
        ticket.closedBy = null;
        ticket.closeReason = null;
        ticket.claimedBy = null;
        await ticket.save();

        // Envoyer un embed de bienvenue dans le ticket réouvert
        const reopenEmbed = createEmbed({
            title: `🔓 Ticket #${ticket.ticketId} — Réouvert`,
            description:
                `Ce ticket a été réouvert par ${interaction.user}.\n\n` +
                `**Créé initialement par :** <@${ticket.userId}> (${ticket.userTag})\n` +
                `**Catégorie :** ${ticket.category}\n\n` +
                `Un membre du staff reprendra le suivi de votre demande.`,
            color: 'success',
            footer: { text: `Ticket #${ticket.ticketId} • ${interaction.guild.name}` }
        });

        // Boutons de gestion du ticket
        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('Fermer le ticket')
                .setEmoji('🔒')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('ticket_claim')
                .setLabel('Prendre en charge')
                .setEmoji('✋')
                .setStyle(ButtonStyle.Success)
        );

        await newChannel.send({
            content: `<@${ticket.userId}>`,
            embeds: [reopenEmbed],
            components: [actionRow]
        });

        await interaction.editReply({
            embeds: [successEmbed(
                `Le ticket **#${ticket.ticketId}** a été réouvert avec succès : ${newChannel}`,
                '🔓 Ticket réouvert'
            )]
        });

        Logger.info(`Ticket #${ticket.ticketId} réouvert par ${interaction.user.tag}`);

    } catch (error) {
        Logger.error(`Erreur lors de la réouverture du ticket #${ticketIdInput} : ${error.message}`, error);
        await interaction.editReply({
            embeds: [errorEmbed('Une erreur est survenue lors de la réouverture du ticket.')]
        });
    }
}

/* ═══════════════════════════════════════════════════
   Sous-commande : stats — Statistiques de tickets
   ═══════════════════════════════════════════════════ */

/**
 * Affiche les statistiques de tickets pour un utilisateur ou le staff.
 * Inclut : nombre total de tickets, note moyenne, temps moyen de réponse.
 * Réservé aux administrateurs.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleStats(interaction, client) {
    // Vérifier les permissions administrateur
    const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
    if (!isAdmin(interaction.member, guildSettings)) {
        return interaction.reply({
            embeds: [errorEmbed('Vous n\'avez pas la permission de voir les statistiques.')],
            ephemeral: true
        });
    }

    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
        // Récupérer les tickets créés par l'utilisateur
        const userTickets = await Ticket.find({
            guildId: interaction.guild.id,
            userId: targetUser.id
        }).lean();

        // Récupérer les tickets pris en charge par l'utilisateur (en tant que staff)
        const staffTickets = await Ticket.find({
            guildId: interaction.guild.id,
            claimedBy: targetUser.id
        }).lean();

        // Calculer les statistiques des tickets créés
        const totalCreated = userTickets.length;
        const openTickets = userTickets.filter(t => t.status === 'open' || t.status === 'claimed').length;
        const closedTickets = userTickets.filter(t => t.status === 'closed').length;

        // Calculer la note moyenne reçue (tickets créés par l'utilisateur)
        const ratedTickets = userTickets.filter(t => t.rating !== null);
        const avgRatingCreated = ratedTickets.length > 0
            ? (ratedTickets.reduce((sum, t) => sum + t.rating, 0) / ratedTickets.length).toFixed(1)
            : 'N/A';

        // Calculer les statistiques en tant que staff
        const totalHandled = staffTickets.length;
        const ratedStaffTickets = staffTickets.filter(t => t.rating !== null);
        const avgRatingStaff = ratedStaffTickets.length > 0
            ? (ratedStaffTickets.reduce((sum, t) => sum + t.rating, 0) / ratedStaffTickets.length).toFixed(1)
            : 'N/A';

        // Calculer le temps moyen de réponse (entre l'ouverture et la prise en charge)
        // On utilise les tickets pris en charge et fermés pour estimer le temps de traitement
        const closedStaffTickets = staffTickets.filter(t => t.status === 'closed' && t.openedAt && t.closedAt);
        let avgResponseTime = 'N/A';

        if (closedStaffTickets.length > 0) {
            const totalTime = closedStaffTickets.reduce((sum, t) => {
                return sum + (new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime());
            }, 0);
            const avgMs = totalTime / closedStaffTickets.length;
            avgResponseTime = formatDuration(avgMs);
        }

        // Construire l'embed de statistiques
        const statsEmbed = createEmbed({
            title: `📊 Statistiques de tickets — ${targetUser.tag}`,
            color: 'info',
            thumbnail: targetUser.displayAvatarURL({ dynamic: true, size: 128 }),
            fields: [
                {
                    name: '📩 Tickets créés',
                    value:
                        `**Total :** ${totalCreated}\n` +
                        `**Ouverts :** ${openTickets}\n` +
                        `**Fermés :** ${closedTickets}\n` +
                        `**Note moyenne :** ${avgRatingCreated !== 'N/A' ? `${avgRatingCreated}/5 ⭐` : 'N/A'}`,
                    inline: true
                },
                {
                    name: '🛠️ Tickets traités (staff)',
                    value:
                        `**Total :** ${totalHandled}\n` +
                        `**Note moyenne :** ${avgRatingStaff !== 'N/A' ? `${avgRatingStaff}/5 ⭐` : 'N/A'}\n` +
                        `**Temps moyen :** ${avgResponseTime}`,
                    inline: true
                }
            ],
            footer: { text: `Statistiques de ${targetUser.tag} • ${interaction.guild.name}` }
        });

        await interaction.editReply({ embeds: [statsEmbed] });

    } catch (error) {
        Logger.error(`Erreur lors de la récupération des statistiques : ${error.message}`, error);
        await interaction.editReply({
            embeds: [errorEmbed('Une erreur est survenue lors de la récupération des statistiques.')]
        });
    }
}

/* ═══════════════════════════════════════════════════
   Sous-commande : leaderboard — Classement du staff
   ═══════════════════════════════════════════════════ */

/**
 * Affiche le classement des membres du staff par nombre de tickets traités
 * et note moyenne reçue. Réservé aux administrateurs.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleLeaderboard(interaction, client) {
    // Vérifier les permissions administrateur
    const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
    if (!isAdmin(interaction.member, guildSettings)) {
        return interaction.reply({
            embeds: [errorEmbed('Vous n\'avez pas la permission de voir le classement.')],
            ephemeral: true
        });
    }

    await interaction.deferReply();

    try {
        // Agrégation : regrouper les tickets fermés/claim par membre du staff
        const staffStats = await Ticket.aggregate([
            {
                // Filtrer les tickets de ce serveur qui ont été pris en charge
                $match: {
                    guildId: interaction.guild.id,
                    claimedBy: { $ne: null }
                }
            },
            {
                // Regrouper par membre du staff
                $group: {
                    _id: '$claimedBy',
                    totalTickets: { $sum: 1 },
                    avgRating: { $avg: '$rating' },
                    totalRated: {
                        $sum: {
                            $cond: [{ $ne: ['$rating', null] }, 1, 0]
                        }
                    }
                }
            },
            {
                // Trier par nombre de tickets traités (décroissant)
                $sort: { totalTickets: -1 }
            },
            {
                // Limiter à 10 membres du staff
                $limit: 10
            }
        ]);

        // Vérifier s'il y a des données
        if (staffStats.length === 0) {
            return interaction.editReply({
                embeds: [infoEmbed('Aucune donnée de classement disponible. Aucun ticket n\'a encore été pris en charge.')]
            });
        }

        // Construire le classement
        const medals = ['🥇', '🥈', '🥉'];
        let leaderboardText = '';

        for (let i = 0; i < staffStats.length; i++) {
            const stat = staffStats[i];
            const position = i < 3 ? medals[i] : `**#${i + 1}**`;

            // Essayer de récupérer le tag de l'utilisateur
            let userTag = `<@${stat._id}>`;

            // Formater la note moyenne
            const avgRating = stat.avgRating !== null
                ? `${stat.avgRating.toFixed(1)}/5 ⭐`
                : 'N/A';

            leaderboardText +=
                `${position} ${userTag}\n` +
                `> 🎫 **${stat.totalTickets}** ticket${stat.totalTickets > 1 ? 's' : ''} traité${stat.totalTickets > 1 ? 's' : ''} ` +
                `• Note : ${avgRating} (${stat.totalRated} avis)\n\n`;
        }

        // Construire l'embed du classement
        const leaderboardEmbed = createEmbed({
            title: '🏆 Classement du staff — Tickets',
            description: leaderboardText,
            color: 'info',
            footer: { text: `Classement du staff • ${interaction.guild.name}` },
            thumbnail: interaction.guild.iconURL({ dynamic: true, size: 256 })
        });

        await interaction.editReply({ embeds: [leaderboardEmbed] });

    } catch (error) {
        Logger.error(`Erreur lors de la récupération du classement : ${error.message}`, error);
        await interaction.editReply({
            embeds: [errorEmbed('Une erreur est survenue lors de la récupération du classement.')]
        });
    }
}

/* ═══════════════════════════════════════════════════
   Fonctions utilitaires
   ═══════════════════════════════════════════════════ */

/**
 * Formate une durée en millisecondes en texte lisible (jours, heures, minutes).
 *
 * @param {number} ms - Durée en millisecondes
 * @returns {string} Durée formatée en texte (ex: '2j 3h 15m')
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);

    // Si la durée est très courte (moins d'une minute)
    if (parts.length === 0) {
        return `${seconds}s`;
    }

    return parts.join(' ');
}

module.exports = {
    data,
    execute,
    module: 'tickets',
    adminOnly: false
};
