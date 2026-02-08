// Commande de boutique - Permet de consulter et d'acheter des articles avec la monnaie du serveur
const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embed');
const User = require('../../../database/models/user');
const Guild = require('../../../database/models/guild');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Voir et acheter dans la boutique')
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('Afficher les articles disponibles dans la boutique')
        )
        .addSubcommand(sub =>
            sub
                .setName('buy')
                .setDescription('Acheter un article de la boutique')
                .addStringOption(option =>
                    option
                        .setName('item')
                        .setDescription('Le nom de l\'article à acheter')
                        .setRequired(true)
                )
        ),

    module: 'economy',
    adminOnly: false,

    async execute(interaction) {
        const { guild, user } = interaction;
        const subcommand = interaction.options.getSubcommand();

        try {
            // Récupérer les paramètres du serveur et les articles de la boutique
            const guildSettings = await Guild.findOne({ guildId: guild.id });
            const currencyName = guildSettings?.economy?.currencyName || 'pièces';
            const currencySymbol = guildSettings?.economy?.currencySymbol || '🪙';
            const shopItems = guildSettings?.economy?.shopItems || [];

            if (subcommand === 'list') {
                // ─── Sous-commande : afficher la boutique ───

                // Filtrer pour n'afficher que les articles disponibles
                const availableItems = shopItems.filter(item => item.available);

                if (availableItems.length === 0) {
                    return interaction.reply({
                        embeds: [createEmbed({
                            title: `${currencySymbol} Boutique`,
                            description: 'La boutique est vide pour le moment.',
                            color: 'economy'
                        })],
                        ephemeral: true
                    });
                }

                // Construire la liste des articles avec prix et description
                const itemLines = availableItems.map((item, index) => {
                    const roleInfo = item.roleId ? ` • Rôle : <@&${item.roleId}>` : '';
                    const limitInfo = item.maxPerUser > 0 ? ` • Max : ${item.maxPerUser}/personne` : '';
                    return (
                        `**${index + 1}. ${item.name}** — ${item.price.toLocaleString('fr-FR')} ${currencyName}\n` +
                        `┗ ${item.description || 'Aucune description'}${roleInfo}${limitInfo}`
                    );
                });

                const shopEmbed = createEmbed({
                    title: `${currencySymbol} Boutique — ${guild.name}`,
                    description: itemLines.join('\n\n'),
                    color: 'economy',
                    footer: { text: `Utilisez /shop buy <nom> pour acheter un article` }
                });

                return interaction.reply({ embeds: [shopEmbed] });

            } else if (subcommand === 'buy') {
                // ─── Sous-commande : acheter un article ───

                const itemName = interaction.options.getString('item');

                // Rechercher l'article par nom (insensible à la casse)
                const shopItem = shopItems.find(
                    item => item.name.toLowerCase() === itemName.toLowerCase() && item.available
                );

                if (!shopItem) {
                    return interaction.reply({
                        embeds: [errorEmbed(
                            `L'article **${itemName}** n'existe pas ou n'est plus disponible.\n` +
                            `Utilisez \`/shop list\` pour voir les articles disponibles.`
                        )],
                        ephemeral: true
                    });
                }

                // Récupérer ou créer le profil de l'utilisateur
                let userData = await User.findOne({ guildId: guild.id, userId: user.id });
                if (!userData) {
                    userData = await User.create({ guildId: guild.id, userId: user.id });
                }

                // Vérifier la limite d'achat par utilisateur
                if (shopItem.maxPerUser > 0) {
                    const ownedCount = userData.inventory.filter(
                        inv => inv.itemName.toLowerCase() === shopItem.name.toLowerCase()
                    ).reduce((acc, inv) => acc + inv.quantity, 0);

                    if (ownedCount >= shopItem.maxPerUser) {
                        return interaction.reply({
                            embeds: [errorEmbed(
                                `Vous possédez déjà le maximum autorisé de cet article (${shopItem.maxPerUser}).`
                            )],
                            ephemeral: true
                        });
                    }
                }

                // Vérifier que l'utilisateur a assez d'argent
                if (userData.balance < shopItem.price) {
                    return interaction.reply({
                        embeds: [errorEmbed(
                            `Vous n'avez pas assez de ${currencyName}.\n` +
                            `Prix : **${shopItem.price.toLocaleString('fr-FR')}** ${currencyName}\n` +
                            `Votre solde : **${userData.balance.toLocaleString('fr-FR')}** ${currencyName}`
                        )],
                        ephemeral: true
                    });
                }

                // Déduire le prix du solde de l'utilisateur
                userData.balance -= shopItem.price;

                // Ajouter l'article à l'inventaire de l'utilisateur
                const existingItem = userData.inventory.find(
                    inv => inv.itemName.toLowerCase() === shopItem.name.toLowerCase()
                );

                if (existingItem) {
                    existingItem.quantity += 1;
                } else {
                    userData.inventory.push({
                        itemName: shopItem.name,
                        quantity: 1,
                        acquiredAt: new Date()
                    });
                }

                await userData.save();

                // Si l'article est un rôle, l'attribuer au membre
                let roleMessage = '';
                if (shopItem.roleId) {
                    const member = await guild.members.fetch(user.id).catch(() => null);
                    if (member) {
                        const role = guild.roles.cache.get(shopItem.roleId);
                        if (role) {
                            await member.roles.add(role).catch(err => {
                                Logger.error('Erreur lors de l\'attribution du rôle :', err);
                            });
                            roleMessage = `\nLe rôle <@&${shopItem.roleId}> vous a été attribué.`;
                        }
                    }
                }

                // Confirmer l'achat
                const buyEmbed = createEmbed({
                    title: `${currencySymbol} Achat effectué`,
                    description:
                        `Vous avez acheté **${shopItem.name}** pour **${shopItem.price.toLocaleString('fr-FR')}** ${currencyName}.${roleMessage}\n\n` +
                        `Nouveau solde : **${userData.balance.toLocaleString('fr-FR')}** ${currencyName}`,
                    color: 'economy'
                });

                return interaction.reply({ embeds: [buyEmbed] });
            }

        } catch (error) {
            Logger.error('Erreur lors de l\'utilisation de la boutique :', error);
            return interaction.reply({
                embeds: [errorEmbed('Une erreur est survenue lors de l\'utilisation de la boutique.')],
                ephemeral: true
            });
        }
    }
};
