# Guide d'Installation - NioticBot

## 1. Création du Bot Discord

### Étape 1 : Créer l'application
1. Rendez-vous sur le [Discord Developer Portal](https://discord.com/developers/applications)
2. Cliquez sur **"New Application"**
3. Donnez un nom à votre bot (ex: "NioticBot")
4. Acceptez les conditions d'utilisation

### Étape 2 : Configurer le bot
1. Dans le menu latéral, cliquez sur **"Bot"**
2. Cliquez sur **"Add Bot"** puis confirmez
3. Personnalisez le nom et l'avatar du bot
4. **Copiez le Token** (bouton "Reset Token" si nécessaire) - **NE PARTAGEZ JAMAIS CE TOKEN**

### Étape 3 : Activer les Intents
Dans la section **"Privileged Gateway Intents"**, activez :
- ✅ **Presence Intent** - Pour détecter le statut en ligne
- ✅ **Server Members Intent** - Pour les événements membres (joins, leaves)
- ✅ **Message Content Intent** - Pour lire le contenu des messages (automod)

### Étape 4 : Inviter le bot
1. Dans le menu latéral, cliquez sur **"OAuth2" > "URL Generator"**
2. Cochez les scopes : `bot`, `applications.commands`
3. Cochez les permissions :
   - Administrator (recommandé pour toutes les fonctionnalités)
   - OU permissions individuelles : Manage Channels, Manage Roles, Kick Members, Ban Members, Manage Messages, etc.
4. Copiez l'URL générée et ouvrez-la dans votre navigateur
5. Sélectionnez votre serveur et autorisez

## 2. Installation du Bot

### Prérequis
- **Node.js** v18+ : [Télécharger](https://nodejs.org/)
- **npm** (inclus avec Node.js)
- **Git** : [Télécharger](https://git-scm.com/)
- **MongoDB** : Voir [MONGODB.md](MONGODB.md)

### Installation

```bash
# Cloner le projet
git clone <url-du-repo>
cd nioticbot

# Installer les dépendances
npm install
```

### Configuration

```bash
# Copier le fichier d'environnement
cp .env.example .env
```

Éditez le fichier `.env` :
```env
DISCORD_TOKEN=votre_token_ici
CLIENT_ID=votre_client_id_ici
GUILD_ID=votre_guild_id_ici
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/nioticbot
```

**Où trouver le Client ID :**
- Discord Developer Portal > Votre Application > "General Information" > "Application ID"

**Où trouver le Guild ID :**
- Activez le Mode Développeur dans Discord (Paramètres > Avancés > Mode Développeur)
- Clic droit sur votre serveur > "Copier l'identifiant"

```bash
# Copier la configuration exemple
cp config/config.example.json config/config.json
```

Éditez `config/config.json` avec vos IDs (owners, adminRoleId, etc.).

## 3. Premier Lancement

```bash
# Déployer les commandes slash (à faire une seule fois ou après ajout de commandes)
npm run deploy

# Lancer le bot
npm start

# OU en mode développement (rechargement auto)
npm run dev
```

Si tout fonctionne, vous verrez :
```
[INFO] Connexion à MongoDB...
[INFO] Connecté à MongoDB avec succès
[INFO] XX commandes chargées
[INFO] XX événements chargés
[INFO] Connexion à Discord...
[INFO] ✅ NioticBot#1234 est en ligne ! (1 serveurs)
[INFO] Enregistrement de XX commandes slash...
[INFO] Commandes enregistrées sur le serveur XXXX
```

## 4. Configuration Initiale sur Discord

### Configurer les logs
```
/setup preset:complete
```
Cela créera automatiquement une catégorie "📊 Logs" avec les salons de logs.

### Configurer l'anti-raid
```
/antiraid config
```

### Créer un panel de tickets
```
/ticket panel
```

## 5. Dépannage

### Le bot ne se connecte pas
- Vérifiez que le token dans `.env` est correct
- Vérifiez que les intents sont activés sur le Developer Portal

### Les commandes slash n'apparaissent pas
- Exécutez `npm run deploy`
- Si vous utilisez `GUILD_ID`, les commandes sont instantanées
- Sans `GUILD_ID` (global), attendez jusqu'à 1 heure

### Erreur MongoDB
- Vérifiez que votre URI MongoDB est correcte
- Pour Atlas : vérifiez que votre IP est dans la whitelist
- Voir [MONGODB.md](MONGODB.md)

### Erreur de permissions
- Assurez-vous que le bot a les permissions nécessaires
- Le rôle du bot doit être au-dessus des rôles qu'il doit gérer
