// Gestionnaire d'événements Discord
// Charge et enregistre tous les écouteurs d'événements

const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger');

class EventHandler {
    constructor(client) {
        this.client = client;
    }

    // Charge tous les événements depuis le dossier events/
    async loadEvents() {
        const eventsPath = path.join(__dirname, '..', 'events');
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        for (const file of eventFiles) {
            try {
                const event = require(path.join(eventsPath, file));

                if (event.once) {
                    // Événement unique (ex: ready)
                    this.client.once(event.name, (...args) => event.execute(...args, this.client));
                } else {
                    // Événement récurrent
                    this.client.on(event.name, (...args) => event.execute(...args, this.client));
                }

                Logger.debug(`Événement chargé : ${event.name} (${file})`);
            } catch (error) {
                Logger.error(`Erreur lors du chargement de l'événement ${file}:`, error);
            }
        }

        Logger.info(`${eventFiles.length} événements chargés`);
    }
}

module.exports = EventHandler;
