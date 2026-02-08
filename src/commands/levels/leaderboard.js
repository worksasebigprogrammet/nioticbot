// Commande de classement XP - Affiche le leaderboard des membres les plus actifs du serveur
const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Voir le classement XP du serveur')
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Numéro de la page à afficher')
                .setRequired(false)
                .setMinValue(1)
        ),

    module: 'levels',
    adminOnly: false,

    async execute(interaction) {
        const { guild } = interaction;
        const page = interaction.options.getInteger('page') || 1;
        const usersPerPage = 10;

        try {
            // Compter le nombre total d'utilisateurs avec de l'XP sur ce serveur
            const totalUsers = await User.countDocuments({ guildId: guild.id, totalXp: { $gt: 0 } });
            const totalPages = Math.max(1, Math.ceil(totalUsers / usersPerPage));

            // Vérifier que la page demandée existe
            if (page > totalPages) {
                return interaction.reply({
                    embeds: [errorEmbed(`La page \`${page}\` n'existe pas. Il y a ${totalPages} page(s) au total.`)],
                    ephemeral: true
                });
            }

            // Récupérer les utilisateurs triés par XP total décroissant, avec pagination
            const users = await User.find({ guildId: guild.id, totalXp: { $gt: 0 } })
                .sort({ totalXp: -1 })
                .skip((page - 1) * usersPerPage)
                .limit(usersPerPage)
                .lean();

            // Si aucun utilisateur n'a d'XP, afficher un message informatif
            if (users.length === 0) {
                return interaction.reply({
                    embeds: [createEmbed({
                        title: '📊 Classement XP',
                        description: 'Aucun membre n\'a encore gagné d\'XP sur ce serveur.',
                        color: 'levels'
                    })],
                    ephemeral: true
                });
            }

            // Construire la liste des membres avec leur position, niveau et XP
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
                    `${medal} **${displayName}**\n` +
                    `┗ Niveau \`${userData.level}\` • \`${userData.totalXp.toLocaleString('fr-FR')}\` XP`
                );
            }

            // Construire l'embed du classement
            const leaderboardEmbed = createEmbed({
                title: `📊 Classement XP — ${guild.name}`,
                description: leaderboardLines.join('\n\n'),
                color: 'levels',
                thumbnail: guild.iconURL({ dynamic: true, size: 256 }),
                footer: { text: `Page ${page}/${totalPages} • ${totalUsers} membre(s) classé(s)` }
            });

            return interaction.reply({ embeds: [leaderboardEmbed] });

        } catch (error) {
            Logger.error('Erreur lors de la récupération du classement :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de la récupération du classement.')],
                ephemeral: true
            });
        }
    }
};
