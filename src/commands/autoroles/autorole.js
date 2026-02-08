// Commande d'auto-rôles - Gère les rôles attribués automatiquement aux nouveaux membres
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embed');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Gérer les rôles automatiques')
        .addSubcommand(sub =>
            sub
                .setName('add')
                .setDescription('Ajouter un rôle automatique à l\'arrivée')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Le rôle à attribuer automatiquement')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('remove')
                .setDescription('Retirer un rôle automatique')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Le rôle à retirer de la liste')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('Afficher la liste des rôles automatiques')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    module: 'autoroles',
    adminOnly: true,

    async execute(interaction) {
        const { guild } = interaction;
        const subcommand = interaction.options.getSubcommand();

        try {
            // Récupérer ou créer la configuration du serveur
            let guildSettings = await Guild.findOne({ guildId: guild.id });
            if (!guildSettings) {
                guildSettings = await Guild.create({ guildId: guild.id });
            }

            // Initialiser le tableau des rôles automatiques si inexistant
            if (!guildSettings.autoroles) {
                guildSettings.autoroles = { joinRoles: [], reactionRoles: [] };
            }

            if (subcommand === 'add') {
                // ─── Sous-commande : ajouter un rôle automatique ───

                const role = interaction.options.getRole('role');

                // Vérifier que le rôle n'est pas géré (bot, intégration, etc.)
                if (role.managed) {
                    return interaction.reply({
                        embeds: [errorEmbed('Ce rôle est géré par une intégration et ne peut pas être utilisé.')],
                        ephemeral: true
                    });
                }

                // Vérifier que le rôle n'est pas @everyone
                if (role.id === guild.id) {
                    return interaction.reply({
                        embeds: [errorEmbed('Le rôle @everyone ne peut pas être ajouté comme rôle automatique.')],
                        ephemeral: true
                    });
                }

                // Vérifier que le bot peut attribuer ce rôle (hiérarchie)
                const botMember = await guild.members.fetch(interaction.client.user.id);
                if (role.position >= botMember.roles.highest.position) {
                    return interaction.reply({
                        embeds: [errorEmbed('Ce rôle est supérieur ou égal à mon rôle le plus élevé. Je ne pourrai pas l\'attribuer.')],
                        ephemeral: true
                    });
                }

                // Vérifier que le rôle n'est pas déjà dans la liste
                if (guildSettings.autoroles.joinRoles.includes(role.id)) {
                    return interaction.reply({
                        embeds: [errorEmbed(`Le rôle ${role} est déjà dans la liste des rôles automatiques.`)],
                        ephemeral: true
                    });
                }

                // Ajouter le rôle à la liste
                guildSettings.autoroles.joinRoles.push(role.id);
                await guildSettings.save();

                return interaction.reply({
                    embeds: [successEmbed(`Le rôle ${role} a été ajouté aux rôles automatiques.\nIl sera attribué à chaque nouveau membre.`)]
                });

            } else if (subcommand === 'remove') {
                // ─── Sous-commande : retirer un rôle automatique ───

                const role = interaction.options.getRole('role');

                // Vérifier que le rôle est dans la liste
                const roleIndex = guildSettings.autoroles.joinRoles.indexOf(role.id);
                if (roleIndex === -1) {
                    return interaction.reply({
                        embeds: [errorEmbed(`Le rôle ${role} n'est pas dans la liste des rôles automatiques.`)],
                        ephemeral: true
                    });
                }

                // Retirer le rôle de la liste
                guildSettings.autoroles.joinRoles.splice(roleIndex, 1);
                await guildSettings.save();

                return interaction.reply({
                    embeds: [successEmbed(`Le rôle ${role} a été retiré des rôles automatiques.`)]
                });

            } else if (subcommand === 'list') {
                // ─── Sous-commande : afficher la liste ───

                const joinRoles = guildSettings.autoroles.joinRoles || [];

                if (joinRoles.length === 0) {
                    return interaction.reply({
                        embeds: [createEmbed({
                            title: '⚙️ Rôles automatiques',
                            description: 'Aucun rôle automatique n\'est configuré.',
                            color: 'info'
                        })],
                        ephemeral: true
                    });
                }

                // Construire la liste des rôles avec vérification d'existence
                const roleLines = joinRoles.map((roleId, index) => {
                    const role = guild.roles.cache.get(roleId);
                    if (role) {
                        return `**${index + 1}.** ${role} (\`${role.id}\`)`;
                    }
                    return `**${index + 1}.** ~~Rôle supprimé~~ (\`${roleId}\`)`;
                });

                const listEmbed = createEmbed({
                    title: '⚙️ Rôles automatiques',
                    description: roleLines.join('\n'),
                    color: 'info',
                    footer: { text: `${joinRoles.length} rôle(s) configuré(s)` }
                });

                return interaction.reply({ embeds: [listEmbed] });
            }

        } catch (error) {
            Logger.error('Erreur lors de la gestion des rôles automatiques :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de la gestion des rôles automatiques.')],
                ephemeral: true
            });
        }
    }
};
