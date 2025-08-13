import { useState, useEffect, useRef } from 'react';
import { ref, onValue, update, push, serverTimestamp } from 'firebase/database';
import { database } from '../firebase/config';
import { Team, Player, DraftSettings, DraftAction, DraftMode } from '../types';

interface FirebaseDraftState {
  // Shared state that syncs across all clients
  teams: Team[];
  draftHistory: DraftAction[];
  draftSettings: DraftSettings;
  leagueName: string;
  currentRound: number;
  currentPick: number;
  draftMode: DraftMode;
  snakeDraftOrder: number[];
  timeRemaining: number;
  isTimerRunning: boolean;
  selectedPlayer: Player | null;
  currentBid: number;
  currentBidTeam: number | null;
  lastDraftAction: DraftAction | null;
  showUndoButton: boolean;
  highlightedTeamIndex: number;
  highlightDirection: number;
  currentDraftTeam: number | null;
  draftedPlayers: number[];
}

export function useFirebaseDraft(roomId: string, isHost: boolean = false) {
  // Firebase state
  const [firebaseState, setFirebaseState] = useState<Partial<FirebaseDraftState>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to Firebase room data
  useEffect(() => {
    if (!roomId) return;

    const roomRef = ref(database, `draftRooms/${roomId}`);
    
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        setFirebaseState(data);
        setIsConnected(true);
        setError(null);
      } else {
        // For hosts, we're connected even if room doesn't exist yet (we'll create it)
        // For viewers, room not found is an error
        if (isHost) {
          setIsConnected(true);
          setError(null);
        } else {
          setError('Room not found');
          setIsConnected(false);
        }
      }
    }, (error) => {
      console.error('Firebase error:', error);
      setError('Connection failed');
      setIsConnected(false);
    });

    return () => unsubscribe();
  }, [roomId, isHost]);

  // Host-only timer management
  useEffect(() => {
    if (!isHost || !firebaseState.isTimerRunning || !roomId) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(async () => {
      const newTime = Math.max(0, (firebaseState.timeRemaining || 0) - 1);
      
      try {
        await update(ref(database, `draftRooms/${roomId}`), {
          timeRemaining: newTime,
          isTimerRunning: newTime > 0,
          lastActivity: serverTimestamp()
        });

        if (newTime === 0) {
          console.log('Timer expired');
        }
      } catch (err) {
        console.error('Timer update failed:', err);
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isHost, firebaseState.isTimerRunning, firebaseState.timeRemaining, roomId]);

  // Firebase update functions (host-only)
  const updateFirebaseState = async (updates: Partial<FirebaseDraftState>) => {
    if (!isHost || !roomId) {
      console.warn('Only host can update draft state');
      return;
    }

    try {
      await update(ref(database, `draftRooms/${roomId}`), {
        ...updates,
        lastActivity: serverTimestamp()
      });
    } catch (err) {
      console.error('Firebase update failed:', err);
      setError('Update failed');
    }
  };

  const createRoom = async (initialState: FirebaseDraftState) => {
    if (!isHost) return null;

    try {
      const roomsRef = ref(database, 'draftRooms');
      const newRoomRef = push(roomsRef);
      const newRoomId = newRoomRef.key!;
      
      await update(newRoomRef, {
        ...initialState,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      });

      return newRoomId;
    } catch (err) {
      console.error('Room creation failed:', err);
      setError('Failed to create room');
      return null;
    }
  };

  // Return state with fallbacks
  return {
    // Firebase state with defaults
    teams: (firebaseState.teams || []).map(team => ({
      ...team,
      players: team.players || []
    })),
    draftHistory: firebaseState.draftHistory || [],
    draftSettings: firebaseState.draftSettings || {
      auctionBudget: 200,
      rosterSize: 16,
      auctionRounds: 5,
      draftTimer: 90,
      teamCount: 10
    },
    leagueName: firebaseState.leagueName || "Draft Room",
    currentRound: firebaseState.currentRound || 1,
    currentPick: firebaseState.currentPick || 1,
    draftMode: firebaseState.draftMode || "auction",
    snakeDraftOrder: firebaseState.snakeDraftOrder || [],
    timeRemaining: firebaseState.timeRemaining || 90,
    isTimerRunning: firebaseState.isTimerRunning || false,
    selectedPlayer: firebaseState.selectedPlayer || null,
    currentBid: firebaseState.currentBid || 1,
    currentBidTeam: firebaseState.currentBidTeam || null,
    lastDraftAction: firebaseState.lastDraftAction || null,
    showUndoButton: firebaseState.showUndoButton || false,
    highlightedTeamIndex: firebaseState.highlightedTeamIndex || 0,
    highlightDirection: firebaseState.highlightDirection || 1,
    currentDraftTeam: firebaseState.currentDraftTeam || null,
    draftedPlayers: firebaseState.draftedPlayers || [],
    
    // Connection state
    isConnected,
    error,
    
    // Actions
    updateFirebaseState,
    createRoom
  };
}
