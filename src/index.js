// =============================================
// NioticBot - Bot Discord Multifonction
// Point d'entrée principal de l'application
// =============================================

require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const mongoose = require('mongoose');
const CommandHandler = require('./handlers/commandHandler');
const EventHandler = require('./handlers/eventHandler');
const ErrorHandler = require('./handlers/errorHandler');
const Logger = require('./utils/logger');

// Initialisation du gestionnaire d'erreurs global
ErrorHandler.init();

// Création du client Discord avec tous les intents nécessaires
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.GuildMember,
        Partials.User,
    ],
});

// Stockage des systèmes actifs sur le client
client.systems = {};
client.cooldowns = new Map();

// Fonction principale de démarrage
async function start() {
    try {
        // Connexion à MongoDB
        Logger.info('Connexion à MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            // Options de connexion Mongoose 8
        });
        Logger.info('Connecté à MongoDB avec succès');

        // Chargement des commandes
        const commandHandler = new CommandHandler(client);
        await commandHandler.loadCommands();

        // Stockage du handler sur le client pour l'accès depuis les événements
        client.commandHandler = commandHandler;

        // Chargement des événements
        const eventHandler = new EventHandler(client);
        await eventHandler.loadEvents();

        // Connexion à Discord
        Logger.info('Connexion à Discord...');
        await client.login(process.env.DISCORD_TOKEN);

    } catch (error) {
        Logger.error('Erreur fatale au démarrage:', error);
        process.exit(1);
    }
}

// Gestion de la déconnexion MongoDB
mongoose.connection.on('error', (error) => {
    Logger.error('Erreur MongoDB:', error);
});

mongoose.connection.on('disconnected', () => {
    Logger.warn('Déconnecté de MongoDB, tentative de reconnexion...');
});

// Lancement du bot
start();
