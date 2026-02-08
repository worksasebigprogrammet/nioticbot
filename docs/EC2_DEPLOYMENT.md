# Déploiement sur AWS EC2 - NioticBot

Guide complet pour déployer NioticBot sur une instance AWS EC2 Free Tier.

## 1. Créer une Instance EC2

### Étape 1 : Connexion à AWS
1. Créez un compte sur [AWS](https://aws.amazon.com/) si ce n'est pas fait
2. Connectez-vous à la [Console AWS](https://console.aws.amazon.com/)
3. Recherchez **EC2** dans la barre de recherche

### Étape 2 : Lancer une instance
1. Cliquez sur **"Launch Instance"**
2. Configurez :
   - **Nom** : NioticBot
   - **AMI** : Ubuntu Server 22.04 LTS (Free tier eligible)
   - **Type d'instance** : t2.micro (Free tier - 1 vCPU, 1 Go RAM)
   - **Key pair** : Créez-en une nouvelle (format .pem), téléchargez-la
   - **Stockage** : 8-20 Go gp2 (Free tier = 30 Go)

### Étape 3 : Security Groups
Configurez les règles entrantes :

| Type | Port | Source | Description |
|------|------|--------|-------------|
| SSH | 22 | Votre IP | Accès SSH |
| Custom TCP | 27017 | Votre IP | MongoDB (si accès externe nécessaire) |

> **Note** : Le bot Discord n'a pas besoin de ports entrants supplémentaires car il se connecte en sortie vers l'API Discord.

### Étape 4 : Lancer l'instance
Cliquez sur **"Launch Instance"** et attendez que l'état passe à "Running".

## 2. Connexion SSH

### Linux/Mac
```bash
# Protéger la clé
chmod 400 votre-cle.pem

# Se connecter
ssh -i votre-cle.pem ubuntu@ADRESSE_IP_PUBLIQUE
```

### Windows
Utilisez [PuTTY](https://www.putty.org/) :
1. Convertissez la clé .pem en .ppk avec PuTTYgen
2. Dans PuTTY : Host = IP publique, Port = 22
3. Connection > SSH > Auth : parcourez vers le fichier .ppk
4. Connectez-vous avec l'utilisateur `ubuntu`

## 3. Installation de l'Environnement

```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Installer Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Vérifier l'installation
node --version  # v18.x.x
npm --version   # 9.x.x

# Installer Git
sudo apt install -y git

# Installer les dépendances pour @discordjs/opus (audio)
sudo apt install -y build-essential python3
```

## 4. Installation de MongoDB (optionnel - si pas Atlas)

Voir [MONGODB.md](MONGODB.md) - Section "Option 2 : MongoDB Local".

## 5. Déploiement du Bot

```bash
# Cloner le projet
cd ~
git clone <url-du-repo> nioticbot
cd nioticbot

# Installer les dépendances
npm install

# Créer le fichier .env
cp .env.example .env
nano .env
# Remplissez avec votre token, client ID, et URI MongoDB

# Copier la config
cp config/config.example.json config/config.json
nano config/config.json
# Configurez selon vos besoins

# Déployer les commandes slash
npm run deploy

# Test rapide
npm start
# Ctrl+C pour arrêter
```

## 6. PM2 - Process Manager

PM2 maintient le bot en fonctionnement en permanence et le redémarre automatiquement en cas de crash.

```bash
# Installer PM2 globalement
sudo npm install -g pm2

# Démarrer le bot avec PM2
pm2 start src/index.js --name "nioticbot"

# Vérifier le statut
pm2 status

# Voir les logs
pm2 logs nioticbot

# Voir les logs en temps réel
pm2 logs nioticbot --lines 50

# Redémarrer le bot
pm2 restart nioticbot

# Arrêter le bot
pm2 stop nioticbot

# Configurer le démarrage automatique au boot
pm2 startup
# Exécutez la commande affichée

# Sauvegarder la configuration PM2
pm2 save
```

### Configuration PM2 avancée

Créez un fichier `ecosystem.config.js` :
```javascript
module.exports = {
  apps: [{
    name: 'nioticbot',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

```bash
pm2 start ecosystem.config.js
```

## 7. Mise à Jour du Bot

```bash
cd ~/nioticbot

# Arrêter le bot
pm2 stop nioticbot

# Mettre à jour le code
git pull origin main

# Installer les nouvelles dépendances
npm install

# Re-déployer les commandes (si nouvelles commandes)
npm run deploy

# Redémarrer
pm2 restart nioticbot
```

## 8. Monitoring

### PM2 Monitoring
```bash
# Dashboard en temps réel
pm2 monit

# Métriques détaillées
pm2 show nioticbot
```

### Logs
```bash
# Logs du bot
pm2 logs nioticbot

# Logs système
sudo journalctl -u mongod  # Logs MongoDB
```

### Espace disque
```bash
df -h
du -sh ~/nioticbot/backups/  # Taille des backups
du -sh ~/nioticbot/logs/     # Taille des logs
```

## 9. Sécurité

### Bonnes pratiques
- Ne partagez jamais votre fichier `.env`
- Changez régulièrement vos mots de passe MongoDB
- Gardez le système à jour : `sudo apt update && sudo apt upgrade`
- Surveillez les logs pour détecter les activités suspectes

### Pare-feu (UFW)
```bash
sudo ufw allow ssh
sudo ufw enable
sudo ufw status
```

## 10. Coûts

### AWS Free Tier (12 premiers mois)
- **EC2 t2.micro** : 750 heures/mois gratuites
- **EBS** : 30 Go de stockage gratuit
- **Transfert données** : 15 Go/mois sortant gratuit

### Après le Free Tier
- **EC2 t2.micro** : ~$8.50/mois (us-east-1)
- Envisagez t3.micro ou t3a.micro pour un meilleur rapport qualité/prix
- Ou utilisez une instance réservée pour réduire les coûts
