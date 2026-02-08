// Événement déclenché à chaque interaction (commandes, boutons, menus)
const Logger = require('../utils/logger');
const Guild = require('../../database/models/guild');
const { isAdmin } = require('../utils/permissions');
const { errorEmbed } = require('../utils/embed');

module.exports = {
    name: 'interactionCreate',
    once: false,

    async execute(interaction, client) {
        // Gestion des commandes slash
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction, client);
            return;
        }

        // Gestion des boutons
        if (interaction.isButton()) {
            await handleButton(interaction, client);
            return;
        }

        // Gestion des menus déroulants
        if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction, client);
            return;
        }
    },
};

// Gestion des commandes slash
async function handleSlashCommand(interaction, client) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        // Vérification que le module associé est activé
        if (command.module) {
            const guildSettings = await Guild.findOne({ guildId: interaction.guild?.id });
            if (guildSettings && guildSettings.modules && !guildSettings.modules[command.module]) {
                return interaction.reply({
                    embeds: [errorEmbed('❌ Ce module est désactivé sur ce serveur.')],
                    ephemeral: true
                });
            }
        }

        // Vérification des permissions admin si requises
        if (command.adminOnly) {
            const guildSettings = await Guild.findOne({ guildId: interaction.guild?.id });
            if (!isAdmin(interaction.member, guildSettings)) {
                return interaction.reply({
                    embeds: [errorEmbed('❌ Vous n\'avez pas la permission d\'utiliser cette commande.')],
                    ephemeral: true
                });
            }
        }

        // Gestion du cooldown
        if (command.cooldown) {
            const cooldownKey = `${interaction.commandName}-${interaction.user.id}`;
            const cooldownEnd = client.cooldowns.get(cooldownKey);

            if (cooldownEnd && Date.now() < cooldownEnd) {
                const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
                return interaction.reply({
                    embeds: [errorEmbed(`⏳ Veuillez attendre **${remaining}s** avant de réutiliser cette commande.`)],
                    ephemeral: true
                });
            }

            client.cooldowns.set(cooldownKey, Date.now() + (command.cooldown * 1000));

            // Nettoyage automatique du cooldown
            setTimeout(() => client.cooldowns.delete(cooldownKey), command.cooldown * 1000);
        }

        // Exécution de la commande
        await command.execute(interaction, client);

    } catch (error) {
        Logger.error(`Erreur commande /${interaction.commandName}:`, error);

        const reply = {
            embeds: [errorEmbed('❌ Une erreur est survenue lors de l\'exécution de cette commande.')],
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply).catch(() => {});
        } else {
            await interaction.reply(reply).catch(() => {});
        }
    }
}

// Gestion des interactions bouton
async function handleButton(interaction, client) {
    try {
        const [action, ...args] = interaction.customId.split('_');

        // Boutons de tickets
        if (action === 'ticket') {
            const ticketSystem = require('../systems/tickets');
            await ticketSystem.handleButton(interaction, client, args);
            return;
        }

        // Boutons de giveaway
        if (action === 'giveaway') {
            const { handleGiveawayButton } = require('../commands/giveaways/giveaway');
            await handleGiveawayButton(interaction, client, args);
            return;
        }

        // Boutons de réaction rôle
        if (action === 'reactionrole') {
            const { handleReactionRoleButton } = require('../commands/autoroles/reactionrole');
            await handleReactionRoleButton(interaction, client, args);
            return;
        }

        // Boutons de musique
        if (action === 'music') {
            // Géré dans le système de musique
            return;
        }

        // Boutons de notation de ticket
        if (action === 'rate') {
            const ticketSystem = require('../systems/tickets');
            await ticketSystem.handleRating(interaction, client, args);
            return;
        }

    } catch (error) {
        Logger.error('Erreur bouton:', error);
        await interaction.reply({
            embeds: [errorEmbed('❌ Une erreur est survenue.')],
            ephemeral: true
        }).catch(() => {});
    }
}

// Gestion des menus déroulants
async function handleSelectMenu(interaction, client) {
    try {
        const [action, ...args] = interaction.customId.split('_');

        // Menu de catégorie de ticket
        if (action === 'ticketcategory') {
            const ticketSystem = require('../systems/tickets');
            await ticketSystem.handleCategorySelect(interaction, client, args);
            return;
        }

    } catch (error) {
        Logger.error('Erreur menu déroulant:', error);
        await interaction.reply({
            embeds: [errorEmbed('❌ Une erreur est survenue.')],
            ephemeral: true
        }).catch(() => {});
    }
}
