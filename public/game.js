// AI Player class for solo mode
class AIPlayer {
    constructor(difficulty, role, gameBoard) {
        this.difficulty = difficulty;
        this.role = role; // 'chaser' or 'chased'
        this.gameBoard = gameBoard;
        this.position = { x: 0, y: 0 };
        this.isAlive = true;
        this.isCaught = false;
        this.isGetDeader = role === 'chaser';
        this.emoji = role === 'chaser' ? '🤖' : '👾';
        
        // AI behavior settings based on difficulty
        this.speedMultiplier = this.getSpeedMultiplier();
        this.reactionTime = this.getReactionTime();
        this.pathfindingAccuracy = this.getPathfindingAccuracy();
        
        // AI state
        this.targetPosition = null;
        this.lastMoveTime = 0;
        this.currentDirection = null;
        this.avoidanceVector = { x: 0, y: 0 };
        this.lastPlayerPosition = { x: 0, y: 0 };
        
        // Chased AI specific state
        this.currentTarget = null;
        this.targetPersistence = 0;
        this.lastPosition = { x: 0, y: 0 };
        this.stuckCounter = 0;
        this.momentumDirection = null;
        this.momentumCounter = 0;
        this.cornerEscapeMode = false;
        this.cornerEscapeCounter = 0;
    }
    
    getSpeedMultiplier() {
        const multipliers = {
            easy: { chaser: 1.1, chased: 1.15 },
            medium: { chaser: 1.12, chased: 1.17 },
            hard: { chaser: 1.2, chased: 1.15 },
            nightmare: { chaser: 3.0, chased: 2.5 }
        };
        return multipliers[this.difficulty][this.role];
    }
    
    getReactionTime() {
        const reactionTimes = {
            easy: 100,
            medium: 50,
            hard: 10,
            nightmare: 16 // ~60 FPS
        };
        return reactionTimes[this.difficulty];
    }
    
    getPathfindingAccuracy() {
        const accuracies = {
            easy: 0.7,
            medium: 0.85,
            hard: 0.95,
            nightmare: 1.0
        };
        return accuracies[this.difficulty];
    }
    
    update(playerPosition, obstacles, gameState) {
        if (!this.isAlive || this.isCaught) return;
        
        const currentTime = Date.now();
        if (currentTime - this.lastMoveTime < this.reactionTime) return;
        
        this.lastMoveTime = currentTime;
        
        if (this.role === 'chaser') {
            this.updateChaserBehavior(playerPosition, obstacles);
        } else {
            this.updateChasedBehavior(playerPosition, obstacles);
        }
        
        this.lastPlayerPosition = { ...playerPosition };
    }
    
    updateChaserBehavior(playerPosition, obstacles) {
        // AI chaser tries to get close to the player
        const targetX = playerPosition.x;
        const targetY = playerPosition.y;
        
        // Calculate direction to player
        const dx = targetX - this.position.x;
        const dy = targetY - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 5) return; // Already very close
        
        // Normalize direction
        const moveX = dx / distance;
        const moveY = dy / distance;
        
        // Apply speed multiplier
        const speed = 5 * this.speedMultiplier;
        const newX = this.position.x + moveX * speed;
        const newY = this.position.y + moveY * speed;
        
        // Check for obstacles and adjust path
        const adjustedPosition = this.avoidObstacles({ x: newX, y: newY }, obstacles);
        
