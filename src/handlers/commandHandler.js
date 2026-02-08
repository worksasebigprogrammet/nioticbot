// Gestionnaire de commandes slash Discord
// Charge et enregistre toutes les commandes du bot

const { Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger');

class CommandHandler {
    constructor(client) {
        this.client = client;
        client.commands = new Collection();
    }

    // Charge toutes les commandes depuis le dossier commands/
    async loadCommands() {
        const commandsPath = path.join(__dirname, '..', 'commands');
        const commandFolders = fs.readdirSync(commandsPath);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;

            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                try {
                    const command = require(path.join(folderPath, file));

                    if ('data' in command && 'execute' in command) {
                        this.client.commands.set(command.data.name, command);
                        Logger.debug(`Commande chargée : ${command.data.name} (${folder})`);
                    } else {
                        Logger.warn(`Commande invalide : ${file} - manque 'data' ou 'execute'`);
                    }
                } catch (error) {
                    Logger.error(`Erreur lors du chargement de ${file}:`, error);
                }
            }
        }

        Logger.info(`${this.client.commands.size} commandes chargées`);
    }

    // Enregistre les commandes slash auprès de l'API Discord
    async registerCommands() {
        const commands = [];
        this.client.commands.forEach(command => {
            commands.push(command.data.toJSON());
        });

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        try {
            Logger.info(`Enregistrement de ${commands.length} commandes slash...`);

            // Enregistrement global (peut prendre jusqu'à 1h pour se propager)
            if (process.env.GUILD_ID) {
                // En développement : enregistrement sur un serveur spécifique (instantané)
                await rest.put(
                    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                    { body: commands }
                );
                Logger.info(`Commandes enregistrées sur le serveur ${process.env.GUILD_ID}`);
            } else {
                // En production : enregistrement global
                await rest.put(
                    Routes.applicationCommands(process.env.CLIENT_ID),
                    { body: commands }
                );
                Logger.info('Commandes enregistrées globalement');
            }
        } catch (error) {
            Logger.error('Erreur lors de l\'enregistrement des commandes:', error);
        }
    }

    // Gère l'exécution d'une commande
    async handleCommand(interaction) {
        const command = this.client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, this.client);
        } catch (error) {
            Logger.error(`Erreur lors de l'exécution de /${interaction.commandName}:`, error);

            const errorMessage = { content: '❌ Une erreur est survenue lors de l\'exécution de cette commande.', ephemeral: true };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage).catch(() => {});
            } else {
                await interaction.reply(errorMessage).catch(() => {});
            }
        }
    }
}

module.exports = CommandHandler;
