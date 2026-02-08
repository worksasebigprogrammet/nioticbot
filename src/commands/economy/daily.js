// Commande quotidienne - Permet de réclamer une récompense en monnaie toutes les 24 heures
const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Réclamer sa récompense quotidienne'),

    module: 'economy',
    adminOnly: false,

    async execute(interaction) {
        const { guild, user } = interaction;

        try {
            // Récupérer les paramètres économiques du serveur
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            const dailyAmount = guildSettings?.economy?.dailyAmount || 100;
            const currencyName = guildSettings?.economy?.currencyName || 'pièces';
            const currencySymbol = guildSettings?.economy?.currencySymbol || '🪙';

            // Récupérer ou créer le profil de l'utilisateur
            let userData = await User.findOne({ guildId: guild.id, userId: user.id });
            if (!userData) {
                userData = await User.create({ guildId: guild.id, userId: user.id });
            }

            const now = new Date();
            const cooldown = 24 * 60 * 60 * 1000; // 24 heures en millisecondes

            // Vérifier si le délai de 24 heures est écoulé
            if (userData.dailyLastClaimed) {
                const timeSinceClaim = now.getTime() - userData.dailyLastClaimed.getTime();

                if (timeSinceClaim < cooldown) {
                    // Calculer le temps restant avant la prochaine réclamation
                    const remaining = cooldown - timeSinceClaim;
                    const hours = Math.floor(remaining / (1000 * 60 * 60));
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                    return interaction.reply({
                        embeds: [errorEmbed(
                            `Vous avez déjà réclamé votre récompense quotidienne.\n` +
                            `Revenez dans **${hours}h ${minutes}m ${seconds}s**.`
                        )],
                        ephemeral: true
                    });
                }
            }

            // Ajouter la récompense et mettre à jour le timestamp
            userData.balance += dailyAmount;
            userData.dailyLastClaimed = now;
            await userData.save();

            // Confirmer la réclamation
            const dailyEmbed = createEmbed({
                title: `${currencySymbol} Récompense quotidienne`,
                description:
                    `Vous avez reçu **${dailyAmount.toLocaleString('fr-FR')}** ${currencyName} !\n\n` +
                    `Nouveau solde : **${userData.balance.toLocaleString('fr-FR')}** ${currencyName}`,
                color: 'economy'
            });

            return interaction.reply({ embeds: [dailyEmbed] });

        } catch (error) {
            Logger.error('Erreur lors de la réclamation quotidienne :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de la réclamation de votre récompense.')],
                ephemeral: true
            });
        }
    }
};