        // Ensure within bounds
        this.position.x = Math.max(20, Math.min(this.gameBoard.width - 20, adjustedPosition.x));
        this.position.y = Math.max(20, Math.min(this.gameBoard.height - 20, adjustedPosition.y));
    }
    
    updateChasedBehavior(playerPosition, obstacles) {
        // Check if AI is stuck (not moving much)
        const distanceMoved = Math.sqrt(
            Math.pow(this.position.x - this.lastPosition.x, 2) + 
            Math.pow(this.position.y - this.lastPosition.y, 2)
        );
        
        if (distanceMoved < 2) {
            this.stuckCounter++;
        } else {
            this.stuckCounter = 0;
        }
        
        // Update last position
        this.lastPosition = { x: this.position.x, y: this.position.y };
        
        // Check for corner detection
        const isInCorner = this.detectCorner();
        
        // If in corner, enter escape mode
        if (isInCorner && !this.cornerEscapeMode) {
            this.cornerEscapeMode = true;
            this.cornerEscapeCounter = 30; // Escape for 30 frames
            this.currentTarget = null; // Clear current target
            this.targetPersistence = 0;
        }
        
        // Handle corner escape mode
        if (this.cornerEscapeMode) {
            this.handleCornerEscape(playerPosition, obstacles);
            return;
        }
        
        const dx = this.position.x - playerPosition.x;
        const dy = this.position.y - playerPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If too close to player, run away
        if (distance < 150) {
            this.momentumDirection = null; // Reset momentum when fleeing
            this.momentumCounter = 0;
            
            const moveX = dx / distance;
            const moveY = dy / distance;
            
            const speed = 5 * this.speedMultiplier;
            const newX = this.position.x + moveX * speed;
            const newY = this.position.y + moveY * speed;
            
            const adjustedPosition = this.avoidObstacles({ x: newX, y: newY }, obstacles);
            
            this.position.x = Math.max(20, Math.min(this.gameBoard.width - 20, adjustedPosition.x));
            this.position.y = Math.max(20, Math.min(this.gameBoard.height - 20, adjustedPosition.y));
        } else {
            // If far from player, explore the board strategically
            this.exploreBoardImproved(playerPosition, obstacles);
        }
    }
    
    exploreBoardImproved(playerPosition, obstacles) {
        const speed = 5 * this.speedMultiplier;
        
        // If stuck for too long, force a new direction
        if (this.stuckCounter > 10) {
            this.currentTarget = null;
            this.targetPersistence = 0;
            this.momentumDirection = null;
            this.momentumCounter = 0;
            this.stuckCounter = 0;
        }
        
        // Use momentum if available and not stuck
        if (this.momentumDirection && this.momentumCounter > 0 && this.stuckCounter < 5) {
            this.momentumCounter--;
            this.moveInDirection(this.momentumDirection, speed, obstacles);
            return;
        }
        
        // If we have a current target and haven't reached it, continue towards it
        if (this.currentTarget && this.targetPersistence > 0) {
            const dx = this.currentTarget.x - this.position.x;
            const dy = this.currentTarget.y - this.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 20) {
                this.targetPersistence--;
                this.moveTowardsTarget(this.currentTarget, speed, obstacles);
                return;
            }
        }
        
        // Pick a new target
        this.pickNewTarget(playerPosition);
        
        if (this.currentTarget) {
            this.moveTowardsTarget(this.currentTarget, speed, obstacles);
        } else {
            // Fallback to random movement
            this.randomMovement(obstacles);
        }
    }
    
    pickNewTarget(playerPosition) {
        // Define exploration targets with better distribution
        const explorationTargets = [
            { x: 100, y: 100 }, // Top-left
            { x: this.gameBoard.width - 100, y: 100 }, // Top-right
            { x: 100, y: this.gameBoard.height - 100 }, // Bottom-left
            { x: this.gameBoard.width - 100, y: this.gameBoard.height - 100 }, // Bottom-right
            { x: this.gameBoard.width / 2, y: 100 }, // Top-center
            { x: this.gameBoard.width / 2, y: this.gameBoard.height - 100 }, // Bottom-center
            { x: 100, y: this.gameBoard.height / 2 }, // Left-center
            { x: this.gameBoard.width - 100, y: this.gameBoard.height / 2 }, // Right-center
            { x: this.gameBoard.width / 4, y: this.gameBoard.height / 4 }, // Quarter positions
            { x: 3 * this.gameBoard.width / 4, y: this.gameBoard.height / 4 },
            { x: this.gameBoard.width / 4, y: 3 * this.gameBoard.height / 4 },
            { x: 3 * this.gameBoard.width / 4, y: 3 * this.gameBoard.height / 4 }
        ];
        
        // Find the best target
        let bestTarget = null;
        let bestScore = -1;
        
        for (const target of explorationTargets) {
            const distanceToPlayer = Math.sqrt(
                Math.pow(target.x - playerPosition.x, 2) + 
                Math.pow(target.y - playerPosition.y, 2)
            );
            const distanceToTarget = Math.sqrt(
                Math.pow(target.x - this.position.x, 2) + 
                Math.pow(target.y - this.position.y, 2)
            );
            
            // Prefer targets that are far from player and not too close to current position
            const score = distanceToPlayer - (distanceToTarget * 0.2);
            
            if (score > bestScore && distanceToTarget > 50) {
                bestScore = score;
                bestTarget = target;
            }
        }
        
        if (bestTarget) {
            this.currentTarget = bestTarget;
            this.targetPersistence = 30 + Math.random() * 20; // Persist for 30-50 frames
        }
    }
    
    moveTowardsTarget(target, speed, obstacles) {
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 2) {
            const moveX = dx / distance;
            const moveY = dy / distance;
            
            const newX = this.position.x + moveX * speed;
            const newY = this.position.y + moveY * speed;
            
            const adjustedPosition = this.avoidObstacles({ x: newX, y: newY }, obstacles);
            
            this.position.x = Math.max(20, Math.min(this.gameBoard.width - 20, adjustedPosition.x));
            this.position.y = Math.max(20, Math.min(this.gameBoard.height - 20, adjustedPosition.y));
            
            // Set momentum direction
            this.momentumDirection = { x: moveX, y: moveY };
            this.momentumCounter = 5 + Math.random() * 10; // 5-15 frames of momentum
        }
    }
    
    moveInDirection(direction, speed, obstacles) {
        const newX = this.position.x + direction.x * speed;
        const newY = this.position.y + direction.y * speed;
        
        const adjustedPosition = this.avoidObstacles({ x: newX, y: newY }, obstacles);
        
        this.position.x = Math.max(20, Math.min(this.gameBoard.width - 20, adjustedPosition.x));
        this.position.y = Math.max(20, Math.min(this.gameBoard.height - 20, adjustedPosition.y));
    }
    
    detectCorner() {
        // Define corner zones (within 60px of any corner)
        const cornerZone = 60;
        const x = this.position.x;
        const y = this.position.y;
        
        // Check if in any corner zone
        const inTopLeft = x < cornerZone && y < cornerZone;
        const inTopRight = x > (this.gameBoard.width - cornerZone) && y < cornerZone;
        const inBottomLeft = x < cornerZone && y > (this.gameBoard.height - cornerZone);
        const inBottomRight = x > (this.gameBoard.width - cornerZone) && y > (this.gameBoard.height - cornerZone);
        
        return inTopLeft || inTopRight || inBottomLeft || inBottomRight;
    }
    
    handleCornerEscape(playerPosition, obstacles) {
        const speed = 5 * this.speedMultiplier;
        
        // Decrease escape counter
        this.cornerEscapeCounter--;
        
        // If escape counter is done, exit escape mode
        if (this.cornerEscapeCounter <= 0) {
            this.cornerEscapeMode = false;
            return;
        }
        
        // Calculate escape direction (away from nearest corner toward center)
        const centerX = this.gameBoard.width / 2;
        const centerY = this.gameBoard.height / 2;
        
        const escapeX = centerX - this.position.x;
        const escapeY = centerY - this.position.y;
        const escapeDistance = Math.sqrt(escapeX * escapeX + escapeY * escapeY);
        
        if (escapeDistance > 0) {
            const moveX = escapeX / escapeDistance;
            const moveY = escapeY / escapeDistance;
            
            const newX = this.position.x + moveX * speed;
            const newY = this.position.y + moveY * speed;
            
            const adjustedPosition = this.avoidObstacles({ x: newX, y: newY }, obstacles);
            
            this.position.x = Math.max(20, Math.min(this.gameBoard.width - 20, adjustedPosition.x));
            this.position.y = Math.max(20, Math.min(this.gameBoard.height - 20, adjustedPosition.y));
            
            // Set momentum for smooth escape
            this.momentumDirection = { x: moveX, y: moveY };
            this.momentumCounter = 10;
        }
    }
    
    exploreBoard(playerPosition, obstacles) {
        // Legacy method - redirect to improved version
        this.exploreBoardImproved(playerPosition, obstacles);
    }
    
    randomMovement(obstacles) {
        // Fallback random movement
        const directions = ['up', 'down', 'left', 'right'];
        const randomDirection = directions[Math.floor(Math.random() * directions.length)];
        
        const speed = 5 * this.speedMultiplier;
        let newX = this.position.x;
        let newY = this.position.y;
        
        switch (randomDirection) {
            case 'up':
                newY = Math.max(20, newY - speed);
                break;
            case 'down':
                newY = Math.min(this.gameBoard.height - 20, newY + speed);
                break;
            case 'left':
                newX = Math.max(20, newX - speed);
                break;
            case 'right':
                newX = Math.min(this.gameBoard.width - 20, newX + speed);
                break;
        }
        
        const adjustedPosition = this.avoidObstacles({ x: newX, y: newY }, obstacles);
        
        this.position.x = adjustedPosition.x;
        this.position.y = adjustedPosition.y;
    }
    
    avoidObstacles(targetPosition, obstacles) {
        if (!obstacles || obstacles.length === 0) return targetPosition;
        
        const playerRadius = 15;
        const obstacleRadius = 20;
        const minDistance = playerRadius + obstacleRadius;
        
        let adjustedX = targetPosition.x;
        let adjustedY = targetPosition.y;
        
        for (const obstacle of obstacles) {
            const dx = adjustedX - obstacle.x;
            const dy = adjustedY - obstacle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
                // Calculate avoidance vector
                const avoidX = dx / distance;
                const avoidY = dy / distance;
                
                // Move away from obstacle
                adjustedX = obstacle.x + avoidX * minDistance;
                adjustedY = obstacle.y + avoidY * minDistance;
            }
        }
        
        return { x: adjustedX, y: adjustedY };
    }
    
    setPosition(x, y) {
        this.position.x = x;
        this.position.y = y;
    }
    
    getPosition() {
        return { ...this.position };
    }
}

class GetDeadGame {
    constructor() {
        this.socket = null;
        this.currentRoomId = null;
        this.playerId = null;
        this.gameState = null;
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        
        // Track pressed keys for smooth movement
        this.pressedKeys = new Set();
        this.movementInterval = null;
        
        // Track selected emoji for this player
        this.selectedPlayerEmoji = '💀';
        this.playerEmojis = new Map(); // Store emojis for all players
        
        // Track obstacles
        this.obstacles = [];
        this.obstaclesEnabled = true; // Default to enabled
        
        // Trackpad state
        this.trackpadActive = false;
        this.trackpadCenter = null;
        this.trackpadRadius = 50; // Half of trackpad width/height (100px / 2)
        
        // Solo mode state
        this.isSoloMode = false;
        this.soloGameState = null;
        this.aiPlayer = null;
        this.soloDifficulty = 'easy';
        this.playerRole = 'chaser';
        
        this.initializeElements();
        this.setupEventListeners();
        // Connect to server immediately when page loads
        this.connectToServer();
    }
    
