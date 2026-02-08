// Système de tickets — gère la création, la fermeture, la notation et les transcriptions des tickets
const {
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const Ticket = require('../../database/models/ticket');
const Guild = require('../../database/models/guild');
const Logger = require('../utils/logger');
const { createEmbed, successEmbed, infoEmbed } = require('../utils/embed');

/**
 * Labels et émojis pour chaque catégorie de ticket.
 * Utilisé pour l'affichage dans les menus et les embeds.
 */
const CATEGORY_LABELS = {
    support: { label: 'Support', emoji: '🛠️', description: 'Aide technique ou question générale' },
    report: { label: 'Signalement', emoji: '🚨', description: 'Signaler un utilisateur ou un problème' },
    partnership: { label: 'Partenariat', emoji: '🤝', description: 'Demande de partenariat' },
    other: { label: 'Autre', emoji: '📋', description: 'Autre demande' }
};

/**
 * Émojis de notation par étoiles.
 */
const RATING_EMOJIS = ['⭐', '⭐', '⭐', '⭐', '⭐'];

module.exports = {
    /**
     * Gère les clics sur les boutons liés aux tickets.
     * Actions possibles : 'create' (afficher le menu de catégorie),
     * 'close' (fermer le ticket), 'claim' (prendre en charge le ticket).
     *
     * @param {import('discord.js').ButtonInteraction} interaction - L'interaction bouton
     * @param {import('discord.js').Client} client - Le client Discord
     * @param {string[]} args - Arguments extraits du customId (après 'ticket_')
     */
    async handleButton(interaction, client, args) {
        const action = args[0];

        switch (action) {
            case 'create':
                await this._showCategoryMenu(interaction, client);
                break;

            case 'close':
                await this.closeTicket(interaction, client);
                break;

            case 'claim':
                await this._claimTicket(interaction, client);
                break;

            default:
                Logger.warn(`Action de bouton ticket inconnue : ${action}`);
                break;
        }
    },

    /**
     * Affiche le menu déroulant de sélection de catégorie de ticket.
     * Récupère les catégories configurées pour le serveur ou utilise les catégories par défaut.
     *
     * @param {import('discord.js').ButtonInteraction} interaction - L'interaction bouton
     * @param {import('discord.js').Client} client - Le client Discord
     * @private
     */
    async _showCategoryMenu(interaction, client) {
        // Vérifier si l'utilisateur a déjà un ticket ouvert
        const existingTicket = await Ticket.findOne({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            status: { $in: ['open', 'claimed'] }
        });

        if (existingTicket) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: '❌ Ticket existant',
                    description: `Vous avez déjà un ticket ouvert : <#${existingTicket.channelId}>`,
                    color: 'error'
                })],
                ephemeral: true
            });
        }

        // Récupérer les paramètres du serveur pour les catégories personnalisées
        const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
        const ticketCategories = guildSettings?.tickets?.categories || [];

        // Construire les options du menu déroulant
        let options = [];

        if (ticketCategories.length > 0) {
            // Utiliser les catégories configurées par le serveur
            options = ticketCategories.map((cat, index) => ({
                label: cat.name,
                description: cat.description || 'Aucune description',
                value: `custom_${index}`,
                emoji: cat.emoji || '🎫'
            }));
        } else {
            // Utiliser les catégories par défaut
            options = Object.entries(CATEGORY_LABELS).map(([key, data]) => ({
                label: data.label,
                description: data.description,
                value: key,
                emoji: data.emoji
            }));
        }

        // Créer le menu déroulant de sélection de catégorie
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticketcategory_select')
            .setPlaceholder('📂 Choisissez une catégorie...')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            embeds: [createEmbed({
                title: '🎫 Créer un ticket',
                description: 'Veuillez sélectionner la catégorie qui correspond le mieux à votre demande.',
                color: 'info'
            })],
            components: [row],
            ephemeral: true
        });
    },

    /**
     * Gère la sélection d'une catégorie dans le menu déroulant.
     * Crée un nouveau salon privé, envoie l'embed de bienvenue
     * avec les boutons de gestion, et enregistre le ticket en base de données.
     *
     * @param {import('discord.js').StringSelectMenuInteraction} interaction - L'interaction menu
     * @param {import('discord.js').Client} client - Le client Discord
     * @param {string[]} args - Arguments extraits du customId
     */
    async handleCategorySelect(interaction, client, args) {
        await interaction.deferReply({ ephemeral: true });

        const selectedValue = interaction.values[0];
        const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });

        // Déterminer la catégorie sélectionnée et les paramètres associés
        let categoryName = 'support';
        let categoryLabel = 'Support';
        let ticketCategoryId = guildSettings?.tickets?.categoryId || null;
        let staffRoles = [];

        if (selectedValue.startsWith('custom_')) {
            // Catégorie personnalisée configurée par le serveur
            const index = parseInt(selectedValue.split('_')[1]);
            const customCategories = guildSettings?.tickets?.categories || [];
            const customCat = customCategories[index];

            if (customCat) {
                categoryName = customCat.name.toLowerCase().replace(/\s+/g, '-');
                categoryLabel = customCat.name;
                ticketCategoryId = customCat.categoryId || ticketCategoryId;
                staffRoles = customCat.staffRoles || [];
            }
        } else {
            // Catégorie par défaut
            categoryName = selectedValue;
            categoryLabel = CATEGORY_LABELS[selectedValue]?.label || selectedValue;
        }

        try {
            // Obtenir le prochain numéro de ticket pour ce serveur
            const ticketNumber = await Ticket.getNextTicketId(interaction.guild.id);
            const channelName = `ticket-${ticketNumber}-${interaction.user.username}`.substring(0, 100);

            // Construire les permissions du salon
            const permissionOverwrites = [
                {
                    // Interdire l'accès à @everyone
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    // Autoriser l'accès à l'utilisateur qui a créé le ticket
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.EmbedLinks
                    ]
                },
                {
                    // Autoriser l'accès au bot
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

            // Ajouter les rôles du staff avec accès au salon
            for (const roleId of staffRoles) {
                permissionOverwrites.push({
                    id: roleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                });
            }

            // Si aucun rôle staff personnalisé, ajouter le rôle admin configuré
            if (staffRoles.length === 0 && guildSettings?.permissions?.adminRoleId) {
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

            // Créer le salon textuel privé pour le ticket
            const ticketChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: ticketCategoryId || undefined,
                permissionOverwrites: permissionOverwrites,
                topic: `Ticket #${ticketNumber} | ${categoryLabel} | Créé par ${interaction.user.tag}`
            });

            // Construire l'embed de bienvenue dans le ticket
            const welcomeEmbed = createEmbed({
                title: `🎫 Ticket #${ticketNumber}`,
                description:
                    `Bienvenue ${interaction.user}, merci d'avoir créé un ticket !\n\n` +
                    `**Catégorie :** ${categoryLabel}\n` +
                    `**Créé par :** ${interaction.user.tag}\n\n` +
                    `📝 Veuillez décrire votre demande en détail.\n` +
                    `Un membre du staff vous répondra dès que possible.`,
                color: 'info',
                footer: { text: `Ticket #${ticketNumber} • ${interaction.guild.name}` },
                thumbnail: interaction.user.displayAvatarURL({ dynamic: true, size: 128 })
            });

            // Construire les boutons de gestion du ticket (fermer / prendre en charge)
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

            // Envoyer l'embed de bienvenue et les boutons dans le salon du ticket
            await ticketChannel.send({
                content: `${interaction.user}`,
                embeds: [welcomeEmbed],
                components: [actionRow]
            });

            // Enregistrer le ticket dans la base de données
            await Ticket.create({
                guildId: interaction.guild.id,
                ticketId: ticketNumber,
                channelId: ticketChannel.id,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                category: Object.keys(CATEGORY_LABELS).includes(selectedValue) ? selectedValue : 'other',
                status: 'open',
                openedAt: new Date()
            });

            // Répondre à l'utilisateur avec un lien vers le ticket
            await interaction.editReply({
                embeds: [successEmbed(`Votre ticket a été créé avec succès : ${ticketChannel}`)]
            });

            // Journaliser la création du ticket
            Logger.info(`Ticket #${ticketNumber} créé par ${interaction.user.tag} sur ${interaction.guild.name}`);

            // Journaliser via le système de logs (logs.tickets)
            client.systems?.logs?.logTicket(interaction.guild, 'ticket_created', {
                user: interaction.user,
                channel: ticketChannel,
                category: categoryLabel,
                ticketId: ticketNumber
            });

            // Envoyer un log dans le salon de logs des tickets si configuré
            if (guildSettings?.tickets?.logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(guildSettings.tickets.logChannelId);
                if (logChannel) {
                    await logChannel.send({
                        embeds: [createEmbed({
                            title: '📩 Nouveau ticket créé',
                            description:
                                `**Ticket :** #${ticketNumber}\n` +
                                `**Salon :** ${ticketChannel}\n` +
                                `**Catégorie :** ${categoryLabel}\n` +
                                `**Créé par :** ${interaction.user.tag} (${interaction.user.id})`,
                            color: 'info',
                            footer: { text: `Ticket #${ticketNumber}` }
                        })]
                    }).catch(() => {});
                }
            }

        } catch (error) {
            Logger.error(`Erreur lors de la création du ticket : ${error.message}`, error);
            await interaction.editReply({
                embeds: [createEmbed({
                    title: '❌ Erreur',
                    description: 'Une erreur est survenue lors de la création du ticket. Veuillez réessayer.',
                    color: 'error'
                })]
            }).catch(() => {});
        }
    },

    /**
     * Gère la notation d'un ticket par l'utilisateur (1 à 5 étoiles).
     * Enregistre la note dans la base de données et envoie une confirmation.
     *
     * @param {import('discord.js').ButtonInteraction} interaction - L'interaction bouton
     * @param {import('discord.js').Client} client - Le client Discord
     * @param {string[]} args - Arguments extraits du customId (contient le ticketId et la note)
     */
    async handleRating(interaction, client, args) {
        // Le customId est au format : rate_<ticketId>_<note>
        const ticketId = parseInt(args[0]);
        const rating = parseInt(args[1]);

        // Valider la note
        if (isNaN(rating) || rating < 1 || rating > 5) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: '❌ Erreur',
                    description: 'Note invalide. Veuillez choisir entre 1 et 5 étoiles.',
                    color: 'error'
                })],
                ephemeral: true
            });
        }

        try {
            // Rechercher le ticket dans la base de données
            const ticket = await Ticket.findOne({
                guildId: interaction.guild.id,
                ticketId: ticketId
            });

            if (!ticket) {
                return interaction.reply({
                    embeds: [createEmbed({
                        title: '❌ Erreur',
                        description: 'Ticket introuvable.',
                        color: 'error'
                    })],
                    ephemeral: true
                });
            }

            // Vérifier que c'est bien le créateur du ticket qui note
            if (ticket.userId !== interaction.user.id) {
                return interaction.reply({
                    embeds: [createEmbed({
                        title: '❌ Erreur',
                        description: 'Seul le créateur du ticket peut attribuer une note.',
                        color: 'error'
                    })],
                    ephemeral: true
                });
            }

            // Vérifier si le ticket a déjà été noté
            if (ticket.rating !== null) {
                return interaction.reply({
                    embeds: [createEmbed({
                        title: '❌ Déjà noté',
                        description: `Vous avez déjà attribué une note de ${RATING_EMOJIS.slice(0, ticket.rating).join('')} à ce ticket.`,
                        color: 'warning'
                    })],
                    ephemeral: true
                });
            }

            // Enregistrer la note dans la base de données
            ticket.rating = rating;
            await ticket.save();

            // Générer l'affichage des étoiles
            const starsDisplay = RATING_EMOJIS.slice(0, rating).join('');

            // Désactiver les boutons de notation en mettant à jour le message
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    ...interaction.message.components[0].components.map(btn =>
                        ButtonBuilder.from(btn).setDisabled(true)
                    )
                );
                await interaction.message.edit({ components: [disabledRow] });
            } catch {
                // Ignorer si le message ne peut pas être modifié
            }

            await interaction.reply({
                embeds: [successEmbed(
                    `Merci pour votre note ! Vous avez attribué ${starsDisplay} (${rating}/5) au ticket #${ticketId}.`,
                    '⭐ Évaluation enregistrée'
                )],
                ephemeral: true
            });

            Logger.info(`Ticket #${ticketId} noté ${rating}/5 par ${interaction.user.tag}`);

            // Envoyer la note dans le salon de logs si configuré
            const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
            if (guildSettings?.tickets?.logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(guildSettings.tickets.logChannelId);
                if (logChannel) {
                    await logChannel.send({
                        embeds: [createEmbed({
                            title: '⭐ Ticket noté',
                            description:
                                `**Ticket :** #${ticketId}\n` +
                                `**Note :** ${starsDisplay} (${rating}/5)\n` +
                                `**Noté par :** ${interaction.user.tag}`,
                            color: rating >= 4 ? 'success' : rating >= 2 ? 'warning' : 'error',
                            footer: { text: `Ticket #${ticketId}` }
                        })]
                    }).catch(() => {});
                }
            }

        } catch (error) {
            Logger.error(`Erreur lors de la notation du ticket : ${error.message}`, error);
            await interaction.reply({
                embeds: [createEmbed({
                    title: '❌ Erreur',
                    description: 'Une erreur est survenue lors de l\'enregistrement de la note.',
                    color: 'error'
                })],
                ephemeral: true
            }).catch(() => {});
        }
    },

    /**
     * Génère une transcription textuelle lisible de tous les messages d'un salon.
     * Récupère l'historique complet des messages et les formate en texte brut.
     *
     * @param {import('discord.js').TextChannel} channel - Le salon dont on veut la transcription
     * @returns {Promise<string>} La transcription formatée en texte
     */
    async generateTranscript(channel) {
        let allMessages = [];
        let lastMessageId = null;

        // Récupérer tous les messages du salon par lots de 100
        while (true) {
            const options = { limit: 100 };
            if (lastMessageId) {
                options.before = lastMessageId;
            }

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) break;

            allMessages.push(...messages.values());
            lastMessageId = messages.last().id;

            // Sécurité : limiter à 1000 messages pour éviter les boucles infinies
            if (allMessages.length >= 1000) break;
        }

        // Trier les messages par date croissante (du plus ancien au plus récent)
        allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        // Construire l'en-tête de la transcription
        const lines = [];
        lines.push('═══════════════════════════════════════════════════');
        lines.push(`  TRANSCRIPTION DU SALON : #${channel.name}`);
        lines.push(`  Serveur : ${channel.guild.name}`);
        lines.push(`  Date de génération : ${new Date().toLocaleString('fr-FR')}`);
        lines.push(`  Total de messages : ${allMessages.length}`);
        lines.push('═══════════════════════════════════════════════════');
        lines.push('');

        // Formater chaque message
        for (const msg of allMessages) {
            const timestamp = new Date(msg.createdTimestamp).toLocaleString('fr-FR');
            const author = msg.author?.tag || 'Utilisateur inconnu';

            lines.push(`[${timestamp}] ${author} :`);

            // Contenu textuel du message
            if (msg.content) {
                lines.push(`  ${msg.content}`);
            }

            // Pièces jointes (fichiers, images)
            if (msg.attachments.size > 0) {
                for (const attachment of msg.attachments.values()) {
                    lines.push(`  📎 Pièce jointe : ${attachment.url}`);
                }
            }

            // Embeds (résumé seulement)
            if (msg.embeds.length > 0) {
                for (const embed of msg.embeds) {
                    if (embed.title) lines.push(`  [Embed] ${embed.title}`);
                    if (embed.description) lines.push(`  ${embed.description}`);
                }
            }

            // Stickers
            if (msg.stickers?.size > 0) {
                for (const sticker of msg.stickers.values()) {
                    lines.push(`  🏷️ Sticker : ${sticker.name}`);
                }
            }

            lines.push('');
        }

        lines.push('═══════════════════════════════════════════════════');
        lines.push('  FIN DE LA TRANSCRIPTION');
        lines.push('═══════════════════════════════════════════════════');

        return lines.join('\n');
    },

    /**
     * Ferme un ticket : génère la transcription, l'enregistre en base de données,
     * l'envoie dans le salon de transcriptions, affiche les boutons de notation,
     * puis supprime le salon après un délai de 10 secondes.
     *
     * @param {import('discord.js').ButtonInteraction|import('discord.js').ChatInputCommandInteraction} interaction - L'interaction
     * @param {import('discord.js').Client} client - Le client Discord
     * @param {string} [reason='Aucune raison fournie'] - Raison de la fermeture
     */
    async closeTicket(interaction, client, reason = 'Aucune raison fournie') {
        // Rechercher le ticket associé à ce salon
        const ticket = await Ticket.findOne({
            channelId: interaction.channel.id,
            status: { $in: ['open', 'claimed'] }
        });

        if (!ticket) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: '❌ Erreur',
                    description: 'Ce salon n\'est pas un ticket ou le ticket est déjà fermé.',
                    color: 'error'
                })],
                ephemeral: true
            });
        }

        await interaction.reply({
            embeds: [createEmbed({
                title: '🔒 Fermeture du ticket',
                description: 'Le ticket va être fermé dans **10 secondes**...\nGénération de la transcription en cours...',
                color: 'warning'
            })]
        });

        try {
            // Générer la transcription du ticket
            const transcript = await this.generateTranscript(interaction.channel);

            // Mettre à jour le ticket dans la base de données
            ticket.status = 'closed';
            ticket.closedAt = new Date();
            ticket.closedBy = interaction.user.id;
            ticket.closeReason = reason;
            ticket.transcript = transcript;
            await ticket.save();

            // Récupérer les paramètres du serveur
            const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });

            // Envoyer la transcription dans le salon dédié si configuré
            if (guildSettings?.tickets?.transcriptChannelId) {
                const transcriptChannel = interaction.guild.channels.cache.get(
                    guildSettings.tickets.transcriptChannelId
                );

                if (transcriptChannel) {
                    // Créer l'embed récapitulatif du ticket
                    const transcriptEmbed = createEmbed({
                        title: `📋 Transcription — Ticket #${ticket.ticketId}`,
                        description:
                            `**Créé par :** <@${ticket.userId}> (${ticket.userTag})\n` +
                            `**Catégorie :** ${ticket.category}\n` +
                            `**Pris en charge par :** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Personne'}\n` +
                            `**Fermé par :** ${interaction.user.tag}\n` +
                            `**Raison :** ${reason}\n` +
                            `**Ouvert le :** ${ticket.openedAt.toLocaleString('fr-FR')}\n` +
                            `**Fermé le :** ${new Date().toLocaleString('fr-FR')}`,
                        color: 'log',
                        footer: { text: `Ticket #${ticket.ticketId} • ${interaction.guild.name}` }
                    });

                    // Envoyer la transcription sous forme de fichier texte
                    await transcriptChannel.send({
                        embeds: [transcriptEmbed],
                        files: [{
                            attachment: Buffer.from(transcript, 'utf-8'),
                            name: `transcript-ticket-${ticket.ticketId}.txt`
                        }]
                    }).catch(err => {
                        Logger.error(`Erreur lors de l'envoi de la transcription : ${err.message}`);
                    });
                }
            }

            // Envoyer les boutons de notation à l'utilisateur en MP
            try {
                const ticketUser = await client.users.fetch(ticket.userId);

                // Construire les boutons de notation (1 à 5 étoiles)
                const ratingRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`rate_${ticket.ticketId}_1`)
                        .setLabel('1')
                        .setEmoji('⭐')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`rate_${ticket.ticketId}_2`)
                        .setLabel('2')
                        .setEmoji('⭐')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`rate_${ticket.ticketId}_3`)
                        .setLabel('3')
                        .setEmoji('⭐')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`rate_${ticket.ticketId}_4`)
                        .setLabel('4')
                        .setEmoji('⭐')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`rate_${ticket.ticketId}_5`)
                        .setLabel('5')
                        .setEmoji('⭐')
                        .setStyle(ButtonStyle.Primary)
                );

                await ticketUser.send({
                    embeds: [createEmbed({
                        title: '⭐ Évaluez votre expérience',
                        description:
                            `Votre ticket **#${ticket.ticketId}** sur **${interaction.guild.name}** a été fermé.\n\n` +
                            `Veuillez noter la qualité du support reçu en cliquant sur une étoile ci-dessous.`,
                        color: 'info',
                        footer: { text: `Ticket #${ticket.ticketId}` }
                    })],
                    components: [ratingRow]
                });
            } catch {
                // Impossible d'envoyer un MP (MPs désactivés)
                Logger.warn(`Impossible d'envoyer les boutons de notation en MP à ${ticket.userTag}`);
            }

            // Envoyer un log dans le salon de logs des tickets si configuré
            if (guildSettings?.tickets?.logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(guildSettings.tickets.logChannelId);
                if (logChannel) {
                    await logChannel.send({
                        embeds: [createEmbed({
                            title: '🔒 Ticket fermé',
                            description:
                                `**Ticket :** #${ticket.ticketId}\n` +
                                `**Créé par :** ${ticket.userTag} (${ticket.userId})\n` +
                                `**Fermé par :** ${interaction.user.tag}\n` +
                                `**Raison :** ${reason}`,
                            color: 'error',
                            footer: { text: `Ticket #${ticket.ticketId}` }
                        })]
                    }).catch(() => {});
                }
            }

            Logger.info(`Ticket #${ticket.ticketId} fermé par ${interaction.user.tag} sur ${interaction.guild.name}`);

            // Journaliser via le système de logs (logs.tickets)
            client.systems?.logs?.logTicket(interaction.guild, 'ticket_closed', {
                user: { tag: ticket.userTag, id: ticket.userId },
                closedBy: interaction.user,
                channel: interaction.channel,
                reason: reason,
                ticketId: ticket.ticketId
            });

            // Supprimer le salon après 10 secondes
            setTimeout(async () => {
                try {
                    await interaction.channel.delete(`Ticket #${ticket.ticketId} fermé`);
                } catch (err) {
                    Logger.error(`Erreur lors de la suppression du salon du ticket #${ticket.ticketId} : ${err.message}`);
                }
            }, 10_000);

        } catch (error) {
            Logger.error(`Erreur lors de la fermeture du ticket : ${error.message}`, error);
            await interaction.followUp({
                embeds: [createEmbed({
                    title: '❌ Erreur',
                    description: 'Une erreur est survenue lors de la fermeture du ticket.',
                    color: 'error'
                })],
                ephemeral: true
            }).catch(() => {});
        }
    },

    /**
     * Prend en charge un ticket (claim). Marque le ticket comme « claimed »
     * dans la base de données et notifie le salon.
     *
     * @param {import('discord.js').ButtonInteraction} interaction - L'interaction bouton
     * @param {import('discord.js').Client} client - Le client Discord
     * @private
     */
    async _claimTicket(interaction, client) {
        // Rechercher le ticket associé à ce salon
        const ticket = await Ticket.findOne({
            channelId: interaction.channel.id,
            status: 'open'
        });

        if (!ticket) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: '❌ Erreur',
                    description: 'Ce ticket n\'est pas ouvert ou n\'existe pas.',
                    color: 'error'
                })],
                ephemeral: true
            });
        }

        // Vérifier si le ticket est déjà pris en charge
        if (ticket.status === 'claimed') {
            return interaction.reply({
                embeds: [createEmbed({
                    title: '❌ Déjà pris en charge',
                    description: `Ce ticket est déjà pris en charge par <@${ticket.claimedBy}>.`,
                    color: 'warning'
                })],
                ephemeral: true
            });
        }

        // Mettre à jour le statut du ticket
        ticket.status = 'claimed';
        ticket.claimedBy = interaction.user.id;
        await ticket.save();

        // Mettre à jour les boutons du message (désactiver le bouton claim)
        try {
            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('Fermer le ticket')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('ticket_claim')
                    .setLabel(`Pris en charge par ${interaction.user.username}`)
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true)
            );

            await interaction.message.edit({ components: [updatedRow] });
        } catch {
            // Ignorer si le message ne peut pas être modifié
        }

        await interaction.reply({
            embeds: [successEmbed(
                `${interaction.user} a pris en charge ce ticket.\nLe membre du staff assigné est désormais responsable de cette demande.`,
                '✋ Ticket pris en charge'
            )]
        });

        Logger.info(`Ticket #${ticket.ticketId} pris en charge par ${interaction.user.tag}`);

        // Journaliser via le système de logs (logs.tickets)
        client.systems?.logs?.logTicket(interaction.guild, 'ticket_claimed', {
            user: { tag: ticket.userTag, id: ticket.userId },
            staff: interaction.user,
            channel: interaction.channel,
            ticketId: ticket.ticketId
        });

        // Envoyer un log si configuré
        const guildSettings = await Guild.findOne({ guildId: interaction.guild.id });
        if (guildSettings?.tickets?.logChannelId) {
            const logChannel = interaction.guild.channels.cache.get(guildSettings.tickets.logChannelId);
            if (logChannel) {
                await logChannel.send({
                    embeds: [createEmbed({
                        title: '✋ Ticket pris en charge',
                        description:
                            `**Ticket :** #${ticket.ticketId}\n` +
                            `**Pris en charge par :** ${interaction.user.tag} (${interaction.user.id})`,
                        color: 'success',
                        footer: { text: `Ticket #${ticket.ticketId}` }
                    })]
                }).catch(() => {});
            }
        }
    }
};
