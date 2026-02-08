// Commande de solde - Affiche le solde en monnaie du serveur d'un membre
const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Voir son solde')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre dont vous voulez voir le solde')
                .setRequired(false)
        ),

    module: 'economy',
    adminOnly: false,

    async execute(interaction) {
        const { guild } = interaction;
        const targetUser = interaction.options.getUser('user') || interaction.user;

        try {
            // Récupérer les paramètres du serveur pour le nom de la monnaie
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            const currencyName = guildSettings?.economy?.currencyName || 'pièces';
            const currencySymbol = guildSettings?.economy?.currencySymbol || '🪙';

            // Récupérer les données économiques de l'utilisateur
            let userData = await User.findOne({ guildId: guild.id, userId: targetUser.id });

            // Si l'utilisateur n'a pas de profil, son solde est à 0
            const balance = userData?.balance || 0;

            // Construire l'embed du solde
            const balanceEmbed = createEmbed({
                title: `${currencySymbol} Solde de ${targetUser.displayName}`,
                description: `**${balance.toLocaleString('fr-FR')}** ${currencyName}`,
                color: 'economy',
                thumbnail: targetUser.displayAvatarURL({ dynamic: true, size: 256 })
            });

            return interaction.reply({ embeds: [balanceEmbed] });

        } catch (error) {
            Logger.error('Erreur lors de la récupération du solde :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de la récupération du solde.')],
                ephemeral: true
            });
        }
    }
};