    initializeElements() {
        this.elements = {
            landingPage: document.querySelector('.landing-page'),
            gameSetup: document.getElementById('gameSetup'),
            gameRoom: document.getElementById('gameRoom'),
            soloModeSetup: document.getElementById('soloModeSetup'),
            gameBoard: document.getElementById('gameBoard'),
            gameOver: document.getElementById('gameOver'),
            
            startGameBtn: document.getElementById('startGameBtn'),
            playerName: document.getElementById('playerName'),
            roomLink: document.getElementById('roomLink'),
            copyLinkBtn: document.getElementById('copyLinkBtn'),
            multiplayerModeBtn: document.getElementById('multiplayerModeBtn'),
            soloModeBtn: document.getElementById('soloModeBtn'),
            gameModeSelection: document.getElementById('gameModeSelection'),
            joinRoomSection: document.getElementById('joinRoomSection'),
            enterGameRoomBtn: document.getElementById('enterGameRoomBtn'),
            
            currentRoomId: document.getElementById('currentRoomId'),
            playerCount: document.getElementById('playerCount'),
            playersContainer: document.getElementById('playersContainer'),
            playerEmojiSelection: document.getElementById('playerEmojiSelection'),
            emojiRoleDescription: document.getElementById('emojiRoleDescription'),
            enableObstacles: document.getElementById('enableObstacles'),
            startGameRoomBtn: document.getElementById('startGameRoomBtn'),
            leaveRoomBtn: document.getElementById('leaveRoomBtn'),
            
            gameCanvas: document.getElementById('gameCanvas'),
            playerRole: document.getElementById('playerRole'),
            newGameBtn: document.getElementById('newGameBtn'),
            
            // Trackpad elements
            mobileTrackpad: document.getElementById('mobileTrackpad'),
            trackpadCenter: document.getElementById('trackpadCenter'),
            trackpadDot: document.getElementById('trackpadDot'),
            
            // Solo mode elements
            startSoloGameBtn: document.getElementById('startSoloGameBtn'),
            backToSetupBtn: document.getElementById('backToSetupBtn'),
            soloEnableObstacles: document.getElementById('soloEnableObstacles'),
            
            // Exit game button
            exitGameBtn: document.getElementById('exitGameBtn')
        };
    }
    
    setupEventListeners() {
        // Landing page
        this.elements.startGameBtn.addEventListener('click', () => this.showGameSetup());
        
        // Game setup
        this.elements.playerName.addEventListener('input', () => this.validateModeButtons());
        this.elements.copyLinkBtn.addEventListener('click', () => this.copyRoomLink());
        this.elements.multiplayerModeBtn.addEventListener('click', () => this.joinRoom());
        this.elements.soloModeBtn.addEventListener('click', () => this.showSoloModeSetup());
        this.elements.enterGameRoomBtn.addEventListener('click', () => this.joinRoom());
        
        // Game room
        this.elements.startGameRoomBtn.addEventListener('click', () => this.startGame());
        this.elements.leaveRoomBtn.addEventListener('click', () => window.location.href = '/');
        
        // Emoji selection
        this.setupEmojiSelection();
        
        // Game options
        this.elements.enableObstacles.addEventListener('change', () => this.toggleObstacles());
        
        // Game over
        this.elements.newGameBtn.addEventListener('click', () => this.startNewGame());
        
        // Solo mode
        this.elements.startSoloGameBtn.addEventListener('click', () => this.startSoloGame());
        this.elements.backToSetupBtn.addEventListener('click', () => this.backToGameSetup());
        this.elements.soloEnableObstacles.addEventListener('change', () => this.toggleSoloObstacles());
        
        // Exit game
        this.elements.exitGameBtn.addEventListener('click', () => this.exitGame());
        
        // Keyboard controls for smooth movement
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Touch controls for mobile
        this.setupTouchControls();
        
        // Trackpad controls for mobile
        this.setupTrackpadControls();
    }
    
