// Commande de changement de langue - Permet de changer la langue du bot pour le serveur
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embed');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

/* ─── Noms des langues pour l'affichage ─── */
const LANGUAGE_NAMES = {
    fr: '🇫🇷 Français',
    en: '🇬🇧 English'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('Changer la langue du bot')
        .addStringOption(option =>
            option
                .setName('lang')
                .setDescription('La langue à utiliser')
                .setRequired(true)
                .addChoices(
                    { name: '🇫🇷 Français', value: 'fr' },
                    { name: '🇬🇧 English', value: 'en' }
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    module: null,
    adminOnly: true,

    async execute(interaction) {
        const { guild } = interaction;
        const lang = interaction.options.getString('lang');

        try {
            // Récupérer la configuration actuelle pour vérifier la langue existante
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            const currentLang = guildSettings?.language || 'fr';

            // Vérifier si la langue est déjà définie
            if (currentLang === lang) {
                return interaction.reply({
                    embeds: [errorEmbed(
                        `La langue du bot est déjà définie sur **${LANGUAGE_NAMES[lang]}**.`
                    )],
                    ephemeral: true
                });
            }

            // Mettre à jour la langue dans la base de données
            await Guild.findOneAndUpdate(
                { guildId: guild.id },
                { $set: { language: lang } },
                { upsert: true }
            );

            Logger.info(`Langue changée en "${lang}" sur ${guild.name} (${guild.id}) par ${interaction.user.tag}`);

            // Messages de confirmation dans les deux langues
            const confirmMessages = {
                fr: `La langue du bot a été changée en **${LANGUAGE_NAMES[lang]}**.\n\nLes commandes et messages du bot seront désormais affichés dans cette langue.`,
                en: `Bot language has been changed to **${LANGUAGE_NAMES[lang]}**.\n\nBot commands and messages will now be displayed in this language.`
            };

            return interaction.reply({
                embeds: [successEmbed(confirmMessages[lang])],
                ephemeral: false
            });

        } catch (error) {
            Logger.error(`Erreur lors du changement de langue sur ${guild.name}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors du changement de langue : ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
