// Commande de gestion des backups - Créer, lister et restaurer des sauvegardes du serveur
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, createEmbed, warningEmbed } = require('../../utils/embed');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Gérer les backups')
        /* ─── Sous-commande : créer une backup ─── */
        .addSubcommand(sub =>
            sub
                .setName('create')
                .setDescription('Créer une sauvegarde du serveur')
        )
        /* ─── Sous-commande : lister les backups disponibles ─── */
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('Lister les sauvegardes disponibles')
        )
        /* ─── Sous-commande : restaurer une backup ─── */
        .addSubcommand(sub =>
            sub
                .setName('restore')
                .setDescription('Restaurer une sauvegarde')
                .addStringOption(option =>
                    option
                        .setName('backup_id')
                        .setDescription('L\'identifiant de la sauvegarde à restaurer')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    module: 'backup',
    adminOnly: true,

    async execute(interaction) {
        const { guild, client } = interaction;
        const subcommand = interaction.options.getSubcommand();

        // Vérifier que le système de backup est disponible
        if (!client.systems?.backup) {
            return interaction.reply({
                embeds: [errorEmbed(
                    'Le système de backup n\'est pas initialisé.\n' +
                    'Vérifiez que le module `backup` est activé avec `/config set backup enabled true`.'
                )],
                ephemeral: true
            });
        }

        switch (subcommand) {
            case 'create':
                return await handleCreate(interaction, client);
            case 'list':
                return await handleList(interaction, client);
            case 'restore':
                return await handleRestore(interaction, client);
            default:
                return interaction.reply({
                    embeds: [errorEmbed('Sous-commande inconnue.')],
                    ephemeral: true
                });
        }
    }
};

/**
 * Crée une nouvelle sauvegarde du serveur.
 * Capture la configuration actuelle, les salons, les rôles et les paramètres.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client - Instance du client Discord
 */
async function handleCreate(interaction, client) {
    const { guild } = interaction;

    // Différer la réponse car la création de backup peut prendre du temps
    await interaction.deferReply({ ephemeral: true });

    try {
        // Appeler le système de backup pour créer la sauvegarde
        const backup = await client.systems.backup.create(guild.id, {
            createdBy: interaction.user.id,
            createdByTag: interaction.user.tag
        });

        Logger.info(`Backup créée pour ${guild.name} (${guild.id}) par ${interaction.user.tag} — ID: ${backup.id}`);

        const embed = createEmbed({
            title: '💾 Sauvegarde créée',
            description: 'La sauvegarde du serveur a été créée avec succès.',
            color: 'success',
            fields: [
                {
                    name: '🔑 Identifiant',
                    value: `> \`${backup.id}\``,
                    inline: true
                },
                {
                    name: '📅 Date de création',
                    value: `> <t:${Math.floor(Date.now() / 1000)}:f>`,
                    inline: true
                },
                {
                    name: '👤 Créée par',
                    value: `> ${interaction.user.tag}`,
                    inline: true
                },
                {
                    name: '📦 Contenu sauvegardé',
                    value:
                        `> 📁 Salons : \`${backup.data?.channels?.length || 'N/A'}\`\n` +
                        `> 🎭 Rôles : \`${backup.data?.roles?.length || 'N/A'}\`\n` +
                        `> ⚙️ Paramètres : ✅\n` +
                        `> 😀 Emojis : \`${backup.data?.emojis?.length || 'N/A'}\``,
                    inline: false
                }
            ],
            footer: { text: 'Utilisez /backup restore pour restaurer cette sauvegarde' }
        });

        return interaction.editReply({ embeds: [embed] });

    } catch (error) {
        Logger.error(`Erreur lors de la création de la backup : ${error.message}`);
        return interaction.editReply({
            embeds: [errorEmbed(`Une erreur est survenue lors de la création de la sauvegarde : ${error.message}`)]
        });
    }
}

/**
 * Liste toutes les sauvegardes disponibles pour ce serveur.
 * Affiche les identifiants, dates et créateurs de chaque backup.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client - Instance du client Discord
 */
async function handleList(interaction, client) {
    const { guild } = interaction;

    await interaction.deferReply({ ephemeral: true });

    try {
        // Récupérer la liste des backups depuis le système
        const backups = await client.systems.backup.list(guild.id);

        // Vérifier qu'il y a des backups disponibles
        if (!backups || backups.length === 0) {
            return interaction.editReply({
                embeds: [createEmbed({
                    title: '💾 Sauvegardes',
                    description: 'Aucune sauvegarde n\'est disponible pour ce serveur.\n\nUtilisez `/backup create` pour en créer une.',
                    color: 'info'
                })]
            });
        }

        // Formater la liste des backups
        const backupList = backups.map((backup, index) => {
            const date = backup.createdAt
                ? `<t:${Math.floor(new Date(backup.createdAt).getTime() / 1000)}:f>`
                : '*Date inconnue*';
            const creator = backup.createdByTag || '*Inconnu*';
            const channelCount = backup.data?.channels?.length || '?';
            const roleCount = backup.data?.roles?.length || '?';

            return (
                `**${index + 1}.** \`${backup.id}\`\n` +
                `> 📅 ${date}\n` +
                `> 👤 ${creator}\n` +
                `> 📁 ${channelCount} salons • 🎭 ${roleCount} rôles`
            );
        }).join('\n\n');

        const embed = createEmbed({
            title: `💾 Sauvegardes — ${guild.name}`,
            description: `**${backups.length}** sauvegarde(s) disponible(s) :\n\n${backupList}`,
            color: 'info',
            footer: { text: 'Utilisez /backup restore [id] pour restaurer une sauvegarde' }
        });

        return interaction.editReply({ embeds: [embed] });

    } catch (error) {
        Logger.error(`Erreur lors de la récupération des backups : ${error.message}`);
        return interaction.editReply({
            embeds: [errorEmbed(`Une erreur est survenue : ${error.message}`)]
        });
    }
}

/**
 * Restaure une sauvegarde sur le serveur.
 * Cette action est irréversible et remplacera la configuration actuelle.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client - Instance du client Discord
 */
async function handleRestore(interaction, client) {
    const { guild } = interaction;
    const backupId = interaction.options.getString('backup_id');

    // Différer la réponse car la restauration peut prendre beaucoup de temps
    await interaction.deferReply({ ephemeral: true });

    try {
        // Vérifier que la backup existe avant de lancer la restauration
        const backupExists = await client.systems.backup.get(guild.id, backupId);

        if (!backupExists) {
            return interaction.editReply({
                embeds: [errorEmbed(
                    `Aucune sauvegarde trouvée avec l'identifiant \`${backupId}\`.\n\n` +
                    `Utilisez \`/backup list\` pour voir les sauvegardes disponibles.`
                )]
            });
        }

        // Avertir l'utilisateur avant de restaurer
        await interaction.editReply({
            embeds: [warningEmbed(
                `Restauration de la sauvegarde \`${backupId}\` en cours...\n\n` +
                `⏳ Cette opération peut prendre plusieurs minutes.\n` +
                `⚠️ La configuration actuelle sera remplacée par celle de la sauvegarde.`,
                '💾 Restauration en cours'
            )]
        });

        // Lancer la restauration via le système de backup
        const result = await client.systems.backup.restore(guild.id, backupId, {
            restoredBy: interaction.user.id,
            restoredByTag: interaction.user.tag
        });

        Logger.info(`Backup ${backupId} restaurée sur ${guild.name} (${guild.id}) par ${interaction.user.tag}`);

        const embed = createEmbed({
            title: '✅ Sauvegarde restaurée',
            description: `La sauvegarde \`${backupId}\` a été restaurée avec succès.`,
            color: 'success',
            fields: [
                {
                    name: '📦 Éléments restaurés',
                    value:
                        `> 📁 Salons : \`${result?.channels || 'N/A'}\`\n` +
                        `> 🎭 Rôles : \`${result?.roles || 'N/A'}\`\n` +
                        `> ⚙️ Paramètres : ✅`,
                    inline: false
                },
                {
                    name: '👤 Restaurée par',
                    value: `> ${interaction.user.tag}`,
                    inline: true
                },
                {
                    name: '📅 Date',
                    value: `> <t:${Math.floor(Date.now() / 1000)}:f>`,
                    inline: true
                }
            ],
            footer: { text: 'La restauration est terminée' }
        });

        return interaction.editReply({ embeds: [embed] });

    } catch (error) {
        Logger.error(`Erreur lors de la restauration de la backup ${backupId}: ${error.message}`);
        return interaction.editReply({
            embeds: [errorEmbed(
                `Une erreur est survenue lors de la restauration de la sauvegarde.\n\n` +
                `**Erreur:** ${error.message}\n\n` +
                `Certains éléments ont peut-être été partiellement restaurés.`
            )]
        });
    }
}
