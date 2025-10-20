# 🏇 Stay The Distance - Auteuil Edition

Jeu de course de chevaux multijoueur avec système de rooms.

## 🚀 Installation

### 1. Prérequis
```bash
# Node.js v20+
node --version

# Module ws
npm install ws
```

### 2. Déploiement sur serveur

```bash
# Télécharger les 4 fichiers dans un dossier
mkdir ~/stay-the-distance
cd ~/stay-the-distance

# Installer les dépendances
npm install ws

# Ouvrir le port dans le firewall
sudo ufw allow 3001
sudo ufw status
```

### 3. Lancer le serveur

**Test manuel :**
```bash
node server.js
```

Tu devrais voir :
```
╔════════════════════════════════════════════════╗
║   🏇 STAY THE DISTANCE - Auteuil Edition      ║
╚════════════════════════════════════════════════╝

🌍 Serveur démarré sur: http://0.0.0.0:3001
...
```

**Logs à surveiller :**
```
✅ Fichier servi: /home/.../selection.html
🔌 Nouvelle connexion WebSocket depuis ::ffff:192.168.1.x
📨 Message reçu: { type: 'join-room', roomCode: '1234', ... }
✅ Joueur P3BAK ajouté à la room 1234
```

**Production avec PM2 :**
```bash
npm install -g pm2
pm2 start server.js --name stay-the-distance
pm2 save
pm2 startup  # Copier-coller la commande générée
pm2 logs stay-the-distance  # Voir les logs en temps réel
```

## 🎮 Utilisation

### 1. TV (Receiver)
```
http://91.99.56.243:3001/receiver.html
```
- Entre un code room (ex: 1234)
- Clique sur CRÉER
- Partage le lien aux joueurs
- Attends qu'ils rejoignent
- Clique sur DÉMARRER LA COURSE

### 2. Mobile (Joueurs)
```
http://91.99.56.243:3001/selection.html?room=1234
```
- Sélectionne ton cheval avec ◀ ▶
- Clique sur SÉLECTIONNER
- Tu es redirigé vers les contrôles

### 3. Contrôles
- **⬅️ GAUCHE / DROITE ➡️** : Changer de position (0-100)
- **⬆️ PACE + / ⬇️ PACE -** : Augmenter/Réduire le rythme
- **🦘 SAUT** : Sauter un obstacle

## 🔍 Debugging

### Problème : "Server Error" sur controller-game.html

**Diagnostic :**
```bash
# 1. Vérifie les logs du serveur
pm2 logs stay-the-distance --lines 50

# 2. Vérifie que le fichier existe
ls -la ~/stay-the-distance/controller-game.html

# 3. Teste manuellement
curl http://localhost:3001/controller-game.html
# Doit retourner du HTML, pas une erreur 404

# 4. Vérifie que le serveur écoute bien
sudo lsof -i :3001
```

**Si le serveur ne voit pas le "Sélectionner" :**
- Ouvre la console du navigateur (F12)
- Regarde les erreurs WebSocket
- Vérifie que `ws://91.99.56.243:3001` est accessible

**Logs attendus quand un joueur sélectionne :**
```
🔌 Nouvelle connexion WebSocket depuis ::ffff:xxx.xxx.xxx.xxx
📨 Message reçu: {
  type: 'join-room',
  roomCode: '1234',
  playerId: 'P3BAK',
  horse: { name: 'PINGLETON', ... }
}
✨ Nouvelle room créée: 1234
✅ Joueur P3BAK ajouté à la room 1234
👥 Joueurs dans la room: 1
📢 Broadcast room 1234: player-joined (1 destinataires)
```

### Problème : WebSocket ne se connecte pas

**Vérifications :**
```bash
# 1. Firewall
sudo ufw status
# Doit montrer : 3001 ALLOW Anywhere

# 2. Serveur écoute bien
netstat -tuln | grep 3001

# 3. Tester localement
wscat -c ws://localhost:3001
# Doit se connecter
```

**Sur le mobile :**
- Ouvre `http://91.99.56.243:3001/selection.html`
- Ouvre la console (F12)
- Tu dois voir : `✅ WebSocket connecté`
- Si erreur : vérifie l'URL du WebSocket dans le code

## 📁 Structure des fichiers

```
stay-the-distance/
├── server.js              # Serveur Node.js + WebSocket (gestion rooms)
├── selection.html         # Sélection du cheval + connexion WebSocket
├── controller-game.html   # Contrôles mobile (lit params URL)
├── receiver.html          # TV avec liste des joueurs
└── README.md             # Ce fichier
```

## 🔧 Variables à modifier

**Dans tous les fichiers HTML :**
```javascript
const WS_URL = 'ws://91.99.56.243:3001';
```

**Dans server.js :**
```javascript
const PORT = 3001;
```

**Dans le README et les messages du serveur :**
```javascript
http://91.99.56.243:3001/...
```

## 🎯 Fonctionnalités

### ✅ Implémenté
- [x] Système de rooms avec code à 4 chiffres
- [x] Sélection de cheval avec stats
- [x] Connexion WebSocket
- [x] Contrôles mobile (gauche/droite, pace +/-, saut)
- [x] Vue 3D perspective sur le controller
- [x] Receiver avec liste des joueurs

### 🚧 À faire
- [ ] Affichage de la course sur le receiver
- [ ] Logique de la course (calcul des positions)
- [ ] Obstacles et pénalités
- [ ] Système de cravache (whip)
- [ ] Fin de course et classement
- [ ] Replay et statistiques

## 📞 Support

**Problèmes courants :**
1. **404 sur controller-game.html** → Vérifie que le fichier existe et que le serveur le sert
2. **WebSocket ne se connecte pas** → Vérifie le firewall et l'URL
3. **Joueur ne rejoint pas la room** → Regarde les logs du serveur
4. **"Server Error"** → Le serveur ne trouve pas le fichier ou a crashé

**Commandes utiles :**
```bash
# Redémarrer le serveur
pm2 restart stay-the-distance

# Voir les erreurs
pm2 logs stay-the-distance --err

# Tuer le processus si bloqué
pm2 delete stay-the-distance
pm2 start server.js --name stay-the-distance
```