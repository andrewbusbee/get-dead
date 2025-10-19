# Get Dead Game

A multiplayer WebSocket-based chase game where players try to avoid being caught by the "Get Deader".

## How to Play

1. **Landing Page**: Click "Start Game" to begin
2. **Game Setup**: 
   - Enter your name
   - Share the game link with friends
   - Optionally check "I want to be the Get Deader" to be the chaser
   - Click "Join Room"
3. **Game Room**: 
   - See all players who have joined
   - One player can be the "Get Deader" (chaser)
   - Others are "Got Deaders" (runners)
   - Click "Start Game" when at least 2 players have joined
4. **Game Play**:
   - Get Deader: 💀 (skull and crossbones)
   - Got Deaders: 😱 (screaming faces)
   - Move with arrow keys or touch/swipe on mobile
   - Get Deader tries to catch Got Deaders
   - When caught, Got Deader becomes 💀 and stops moving
   - Game ends when all Got Deaders are caught
5. **Game Over**: Click "Start New Game" to return to the game room

## Features

- Real-time multiplayer using WebSockets
- Mobile-friendly touch controls
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
- Only one player can be the Get Deader
- Players start on opposite sides of the screen
- Movement is smooth with 5-pixel increments
- Collision detection radius is 30 pixels
- Game ends when all Got Deaders are caught
- No time limit or scoring system
