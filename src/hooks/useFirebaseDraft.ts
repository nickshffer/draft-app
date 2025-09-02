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
  highlightedTeamIndex: number;
  highlightDirection: number;
  currentDraftTeam: number | null;
  draftedPlayers: number[];
  customPlayerList?: Player[]; // Host can override the global player list
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

  // Host-only timer management - SIMPLE VERSION
  useEffect(() => {
    if (!isHost || !roomId) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Only run timer if it's supposed to be running AND time > 0
    if (firebaseState.isTimerRunning && (firebaseState.timeRemaining || 0) > 0) {
      timerRef.current = setInterval(async () => {
        const currentTime = firebaseState.timeRemaining || 0;
        const newTime = Math.max(0, currentTime - 1);
        
        try {
          await update(ref(database, `draftRooms/${roomId}`), {
            timeRemaining: newTime,
            isTimerRunning: newTime > 0, // Stop timer when it hits 0
            lastActivity: serverTimestamp()
          });
          
          if (newTime === 0) {
            console.log('Timer expired - stopped at 0');
          }
        } catch (err) {
          console.error('Timer update failed:', err);
        }
      }, 1000);
    } else {
      // Clear timer if not running or at 0
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
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

  const updateCustomPlayerList = async (players: Player[]) => {
    if (!isHost || !roomId) {
      console.warn('Only host can update custom player list');
      return;
    }

    try {
      await update(ref(database, `draftRooms/${roomId}`), {
        customPlayerList: players,
        lastActivity: serverTimestamp()
      });
    } catch (err) {
      console.error('Failed to update custom player list:', err);
      setError('Failed to update player list');
    }
  };

  // Return state - Firebase is source of truth, but provide safe defaults for incomplete state
  const isFirebaseReady = firebaseState.teams && firebaseState.draftSettings;
  
  return {
    // Firebase state - use actual values or safe defaults (but mark as not connected if incomplete)
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
      auctionTimer: 10,
      teamCount: 10
    },
    leagueName: firebaseState.leagueName || "Draft Room",
    currentRound: firebaseState.currentRound ?? 1,
    currentPick: firebaseState.currentPick ?? 1,
    draftMode: firebaseState.draftMode || "auction",
    snakeDraftOrder: firebaseState.snakeDraftOrder || [],
    timeRemaining: firebaseState.timeRemaining ?? 10,
    isTimerRunning: firebaseState.isTimerRunning ?? false,
    selectedPlayer: firebaseState.selectedPlayer ?? null,
    currentBid: firebaseState.currentBid ?? 1,
    currentBidTeam: firebaseState.currentBidTeam ?? null,
    lastDraftAction: firebaseState.lastDraftAction ?? null,
    highlightedTeamIndex: firebaseState.highlightedTeamIndex ?? 0,
    highlightDirection: firebaseState.highlightDirection ?? 1,
    currentDraftTeam: firebaseState.currentDraftTeam ?? null,
    draftedPlayers: firebaseState.draftedPlayers || [],
    customPlayerList: firebaseState.customPlayerList,
    
    // Connection state - only connected if Firebase is ready
    isConnected: isConnected && isFirebaseReady,
    error,
    
    // Actions
    updateFirebaseState,
    createRoom,
    updateCustomPlayerList
  };
}
