# Fantasy Football Draft App

A modern, real-time fantasy football draft application built with React, TypeScript, Vite, and Firebase.

## 🔥 **NEW: Real-time Multi-User Support**

This app now supports **real-time collaboration** where:
- **Host** (`/host`) controls the draft (makes picks, manages settings, runs timer)
- **Readers** (`/`) see all draft activity live but can upload their own player rankings
- **Everyone** sees the same draft state, but with their personal player values displayed in parentheses

### 📊 **Personal Player Values**
- Readers can upload CSV files with their own player valuations
- Personal values appear in parentheses next to host values: `$45 ($52)`
- Fuzzy matching helps identify misnamed players with suggestions
- Player names, teams, and positions must match host data

**CSV Format Requirements:**
```csv
RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,RB,Christian McCaffrey,SF,9,65,285.5
2,WR,A.J. Brown,PHI,7,52,260.1
```

**Error Handling:**
- Mismatched names show suggestions: `"AJ Brown" not found. Did you mean "A.J. Brown"?`
- Only matching players are updated with local values
- Upload fails if no players match the host data

## Features

### 🎮 **Draft Modes**
- **Auction Draft**: Full bidding system with timer and team selection
- **Snake Draft**: Turn-based drafting with proper order calculation  
- **Hybrid Mode**: Auction rounds followed by snake rounds

### 🌐 **Real-time Collaboration**
- **Firebase Integration**: All draft state synced across users
- **Host Controls**: Only host can make picks and change settings
- **Personal Rankings**: Each user can upload their own CSV player data
- **Live Updates**: See draft picks, timer, and bids in real-time

### 📊 **Data Management**
- **CSV Import**: Upload your own player rankings and values
- **Team Management**: Edit team names, owners, and draft positions
- **Draft History**: Complete tracking of all picks and transactions

### 🎨 **User Experience**
- **Responsive Design**: Works perfectly on desktop and mobile
- **Retro Gaming Theme**: Pixel-perfect styling with bold colors
- **Connection Status**: See if you're HOST, VIEWER, or OFFLINE

## Tech Stack

- **React 18** - Modern React with hooks
- **TypeScript** - Type safety and better developer experience
- **Vite** - Fast build tool and development server
- **Firebase** - Real-time database for multi-user sync
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Beautiful icon library

## Getting Started

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Firebase project (for real-time features)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd fantasy-football-draft-app
```

2. Install dependencies:
```bash
npm install
```

3. **Set up Firebase** (see Firebase Setup section below)

4. Start the development server:
```bash
npm run dev
```

5. Open your browser:
   - **Host mode**: [http://localhost:5173/host](http://localhost:5173/host) (can make draft picks and changes)
   - **Reader mode**: [http://localhost:5173/](http://localhost:5173/) (view-only, can upload personal CSV)

## 🔥 Firebase Setup Guide

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: `fantasy-draft-app`
4. Disable Google Analytics (not needed)
5. Click "Create project"

### Step 2: Enable Realtime Database

1. In your Firebase project, click "Realtime Database" in the left sidebar
2. Click "Create Database"
3. Choose location (us-central1 is fine)
4. **Start in test mode** (we'll secure it later)
5. Click "Done"

### Step 3: Get Configuration

1. Click the gear icon → "Project settings"
2. Scroll down to "Your apps"
3. Click the web icon `</>`
4. Enter app nickname: `draft-app`
5. **Don't check** "Set up Firebase Hosting"
6. Click "Register app"
7. **Copy the firebaseConfig object**

### Step 4: Update Your Code

Replace the config in `src/firebase/config.ts`:

```typescript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com/",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

### Step 5: Set Database Rules

1. Go to "Realtime Database" → "Rules" tab
2. Replace the rules with:

```json
{
  "rules": {
    "draftRooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

3. Click "Publish"

### Step 6: Test Real-time Features

1. Start your dev server: `npm run dev`
2. Open two browser windows:
   - **Host**: `http://localhost:5173/host`
   - **Reader**: `http://localhost:5173/`
3. Make a draft pick in the host window
4. Watch it appear in the reader window instantly! 🎉

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## Project Structure

```
src/
├── components/          # Reusable UI components
├── data/               # Mock data and constants
├── firebase/           # Firebase configuration
├── hooks/              # Custom React hooks (including Firebase)
├── styles/             # Color themes and styling
├── types/              # TypeScript type definitions
├── App.tsx             # Main application component
└── main.tsx            # Application entry point
```

## How It Works

### 🏠 **Host Mode** (`/host`)
- Controls all draft actions (picks, bids, timer)
- Can modify settings and team information
- Manages the draft flow and progression
- Connection status shows "HOST"

### 👀 **Reader Mode** (`/`)
- Sees all draft activity in real-time
- Can upload personal player rankings via CSV
- Cannot make draft picks or change settings
- Connection status shows "VIEW"

### 📱 **Room System**
- Each draft session has a unique room ID
- Host creates the room, viewers join with room ID
- All draft state synced via Firebase Realtime Database

## CSV Import Format

Upload a CSV file with the following columns:

```
RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,WR,Ja'Marr Chase,CIN,10,57,351.75
2,RB,Bijan Robinson,ATL,5,56,317.44
3,WR,Justin Jefferson,MIN,6,55,311.52
```

**Note**: Each user can upload their own rankings - this only affects what they see, not the shared draft state.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.