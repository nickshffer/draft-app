import { useCallback } from 'react';
import { useFirebaseDraft } from './useFirebaseDraft';
import { draftLogger } from '../utils/draftLogger';
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
  customPlayerList?: Player[];
}

/**
 * Enhanced hook that wraps useFirebaseDraft with comprehensive logging
 */
export function useFirebaseDraftWithLogging(roomId: string, isHost: boolean = false) {
  const originalHook = useFirebaseDraft(roomId, isHost);
  
  // Get current state for logging - NO FALLBACKS
  const getCurrentState = useCallback((): Partial<FirebaseDraftState> => {
    return {
      teams: originalHook.teams,
      draftHistory: originalHook.draftHistory,
      draftSettings: originalHook.draftSettings,
      leagueName: originalHook.leagueName,
      currentRound: originalHook.currentRound,
      currentPick: originalHook.currentPick,
      draftMode: originalHook.draftMode,
      snakeDraftOrder: originalHook.snakeDraftOrder,
      timeRemaining: originalHook.timeRemaining,
      isTimerRunning: originalHook.isTimerRunning,
      selectedPlayer: originalHook.selectedPlayer,
      currentBid: originalHook.currentBid,
      currentBidTeam: originalHook.currentBidTeam,
      lastDraftAction: originalHook.lastDraftAction,
      highlightedTeamIndex: originalHook.highlightedTeamIndex,
      highlightDirection: originalHook.highlightDirection,
      currentDraftTeam: originalHook.currentDraftTeam,
      draftedPlayers: originalHook.draftedPlayers,
      customPlayerList: originalHook.customPlayerList
    };
  }, [originalHook]);

  // Enhanced updateFirebaseState with logging
  const updateFirebaseState = useCallback(async (
    updates: Partial<FirebaseDraftState>,
    action: string = 'state_update',
    metadata: any = {}
  ) => {
    const prevState = getCurrentState();
    
    try {
      // Call original update function
      await originalHook.updateFirebaseState(updates);
      
      // Log the changes
      await draftLogger.logAction(
        roomId,
        action,
        prevState,
        { ...prevState, ...updates },
        {
          isHost,
          ...metadata
        }
      );
    } catch (error) {
      console.error('Firebase update failed:', error);
      
      // Log the failed attempt
      await draftLogger.logSimpleAction(
        roomId,
        'update_failed',
        `Failed to update: ${action}`,
        {
          isHost,
          error: error instanceof Error ? error.message : 'Unknown error',
          attemptedUpdates: Object.keys(updates),
          ...metadata
        }
      );
      
      throw error;
    }
  }, [roomId, isHost, getCurrentState, originalHook.updateFirebaseState]);

  // Enhanced createRoom with logging
  const createRoom = useCallback(async (initialState: FirebaseDraftState) => {
    try {
      const newRoomId = await originalHook.createRoom(initialState);
      
      if (newRoomId) {
        await draftLogger.logAction(
          newRoomId,
          'room_created',
          {},
          initialState,
          {
            isHost,
            newRoomId
          }
        );
      }
      
      return newRoomId;
    } catch (error) {
      await draftLogger.logSimpleAction(
        roomId || 'unknown',
        'room_creation_failed',
        'Failed to create new room',
        {
          isHost,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      throw error;
    }
  }, [roomId, isHost, originalHook.createRoom]);

  // Enhanced updateCustomPlayerList with logging
  const updateCustomPlayerList = useCallback(async (players: Player[]) => {
    const prevState = getCurrentState();
    
    try {
      await originalHook.updateCustomPlayerList(players);
      
      await draftLogger.logAction(
        roomId,
        'custom_players_updated',
        { customPlayerList: prevState.customPlayerList },
        { customPlayerList: players },
        {
          isHost,
          playerCount: players.length
        }
      );
    } catch (error) {
      await draftLogger.logSimpleAction(
        roomId,
        'custom_players_update_failed',
        'Failed to update custom player list',
        {
          isHost,
          error: error instanceof Error ? error.message : 'Unknown error',
          attemptedPlayerCount: players.length
        }
      );
      
      throw error;
    }
  }, [roomId, isHost, getCurrentState, originalHook.updateCustomPlayerList]);

  return {
    // All original properties
    ...originalHook,
    
    // Enhanced functions with logging
    updateFirebaseState,
    createRoom,
    updateCustomPlayerList
  };
}
