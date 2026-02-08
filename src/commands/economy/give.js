// Commande de don - Permet de transférer de la monnaie à un autre membre du serveur
const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('Donner de l\'argent à un membre')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre à qui donner de l\'argent')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Le montant à donner')
                .setRequired(true)
                .setMinValue(1)
        ),

    module: 'economy',
    adminOnly: false,

    async execute(interaction) {
        const { guild, user } = interaction;
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        try {
            // Empêcher de se donner de l'argent à soi-même
            if (targetUser.id === user.id) {
                return interaction.reply({
                    embeds: [errorEmbed('Vous ne pouvez pas vous donner de l\'argent à vous-même.')],
                    ephemeral: true
                });
            }

            // Empêcher les dons aux bots
            if (targetUser.bot) {
                return interaction.reply({
                    embeds: [errorEmbed('Vous ne pouvez pas donner de l\'argent à un bot.')],
                    ephemeral: true
                });
            }

            // Récupérer les paramètres économiques du serveur
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            const currencyName = guildSettings?.economy?.currencyName || 'pièces';
            const currencySymbol = guildSettings?.economy?.currencySymbol || '🪙';

            // Récupérer ou créer le profil de l'expéditeur
            let senderData = await User.findOne({ guildId: guild.id, userId: user.id });
            if (!senderData) {
                senderData = await User.create({ guildId: guild.id, userId: user.id });
            }

            // Vérifier que l'expéditeur a assez d'argent
            if (senderData.balance < amount) {
                return interaction.reply({
                    embeds: [errorEmbed(
                        `Vous n'avez pas assez de ${currencyName}.\n` +
                        `Votre solde : **${senderData.balance.toLocaleString('fr-FR')}** ${currencyName}`
                    )],
                    ephemeral: true
                });
            }

            // Récupérer ou créer le profil du destinataire
            let receiverData = await User.findOne({ guildId: guild.id, userId: targetUser.id });
            if (!receiverData) {
                receiverData = await User.create({ guildId: guild.id, userId: targetUser.id });
            }

            // Effectuer le transfert : déduire de l'expéditeur, ajouter au destinataire
            senderData.balance -= amount;
            receiverData.balance += amount;

            await senderData.save();
            await receiverData.save();

            // Confirmer le transfert
            const giveEmbed = createEmbed({
                title: `${currencySymbol} Transfert effectué`,
                description:
                    `**${user.displayName}** a donné **${amount.toLocaleString('fr-FR')}** ${currencyName} à **${targetUser.displayName}**.\n\n` +
                    `Votre nouveau solde : **${senderData.balance.toLocaleString('fr-FR')}** ${currencyName}`,
                color: 'economy'
            });

            return interaction.reply({ embeds: [giveEmbed] });

        } catch (error) {
            Logger.error('Erreur lors du transfert d\'argent :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors du transfert.')],
                ephemeral: true
            });
        }
    }
};
