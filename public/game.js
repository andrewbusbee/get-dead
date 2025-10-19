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
        this.obstaclesEnabled = false;
        
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
            gameBoard: document.getElementById('gameBoard'),
            gameOver: document.getElementById('gameOver'),
            
            startGameBtn: document.getElementById('startGameBtn'),
            playerName: document.getElementById('playerName'),
            roomLink: document.getElementById('roomLink'),
            copyLinkBtn: document.getElementById('copyLinkBtn'),
            joinRoomBtn: document.getElementById('joinRoomBtn'),
            
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
            newGameBtn: document.getElementById('newGameBtn')
        };
    }
    
    setupEventListeners() {
        // Landing page
        this.elements.startGameBtn.addEventListener('click', () => this.showGameSetup());
        
        // Game setup
        this.elements.playerName.addEventListener('input', () => this.validateJoinButton());
        this.elements.copyLinkBtn.addEventListener('click', () => this.copyRoomLink());
        this.elements.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        
        // Game room
        this.elements.startGameRoomBtn.addEventListener('click', () => this.startGame());
        this.elements.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        
        // Emoji selection
        this.setupEmojiSelection();
        
        // Game options
        this.elements.enableObstacles.addEventListener('change', () => this.toggleObstacles());
        
        // Game over
        this.elements.newGameBtn.addEventListener('click', () => this.startNewGame());
        
        // Keyboard controls for smooth movement
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Touch controls for mobile
        this.setupTouchControls();
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
            this.updatePlayersList(data.room.players);
            this.updateStartButton(this.canStartGame(data.room.players));
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
        }
        this.updateRoomLink();
    }
    
    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
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
    
    validateJoinButton() {
        const playerName = this.elements.playerName.value.trim();
        this.elements.joinRoomBtn.disabled = playerName.length === 0;
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
    
    showGameRoom() {
        this.elements.gameSetup.classList.add('hidden');
        this.elements.gameRoom.classList.remove('hidden');
        this.elements.currentRoomId.textContent = this.currentRoomId;
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
            this.elements.startGameRoomBtn.textContent = 'Start Game (Need Chaser)';
            this.elements.startGameRoomBtn.title = 'At least one player must be designated as the chaser to start the game';
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
        this.elements.gameRoom.classList.add('hidden');
        this.elements.gameBoard.classList.remove('hidden');
        
        // Update player role display
        const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (currentPlayer) {
            this.elements.playerRole.textContent = currentPlayer.isGetDeader ? 'You are the Get Deader!' : 'You are a Got Deader!';
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
    }
    
    startGameLoop() {
        this.gameLoop();
    }
    
    gameLoop() {
        this.drawGame();
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }
    
    drawGame() {
        if (!this.gameState) return;
        
        // Clear canvas
        this.ctx.fillStyle = '#228B22';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw obstacles
        if (this.gameState.obstaclesEnabled && this.gameState.obstacles && this.gameState.obstacles.length > 0) {
            this.gameState.obstacles.forEach(obstacle => {
                this.ctx.font = '32px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = '#8B4513'; // Brown color for obstacles
                this.ctx.fillText(obstacle.emoji, obstacle.x, obstacle.y);
            });
        }
        
        // Draw players
        this.gameState.players.forEach(player => {
            if (!player.isAlive) return;
            
            this.ctx.font = '24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // Get player's selected emoji, fallback to default based on role
            let emoji = this.playerEmojis.get(player.id);
            if (!emoji) {
                emoji = player.isGetDeader ? '💀' : '😱';
            }
            
            // If caught, show the chaser emoji
            if (player.isCaught) {
                emoji = '💀'; // Always show skull when caught
            }
            
            this.ctx.fillStyle = '#000';
            this.ctx.fillText(emoji, player.position.x, player.position.y);
        });
    }
    
    handleKeyDown(e) {
        if (!this.gameState || this.gameState.gameState !== 'playing') return;
        
        const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
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
    
    setupTouchControls() {
        // Touch controls will be set up when the canvas is initialized
        // This prevents the error when canvas doesn't exist yet
    }
    
    initializeTouchControls() {
        if (!this.canvas) return;
        
        let touchStartX = 0;
        let touchStartY = 0;
        
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
    
    checkGameOver() {
        if (this.gameState.gameState === 'finished') {
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
    
    startNewGame() {
        console.log('Starting new game for all players');
        
        // Emit new game event to server to notify all players
        if (this.socket && this.socket.connected) {
            this.socket.emit('new-game', { roomId: this.currentRoomId });
        }
        
        this.elements.gameOver.classList.add('hidden');
        this.elements.gameRoom.classList.remove('hidden');
        
        // Reset game state
        this.gameState = null;
        this.animationId = null;
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
        this.elements.joinRoomBtn.disabled = true;
        
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
            game.updateRoomLink();
            game.elements.landingPage.classList.add('hidden');
            game.elements.gameSetup.classList.remove('hidden');
            console.log('Auto-filled room ID:', game.currentRoomId, 'and showing setup page');
        }, 100);
    }
});
