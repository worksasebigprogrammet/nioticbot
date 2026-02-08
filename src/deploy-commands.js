// Script de déploiement des commandes slash
// Utiliser : node src/deploy-commands.js

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Logger = require('./utils/logger');

async function deploy() {
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(commandsPath);

    // Chargement de toutes les commandes
    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;

        const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(path.join(folderPath, file));
            if ('data' in command) {
                commands.push(command.data.toJSON());
                Logger.debug(`Commande trouvée : ${command.data.name}`);
            }
        }
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        Logger.info(`Déploiement de ${commands.length} commandes slash...`);

        if (process.env.GUILD_ID) {
            // Déploiement sur un serveur spécifique (instantané)
            const data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            Logger.info(`${data.length} commandes déployées sur le serveur ${process.env.GUILD_ID}`);
        } else {
            // Déploiement global (peut prendre jusqu'à 1h)
            const data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
            Logger.info(`${data.length} commandes déployées globalement`);
        }
    } catch (error) {
        Logger.error('Erreur lors du déploiement:', error);
    }
}

deploy();
