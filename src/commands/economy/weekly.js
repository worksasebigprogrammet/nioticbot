// Commande hebdomadaire - Permet de réclamer une récompense en monnaie toutes les 7 jours
const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weekly')
        .setDescription('Réclamer sa récompense hebdomadaire'),

    module: 'economy',
    adminOnly: false,

    async execute(interaction) {
        const { guild, user } = interaction;

        try {
            // Récupérer les paramètres économiques du serveur
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            const weeklyAmount = guildSettings?.economy?.weeklyAmount || 500;
            const currencyName = guildSettings?.economy?.currencyName || 'pièces';
            const currencySymbol = guildSettings?.economy?.currencySymbol || '🪙';

            // Récupérer ou créer le profil de l'utilisateur
            let userData = await User.findOne({ guildId: guild.id, userId: user.id });
            if (!userData) {
                userData = await User.create({ guildId: guild.id, userId: user.id });
            }

            const now = new Date();
            const cooldown = 7 * 24 * 60 * 60 * 1000; // 7 jours en millisecondes

            // Vérifier si le délai de 7 jours est écoulé
            if (userData.weeklyLastClaimed) {
                const timeSinceClaim = now.getTime() - userData.weeklyLastClaimed.getTime();

                if (timeSinceClaim < cooldown) {
                    // Calculer le temps restant avant la prochaine réclamation
                    const remaining = cooldown - timeSinceClaim;
                    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

                    return interaction.reply({
                        embeds: [errorEmbed(
                            `Vous avez déjà réclamé votre récompense hebdomadaire.\n` +
                            `Revenez dans **${days}j ${hours}h ${minutes}m**.`
                        )],
                        ephemeral: true
                    });
                }
            }

            // Ajouter la récompense et mettre à jour le timestamp
            userData.balance += weeklyAmount;
            userData.weeklyLastClaimed = now;
            await userData.save();

            // Confirmer la réclamation
            const weeklyEmbed = createEmbed({
                title: `${currencySymbol} Récompense hebdomadaire`,
                description:
                    `Vous avez reçu **${weeklyAmount.toLocaleString('fr-FR')}** ${currencyName} !\n\n` +
                    `Nouveau solde : **${userData.balance.toLocaleString('fr-FR')}** ${currencyName}`,
                color: 'economy'
            });

            return interaction.reply({ embeds: [weeklyEmbed] });

        } catch (error) {
            Logger.error('Erreur lors de la réclamation hebdomadaire :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de la réclamation de votre récompense.')],
                ephemeral: true
            });
        }
    }
};
