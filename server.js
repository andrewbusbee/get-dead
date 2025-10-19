const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
let gameRooms = new Map();
let playerSockets = new Map();

// Game room class
class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = new Map();
    this.gameState = 'waiting'; // waiting, playing, finished
    this.gameBoard = {
      width: 800,
      height: 600
    };
    this.obstacles = [];
    this.obstaclesEnabled = false;
  }

  addPlayer(socketId, playerName) {
    const player = {
      id: socketId,
      name: playerName,
      isGetDeader: false,
      position: { x: 0, y: 0 },
      isCaught: false,
      isAlive: true
    };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  setGetDeader(socketId) {
    // Reset all players to not be Get Deader
    this.players.forEach(player => {
      player.isGetDeader = false;
    });
    
    const player = this.players.get(socketId);
    if (player) {
      player.isGetDeader = true;
      return true;
    }
    return false;
  }

  generateObstacles() {
    this.obstacles = [];
    if (!this.obstaclesEnabled) return;
    
    const obstacleEmojis = ['🪨', '🌳', '🏠', '🚗', '📦', '🪑', '🗿', '🛡️'];
    const numObstacles = Math.floor(Math.random() * 8) + 5; // 5-12 obstacles
    
    for (let i = 0; i < numObstacles; i++) {
      let x, y;
      let attempts = 0;
      
      do {
        x = Math.random() * (this.gameBoard.width - 40) + 20;
        y = Math.random() * (this.gameBoard.height - 40) + 20;
        attempts++;
      } while (this.isObstacleTooCloseToPlayers(x, y) && attempts < 50);
      
      this.obstacles.push({
        x: x,
        y: y,
        emoji: obstacleEmojis[Math.floor(Math.random() * obstacleEmojis.length)]
      });
    }
  }
  
  isObstacleTooCloseToPlayers(x, y) {
    const players = Array.from(this.players.values());
    return players.some(player => {
      const distance = Math.sqrt(
        Math.pow(player.position.x - x, 2) + 
        Math.pow(player.position.y - y, 2)
      );
      return distance < 80; // Minimum distance from players
    });
  }
  
  setObstaclesEnabled(enabled) {
    this.obstaclesEnabled = enabled;
    if (enabled && this.obstacles.length === 0) {
      this.generateObstacles();
    }
  }

  startGame() {
    if (this.players.size < 2) return false;
    
    this.gameState = 'playing';
    
    // Generate obstacles if enabled
    this.generateObstacles();
    
    // Position players
    const players = Array.from(this.players.values());
    const getDeader = players.find(p => p.isGetDeader);
    const gotDeaders = players.filter(p => !p.isGetDeader);
    
    // Position Get Deader on left side
    if (getDeader) {
      getDeader.position = { x: 50, y: this.gameBoard.height / 2 };
    }
    
    // Position Got Deaders on right side
    gotDeaders.forEach((player, index) => {
      player.position = { 
        x: this.gameBoard.width - 100, 
        y: 100 + (index * 80) 
      };
    });
    
    return true;
  }

  movePlayer(socketId, direction, directions = null) {
    const player = this.players.get(socketId);
    if (!player || !player.isAlive || player.isCaught) return;
    
    const speed = 5;
    const diagonalSpeed = speed * 0.707; // ~3.5 for diagonal movement (sqrt(2)/2)
    const newPos = { ...player.position };
    
    if (direction === 'diagonal' && directions) {
      // Handle diagonal movement
      directions.forEach(dir => {
        switch (dir) {
          case 'up':
            newPos.y = Math.max(20, newPos.y - diagonalSpeed);
            break;
          case 'down':
            newPos.y = Math.min(this.gameBoard.height - 20, newPos.y + diagonalSpeed);
            break;
          case 'left':
            newPos.x = Math.max(20, newPos.x - diagonalSpeed);
            break;
          case 'right':
            newPos.x = Math.min(this.gameBoard.width - 20, newPos.x + diagonalSpeed);
            break;
        }
      });
    } else {
      // Handle single direction movement
      switch (direction) {
        case 'up':
          newPos.y = Math.max(20, newPos.y - speed);
          break;
        case 'down':
          newPos.y = Math.min(this.gameBoard.height - 20, newPos.y + speed);
          break;
        case 'left':
          newPos.x = Math.max(20, newPos.x - speed);
          break;
        case 'right':
          newPos.x = Math.min(this.gameBoard.width - 20, newPos.x + speed);
          break;
      }
    }
    
    // Check for obstacle collisions before moving
    if (this.checkObstacleCollision(newPos)) {
      return; // Don't move if would collide with obstacle
    }
    
    player.position = newPos;
    
    // Check for player collisions
    this.checkCollisions();
  }

  checkObstacleCollision(position) {
    if (!this.obstaclesEnabled || !this.obstacles) return false;
    
    const playerRadius = 15; // Approximate player collision radius
    
    for (const obstacle of this.obstacles) {
      const distance = Math.sqrt(
        Math.pow(position.x - obstacle.x, 2) + Math.pow(position.y - obstacle.y, 2)
      );
      
      if (distance < playerRadius + 20) { // Use fixed obstacle size
        return true; // Collision detected
      }
    }
    
    return false;
  }

  checkCollisions() {
    const players = Array.from(this.players.values());
    const getDeader = players.find(p => p.isGetDeader && p.isAlive);
    const gotDeaders = players.filter(p => !p.isGetDeader && p.isAlive && !p.isCaught);
    
    if (!getDeader) return;
    
    gotDeaders.forEach(gotDeader => {
      const distance = Math.sqrt(
        Math.pow(getDeader.position.x - gotDeader.position.x, 2) +
        Math.pow(getDeader.position.y - gotDeader.position.y, 2)
      );
      
      if (distance < 30) { // Collision threshold
        gotDeader.isCaught = true;
        gotDeader.isAlive = false;
        
        // Check if game is over
        const remainingGotDeaders = players.filter(p => !p.isGetDeader && p.isAlive && !p.isCaught);
        if (remainingGotDeaders.length === 0) {
          this.gameState = 'finished';
        }
      }
    });
  }

  getGameData() {
    return {
      roomId: this.roomId,
      players: Array.from(this.players.values()),
      gameState: this.gameState,
      gameBoard: this.gameBoard,
      obstacles: this.obstacles,
      obstaclesEnabled: this.obstaclesEnabled
    };
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('join-room', (data) => {
    console.log('Join room request:', data);
    const { roomId, playerName } = data;
    
    if (!gameRooms.has(roomId)) {
      console.log('Creating new room:', roomId);
      gameRooms.set(roomId, new GameRoom(roomId));
    }
    
    const room = gameRooms.get(roomId);
    const player = room.addPlayer(socket.id, playerName);
    playerSockets.set(socket.id, roomId);
    
    console.log('Player added to room:', roomId, 'Total players:', room.players.size);
    
    socket.join(roomId);
    socket.emit('joined-room', { player, room: room.getGameData() });
    io.to(roomId).emit('room-updated', room.getGameData());
  });
  
  socket.on('set-get-deader', (data) => {
    const { roomId, playerId } = data;
    const room = gameRooms.get(roomId);
    
    if (room) {
      // If playerId is provided, set that player as Get Deader
      // Otherwise, set the current socket as Get Deader (backward compatibility)
      const targetPlayerId = playerId || socket.id;
      
      if (room.setGetDeader(targetPlayerId)) {
        console.log('Set Get Deader to player:', targetPlayerId);
        io.to(roomId).emit('room-updated', room.getGameData());
      }
    }
  });
  
  socket.on('set-player-emoji', (data) => {
    const { roomId, emoji } = data;
    const room = gameRooms.get(roomId);
    
    if (room) {
      const player = room.players.get(socket.id);
      if (player) {
        player.emoji = emoji;
        console.log('Player', player.name, 'selected emoji:', emoji);
        
        // Notify all players in the room about the emoji change
        io.to(roomId).emit('player-emoji-updated', {
          playerId: socket.id,
          emoji: emoji
        });
      }
    }
  });
  
  socket.on('set-obstacles-preference', (data) => {
    const { roomId, enabled } = data;
    const room = gameRooms.get(roomId);
    
    if (room) {
      room.setObstaclesEnabled(enabled);
      console.log('Obstacles enabled for room', roomId, ':', enabled);
      
      // Notify all players in the room about the obstacles preference change
      io.to(roomId).emit('obstacles-preference-updated', {
        enabled: enabled,
        obstacles: room.obstacles
      });
    }
  });
  
  socket.on('start-game', (data) => {
    const { roomId } = data;
    const room = gameRooms.get(roomId);
    
    if (room && room.startGame()) {
      io.to(roomId).emit('game-started', room.getGameData());
    }
  });
  
  socket.on('move-player', (data) => {
    const { roomId, direction, directions } = data;
    const room = gameRooms.get(roomId);
    
    if (room && room.gameState === 'playing') {
      room.movePlayer(socket.id, direction, directions);
      io.to(roomId).emit('game-updated', room.getGameData());
    }
  });
  
  socket.on('new-game', (data) => {
    const { roomId } = data;
    const room = gameRooms.get(roomId);
    
    if (room) {
      console.log('New game requested for room:', roomId);
      
      // Reset all players to alive and not caught
      room.players.forEach(player => {
        player.isAlive = true;
        player.isCaught = false;
        player.position = { x: 0, y: 0 }; // Will be repositioned when game starts
      });
      
      // Reset game state
      room.gameState = 'waiting';
      
      // Notify all players in the room to go back to game room
      io.to(roomId).emit('new-game-requested');
      io.to(roomId).emit('room-updated', room.getGameData());
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    const roomId = playerSockets.get(socket.id);
    if (roomId) {
      const room = gameRooms.get(roomId);
      if (room) {
        room.removePlayer(socket.id);
        io.to(roomId).emit('room-updated', room.getGameData());
        
        // Clean up empty rooms
        if (room.players.size === 0) {
          gameRooms.delete(roomId);
        }
      }
      playerSockets.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Get Dead game server running on port ${PORT}`);
});
