# Get Dead Game

A multiplayer WebSocket-based chase game where players try to avoid being caught by the "Get Deader".

## How to Play

1. **Landing Page**: Click "Start Game" to begin
2. **Game Setup**: 
   - Enter your name
   - Click "Join Room"
3. **Game Room**: 
   - Copy and share the game link with friends
   - See all players who have joined
   - Use checkboxes to designate who will be the "Get Deader" (chaser)
   - Others will be "Got Deaders" (runners)
   - **Choose Your Emoji**: Select from different emoji categories:
     - Chasers: 💀 ⚔️ 🗡️ ☠️ 👹 (weapons & death symbols)
     - Runners: 😱 🏃‍♂️ 😰 😨 🤯 (scared & running symbols)
   - **Game Options**: 
     - Obstacles are enabled by default for added challenge and cover (10 obstacles)
   - Click "Start Game" when ready (button shows what's needed: "Need 2+ Players" or "Need Chaser")
4. **Game Play**:
   - Move with arrow keys (supports diagonal movement), touch/swipe, or virtual trackpad on mobile
   - Get Deader tries to catch Got Deaders
   - When caught, Got Deaders turn into 💀 (skull and crossbones) and stop moving
   - Obstacles (if enabled) block movement and provide strategic cover (players never start blocked)
   - Game ends when all Got Deaders are caught
5. **Game Over**: Click "Start New Game" to return to the game room

## Features

- Real-time multiplayer using WebSockets
- Mobile-friendly touch controls with swipe gestures and virtual trackpad
- Customizable emoji selection for each player role
- Optional obstacles for strategic gameplay
- Smooth diagonal movement support
- No backend storage (stateless)
- Responsive design
- Docker deployment ready

## Running the Game

### Using Docker Compose (Recommended)

```bash
docker-compose up --build
```

The game will be available at `http://localhost:8080`

### Manual Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open `http://localhost:3000` in your browser (or `http://localhost:8080` if using Docker)

## Technical Details

- **Backend**: Node.js with Express and Socket.io
- **Frontend**: Vanilla JavaScript with HTML5 Canvas
- **Deployment**: Docker with Docker Compose
- **Port**: 3000 (configurable via PORT environment variable)

## Game Rules

- Minimum 2 players required to start
- Only one player can be the Get Deader (designated via checkbox)
- Players start on opposite sides of the screen
- Movement is smooth with 5-pixel increments (diagonal movement supported)
- Collision detection radius is 30 pixels
- Obstacles block movement and provide cover (10 obstacles per game, enabled by default)
- Players cannot move through obstacles
- Game ends when all Got Deaders are caught
- No time limit or scoring system
- Emoji selection is role-based (chasers vs runners)
