// Commande de classement économique - Affiche les membres les plus riches du serveur
const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('baltop')
        .setDescription('Classement des plus riches')
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Numéro de la page à afficher')
                .setRequired(false)
                .setMinValue(1)
        ),

    module: 'economy',
    adminOnly: false,

    async execute(interaction) {
        const { guild } = interaction;
        const page = interaction.options.getInteger('page') || 1;
        const usersPerPage = 10;

        try {
            // Récupérer les paramètres économiques du serveur
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            const currencyName = guildSettings?.economy?.currencyName || 'pièces';
            const currencySymbol = guildSettings?.economy?.currencySymbol || '🪙';

            // Compter le nombre total d'utilisateurs avec un solde positif
            const totalUsers = await User.countDocuments({ guildId: guild.id, balance: { $gt: 0 } });
            const totalPages = Math.max(1, Math.ceil(totalUsers / usersPerPage));

            // Vérifier que la page demandée existe
            if (page > totalPages) {
                return interaction.reply({
                    embeds: [errorEmbed(`La page \`${page}\` n'existe pas. Il y a ${totalPages} page(s) au total.`)],
                    ephemeral: true
                });
            }

            // Récupérer les utilisateurs triés par solde décroissant, avec pagination
            const users = await User.find({ guildId: guild.id, balance: { $gt: 0 } })
                .sort({ balance: -1 })
                .skip((page - 1) * usersPerPage)
                .limit(usersPerPage)
                .lean();

            // Si aucun utilisateur n'a de solde, afficher un message informatif
            if (users.length === 0) {
                return interaction.reply({
                    embeds: [createEmbed({
                        title: `${currencySymbol} Classement économique`,
                        description: 'Aucun membre n\'a encore de monnaie sur ce serveur.',
                        color: 'economy'
                    })],
                    ephemeral: true
                });
            }

            // Construire la liste des membres avec leur position et solde
            const startPosition = (page - 1) * usersPerPage;
            const leaderboardLines = [];

            for (let i = 0; i < users.length; i++) {
                const userData = users[i];
                const position = startPosition + i + 1;

                // Médailles pour le top 3
                let medal = '';
                if (position === 1) medal = '🥇';
                else if (position === 2) medal = '🥈';
                else if (position === 3) medal = '🥉';
                else medal = `\`#${position}\``;

                // Résoudre le nom d'utilisateur depuis le serveur
                const member = await guild.members.fetch(userData.userId).catch(() => null);
                const displayName = member ? member.displayName : `Utilisateur inconnu (${userData.userId})`;

                leaderboardLines.push(
                    `${medal} **${displayName}** — **${userData.balance.toLocaleString('fr-FR')}** ${currencyName}`
                );
            }

            // Construire l'embed du classement
            const baltopEmbed = createEmbed({
                title: `${currencySymbol} Classement des plus riches — ${guild.name}`,
                description: leaderboardLines.join('\n'),
                color: 'economy',
                thumbnail: guild.iconURL({ dynamic: true, size: 256 }),
                footer: { text: `Page ${page}/${totalPages} • ${totalUsers} membre(s) classé(s)` }
            });

            return interaction.reply({ embeds: [baltopEmbed] });

        } catch (error) {
            Logger.error('Erreur lors de la récupération du classement économique :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de la récupération du classement.')],
                ephemeral: true
            });
        }
    }
};