    connectToServer() {
        console.log('Connecting to server...');
        
        if (typeof io === 'undefined') {
            console.error('Socket.IO library not loaded!');
            alert('Socket.IO library failed to load. Please refresh the page.');
            return;
        }
        
        try {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Connected to server');
            });
            
            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
            });
            
        this.socket.on('joined-room', (data) => {
            console.log('Joined room response:', data);
            this.playerId = data.player.id;
            this.currentRoomId = data.room.roomId;
            this.gameState = data.room; // Store game state for role checking
            this.updateObstaclesFromServer(data.room.obstacles, data.room.obstaclesEnabled);
            this.updateRoomLink();
            this.showGameRoom();
            // Update players list and start button after showing game room
            setTimeout(() => {
                this.updatePlayersList(data.room.players);
                this.updateStartButton(this.canStartGame(data.room.players));
            }, 50);
        });
            
            this.socket.on('room-updated', (data) => {
                this.gameState = data; // Store game state for role checking
                this.updateObstaclesFromServer(data.obstacles, data.obstaclesEnabled);
                this.updatePlayersList(data.players);
                this.updateStartButton(this.canStartGame(data.players));
            });
            
            this.socket.on('game-started', (data) => {
                this.gameState = data;
                this.updateObstaclesFromServer(data.obstacles, data.obstaclesEnabled);
                this.showGameBoard();
                this.initializeCanvas();
                this.startGameLoop();
            });
            
        this.socket.on('game-updated', (data) => {
            this.gameState = data;
            this.checkGameOver();
        });
        
        this.socket.on('new-game-requested', () => {
            console.log('New game requested by another player');
            this.hideGameOver();
            this.showGameRoom();
        });
        
        this.socket.on('player-emoji-updated', (data) => {
            console.log('Player emoji updated:', data);
            this.playerEmojis.set(data.playerId, data.emoji);
        });
        
        this.socket.on('obstacles-preference-updated', (data) => {
            this.updateObstaclesFromServer(data.obstacles, data.enabled);
        });
        } catch (error) {
            console.error('Failed to create socket connection:', error);
        }
    }
    
    showGameSetup() {
        this.elements.landingPage.classList.add('hidden');
        this.elements.gameSetup.classList.remove('hidden');
        
        // Only generate room ID if we don't already have one (from URL)
        if (!this.currentRoomId) {
            this.currentRoomId = this.generateRoomId();
            this.updateRoomStatus('creating');
            // Show mode selection buttons for new games
            this.elements.gameModeSelection.classList.remove('hidden');
            this.elements.joinRoomSection.classList.add('hidden');
        } else {
            this.updateRoomStatus('joining');
            // Show enter game room button for joining existing games
            this.elements.gameModeSelection.classList.add('hidden');
            this.elements.joinRoomSection.classList.remove('hidden');
        }
    }
    
    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    updateRoomStatus(type) {
        const statusMessage = document.getElementById('roomStatusMessage');
        if (type === 'creating') {
            statusMessage.textContent = 'You are creating a new game';
        } else if (type === 'joining') {
            statusMessage.textContent = `You are joining game ${this.currentRoomId}`;
        }
    }
    
    updateRoomLink() {
        const roomUrl = `${window.location.origin}?room=${this.currentRoomId}`;
        this.elements.roomLink.value = roomUrl;
    }
    
    copyRoomLink() {
        this.elements.roomLink.select();
        document.execCommand('copy');
        
        const originalText = this.elements.copyLinkBtn.textContent;
        this.elements.copyLinkBtn.textContent = 'Copied!';
        setTimeout(() => {
            this.elements.copyLinkBtn.textContent = originalText;
        }, 2000);
    }
    
    validateModeButtons() {
        const playerName = this.elements.playerName.value.trim();
        const isNameValid = playerName.length > 0;
        this.elements.multiplayerModeBtn.disabled = !isNameValid;
        this.elements.soloModeBtn.disabled = !isNameValid;
        this.elements.enterGameRoomBtn.disabled = !isNameValid;
    }
    
    joinRoom() {
        console.log('Join room button clicked');
        const playerName = this.elements.playerName.value.trim();
        console.log('Player name:', playerName);
        console.log('Room ID:', this.currentRoomId);
        console.log('Socket connected:', this.socket ? this.socket.connected : 'No socket');
        
        if (playerName.length === 0) {
            console.log('Player name is empty, not joining');
            return;
        }
        
        if (!this.socket || !this.socket.connected) {
            console.error('Socket not ready, please wait a moment and try again');
            alert('Connecting to server... Please try again in a moment.');
            return;
        }
        
        console.log('Emitting join-room event with room ID:', this.currentRoomId);
        this.socket.emit('join-room', {
            roomId: this.currentRoomId,
            playerName: playerName
        });
    }
    
    showSoloModeSetup() {
        this.elements.gameSetup.classList.add('hidden');
        this.elements.soloModeSetup.classList.remove('hidden');
        
        // Set default values
        this.elements.soloEnableObstacles.checked = this.obstaclesEnabled;
    }
    
    backToGameSetup() {
        this.elements.soloModeSetup.classList.add('hidden');
        this.elements.gameSetup.classList.remove('hidden');
    }
    
    showGameRoom() {
        this.elements.gameSetup.classList.add('hidden');
        this.elements.gameRoom.classList.remove('hidden');
        this.elements.currentRoomId.textContent = this.currentRoomId;
        this.updateRoomLink();
        
        // Sync checkbox with default enabled state
        this.elements.enableObstacles.checked = this.obstaclesEnabled;
    }
    
    updatePlayersList(players) {
        this.elements.playersContainer.innerHTML = '';
        this.elements.playerCount.textContent = players.length;
        
        players.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = `player-item ${player.isGetDeader ? 'get-deader' : ''}`;
            
            // Player info section
            const playerInfo = document.createElement('div');
            playerInfo.className = 'player-info';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.name;
            
            const statusSpan = document.createElement('span');
            statusSpan.className = 'player-status';
            statusSpan.textContent = player.isGetDeader ? 'Get Deader' : 'Got Deader';
            
            playerInfo.appendChild(nameSpan);
            playerInfo.appendChild(statusSpan);
            
            // Chaser checkbox section
            const chaserCheckbox = document.createElement('div');
            chaserCheckbox.className = 'chaser-checkbox';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `chaser-${player.id}`;
            checkbox.checked = player.isGetDeader;
            checkbox.addEventListener('change', () => this.toggleChaser(player.id));
            
            const label = document.createElement('label');
            label.htmlFor = `chaser-${player.id}`;
            label.textContent = 'Chaser';
            
            chaserCheckbox.appendChild(checkbox);
            chaserCheckbox.appendChild(label);
            
            playerDiv.appendChild(playerInfo);
            playerDiv.appendChild(chaserCheckbox);
            this.elements.playersContainer.appendChild(playerDiv);
        });
        
        // Update emoji selection based on current role
        this.updateEmojiSelectionForRole();
        
        // Update start button text based on current state
        this.updateStartButton(this.canStartGame(players));
    }
    
    toggleChaser(playerId) {
        if (!this.socket || !this.socket.connected) {
            console.error('Socket not connected');
            return;
        }
        
        console.log('Setting Get Deader to player:', playerId);
        this.socket.emit('set-get-deader', { 
            roomId: this.currentRoomId,
            playerId: playerId 
        });
        
        // Update button text immediately for better UX
        setTimeout(() => {
            if (this.gameState?.players) {
                this.updateStartButton(this.canStartGame(this.gameState.players));
            }
        }, 100);
    }
    
    setupEmojiSelection() {
        // Player emoji selection
        this.elements.playerEmojiSelection.addEventListener('click', (e) => {
            if (e.target.classList.contains('emoji-option')) {
                // Remove selected class from all emojis
                this.elements.playerEmojiSelection.querySelectorAll('.emoji-option').forEach(option => {
                    option.classList.remove('selected');
                });
                
                // Add selected class to clicked emoji
                e.target.classList.add('selected');
                
                // Update selected emoji
                this.selectedPlayerEmoji = e.target.dataset.emoji;
                console.log('Selected player emoji:', this.selectedPlayerEmoji);
                
                // Send emoji selection to server
                this.sendEmojiSelection();
            }
        });
        
        // Set default selection based on role
        this.updateEmojiSelectionForRole();
    }
    
    updateEmojiSelectionForRole() {
        // Clear all selections first
        this.elements.playerEmojiSelection.querySelectorAll('.emoji-option').forEach(option => {
            option.classList.remove('selected');
            option.style.display = 'none'; // Hide all initially
        });
        
        // Determine if current player is the chaser
        const currentPlayer = this.gameState?.players.find(p => p.id === this.playerId);
        const isChaser = currentPlayer?.isGetDeader || false;
        
        // Define emoji categories
        const chaserEmojis = ['💀', '⚔️', '🗡️', '☠️', '👹'];
        const chasedEmojis = ['😱', '🏃‍♂️', '😰', '😨', '🤯'];
        
        // Show appropriate emojis based on role
        const availableEmojis = isChaser ? chaserEmojis : chasedEmojis;
        const defaultEmoji = isChaser ? '💀' : '😱';
        
        // Update description text
        this.elements.emojiRoleDescription.textContent = isChaser 
            ? 'Choose your chaser emoji (weapons & death symbols):'
            : 'Choose your chased emoji (scared & running symbols):';
        
        availableEmojis.forEach(emoji => {
            const option = this.elements.playerEmojiSelection.querySelector(`[data-emoji="${emoji}"]`);
            if (option) {
                option.style.display = 'flex';
                if (emoji === defaultEmoji) {
                    option.classList.add('selected');
                    this.selectedPlayerEmoji = emoji;
                }
            }
        });
        
        console.log('Updated emoji selection for role:', isChaser ? 'chaser' : 'chased');
    }
    
    sendEmojiSelection() {
        if (!this.socket || !this.socket.connected) return;
        
        this.socket.emit('set-player-emoji', {
            roomId: this.currentRoomId,
            emoji: this.selectedPlayerEmoji
        });
    }
    
    toggleObstacles() {
        this.obstaclesEnabled = this.elements.enableObstacles.checked;
        console.log('Obstacles enabled:', this.obstaclesEnabled);
        
        // Send obstacle preference to server
        if (this.socket && this.socket.connected) {
            this.socket.emit('set-obstacles-preference', {
                roomId: this.currentRoomId,
                enabled: this.obstaclesEnabled
            });
        }
    }
    
    toggleSoloObstacles() {
        this.obstaclesEnabled = this.elements.soloEnableObstacles.checked;
        console.log('Solo obstacles enabled:', this.obstaclesEnabled);
    }
    
    updateObstaclesFromServer(obstacles, enabled) {
        this.obstacles = obstacles || [];
        this.obstaclesEnabled = enabled;
        
        // Update the checkbox to match server state
        if (this.elements.enableObstacles) {
            this.elements.enableObstacles.checked = enabled;
        }
        
        console.log('Obstacles updated from server:', this.obstacles.length, 'obstacles, enabled:', enabled);
    }
    
    
    
    
    updateStartButton(canStart) {
        this.elements.startGameRoomBtn.disabled = !canStart;
        
        if (canStart) {
            this.elements.startGameRoomBtn.textContent = 'Start Game';
            this.elements.startGameRoomBtn.title = 'Ready to start the game!';
        } else {
            // Determine what's needed based on current state
            const playerCount = this.gameState?.players?.length || 0;
            const hasChaser = this.gameState?.players?.some(p => p.isGetDeader) || false;
            
            if (playerCount < 2) {
                this.elements.startGameRoomBtn.textContent = 'Start Game (Need 2+ Players)';
                this.elements.startGameRoomBtn.title = 'At least 2 players are required to start the game';
            } else if (!hasChaser) {
                this.elements.startGameRoomBtn.textContent = 'Start Game (Need Chaser)';
                this.elements.startGameRoomBtn.title = 'At least one player must be designated as the chaser to start the game';
            } else {
                this.elements.startGameRoomBtn.textContent = 'Start Game';
                this.elements.startGameRoomBtn.title = 'Ready to start the game!';
            }
        }
    }
    
    canStartGame(players) {
        // Need at least 2 players AND at least one chaser
        if (players.length < 2) return false;
        
        const hasChaser = players.some(player => player.isGetDeader);
        return hasChaser;
    }
    
    startGame() {
        this.socket.emit('start-game', { roomId: this.currentRoomId });
    }
    
    showGameBoard() {
        if (this.isSoloMode) {
            this.elements.soloModeSetup.classList.add('hidden');
        } else {
            this.elements.gameRoom.classList.add('hidden');
        }
        this.elements.gameBoard.classList.remove('hidden');
        
        // Update player role display
        if (this.isSoloMode) {
            const currentPlayer = this.soloGameState.players[0];
            if (currentPlayer) {
                this.elements.playerRole.textContent = currentPlayer.isGetDeader ? 'You are the Get Deader!' : 'You are a Got Deader!';
            }
        } else {
            const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
            if (currentPlayer) {
                this.elements.playerRole.textContent = currentPlayer.isGetDeader ? 'You are the Get Deader!' : 'You are a Got Deader!';
            }
        }
    }
    
    initializeCanvas() {
        this.canvas = this.elements.gameCanvas;
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        // Initialize touch controls now that canvas exists
        this.initializeTouchControls();
        
        // Initialize trackpad
        this.initializeTrackpad();
    }
    
    startGameLoop() {
        this.gameLoop();
    }
    
    gameLoop() {
        if (this.isSoloMode) {
            this.updateSoloGame();
        }
        this.drawGame();
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }
    
    updateSoloGame() {
        if (!this.soloGameState || !this.aiPlayer) return;
        
        const player = this.soloGameState.players[0];
        
        // Update AI player
        this.aiPlayer.update(player.position, this.soloGameState.obstacles, this.soloGameState);
        
        // Check for collisions
        this.checkSoloCollisions();
    }
    
    checkSoloCollisions() {
        const player = this.soloGameState.players[0];
        const aiPos = this.aiPlayer.getPosition();
        
        const distance = Math.sqrt(
            Math.pow(player.position.x - aiPos.x, 2) +
            Math.pow(player.position.y - aiPos.y, 2)
        );
        
        if (distance < 30) { // Collision threshold
            if (this.playerRole === 'chaser') {
                // Player caught AI
                this.aiPlayer.isCaught = true;
                this.aiPlayer.isAlive = false;
                this.soloGameState.gameState = 'finished';
                this.showGameOver();
            } else {
                // AI caught player
                player.isCaught = true;
                player.isAlive = false;
                this.soloGameState.gameState = 'finished';
                this.showGameOver();
            }
        }
    }
    
    drawGame() {
        const currentGameState = this.isSoloMode ? this.soloGameState : this.gameState;
        if (!currentGameState) return;
        
        // Clear canvas
        this.ctx.fillStyle = '#228B22';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw obstacles
        if (currentGameState.obstaclesEnabled && currentGameState.obstacles && currentGameState.obstacles.length > 0) {
            currentGameState.obstacles.forEach(obstacle => {
                this.ctx.font = '32px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = '#8B4513'; // Brown color for obstacles
                this.ctx.fillText(obstacle.emoji, obstacle.x, obstacle.y);
            });
        }
        
        if (this.isSoloMode) {
            // Draw solo mode players
            this.drawSoloPlayers();
        } else {
            // Draw multiplayer players
            this.drawMultiplayerPlayers();
        }
    }
    
    drawSoloPlayers() {
        const player = this.soloGameState.players[0];
        const aiPos = this.aiPlayer.getPosition();
        
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Draw player
        if (player.isAlive && !player.isCaught) {
            this.ctx.fillStyle = '#000';
            this.ctx.fillText(player.emoji, player.position.x, player.position.y);
        } else if (player.isCaught) {
            this.ctx.fillStyle = '#000';
            this.ctx.fillText('💀', player.position.x, player.position.y);
        }
        
        // Draw AI player
        if (this.aiPlayer.isAlive && !this.aiPlayer.isCaught) {
            this.ctx.fillStyle = '#000';
            this.ctx.fillText(this.aiPlayer.emoji, aiPos.x, aiPos.y);
        } else if (this.aiPlayer.isCaught) {
            this.ctx.fillStyle = '#000';
            this.ctx.fillText('💀', aiPos.x, aiPos.y);
        }
    }
    
    drawMultiplayerPlayers() {
        this.gameState.players.forEach(player => {
            // Don't draw dead players, but do draw caught players as skulls
            if (!player.isAlive && !player.isCaught) return;
            
            this.ctx.font = '24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // If caught, always show skull and crossbones
            if (player.isCaught) {
                this.ctx.fillStyle = '#000';
                this.ctx.fillText('💀', player.position.x, player.position.y);
                return;
            }
            
            // Get player's selected emoji, fallback to default based on role
            let emoji = this.playerEmojis.get(player.id);
            if (!emoji) {
                emoji = player.isGetDeader ? '💀' : '😱';
            }
            
            this.ctx.fillStyle = '#000';
            this.ctx.fillText(emoji, player.position.x, player.position.y);
        });
    }
    
    handleKeyDown(e) {
        const currentGameState = this.isSoloMode ? this.soloGameState : this.gameState;
        if (!currentGameState || currentGameState.gameState !== 'playing') return;
        
        let currentPlayer;
        if (this.isSoloMode) {
            currentPlayer = currentGameState.players[0];
        } else {
            currentPlayer = currentGameState.players.find(p => p.id === this.playerId);
        }
        
        if (!currentPlayer || !currentPlayer.isAlive || currentPlayer.isCaught) return;
        
        let direction = null;
        
        switch (e.key) {
            case 'ArrowUp':
                direction = 'up';
                break;
            case 'ArrowDown':
                direction = 'down';
                break;
            case 'ArrowLeft':
                direction = 'left';
                break;
            case 'ArrowRight':
                direction = 'right';
                break;
        }
        
        if (direction) {
            e.preventDefault();
            this.pressedKeys.add(direction);
            this.startContinuousMovement();
        }
    }
    
    handleKeyUp(e) {
        let direction = null;
        
        switch (e.key) {
            case 'ArrowUp':
                direction = 'up';
                break;
            case 'ArrowDown':
                direction = 'down';
                break;
            case 'ArrowLeft':
                direction = 'left';
                break;
            case 'ArrowRight':
                direction = 'right';
                break;
        }
        
        if (direction) {
            this.pressedKeys.delete(direction);
            if (this.pressedKeys.size === 0) {
                this.stopContinuousMovement();
            }
        }
    }
    
    startContinuousMovement() {
        if (this.movementInterval) return; // Already running
        
        this.movementInterval = setInterval(() => {
            if (this.pressedKeys.size === 0) {
                this.stopContinuousMovement();
                return;
            }
            
            // Process all pressed directions for diagonal movement
            const directions = Array.from(this.pressedKeys);
            this.sendMovement(directions);
        }, 50); // Send movement every 50ms for smooth movement
    }
    
    stopContinuousMovement() {
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
    }
    
    sendMovement(directions) {
        if (this.isSoloMode) {
            this.handleSoloMovement(directions);
        } else {
            this.handleMultiplayerMovement(directions);
        }
    }
    
    handleSoloMovement(directions) {
        const currentPlayer = this.soloGameState.players[0];
        if (!currentPlayer) return;
        
        const newPosition = this.calculateNewPosition(currentPlayer.position, directions);
        
        // Check if new position collides with obstacles
        if (this.checkSoloObstacleCollision(newPosition)) {
            return; // Don't move if would collide with obstacle
        }
        
        // Update player position directly
        currentPlayer.position = newPosition;
    }
    
    handleMultiplayerMovement(directions) {
        if (!this.socket || !this.socket.connected) return;
        
        // Check for obstacle collisions before sending movement
        const currentPlayer = this.gameState?.players.find(p => p.id === this.playerId);
        if (!currentPlayer) return;
        
        const newPosition = this.calculateNewPosition(currentPlayer.position, directions);
        
        // Check if new position collides with obstacles
        if (this.checkObstacleCollision(newPosition)) {
            return; // Don't move if would collide with obstacle
        }
        
        // For diagonal movement, we'll send the primary direction
        // The server can handle diagonal movement by processing multiple directions
        if (directions.length === 1) {
            this.socket.emit('move-player', {
                roomId: this.currentRoomId,
                direction: directions[0]
            });
        } else if (directions.length > 1) {
            // Send diagonal movement
            this.socket.emit('move-player', {
                roomId: this.currentRoomId,
                direction: 'diagonal',
                directions: directions
            });
        }
    }
    
    calculateNewPosition(currentPos, directions) {
        const speed = 5;
        const diagonalSpeed = speed * 0.707;
        const newPos = { ...currentPos };
        
        if (directions.length === 1) {
            switch (directions[0]) {
                case 'up':
                    newPos.y = Math.max(20, newPos.y - speed);
                    break;
                case 'down':
                    newPos.y = Math.min(600 - 20, newPos.y + speed);
                    break;
                case 'left':
                    newPos.x = Math.max(20, newPos.x - speed);
                    break;
                case 'right':
                    newPos.x = Math.min(800 - 20, newPos.x + speed);
                    break;
            }
        } else if (directions.length > 1) {
            directions.forEach(dir => {
                switch (dir) {
                    case 'up':
                        newPos.y = Math.max(20, newPos.y - diagonalSpeed);
                        break;
                    case 'down':
                        newPos.y = Math.min(600 - 20, newPos.y + diagonalSpeed);
                        break;
                    case 'left':
                        newPos.x = Math.max(20, newPos.x - diagonalSpeed);
                        break;
                    case 'right':
                        newPos.x = Math.min(800 - 20, newPos.x + diagonalSpeed);
                        break;
                }
            });
        }
        
        return newPos;
    }
    
    checkObstacleCollision(position) {
        if (!this.gameState.obstaclesEnabled || !this.gameState.obstacles) return false;
        
        const playerRadius = 15; // Approximate player collision radius
        
        for (const obstacle of this.gameState.obstacles) {
            const distance = Math.sqrt(
                Math.pow(position.x - obstacle.x, 2) + Math.pow(position.y - obstacle.y, 2)
            );
            
            if (distance < playerRadius + 20) { // Use fixed obstacle size
                return true; // Collision detected
            }
        }
        
        return false;
    }
    
    checkSoloObstacleCollision(position) {
        if (!this.soloGameState.obstaclesEnabled || !this.soloGameState.obstacles) return false;
        
        const playerRadius = 15; // Approximate player collision radius
        
        for (const obstacle of this.soloGameState.obstacles) {
            const distance = Math.sqrt(
                Math.pow(position.x - obstacle.x, 2) + Math.pow(position.y - obstacle.y, 2)
            );
            
            if (distance < playerRadius + 20) { // Use fixed obstacle size
                return true; // Collision detected
            }
        }
        
        return false;
    }
    
    setupTouchControls() {
        // Touch controls will be set up when the canvas is initialized
        // This prevents the error when canvas doesn't exist yet
    }
    
    initializeTouchControls() {
        if (!this.canvas) return;
        
        let touchStartX = 0;
        let touchStartY = 0;
        let isTouching = false;
        let currentDirection = null;
        
        // Add touch events to the entire page for maximum mobile UX
        // This allows users to touch anywhere on the screen to control their character
        
        // Touch start - anywhere on the page
        document.addEventListener('touchstart', (e) => {
            // Only prevent default if we're in the game and not touching interactive elements
            if (this.gameState && this.gameState.gameState === 'playing') {
                // Check if the touch is on an interactive element
                const target = e.target;
                const isInteractiveElement = target.tagName === 'INPUT' || 
                                          target.tagName === 'BUTTON' || 
                                          target.tagName === 'A' ||
                                          target.classList.contains('emoji-option') ||
                                          target.closest('.game-room') ||
                                          target.closest('.game-setup') ||
                                          target.closest('.game-over');
                
                if (!isInteractiveElement) {
                    e.preventDefault();
                    const touch = e.touches[0];
                    touchStartX = touch.clientX;
                    touchStartY = touch.clientY;
                    isTouching = true;
                    
                    // Calculate initial direction
                    this.updateTouchDirection(touch.clientX, touch.clientY, true);
                }
            }
        });
        
        // Touch move - continuous movement while dragging
        document.addEventListener('touchmove', (e) => {
            if (isTouching && this.gameState && this.gameState.gameState === 'playing') {
                e.preventDefault();
                const touch = e.touches[0];
                this.updateTouchDirection(touch.clientX, touch.clientY, false);
            }
        });
        
        // Touch end - stop movement
        document.addEventListener('touchend', (e) => {
            if (isTouching) {
                e.preventDefault();
                isTouching = false;
                this.stopContinuousMovement();
                this.updateTrackpadDisplay(null);
            }
        });
        
        // Also keep the original canvas touch events for swipe gestures
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!this.gameState || this.gameState.gameState !== 'playing') return;
            
            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;
            
            const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
            if (!currentPlayer || !currentPlayer.isAlive || currentPlayer.isCaught) return;
            
            let direction = null;
            const minSwipeDistance = 30;
            
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (Math.abs(deltaX) > minSwipeDistance) {
                    direction = deltaX > 0 ? 'right' : 'left';
                }
            } else {
                if (Math.abs(deltaY) > minSwipeDistance) {
                    direction = deltaY > 0 ? 'down' : 'up';
                }
            }
            
            if (direction) {
                this.socket.emit('move-player', {
                    roomId: this.currentRoomId,
                    direction: direction
                });
            }
        });
    }
    
    updateTouchDirection(clientX, clientY, isStart) {
        const currentGameState = this.isSoloMode ? this.soloGameState : this.gameState;
        if (!currentGameState || currentGameState.gameState !== 'playing') return;
        
        let currentPlayer;
        if (this.isSoloMode) {
            currentPlayer = currentGameState.players[0];
        } else {
            currentPlayer = currentGameState.players.find(p => p.id === this.playerId);
        }
        
        if (!currentPlayer || !currentPlayer.isAlive || currentPlayer.isCaught) return;
        
        // Calculate direction from touch position to center of the viewport
        // This allows touch controls to work from anywhere on the page
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        const deltaX = clientX - centerX;
        const deltaY = clientY - centerY;
        
        // Calculate angle and determine direction
        const angle = Math.atan2(deltaY, deltaX);
        const degrees = (angle * 180 / Math.PI + 360) % 360;
        
        // Determine primary direction based on angle
        let direction = null;
        const threshold = 30; // Degrees threshold for diagonal detection
        
        if (degrees >= 315 || degrees < 45) {
            direction = 'right';
        } else if (degrees >= 45 && degrees < 135) {
            direction = 'down';
        } else if (degrees >= 135 && degrees < 225) {
            direction = 'left';
        } else if (degrees >= 225 && degrees < 315) {
            direction = 'up';
        }
        
        // Check for diagonal movement
        let directions = [direction];
        if (Math.abs(deltaX) > 20 && Math.abs(deltaY) > 20) {
            // Strong diagonal movement
            if (degrees >= 315 || degrees < 45) {
                if (deltaY < -20) directions = ['right', 'up'];
                else if (deltaY > 20) directions = ['right', 'down'];
            } else if (degrees >= 45 && degrees < 135) {
                if (deltaX < -20) directions = ['down', 'left'];
                else if (deltaX > 20) directions = ['down', 'right'];
            } else if (degrees >= 135 && degrees < 225) {
                if (deltaY < -20) directions = ['left', 'up'];
                else if (deltaY > 20) directions = ['left', 'down'];
            } else if (degrees >= 225 && degrees < 315) {
                if (deltaX < -20) directions = ['up', 'left'];
                else if (deltaX > 20) directions = ['up', 'right'];
            }
        }
        
        if (direction) {
            this.pressedKeys.clear();
            directions.forEach(dir => this.pressedKeys.add(dir));
            this.startContinuousMovement();
            
            // Update trackpad display to show current direction
            this.updateTrackpadDisplay(directions);
        }
    }
    
    updateTrackpadDisplay(directions) {
        if (!this.elements.trackpadDot) return;
        
        if (directions && directions.length > 0) {
            // Show the dot and position it based on direction
            this.elements.trackpadDot.classList.add('visible');
            this.positionTrackpadDot(directions);
        } else {
            // Hide the dot when not moving
            this.elements.trackpadDot.classList.remove('visible');
        }
    }
    
    positionTrackpadDot(directions) {
        if (!this.elements.trackpadDot || !directions || directions.length === 0) return;
        
        // Calculate dot position based on primary direction
        const primaryDirection = directions[0];
        const trackpadRadius = 20; // Half of trackpad width (40px / 2)
        const dotRadius = 4; // Half of dot width (8px / 2)
        const maxDistance = trackpadRadius - dotRadius - 2; // Leave some margin
        
        let x = 0, y = 0;
        
        // Calculate position based on direction
        switch (primaryDirection) {
            case 'up':
                y = -maxDistance;
                break;
            case 'down':
                y = maxDistance;
                break;
            case 'left':
                x = -maxDistance;
                break;
            case 'right':
                x = maxDistance;
                break;
        }
        
        // For diagonal movement, position between the two directions
        if (directions.length > 1) {
            const secondaryDirection = directions[1];
            const diagonalDistance = maxDistance * 0.7; // Slightly closer to center for diagonal
            
            switch (primaryDirection) {
                case 'up':
                    y = -diagonalDistance;
                    break;
                case 'down':
                    y = diagonalDistance;
                    break;
                case 'left':
                    x = -diagonalDistance;
                    break;
                case 'right':
                    x = diagonalDistance;
                    break;
            }
            
            // Adjust for secondary direction
            switch (secondaryDirection) {
                case 'up':
                    y = -diagonalDistance;
                    break;
                case 'down':
                    y = diagonalDistance;
                    break;
                case 'left':
                    x = -diagonalDistance;
                    break;
                case 'right':
                    x = diagonalDistance;
                    break;
            }
        }
        
        // Apply the position
        this.elements.trackpadDot.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
    
    setupTrackpadControls() {
        // Trackpad controls will be set up when the canvas is initialized
        // This prevents the error when elements don't exist yet
    }
    
    initializeTrackpad() {
        if (!this.elements.trackpadCenter) return;
        
        // Store trackpad center position for calculations
        const trackpadRect = this.elements.mobileTrackpad.getBoundingClientRect();
        this.trackpadCenter = {
            x: trackpadRect.left + trackpadRect.width / 2,
            y: trackpadRect.top + trackpadRect.height / 2
        };
        
        // Update trackpad radius based on actual size
        this.trackpadRadius = trackpadRect.width / 2;
        
        // Add touch event listeners to trackpad
        this.elements.trackpadCenter.addEventListener('touchstart', (e) => this.handleTrackpadStart(e));
        this.elements.trackpadCenter.addEventListener('touchmove', (e) => this.handleTrackpadMove(e));
        this.elements.trackpadCenter.addEventListener('touchend', (e) => this.handleTrackpadEnd(e));
        
        // Add mouse events for testing on desktop
        this.elements.trackpadCenter.addEventListener('mousedown', (e) => this.handleTrackpadStart(e));
        this.elements.trackpadCenter.addEventListener('mousemove', (e) => this.handleTrackpadMove(e));
        this.elements.trackpadCenter.addEventListener('mouseup', (e) => this.handleTrackpadEnd(e));
        this.elements.trackpadCenter.addEventListener('mouseleave', (e) => this.handleTrackpadEnd(e));
        
        // Handle window resize to update trackpad position
        window.addEventListener('resize', () => this.updateTrackpadPosition());
    }
    
    handleTrackpadStart(e) {
        e.preventDefault();
        this.trackpadActive = true;
        this.elements.trackpadCenter.classList.add('touching');
        
        // Update trackpad center position in case of window resize
        const trackpadRect = this.elements.mobileTrackpad.getBoundingClientRect();
        this.trackpadCenter = {
            x: trackpadRect.left + trackpadRect.width / 2,
            y: trackpadRect.top + trackpadRect.height / 2
        };
    }
    
    handleTrackpadMove(e) {
        if (!this.trackpadActive) return;
        
        e.preventDefault();
        
        const touch = e.touches ? e.touches[0] : e;
        const clientX = touch.clientX;
        const clientY = touch.clientY;
        
        // Calculate direction from trackpad center
        const deltaX = clientX - this.trackpadCenter.x;
        const deltaY = clientY - this.trackpadCenter.y;
        
        // Calculate distance from center
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Only process if touch is within trackpad radius
        if (distance <= this.trackpadRadius) {
            this.processTrackpadInput(deltaX, deltaY);
        }
    }
    
    handleTrackpadEnd(e) {
        e.preventDefault();
        this.trackpadActive = false;
        this.elements.trackpadCenter.classList.remove('touching');
        
        // Stop movement when trackpad is released
        this.stopContinuousMovement();
    }
    
    processTrackpadInput(deltaX, deltaY) {
        const currentGameState = this.isSoloMode ? this.soloGameState : this.gameState;
        if (!currentGameState || currentGameState.gameState !== 'playing') return;
        
        let currentPlayer;
        if (this.isSoloMode) {
            currentPlayer = currentGameState.players[0];
        } else {
            currentPlayer = currentGameState.players.find(p => p.id === this.playerId);
        }
        
        if (!currentPlayer || !currentPlayer.isAlive || currentPlayer.isCaught) return;
        
        // Calculate angle and determine direction
        const angle = Math.atan2(deltaY, deltaX);
        const degrees = (angle * 180 / Math.PI + 360) % 360;
        
        // Determine primary direction based on angle
        let direction = null;
        const threshold = 30; // Degrees threshold for diagonal detection
        
        if (degrees >= 315 || degrees < 45) {
            direction = 'right';
        } else if (degrees >= 45 && degrees < 135) {
            direction = 'down';
        } else if (degrees >= 135 && degrees < 225) {
            direction = 'left';
        } else if (degrees >= 225 && degrees < 315) {
            direction = 'up';
        }
        
        // Check for diagonal movement
        let directions = [direction];
        if (Math.abs(deltaX) > 10 && Math.abs(deltaY) > 10) {
            // Strong diagonal movement
            if (degrees >= 315 || degrees < 45) {
                if (deltaY < -10) directions = ['right', 'up'];
                else if (deltaY > 10) directions = ['right', 'down'];
            } else if (degrees >= 45 && degrees < 135) {
                if (deltaX < -10) directions = ['down', 'left'];
                else if (deltaX > 10) directions = ['down', 'right'];
            } else if (degrees >= 135 && degrees < 225) {
                if (deltaY < -10) directions = ['left', 'up'];
                else if (deltaY > 10) directions = ['left', 'down'];
            } else if (degrees >= 225 && degrees < 315) {
                if (deltaX < -10) directions = ['up', 'left'];
                else if (deltaX > 10) directions = ['up', 'right'];
            }
        }
        
        if (direction) {
            this.pressedKeys.clear();
            directions.forEach(dir => this.pressedKeys.add(dir));
            this.startContinuousMovement();
        }
    }
    
    updateTrackpadPosition() {
        if (!this.elements.trackpadCenter) return;
        
        // Update trackpad center position and radius
        const trackpadRect = this.elements.mobileTrackpad.getBoundingClientRect();
        this.trackpadCenter = {
            x: trackpadRect.left + trackpadRect.width / 2,
            y: trackpadRect.top + trackpadRect.height / 2
        };
        this.trackpadRadius = trackpadRect.width / 2;
    }
    
    checkGameOver() {
        const currentGameState = this.isSoloMode ? this.soloGameState : this.gameState;
        if (currentGameState && currentGameState.gameState === 'finished') {
            this.showGameOver();
        }
    }
    
    showGameOver() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        // Stop movement when game ends
        this.stopContinuousMovement();
        this.pressedKeys.clear();
        
        this.elements.gameBoard.classList.add('hidden');
        this.elements.gameOver.classList.remove('hidden');
    }
    
    hideGameOver() {
        this.elements.gameOver.classList.add('hidden');
    }
    
    startSoloGame() {
        console.log('Starting solo game');
        
        // Get selected role and difficulty
        const roleRadios = document.querySelectorAll('input[name="playerRole"]');
        const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
        
        this.playerRole = Array.from(roleRadios).find(radio => radio.checked)?.value || 'chaser';
        this.soloDifficulty = Array.from(difficultyRadios).find(radio => radio.checked)?.value || 'easy';
        
        console.log('Solo game settings:', { role: this.playerRole, difficulty: this.soloDifficulty });
        
        // Create solo game state
        this.isSoloMode = true;
        this.soloGameState = this.createSoloGameState();
        
        // Create AI player
        const aiRole = this.playerRole === 'chaser' ? 'chased' : 'chaser';
        this.aiPlayer = new AIPlayer(this.soloDifficulty, aiRole, this.soloGameState.gameBoard);
        
        // Position players
        this.positionSoloPlayers();
        
        // Generate obstacles
        this.generateSoloObstacles();
        
        // Start the game
        this.showGameBoard();
        this.initializeCanvas();
        this.startGameLoop();
    }
    
    createSoloGameState() {
        return {
            roomId: 'solo',
            players: [
                {
                    id: 'player',
                    name: this.elements.playerName.value.trim(),
                    isGetDeader: this.playerRole === 'chaser',
                    position: { x: 0, y: 0 },
                    isCaught: false,
                    isAlive: true,
                    emoji: this.selectedPlayerEmoji
                }
            ],
            gameState: 'playing',
            gameBoard: {
                width: 800,
                height: 600
            },
            obstacles: [],
            obstaclesEnabled: this.obstaclesEnabled
        };
    }
    
    positionSoloPlayers() {
        const player = this.soloGameState.players[0];
        
        if (this.playerRole === 'chaser') {
            // Player is chaser, spawn on left
            player.position = { x: 50, y: this.soloGameState.gameBoard.height / 2 };
            // AI is chased, spawn on right
            this.aiPlayer.setPosition(this.soloGameState.gameBoard.width - 100, 100);
        } else {
            // Player is chased, spawn on right
            player.position = { x: this.soloGameState.gameBoard.width - 100, y: 100 };
            // AI is chaser, spawn on left
            this.aiPlayer.setPosition(50, this.soloGameState.gameBoard.height / 2);
        }
    }
    
    generateSoloObstacles() {
        if (!this.obstaclesEnabled) return;
        
        this.soloGameState.obstacles = [];
        const obstacleEmojis = ['🪨', '🌳', '🏠', '🚗', '📦', '🪑', '🗿', '🛡️'];
        const numObstacles = 10;
        
        for (let i = 0; i < numObstacles; i++) {
            let x, y;
            let attempts = 0;
            let validPosition = false;
            
            do {
                x = Math.random() * (this.soloGameState.gameBoard.width - 40) + 20;
                y = Math.random() * (this.soloGameState.gameBoard.height - 40) + 20;
                attempts++;
                
                // Check if position is valid (not too close to players)
                validPosition = !this.isObstacleTooCloseToSoloPlayers(x, y);
                
            } while (!validPosition && attempts < 100);
            
            if (validPosition) {
                this.soloGameState.obstacles.push({
                    x: x,
                    y: y,
                    emoji: obstacleEmojis[Math.floor(Math.random() * obstacleEmojis.length)]
                });
            }
        }
    }
    
    isObstacleTooCloseToSoloPlayers(x, y) {
        const player = this.soloGameState.players[0];
        const aiPos = this.aiPlayer.getPosition();
        
        const distanceToPlayer = Math.sqrt(
            Math.pow(player.position.x - x, 2) + Math.pow(player.position.y - y, 2)
        );
        const distanceToAI = Math.sqrt(
            Math.pow(aiPos.x - x, 2) + Math.pow(aiPos.y - y, 2)
        );
        
        return distanceToPlayer < 100 || distanceToAI < 100;
    }
    
    startNewGame() {
        console.log('Starting new game for all players');
        
        if (this.isSoloMode) {
            // Solo mode new game
            this.hideGameOver();
            this.showSoloModeSetup();
            this.resetSoloGame();
        } else {
            // Multiplayer new game
            if (this.socket && this.socket.connected) {
                this.socket.emit('new-game', { roomId: this.currentRoomId });
            }
            this.hideGameOver();
            this.showGameRoom();
        }
        
        // Reset game state
        this.gameState = null;
        this.animationId = null;
    }
    
    resetSoloGame() {
        this.isSoloMode = false;
        this.soloGameState = null;
        this.aiPlayer = null;
    }
    
    exitGame() {
        if (this.isSoloMode) {
            // Solo mode: go back to solo setup page
            this.elements.gameBoard.classList.add('hidden');
            this.elements.soloModeSetup.classList.remove('hidden');
            this.resetSoloGame();
        } else {
            // Multiplayer mode: go back to game room
            this.elements.gameBoard.classList.add('hidden');
            this.elements.gameRoom.classList.remove('hidden');
        }
    }
    
    leaveRoom() {
        // Stop movement when leaving room
        this.stopContinuousMovement();
        this.pressedKeys.clear();
        
        this.socket.disconnect();
        this.resetToLanding();
    }
    
    resetToLanding() {
        // Hide all sections
        document.querySelectorAll('.container > div').forEach(div => {
            div.classList.add('hidden');
        });
        
        // Show landing page
        this.elements.landingPage.classList.remove('hidden');
        
        // Reset form
        this.elements.playerName.value = '';
        this.elements.multiplayerModeBtn.disabled = true;
        this.elements.soloModeBtn.disabled = true;
        this.elements.enterGameRoomBtn.disabled = true;
        
        // Reset solo mode state
        this.resetSoloGame();
        
        // Reconnect to server
        this.connectToServer();
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    const game = new GetDeadGame();
    
    // Store game instance globally for URL parameter handling
    window.getDeadGame = game;
    
    // Check for room parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        console.log('Room ID from URL:', roomId);
        // Auto-fill room ID and show setup
        setTimeout(() => {
            game.currentRoomId = roomId;
            game.showGameSetup();
            console.log('Auto-filled room ID:', game.currentRoomId, 'and showing setup page');
        }, 100);
    }
});
