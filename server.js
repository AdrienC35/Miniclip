const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const PORT = 3001;

// Créer le serveur Express
const app = express();
const server = http.createServer(app);

// Servir les fichiers statiques
app.use(express.static(__dirname));

// Routes pour les pages principales
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'receiver-aerial-view.html'));
});

app.get('/receiver.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'receiver-aerial-view.html'));
});

app.get('/selection.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'selection.html'));
});

app.get('/controller-game.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'controller-game-immersive.html'));
});

// Créer le serveur WebSocket attaché au serveur HTTP
const wss = new WebSocket.Server({ server });

// Structure: Map<roomCode, Room>
const rooms = new Map();

class Room {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = new Map(); // Map<playerId, Player>
    this.readyEnabled = false;
    this.countdownTimer = null;
    this.raceStarted = false;
    this.raceFinished = false;
    this.finishOrder = []; // Ordre d'arrivée
    this.obstacles = this.generateObstacles();
  }

  generateObstacles() {
    const obstacles = [];
    const TOTAL_DISTANCE = 2000;
    const HEDGE_INTERVAL = 200;
    
    for (let dist = HEDGE_INTERVAL; dist < TOTAL_DISTANCE; dist += HEDGE_INTERVAL) {
      obstacles.push({
        id: `hedge_${dist}`,
        distance: dist,
        type: 'hedge'
      });
    }
    
    console.log(`🌿 Généré ${obstacles.length} haies pour la room ${this.roomCode}`);
    return obstacles;
  }

  addPlayer(playerId, ws, horse) {
    this.players.set(playerId, {
      id: playerId,
      ws: ws,
      horse: horse,
      ready: false,
      finished: false,
      finishTime: null,
      position: { x: 0, z: 0 },
      distance: 0,
      speed: 0
    });
    console.log(`✅ Joueur ${playerId} ajouté à la room ${this.roomCode}`);
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    console.log(`❌ Joueur ${playerId} retiré de la room ${this.roomCode}`);
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  getAllPlayers() {
    return Array.from(this.players.values());
  }

  getPlayersExcept(excludeId) {
    return this.getAllPlayers().filter(p => p.id !== excludeId);
  }

  setPlayerReady(playerId) {
    const player = this.getPlayer(playerId);
    if (player) {
      player.ready = true;
      console.log(`✅ Joueur ${playerId} est PRÊT`);
      return true;
    }
    return false;
  }

  getReadyCount() {
    return this.getAllPlayers().filter(p => p.ready && p.id !== 'RECEIVER').length;
  }

  getTotalPlayerCount() {
    return this.getAllPlayers().filter(p => p.id !== 'RECEIVER').length;
  }

  areAllPlayersReady() {
    const total = this.getTotalPlayerCount();
    const ready = this.getReadyCount();
    console.log(`📊 Joueurs prêts: ${ready}/${total}`);
    return total > 0 && ready === total;
  }

  broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    let sentCount = 0;
    const recipients = [];

    this.players.forEach((player, playerId) => {
      const shouldExclude = excludeId && playerId === excludeId;
      const isOpen = player.ws.readyState === WebSocket.OPEN;
      
      console.log(`   🔍 Check joueur ${playerId}: WS=${isOpen ? 'OPEN' : 'CLOSED'}, Exclu=${shouldExclude}`);
      
      if (isOpen && !shouldExclude) {
        player.ws.send(data);
        sentCount++;
        recipients.push(playerId);
      }
    });

    console.log(`📢 Broadcast room ${this.roomCode}: ${message.type}`);
    console.log(`   → Envoyé à ${sentCount} destinataire(s): [${recipients.join(', ')}]`);
    if (excludeId) {
      console.log(`   → Exclu: ${excludeId}`);
    }
  }

  enableReady() {
    this.readyEnabled = true;
    console.log(`🎬 Activation des boutons "JE SUIS PRÊT" dans la room ${this.roomCode}`);
    
    // Envoyer à tous sauf le receiver
    this.broadcast({
      type: 'ready-enabled'
    }, 'RECEIVER');
  }

  startCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }

    console.log('⏱️ Début du countdown...');
    let count = 3;

    this.broadcast({ type: 'countdown', count: 3 });

    this.countdownTimer = setInterval(() => {
      count--;
      
      if (count > 0) {
        console.log(`⏱️ Countdown: ${count}`);
        this.broadcast({ type: 'countdown', count: count });
      } else {
        console.log('🏁 GO ! Course démarrée !');
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.raceStarted = true;
        
        // Envoyer les obstacles ET le signal de départ
        this.broadcast({ 
          type: 'race-start',
          obstacles: this.obstacles 
        });
      }
    }, 1000);
  }

  playerFinished(playerId, time) {
    const player = this.getPlayer(playerId);
    if (player && !player.finished) {
      player.finished = true;
      player.finishTime = time;
      
      this.finishOrder.push({
        position: this.finishOrder.length + 1,
        playerId: playerId,
        horse: player.horse,
        time: time
      });
      
      console.log(`🏁 ${player.horse.name} termine en position ${this.finishOrder.length} !`);
      
      // Broadcast l'arrivée
      this.broadcast({
        type: 'player-finished',
        playerId: playerId,
        position: this.finishOrder.length,
        time: time
      });
      
      // Vérifier si tous ont fini (sauf receiver)
      const totalPlayers = this.getTotalPlayerCount();
      if (this.finishOrder.length >= totalPlayers) {
        this.endRace();
      }
    }
  }

  endRace() {
    this.raceFinished = true;
    console.log('🏆 Course terminée !');
    
    this.broadcast({
      type: 'race-end',
      results: this.finishOrder
    });
  }

  reset() {
    console.log(`🔄 Reset de la room ${this.roomCode}`);
    this.raceStarted = false;
    this.raceFinished = false;
    this.readyEnabled = false;
    this.finishOrder = [];
    this.obstacles = this.generateObstacles();
    
    // Reset tous les joueurs
    this.players.forEach(player => {
      if (player.id !== 'RECEIVER') {
        player.ready = false;
        player.finished = false;
        player.finishTime = null;
        player.position = { x: 0, z: 0 };
        player.distance = 0;
      }
    });
  }

  updatePlayerPosition(playerId, x, z, distance, speed) {
    const player = this.getPlayer(playerId);
    if (player) {
      player.position = { x, z };
      player.distance = distance;
      player.speed = speed;

      // Broadcast la position à tous les autres
      this.broadcast({
        type: 'player-position',
        playerId: playerId,
        x: x,
        z: z,
        distance: distance,
        speed: speed,
        horse: player.horse
      }, playerId);
    }
  }
}

