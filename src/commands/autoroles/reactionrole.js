// Commande de rôles par réaction - Crée et gère des panneaux de rôles interactifs avec boutons
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embed');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Créer un panel de rôles par réaction')
        .addSubcommand(sub =>
            sub
                .setName('create')
                .setDescription('Créer un nouveau panel de rôles')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Le salon où envoyer le panel')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('title')
                        .setDescription('Le titre du panel')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('La description du panel')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Le type de panel')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Normal (plusieurs rôles)', value: 'normal' },
                            { name: 'Unique (un seul rôle)', value: 'unique' },
                            { name: 'Vérification', value: 'verify' }
                        )
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('addrole')
                .setDescription('Ajouter un rôle à un panel existant')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('L\'identifiant du message du panel')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('L\'emoji associé au rôle')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Le rôle à attribuer')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    module: 'autoroles',
    adminOnly: true,

    async execute(interaction) {
        const { guild, client } = interaction;
        const subcommand = interaction.options.getSubcommand();

        try {
            // Récupérer ou créer la configuration du serveur
            let guildSettings = await Guild.findOne({ guildId: guild.id });
            if (!guildSettings) {
                guildSettings = await Guild.create({ guildId: guild.id });
            }

            // Initialiser le tableau des rôles par réaction si inexistant
            if (!guildSettings.autoroles) {
                guildSettings.autoroles = { joinRoles: [], reactionRoles: [] };
            }

            if (subcommand === 'create') {
                // ─── Sous-commande : créer un panel de rôles ───

                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title');
                const description = interaction.options.getString('description');
                const type = interaction.options.getString('type');

                // Vérifier que le bot peut envoyer des messages dans le salon cible
                const botPermissions = channel.permissionsFor(client.user);
                if (!botPermissions || !botPermissions.has('SendMessages')) {
                    return interaction.reply({
                        embeds: [errorEmbed(`Je n'ai pas la permission d'envoyer des messages dans ${channel}.`)],
                        ephemeral: true
                    });
                }

                // Construire l'embed du panel
                const panelEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(0x5865F2)
                    .setFooter({ text: `Type : ${type} • Cliquez sur un bouton pour obtenir le rôle` })
                    .setTimestamp();

                // Envoyer le panel dans le salon cible (sans boutons pour l'instant)
                const panelMessage = await channel.send({
                    embeds: [panelEmbed]
                });

                // Stocker les métadonnées du panel dans le footer pour les identifier plus tard
                // On utilise le messageId comme identifiant unique
                // Le type est stocké dans la base de données via les reactionRoles

                // Sauvegarder une entrée de référence dans la configuration du serveur
                // On stocke le type dans un champ emoji spécial pour le panel lui-même
                guildSettings.autoroles.reactionRoles.push({
                    messageId: panelMessage.id,
                    channelId: channel.id,
                    emoji: `__panel_type:${type}`,
                    roleId: '0'
                });
                await guildSettings.save();

                return interaction.reply({
                    embeds: [successEmbed(
                        `Le panel de rôles a été créé dans ${channel}.\n` +
                        `ID du message : \`${panelMessage.id}\`\n\n` +
                        `Utilisez \`/reactionrole addrole\` pour ajouter des rôles au panel.`
                    )],
                    ephemeral: true
                });

            } else if (subcommand === 'addrole') {
                // ─── Sous-commande : ajouter un rôle à un panel existant ───

                const messageId = interaction.options.getString('message_id');
                const emoji = interaction.options.getString('emoji');
                const role = interaction.options.getRole('role');

                // Vérifier que le rôle n'est pas géré ou @everyone
                if (role.managed) {
                    return interaction.reply({
                        embeds: [errorEmbed('Ce rôle est géré par une intégration et ne peut pas être utilisé.')],
                        ephemeral: true
                    });
                }

                if (role.id === guild.id) {
                    return interaction.reply({
                        embeds: [errorEmbed('Le rôle @everyone ne peut pas être ajouté.')],
                        ephemeral: true
                    });
                }

                // Vérifier la hiérarchie des rôles
                const botMember = await guild.members.fetch(client.user.id);
                if (role.position >= botMember.roles.highest.position) {
                    return interaction.reply({
                        embeds: [errorEmbed('Ce rôle est supérieur ou égal à mon rôle le plus élevé. Je ne pourrai pas l\'attribuer.')],
                        ephemeral: true
                    });
                }

                // Trouver le panel de référence dans la base de données
                const panelEntry = guildSettings.autoroles.reactionRoles.find(
                    rr => rr.messageId === messageId && rr.emoji.startsWith('__panel_type:')
                );

                if (!panelEntry) {
                    return interaction.reply({
                        embeds: [errorEmbed('Aucun panel de rôles trouvé avec cet identifiant de message.')],
                        ephemeral: true
                    });
                }

                // Récupérer le message du panel
                const channel = guild.channels.cache.get(panelEntry.channelId);
                if (!channel) {
                    return interaction.reply({
                        embeds: [errorEmbed('Le salon du panel n\'a pas été trouvé.')],
                        ephemeral: true
                    });
                }

                const panelMessage = await channel.messages.fetch(messageId).catch(() => null);
                if (!panelMessage) {
                    return interaction.reply({
                        embeds: [errorEmbed('Le message du panel n\'a pas été trouvé. Il a peut-être été supprimé.')],
                        ephemeral: true
                    });
                }

                // Sauvegarder l'association emoji → rôle dans la base de données
                guildSettings.autoroles.reactionRoles.push({
                    messageId: messageId,
                    channelId: panelEntry.channelId,
                    emoji: emoji,
                    roleId: role.id
                });
                await guildSettings.save();

                // Reconstruire tous les boutons pour ce panel
                const panelRoles = guildSettings.autoroles.reactionRoles.filter(
                    rr => rr.messageId === messageId && !rr.emoji.startsWith('__panel_type:')
                );

                // Construire les rangées de boutons (maximum 5 boutons par rangée, 5 rangées max)
                const rows = [];
                let currentRow = new ActionRowBuilder();
                let buttonCount = 0;

                for (const rr of panelRoles) {
                    const roleName = guild.roles.cache.get(rr.roleId)?.name || 'Rôle inconnu';
                    const button = new ButtonBuilder()
                        .setCustomId(`reactionrole_${rr.messageId}_${rr.roleId}`)
                        .setLabel(roleName)
                        .setStyle(ButtonStyle.Primary);

                    // Essayer d'ajouter l'emoji au bouton (peut échouer avec des emojis invalides)
                    try {
                        button.setEmoji(rr.emoji);
                    } catch {
                        // Si l'emoji est invalide, on ne l'ajoute pas au bouton
                    }

                    currentRow.addComponents(button);
                    buttonCount++;

                    // Discord limite à 5 boutons par rangée
                    if (buttonCount % 5 === 0) {
                        rows.push(currentRow);
                        currentRow = new ActionRowBuilder();
                    }
                }

                // Ajouter la dernière rangée si elle contient des boutons
                if (buttonCount % 5 !== 0) {
                    rows.push(currentRow);
                }

                // Mettre à jour le message du panel avec les nouveaux boutons
                await panelMessage.edit({ components: rows });

                return interaction.reply({
                    embeds: [successEmbed(
                        `Le rôle ${role} avec l'emoji ${emoji} a été ajouté au panel.\n` +
                        `Le panel contient maintenant **${panelRoles.length}** rôle(s).`
                    )],
                    ephemeral: true
                });
            }

        } catch (error) {
            Logger.error('Erreur lors de la gestion du panel de rôles :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de la gestion du panel de rôles.')],
                ephemeral: true
            });
        }
    },

    /**
     * Gère le clic sur un bouton de rôle par réaction.
     * Attribue ou retire le rôle selon l'état actuel du membre.
     * Pour le type 'unique', retire les autres rôles du même panel avant d'attribuer le nouveau.
     *
     * @param {import('discord.js').ButtonInteraction} interaction - L'interaction du bouton
     * @param {import('discord.js').Client} client - Le client Discord
     * @param {string[]} args - Les arguments extraits du customId [messageId, roleId]
     */
    async handleReactionRoleButton(interaction, client, args) {
        const { guild, member } = interaction;
        const [messageId, roleId] = args;

        try {
            // Récupérer la configuration du serveur
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            if (!guildSettings || !guildSettings.autoroles) {
                return interaction.reply({
                    embeds: [errorEmbed('La configuration des rôles par réaction est introuvable.')],
                    ephemeral: true
                });
            }

            // Vérifier que cette association existe dans la base de données
            const reactionRole = guildSettings.autoroles.reactionRoles.find(
                rr => rr.messageId === messageId && rr.roleId === roleId
            );

            if (!reactionRole) {
                return interaction.reply({
                    embeds: [errorEmbed('Ce bouton de rôle n\'est plus valide.')],
                    ephemeral: true
                });
            }

            // Récupérer le rôle depuis le serveur
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                return interaction.reply({
                    embeds: [errorEmbed('Le rôle associé à ce bouton n\'existe plus.')],
                    ephemeral: true
                });
            }

            // Déterminer le type du panel
            const panelEntry = guildSettings.autoroles.reactionRoles.find(
                rr => rr.messageId === messageId && rr.emoji.startsWith('__panel_type:')
            );
            const panelType = panelEntry ? panelEntry.emoji.replace('__panel_type:', '') : 'normal';

            // Vérifier si le membre possède déjà le rôle
            const hasRole = member.roles.cache.has(roleId);

            if (hasRole) {
                // Retirer le rôle si le membre l'a déjà
                await member.roles.remove(role);
                return interaction.reply({
                    embeds: [successEmbed(`Le rôle ${role} vous a été retiré.`)],
                    ephemeral: true
                });
            }

            // Pour le type 'unique', retirer les autres rôles du même panel avant d'ajouter le nouveau
            if (panelType === 'unique') {
                const panelRoles = guildSettings.autoroles.reactionRoles.filter(
                    rr => rr.messageId === messageId && !rr.emoji.startsWith('__panel_type:') && rr.roleId !== roleId
                );

                for (const rr of panelRoles) {
                    const otherRole = guild.roles.cache.get(rr.roleId);
                    if (otherRole && member.roles.cache.has(rr.roleId)) {
                        await member.roles.remove(otherRole).catch(() => null);
                    }
                }
            }

            // Attribuer le rôle au membre
            await member.roles.add(role);

            return interaction.reply({
                embeds: [successEmbed(`Le rôle ${role} vous a été attribué.`)],
                ephemeral: true
            });

        } catch (error) {
            Logger.error('Erreur lors du traitement du bouton de rôle :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de l\'attribution du rôle.')],
                ephemeral: true
            });
        }
    }
};
