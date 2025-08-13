import { useState, useEffect, useRef } from 'react';
import { Team, Player, DraftHistory, DraftAction, DraftMode, DraftSettings } from '../types';

export function useDraftLogic(
  teams: Team[], 
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
  players: Player[],
  draftSettings: DraftSettings
) {
  const [draftedPlayers, setDraftedPlayers] = useState<number[]>([]);
  const [draftHistory, setDraftHistory] = useState<DraftHistory[]>([]);
  const [currentDraftTeam, setCurrentDraftTeam] = useState<number | null>(null);
  const [lastDraftAction, setLastDraftAction] = useState<DraftAction | null>(null);
  const [showUndoButton, setShowUndoButton] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentPick, setCurrentPick] = useState(1);
  const [draftMode, setDraftMode] = useState<DraftMode>("auction");
  const [snakeDraftOrder, setSnakeDraftOrder] = useState<number[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(draftSettings.draftTimer);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer effect
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current as NodeJS.Timeout);
            setIsTimerRunning(false);
            return draftSettings.draftTimer;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning, draftSettings.draftTimer]);

  // Switch from auction to snake draft when auction rounds are completed
  useEffect(() => {
    if (currentRound > draftSettings.auctionRounds) {
      setDraftMode(prev => {
        if (prev === "auction") {
          // compute draft order based on remaining budget (desc)
          const order = [...teams]
            .sort((a,b)=> b.budget - a.budget)
            .map(t=>t.id);
          setSnakeDraftOrder(order);
        }
        return "snake";
      });
    } else {
      setDraftMode("auction");
    }
  }, [currentRound, draftSettings.auctionRounds, teams]);

  // Calculate current team on the clock
  useEffect(() => {
    if (draftMode === "auction") {
      setCurrentDraftTeam(null);
    } else {
      if (snakeDraftOrder.length === 0) return;
      const picksIntoSnake = (currentPick - 1) % teams.length;
      const isEvenRound = (currentRound - draftSettings.auctionRounds) % 2 === 0;
      let orderIndex = isEvenRound ? (snakeDraftOrder.length - 1 - picksIntoSnake) : picksIntoSnake;
      orderIndex = ((orderIndex % snakeDraftOrder.length) + snakeDraftOrder.length) % snakeDraftOrder.length;
      setCurrentDraftTeam(snakeDraftOrder[orderIndex]);
    }
  }, [currentRound, currentPick, draftMode, teams.length, draftSettings.auctionRounds, snakeDraftOrder]);

  // Handle draft pick
  const handleDraftPick = (playerId: number, teamId: number, amount = 0) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    // Save the current action for potential undo
    setLastDraftAction({
      playerId,
      teamId,
      amount,
      timestamp: new Date()
    });
    setShowUndoButton(true);

    // Update team roster and budget
    setTeams(prevTeams => {
      return prevTeams.map(team => {
        if (team.id === teamId) {
          return {
            ...team,
            players: [...team.players, player],
            budget: draftMode === "auction" ? team.budget - amount : team.budget
          };
        }
        return team;
      });
    });

    // Update drafted players
    setDraftedPlayers(prev => [...prev, playerId]);

    // Add to draft history
    setDraftHistory(prev => [
      ...prev,
      {
        round: currentRound,
        pick: currentPick,
        player,
        team: teams.find(t => t.id === teamId)!,
        amount: draftMode === "auction" ? amount : 0,
        timestamp: new Date()
      }
    ]);

    // Move to next pick
    if (currentPick % teams.length === 0) {
      setCurrentRound(prev => prev + 1);
    }
    setCurrentPick(prev => prev + 1);

    // Reset timer
    setTimeRemaining(draftSettings.draftTimer);
    setIsTimerRunning(false);
  };

  // Undo the last draft action
  const handleUndoDraft = () => {
    if (!lastDraftAction) return;

    const { playerId, teamId, amount } = lastDraftAction;
    
    // Find the player
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    // Remove player from team's roster and refund budget
    setTeams(prevTeams => {
      return prevTeams.map(team => {
        if (team.id === teamId) {
          return {
            ...team,
            players: team.players.filter(p => p.id !== playerId),
            budget: draftMode === "auction" ? team.budget + amount : team.budget
          };
        }
        return team;
      });
    });

    // Remove from drafted players list
    setDraftedPlayers(prev => prev.filter(id => id !== playerId));

    // Remove the last entry from draft history
    setDraftHistory(prev => prev.slice(0, -1));

    // Reset last action and hide undo button
    setLastDraftAction(null);
    setShowUndoButton(false);
  };

  // Auto-hide the undo button after 30 seconds
  useEffect(() => {
    let undoTimer: NodeJS.Timeout | null = null;
    
    if (showUndoButton) {
      undoTimer = setTimeout(() => {
        setShowUndoButton(false);
      }, 30000);
    }
    
    return () => {
      if (undoTimer) clearTimeout(undoTimer);
    };
  }, [showUndoButton]);

  return {
    draftedPlayers,
    draftHistory,
    currentDraftTeam,
    lastDraftAction,
    showUndoButton,
    currentRound,
    currentPick,
    draftMode,
    snakeDraftOrder,
    timeRemaining,
    isTimerRunning,
    setIsTimerRunning,
    handleDraftPick,
    handleUndoDraft
  };
}