wss.on('connection', (ws) => {
  console.log('🔌 Nouvelle connexion WebSocket');
  let currentPlayerId = null;
  let currentRoomCode = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📨 Message reçu: ${JSON.stringify(data)}`);

      switch (data.type) {
        case 'join-room': {
          const { roomCode, playerId, horse } = data;
          console.log(`🚪 Tentative de rejoindre room ${roomCode} par ${playerId} avec ${horse.name}`);

          // Créer la room si elle n'existe pas
          if (!rooms.has(roomCode)) {
            rooms.set(roomCode, new Room(roomCode));
            console.log(`🆕 Room ${roomCode} créée`);
          }

          const room = rooms.get(roomCode);
          room.addPlayer(playerId, ws, horse);
          
          currentPlayerId = playerId;
          currentRoomCode = roomCode;

          // Confirmer au joueur qu'il a rejoint
          ws.send(JSON.stringify({
            type: 'room-joined',
            roomCode: roomCode,
            playerId: playerId
          }));

          console.log(`👥 Joueurs dans la room: ${room.players.size}`);

          // Broadcast aux autres qu'un nouveau joueur a rejoint
          const playersList = room.getPlayersExcept(playerId).map(p => ({
            id: p.id,
            horse: p.horse
          }));

          console.log(`📊 État de la room avant broadcast:`);
          console.log(`   Nombre total de joueurs: ${room.players.size}`);
          room.players.forEach((p, id) => {
            console.log(`   - ${id}: ${p.horse.name} (WS: ${p.ws.readyState})`);
          });

          room.broadcast({
            type: 'player-joined',
            playerId: playerId,
            horse: horse,
            players: room.getAllPlayers().map(p => ({ id: p.id, horse: p.horse }))
          });

          break;
        }

        case 'enable-ready': {
          const { roomCode } = data;
          const room = rooms.get(roomCode);
          
          if (room) {
            console.log(`📊 État de la room avant broadcast:`);
            console.log(`   Nombre total de joueurs: ${room.players.size}`);
            room.players.forEach((p, id) => {
              console.log(`   - ${id}: ${p.horse.name} (WS: ${p.ws.readyState})`);
            });

            room.enableReady();
          }
          break;
        }

        case 'player-ready': {
          const { roomCode, playerId } = data;
          console.log(`✅ Joueur ${playerId} signale qu'il est PRÊT`);
          
          const room = rooms.get(roomCode);
          if (room) {
            room.setPlayerReady(playerId);

            const readyCount = room.getReadyCount();
            const totalCount = room.getTotalPlayerCount();

            // Informer tout le monde du statut
            room.broadcast({
              type: 'player-ready-status',
              playerId: playerId,
              readyCount: readyCount,
              totalCount: totalCount
            });

            console.log(`📊 Statut: ${readyCount}/${totalCount} joueurs prêts`);

            // Si tout le monde est prêt, lancer le countdown
            if (room.areAllPlayersReady()) {
              console.log('🎉 Tous les joueurs sont prêts ! Lancement du countdown...');
              room.startCountdown();
            }
          }
          break;
        }

        case 'update-position': {
          const { roomCode, playerId, x, z, distance, speed } = data;
          const room = rooms.get(roomCode);
          
          if (room && room.raceStarted) {
            room.updatePlayerPosition(playerId, x, z, distance, speed);
          }
          break;
        }

        case 'player-finished': {
          const { roomCode, playerId, time } = data;
          console.log(`🏁 Joueur ${playerId} signale son arrivée (${time.toFixed(2)}s)`);
          
          const room = rooms.get(roomCode);
          if (room) {
            room.playerFinished(playerId, time);
          }
          break;
        }

        case 'reset-race': {
          const { roomCode } = data;
          console.log(`🔄 Reset de la course demandé pour room ${roomCode}`);
          
          const room = rooms.get(roomCode);
          if (room) {
            room.reset();
            
            // Informer tous les joueurs du reset
            room.broadcast({
              type: 'race-reset'
            });
          }
          break;
        }

        default:
          console.log(`⚠️ Type de message inconnu: ${data.type}`);
      }
    } catch (err) {
      console.error('❌ Erreur de traitement du message:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Connexion fermée');
    
    if (currentRoomCode && currentPlayerId) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        room.removePlayer(currentPlayerId);
        
        // Informer les autres
        room.broadcast({
          type: 'player-left',
          playerId: currentPlayerId
        });

        // Supprimer la room si vide
        if (room.players.size === 0) {
          rooms.delete(currentRoomCode);
          console.log(`🗑️ Room ${currentRoomCode} supprimée (vide)`);
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('❌ Erreur WebSocket:', error);
  });
});

// Démarrer le serveur
server.listen(PORT, () => {
  console.log(`🚀 Serveur HTTP + WebSocket démarré sur le port ${PORT}`);
  console.log(`📡 HTTP: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📡 Prêt à accepter les connexions...`);
});