// Commande de configuration automatique des salons de logs - Crée une catégorie et les salons nécessaires
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { successEmbed, errorEmbed, createEmbed } = require('../../utils/embed');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

/* ─── Définition des presets de salons de logs ─── */
const PRESETS = {
    simple: {
        label: 'Simple',
        channels: [
            { name: '📝-moderation', logType: 'moderation' },
            { name: '💬-messages', logType: 'messageDelete' },
            { name: '👥-membres', logType: 'memberJoinLeave' },
            { name: '⚠️-antiraid', logType: 'antiraid' }
        ]
    },
    complete: {
        label: 'Complet',
        channels: [
            { name: '📝-moderation', logType: 'moderation' },
            { name: '💬-messages', logType: 'messageDelete' },
            { name: '👥-membres', logType: 'memberJoinLeave' },
            { name: '⚠️-antiraid', logType: 'antiraid' },
            { name: '🎭-roles', logType: 'roleUpdate' },
            { name: '🔊-vocal', logType: 'voice' },
            { name: '⚙️-serveur', logType: 'server' },
            { name: '🎫-tickets', logType: 'tickets' }
        ]
    },
    extreme: {
        label: 'Extrême',
        channels: [
            { name: '📝-moderation', logType: 'moderation' },
            { name: '💬-messages', logType: 'messageDelete' },
            { name: '👥-membres', logType: 'memberJoinLeave' },
            { name: '⚠️-antiraid', logType: 'antiraid' },
            { name: '🎭-roles', logType: 'roleUpdate' },
            { name: '🔊-vocal', logType: 'voice' },
            { name: '⚙️-serveur', logType: 'server' },
            { name: '🎫-tickets', logType: 'tickets' },
            { name: '🖼️-avatars', logType: 'memberJoinLeave' },
            { name: '🎉-invitations', logType: 'server' },
            { name: '😀-emojis', logType: 'server' },
            { name: '🤖-webhooks', logType: 'server' }
        ]
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configurer les salons de logs automatiquement')
        .addStringOption(option =>
            option
                .setName('preset')
                .setDescription('Le type de configuration à appliquer')
                .setRequired(true)
                .addChoices(
                    { name: '🟢 Simple (4 salons)', value: 'simple' },
                    { name: '🟡 Complet (8 salons)', value: 'complete' },
                    { name: '🔴 Extrême (12+ salons)', value: 'extreme' }
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    module: 'logs',
    adminOnly: true,

    async execute(interaction) {
        const { guild, client } = interaction;
        const preset = interaction.options.getString('preset');
        const presetConfig = PRESETS[preset];

        // Différer la réponse car la création de salons peut prendre du temps
        await interaction.deferReply({ ephemeral: true });

        try {
            // Créer la catégorie principale pour les logs
            const category = await guild.channels.create({
                name: '📊 Logs',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        // Refuser la vue à @everyone
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        // Autoriser la vue au bot
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.EmbedLinks
                        ]
                    }
                ]
            });

            Logger.info(`Catégorie de logs créée sur ${guild.name} (${guild.id})`);

            // Préparer la mise à jour des paramètres de logs dans la base de données
            const logsUpdate = {};
            const createdChannels = [];

            // Créer chaque salon de log selon le preset choisi
            for (const channelConfig of presetConfig.channels) {
                const channel = await guild.channels.create({
                    name: channelConfig.name,
                    type: ChannelType.GuildText,
                    parent: category.id,
                    permissionOverwrites: [
                        {
                            // Refuser la vue à @everyone
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            // Autoriser la vue au bot uniquement
                            id: client.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.EmbedLinks,
                                PermissionFlagsBits.AttachFiles
                            ]
                        }
                    ]
                });

                // Enregistrer le mapping type de log -> ID du salon
                logsUpdate[`logs.${channelConfig.logType}.channelId`] = channel.id;
                logsUpdate[`logs.${channelConfig.logType}.enabled`] = true;

                createdChannels.push({ name: channelConfig.name, id: channel.id });

                Logger.debug(`Salon de log créé : ${channelConfig.name} (${channel.id})`);
            }

            // Activer le module de logs et mettre à jour la configuration en base de données
            await Guild.findOneAndUpdate(
                { guildId: guild.id },
                {
                    $set: {
                        'modules.logs': true,
                        ...logsUpdate
                    }
                },
                { upsert: true, new: true }
            );

            // Construire la liste des salons créés pour l'embed de confirmation
            const channelList = createdChannels
                .map(ch => `> <#${ch.id}> — \`${ch.name}\``)
                .join('\n');

            // Répondre avec un embed de succès détaillé
            const embed = createEmbed({
                title: '✅ Configuration des logs terminée',
                description:
                    `Le preset **${presetConfig.label}** a été appliqué avec succès.\n\n` +
                    `**${createdChannels.length} salons** ont été créés dans la catégorie **📊 Logs** :\n\n` +
                    channelList,
                color: 'success',
                fields: [
                    {
                        name: '🔒 Permissions',
                        value: 'Seuls les administrateurs et le bot peuvent voir ces salons.',
                        inline: false
                    },
                    {
                        name: '💡 Astuce',
                        value: 'Utilisez `/config view logs` pour voir la configuration actuelle des logs.',
                        inline: false
                    }
                ],
                footer: { text: `Preset: ${presetConfig.label} • ${createdChannels.length} salons créés` }
            });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            Logger.error(`Erreur lors du setup des logs sur ${guild.name}: ${error.message}`);
            return interaction.editReply({
                embeds: [errorEmbed(
                    `Une erreur est survenue lors de la création des salons de logs.\n` +
                    `**Erreur:** ${error.message}\n\n` +
                    `Vérifiez que le bot possède les permissions nécessaires (Gérer les salons).`
                )]
            });
        }
    }
};
