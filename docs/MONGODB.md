# Guide MongoDB - NioticBot

NioticBot supporte deux options pour MongoDB : **MongoDB Atlas** (cloud) et **MongoDB local**.

---

## Option 1 : MongoDB Atlas (Cloud - Recommandé)

MongoDB Atlas offre un cluster gratuit avec 512 Mo de stockage, idéal pour la plupart des serveurs Discord.

### Étape 1 : Créer un compte
1. Rendez-vous sur [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Créez un compte gratuit

### Étape 2 : Créer un cluster
1. Cliquez sur **"Build a Database"**
2. Sélectionnez **"M0 FREE"** (gratuit)
3. Choisissez le cloud provider et la région la plus proche
4. Nommez votre cluster (ex: "NioticBot")
5. Cliquez sur **"Create"**

### Étape 3 : Créer un utilisateur
1. Dans **"Database Access"**, cliquez sur **"Add New Database User"**
2. Méthode : Password
3. Entrez un nom d'utilisateur et un mot de passe robuste
4. Rôle : **"Read and write to any database"**
5. Cliquez sur **"Add User"**

### Étape 4 : Configurer l'accès réseau
1. Dans **"Network Access"**, cliquez sur **"Add IP Address"**
2. Pour le développement : **"Allow Access from Anywhere"** (0.0.0.0/0)
3. Pour la production : entrez l'IP de votre serveur EC2
4. Cliquez sur **"Confirm"**

### Étape 5 : Récupérer l'URI
1. Dans **"Database"**, cliquez sur **"Connect"** à côté de votre cluster
2. Choisissez **"Connect your application"**
3. Driver : **Node.js**, Version : la plus récente
4. Copiez l'URI de connexion, elle ressemble à :
```
mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```
5. Remplacez `<password>` par votre mot de passe
6. Ajoutez le nom de la base après `.net/` :
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/nioticbot?retryWrites=true&w=majority
```

### Étape 6 : Configurer dans le bot
Dans votre fichier `.env` :
```env
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/nioticbot?retryWrites=true&w=majority
```

---

## Option 2 : MongoDB Local (sur EC2 ou serveur)

### Installation sur Ubuntu/Debian

```bash
# Importer la clé GPG de MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Ajouter le dépôt MongoDB
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Mettre à jour et installer
sudo apt-get update
sudo apt-get install -y mongodb-org

# Démarrer MongoDB
sudo systemctl start mongod

# Activer le démarrage automatique
sudo systemctl enable mongod

# Vérifier le statut
sudo systemctl status mongod
```

### Sécurisation

```bash
# Se connecter à MongoDB
mongosh

# Créer un administrateur
use admin
db.createUser({
  user: "admin",
  pwd: "votre_mot_de_passe_robuste",
  roles: [{ role: "userAdminAnyDatabase", db: "admin" }]
})

# Créer un utilisateur pour le bot
use nioticbot
db.createUser({
  user: "nioticbot",
  pwd: "mot_de_passe_bot",
  roles: [{ role: "readWrite", db: "nioticbot" }]
})

exit
```

Activer l'authentification dans `/etc/mongod.conf` :
```yaml
security:
  authorization: enabled
```

Redémarrer MongoDB :
```bash
sudo systemctl restart mongod
```

### URI de connexion locale

```env
MONGODB_URI=mongodb://nioticbot:mot_de_passe_bot@localhost:27017/nioticbot
```

### Maintenance

```bash
# Vérifier l'espace disque utilisé
mongosh --eval "db.stats()" nioticbot

# Backup manuel
mongodump --db nioticbot --out /chemin/backup/$(date +%Y%m%d)

# Restaurer un backup
mongorestore --db nioticbot /chemin/backup/20240101/nioticbot/
```

---

## Vérification de la connexion

Après configuration, lancez le bot. Vous devriez voir :
```
[INFO] Connexion à MongoDB...
[INFO] Connecté à MongoDB avec succès
```

Si vous voyez une erreur, vérifiez :
1. L'URI est correcte (pas de faute de frappe)
2. Le mot de passe ne contient pas de caractères spéciaux non encodés
3. L'IP est autorisée (Atlas) ou MongoDB est bien démarré (local)
4. Le port 27017 est accessible
