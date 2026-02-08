// Commande de rang - Affiche le niveau, l'XP et la position d'un membre dans le classement
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Voir le niveau et l\'XP d\'un membre')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre dont vous voulez voir le rang')
                .setRequired(false)
        ),

    module: 'levels',
    adminOnly: false,

    async execute(interaction) {
        const { guild } = interaction;
        const targetUser = interaction.options.getUser('user') || interaction.user;

        try {
            // Récupérer les données de l'utilisateur dans la base de données
            let userData = await User.findOne({ guildId: guild.id, userId: targetUser.id });

            // Si l'utilisateur n'a pas encore de données, créer un profil vide
            if (!userData) {
                userData = { xp: 0, level: 0, totalXp: 0, messageCount: 0 };
            }

            // Calculer la position dans le classement (nombre d'utilisateurs avec plus d'XP + 1)
            const rankPosition = await User.countDocuments({
                guildId: guild.id,
                totalXp: { $gt: userData.totalXp }
            }) + 1;

            // Calculer l'XP nécessaire pour le prochain niveau
            // Formule : 5 * (niveau + 1)² + 50 * (niveau + 1) + 100
            const currentLevel = userData.level;
            const xpForNextLevel = 5 * Math.pow(currentLevel + 1, 2) + 50 * (currentLevel + 1) + 100;
            const currentXp = userData.xp;

            // Construire la barre de progression visuelle
            const progressBarLength = 20;
            const filledLength = Math.round((currentXp / xpForNextLevel) * progressBarLength);
            const emptyLength = progressBarLength - filledLength;
            const progressBar = '▓'.repeat(filledLength) + '░'.repeat(emptyLength);
            const progressPercent = Math.round((currentXp / xpForNextLevel) * 100);

            // Récupérer le membre du serveur pour obtenir son avatar et ses couleurs
            const member = await guild.members.fetch(targetUser.id).catch(() => null);
            const displayColor = member?.displayColor || 0x5865F2;

            // Construire l'embed de rang
            const rankEmbed = createEmbed({
                title: `📊 Rang de ${targetUser.displayName}`,
                color: displayColor,
                thumbnail: targetUser.displayAvatarURL({ dynamic: true, size: 256 }),
                fields: [
                    {
                        name: '🏆 Position',
                        value: `\`#${rankPosition}\``,
                        inline: true
                    },
                    {
                        name: '⭐ Niveau',
                        value: `\`${currentLevel}\``,
                        inline: true
                    },
                    {
                        name: '💬 Messages',
                        value: `\`${userData.messageCount.toLocaleString('fr-FR')}\``,
                        inline: true
                    },
                    {
                        name: '✨ XP Total',
                        value: `\`${userData.totalXp.toLocaleString('fr-FR')}\``,
                        inline: true
                    },
                    {
                        name: '📈 Progression',
                        value: `${progressBar}\n\`${currentXp.toLocaleString('fr-FR')} / ${xpForNextLevel.toLocaleString('fr-FR')} XP\` (${progressPercent}%)`,
                        inline: false
                    }
                ]
            });

            return interaction.reply({ embeds: [rankEmbed] });

        } catch (error) {
            Logger.error('Erreur lors de la récupération du rang :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de la récupération du rang.')],
                ephemeral: true
            });
        }
    }
};
