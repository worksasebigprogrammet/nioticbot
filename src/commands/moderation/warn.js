// Commande d'avertissement - Permet d'avertir un membre et d'enregistrer l'avertissement
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, moderationEmbed } = require('../../utils/embed');
const Case = require('../../../database/models/case');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Avertir un membre')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Le membre à avertir')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('La raison de l\'avertissement')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    module: 'moderation',
    adminOnly: true,

    async execute(interaction) {
        const { client, guild, member } = interaction;
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        // Récupérer le membre du serveur
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        // Vérifier que le membre existe bien dans le serveur
        if (!targetMember) {
            return interaction.reply({
                embeds: [errorEmbed('Ce membre n\'est pas dans le serveur.')],
                ephemeral: true
            });
        }

        // Vérifier que l'utilisateur cible n'est pas le modérateur lui-même
        if (targetUser.id === member.id) {
            return interaction.reply({
                embeds: [errorEmbed('Vous ne pouvez pas vous avertir vous-même.')],
                ephemeral: true
            });
        }

        // Vérifier que la cible n'est pas un bot
        if (targetUser.bot) {
            return interaction.reply({
                embeds: [errorEmbed('Vous ne pouvez pas avertir un bot.')],
                ephemeral: true
            });
        }

        // Créer le numéro de cas en incrémentant le dernier cas du serveur
        const lastCase = await Case.findOne({ guildId: guild.id }).sort({ caseId: -1 });
        const caseId = lastCase ? lastCase.caseId + 1 : 1;

        try {
            // Ajouter l'avertissement au modèle User dans la base de données
            const userData = await User.findOneAndUpdate(
                { guildId: guild.id, userId: targetUser.id },
                {
                    $push: {
                        warnings: {
                            reason: reason,
                            moderatorId: member.id,
                            moderatorTag: member.user.tag,
                            date: new Date(),
                            caseId: caseId
                        }
                    },
                    $setOnInsert: {
                        guildId: guild.id,
                        userId: targetUser.id,
                        userTag: targetUser.tag
                    }
                },
                { upsert: true, new: true }
            );

            // Compter le nombre total d'avertissements
            const warningCount = userData.warnings ? userData.warnings.length : 1;

            // Enregistrer le cas dans la base de données
            await Case.create({
                guildId: guild.id,
                caseId: caseId,
                type: 'warn',
                userId: targetUser.id,
                userTag: targetUser.tag,
                moderatorId: member.id,
                moderatorTag: member.user.tag,
                reason: reason,
                timestamp: new Date(),
                active: true
            });

            // Envoyer un message privé à l'utilisateur
            try {
                await targetUser.send({
                    embeds: [moderationEmbed({
                        title: `Vous avez reçu un avertissement dans ${guild.name}`,
                        reason: reason,
                        moderator: member.user.tag
                    })]
                });
            } catch (err) {
                // Impossible d'envoyer un MP à l'utilisateur (MPs désactivés)
                Logger.warn(`Impossible d'envoyer un MP à ${targetUser.tag} pour l'avertissement.`);
            }

            // Journaliser l'action de modération
            client.systems?.logs?.log(guild.id, 'moderation.warn', {
                user: targetUser,
                moderator: member.user,
                reason: reason,
                caseId: caseId
            });

            // Répondre avec un embed de succès incluant le nombre d'avertissements
            return interaction.reply({
                embeds: [successEmbed(
                    `**${targetUser.tag}** a reçu un avertissement.\n` +
                    `**Raison:** ${reason}\n` +
                    `**Nombre d'avertissements:** ${warningCount}\n` +
                    `**Cas #${caseId}**`
                )]
            });

        } catch (error) {
            Logger.error(`Erreur lors de l'avertissement de ${targetUser.tag}: ${error.message}`);
            return interaction.reply({
                embeds: [errorEmbed(`Une erreur est survenue lors de l'avertissement: ${error.message}`)],
                ephemeral: true
            });
        }
    }
};
