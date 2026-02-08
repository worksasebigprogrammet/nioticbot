# NioticBot - Bot Discord Multifonction

Bot Discord multifonction ultra-complet pour l'administration de serveurs Discord. Modulaire, performant et entièrement configurable.

## Fonctionnalités

### Modération & Sécurité
- **Commandes de modération** : ban, kick, mute, warn, softban, purge
- **Système de cas** : Historique complet de toutes les actions de modération
- **Anti-raid** : Détection automatique de raids (joins massifs, admin compromis)
- **Auto-modération** : Anti-spam, anti-liens, anti-mention, anti-caps, anti-flood

### Système de Logs
- **3 presets** : Simple (4 salons), Complet (8 salons), Extrême (12+ salons)
- **Configuration granulaire** : Chaque type de log activable/désactivable individuellement
- **30+ types de logs** : Messages, membres, rôles, vocal, serveur, invitations, etc.

### Tickets de Support
- Panel avec boutons et catégories
- Système claim/close/reopen
- Transcripts automatiques
- Notation et statistiques staff

### XP & Niveaux
- XP par message avec cooldown
- Multiplicateurs par rôle et par salon
- Rôles récompenses par niveau
- Classement serveur

### Économie
- Monnaie virtuelle configurable
- Récompenses quotidiennes/hebdomadaires
- Boutique avec items configurables
- Transferts entre membres

### Autres
- **Musique** : Lecture, file d'attente, contrôles
- **Giveaways** : Création, participation, tirage automatique
- **Auto-rôles** : Rôles à l'arrivée et par réaction/bouton
- **Suggestions** : Système de suggestions avec votes
- **Statistiques** : Stats serveur, membres, modération
- **Tracking vocal** : Temps en vocal avec classement
- **Backups** : Sauvegarde automatique quotidienne

## Prérequis

- **Node.js** v18 ou supérieur
- **MongoDB** (Atlas ou local)
- **Token Discord** via [Discord Developer Portal](https://discord.com/developers/applications)

## Installation rapide

```bash
# Cloner le repo
git clone <url-du-repo>
cd nioticbot

# Installer les dépendances
npm install

# Configurer l'environnement
cp .env.example .env
# Éditer .env avec votre token et URI MongoDB

# Copier la config exemple
cp config/config.example.json config/config.json
# Éditer config/config.json avec vos IDs

# Déployer les commandes slash
npm run deploy

# Démarrer le bot
npm start

# OU en mode développement (rechargement auto)
npm run dev
```

## Configuration

Voir [CONFIGURATION.md](docs/CONFIGURATION.md) pour le guide complet.

### Variables d'environnement (.env)

| Variable | Description | Requis |
|----------|-------------|--------|
| `DISCORD_TOKEN` | Token du bot Discord | ✅ |
| `CLIENT_ID` | ID du client/bot | ✅ |
| `GUILD_ID` | ID du serveur (dev uniquement) | ❌ |
| `MONGODB_URI` | URI de connexion MongoDB | ✅ |
| `DEFAULT_LANGUAGE` | Langue par défaut (fr/en) | ❌ |

## Commandes principales

| Commande | Description | Permission |
|----------|-------------|------------|
| `/ban` | Bannir un membre | Admin |
| `/kick` | Expulser un membre | Admin |
| `/mute` | Rendre muet un membre | Admin |
| `/warn` | Avertir un membre | Admin |
| `/purge` | Supprimer des messages | Admin |
| `/setup` | Configurer les logs | Admin |
| `/antiraid` | Gérer l'anti-raid | Admin |
| `/ticket panel` | Créer un panel de tickets | Admin |
| `/rank` | Voir son niveau | Tous |
| `/balance` | Voir son solde | Tous |
| `/daily` | Récompense quotidienne | Tous |
| `/play` | Jouer de la musique | Tous |
| `/suggest` | Faire une suggestion | Tous |
| `/stats` | Voir les statistiques | Tous |

## Documentation

- [SETUP.md](docs/SETUP.md) - Guide d'installation complet
- [MONGODB.md](docs/MONGODB.md) - Configuration MongoDB (Atlas & Local)
- [EC2_DEPLOYMENT.md](docs/EC2_DEPLOYMENT.md) - Déploiement sur AWS EC2
- [CONFIGURATION.md](docs/CONFIGURATION.md) - Guide de configuration
- [ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) - Guide pour administrateurs

## Stack Technique

- **Runtime** : Node.js
- **Discord** : discord.js v14
- **Base de données** : MongoDB / Mongoose
- **Audio** : @discordjs/voice + play-dl
- **i18n** : Système de traduction FR/EN extensible

## Licence

MIT
