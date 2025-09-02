import React, { useState, useEffect, useRef } from "react";
import { Search, Settings, DollarSign, Users, Clock, ChevronDown, ChevronUp, X, Check, ChevronRight, Edit, Save, Upload, AlertCircle, Undo } from "lucide-react";
import Fuse from 'fuse.js';

// Import types
import { FantasyFootballDraftProps, Team, Player, ActiveTab, SortBy, SortDirection, DraftSettings, CsvUploadStatus, DraftMode } from './types';

// Import data and styles
import { mockTeams, positionCategories } from './data/mockData';
import { customColors } from './styles/colors';

// Import sample CSV data
import sampleCsvData from './data/sample.csv?raw';

// Import components
import FontLoader from './components/FontLoader';
import PositionBadge from './components/PositionBadge';
import WelcomePopup from './components/WelcomePopup';

// Import Firebase hook
import { useFirebaseDraftWithLogging } from './hooks/useFirebaseDraftWithLogging';
import { useCsvUpload } from './hooks/useCsvUpload';
import { createDraftActionLogger } from './utils/draftActionLogger';

// Import welcome utilities
import { shouldShowWelcome, dismissWelcome } from './utils/welcomePreferences';

// Import team roster preferences
import { getSelectedTeamId, setSelectedTeamId } from './utils/teamRosterPreferences';

// Roster slot definitions
interface RosterSlot {
  id: string;
  position: string;
  label: string;
  eligiblePositions: string[];
}

const ROSTER_STRUCTURE: RosterSlot[] = [
  { id: 'qb', position: 'QB', label: 'QB', eligiblePositions: ['QB'] },
  { id: 'wr1', position: 'WR', label: 'WR', eligiblePositions: ['WR'] },
  { id: 'wr2', position: 'WR', label: 'WR', eligiblePositions: ['WR'] },
  { id: 'wr3', position: 'WR', label: 'WR', eligiblePositions: ['WR'] },
  { id: 'rb1', position: 'RB', label: 'RB', eligiblePositions: ['RB'] },
  { id: 'rb2', position: 'RB', label: 'RB', eligiblePositions: ['RB'] },
  { id: 'te', position: 'TE', label: 'TE', eligiblePositions: ['TE'] },
  { id: 'flex', position: 'FLEX', label: 'FLEX', eligiblePositions: ['WR', 'RB', 'TE'] },
  { id: 'k', position: 'K', label: 'K', eligiblePositions: ['K'] },
  { id: 'def', position: 'DST', label: 'DST', eligiblePositions: ['DST'] }
];

interface AssignedRosterSlot extends RosterSlot {
  player?: Player;
  isEmpty: boolean;
}

// Auction constraint helper functions
const getAuctionPlayersForTeam = (team: Team, draftHistory: any[], auctionRounds: number): number => {
  // Count how many players this team has drafted during auction rounds
  return draftHistory.filter(pick => 
    pick.teamId === team.id && pick.round <= auctionRounds
  ).length;
};

const getMaxBidForTeam = (team: Team, draftHistory: any[], auctionRounds: number, currentRound: number): number => {
  if (currentRound > auctionRounds) return team.budget; // No constraints in snake rounds
  
  const auctionPlayersDrafted = getAuctionPlayersForTeam(team, draftHistory, auctionRounds);
  const playersStillNeeded = auctionRounds - auctionPlayersDrafted;
  
  if (playersStillNeeded <= 0) return 0; // Team already has their auction picks
  
  // Must save at least $1 for each remaining required player (minus this one)
  const dollarsToReserve = Math.max(0, playersStillNeeded - 1);
  return Math.max(1, team.budget - dollarsToReserve);
};

const canTeamBid = (team: Team, draftHistory: any[], auctionRounds: number, currentRound: number): boolean => {
  if (currentRound > auctionRounds) return false; // No bidding in snake rounds
  
  const auctionPlayersDrafted = getAuctionPlayersForTeam(team, draftHistory, auctionRounds);
  
  // Team can bid if they haven't reached their total auction player limit
  // Each team should be able to draft exactly auctionRounds number of players during auction
  return auctionPlayersDrafted < auctionRounds;
};

// Helper function to sort teams by budget with random tiebreaker
const sortTeamsByBudgetWithTiebreaker = (teams: Team[]): Team[] => {
  return [...teams].sort((a, b) => {
    // Primary sort: higher budget first
    if (b.budget !== a.budget) {
      return b.budget - a.budget;
    }
    
    // Tiebreaker: create pseudo-random but deterministic ordering based on team properties
    // This ensures teams with same budget get a consistent but randomized order
    const hashA = (a.id * 31 + a.name.length * 17 + a.owner.length * 13) % 1000;
    const hashB = (b.id * 31 + b.name.length * 17 + b.owner.length * 13) % 1000;
    
    return hashA - hashB;
  });
};

// Function to assign players to roster slots with dynamic expansion for overflow
const assignPlayersToRosterSlots = (players: Player[], rosterSize: number): AssignedRosterSlot[] => {
  const slots: AssignedRosterSlot[] = ROSTER_STRUCTURE.map(slot => ({
    ...slot,
    isEmpty: true
  }));
  
  // Add bench slots based on roster size
  const benchSlotsNeeded = Math.max(0, rosterSize - ROSTER_STRUCTURE.length);
  for (let i = 0; i < benchSlotsNeeded; i++) {
    slots.push({
      id: `bench${i + 1}`,
      position: 'BEN',
      label: 'BEN',
      eligiblePositions: ['QB', 'WR', 'RB', 'TE', 'K', 'DST'], // Any position can be benched
      isEmpty: true
    });
  }

  let nextBenchNumber = benchSlotsNeeded + 1;

  // Assign players to slots in draft order
  for (const player of players) {
    // Only process players with valid positions
    const validPositions = ['QB', 'WR', 'RB', 'TE', 'K', 'DST'];
    if (!validPositions.includes(player.position)) {
      continue; // Skip invalid positions
    }

    // Find the best available slot that can hold this player
    // Priority: position-specific slots first, then FLEX, then bench
    let availableSlot = slots.find(slot => 
      slot.isEmpty && 
      slot.eligiblePositions.includes(player.position) &&
      slot.position !== 'FLEX' && // Prioritize position-specific slots over FLEX
      slot.position !== 'BEN'     // Prioritize starters over bench
    );
    
    // If no position-specific slot, try FLEX
    if (!availableSlot) {
      availableSlot = slots.find(slot => 
        slot.isEmpty && 
        slot.position === 'FLEX' &&
        slot.eligiblePositions.includes(player.position)
      );
    }
    
    // If no FLEX slot, try bench
    if (!availableSlot) {
      availableSlot = slots.find(slot => 
        slot.isEmpty && 
        slot.position === 'BEN' &&
        slot.eligiblePositions.includes(player.position)
      );
    }
    
    // If no slot available, create a new bench slot for this player
    if (!availableSlot) {
      const newBenchSlot: AssignedRosterSlot = {
        id: `bench${nextBenchNumber}`,
        position: 'BEN',
        label: 'BEN',
        eligiblePositions: ['QB', 'WR', 'RB', 'TE', 'K', 'DST'],
        isEmpty: true
      };
      slots.push(newBenchSlot);
      availableSlot = newBenchSlot;
      nextBenchNumber++;
    }
    
    if (availableSlot) {
      availableSlot.player = player;
      availableSlot.isEmpty = false;
    }
  }

  return slots;
};

// Parse CSV data into Player objects
const parseCsvToPlayers = (csvText: string): Player[] => {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const headerMap: Record<string, string> = {
    'rank': 'rank',
    'position': 'position',
    'pos': 'position',
    'player': 'name',
    'player name': 'name',
    'team': 'team',
    'bye': 'bye',
    'bye week': 'bye',
    'auc $': 'projectedValue',
    'auction value': 'projectedValue', 
    'auction $': 'projectedValue',
    'proj. pts': 'projectedPoints',
    'proj pts': 'projectedPoints',
    'projected points': 'projectedPoints'
  };

  const columnIndices: Record<string, number> = {};
  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim();
    if (headerMap[normalizedHeader]) {
      columnIndices[headerMap[normalizedHeader]] = index;
    }
  });

  const players: Player[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());
    const getValue = (key: string) => {
      const index = columnIndices[key];
      return index !== undefined && index < values.length ? values[index] : '';
    };

          let position = getValue('position').toUpperCase();
      if (['D', 'DEF', 'D/ST'].includes(position)) position = 'DST';
      if (['PK'].includes(position)) position = 'K';

    // Skip if position is invalid
    if (!Object.keys(positionCategories).includes(position)) {
      continue;
    }

    const player: Player = {
      id: i,
      rank: parseInt(getValue('rank')) || i,
      position: position,
      name: getValue('name'),
      team: getValue('team'),
      bye: parseInt(getValue('bye')) || 0,
      projectedValue: parseFloat(getValue('projectedValue')) || 0,
      projectedPoints: parseFloat(getValue('projectedPoints')) || 0
    };

    players.push(player);
  }

  return players;
};

export default function FantasyFootballDraft({
  initialAuctionBudget = 200,
  initialRosterSize = 16,
  initialAuctionRounds = 5,
  draftTimerSeconds = 90,
  isHost = false
}: FantasyFootballDraftProps) {
  // Font families (used directly in inline styles)
  const monofettFont = '"Monofett", cursive';
  const dmMonoFont = '"Geist Mono", monospace';

  // Room management - Get room ID from URL query parameter or use default
  const [roomId, setRoomId] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('roomid') || 'demo-room';
  });

  // Firebase state with logging (replaces most of the previous useState calls)
  const {
    teams, draftHistory, draftSettings, leagueName, currentRound, currentPick,
    draftMode, snakeDraftOrder, timeRemaining, isTimerRunning, selectedPlayer,
    currentBid, currentBidTeam,
    highlightedTeamIndex, highlightDirection, currentDraftTeam, draftedPlayers,
    customPlayerList, isConnected, error, updateFirebaseState, createRoom, updateCustomPlayerList
  } = useFirebaseDraftWithLogging(roomId, isHost);

  // Create logger instance for this room
  const logger = createDraftActionLogger(roomId, isHost);

  // Wrapper functions for logged updates
  const updateLeagueName = async (name: string) => {
    if (!isHost) return;
    await updateFirebaseState({ leagueName: name }, 'update_league_name', { 
      previousName: leagueName, 
      newName: name 
    });
  };

  const updateDraftSetting = async (setting: keyof DraftSettings, value: number) => {
    if (!isHost) return;
    const prevSettings = { ...draftSettings };
    const newSettings = { ...draftSettings, [setting]: value };
    await updateFirebaseState({ 
      draftSettings: newSettings 
    }, 'update_draft_setting', { 
      setting, 
      previousValue: prevSettings[setting], 
      newValue: value 
    });
  };

  const updateCurrentBid = async (newBid: number) => {
    if (!isHost) return;
    await updateFirebaseState({ currentBid: newBid }, 'update_current_bid', {
      previousBid: currentBid,
      newBid,
      playerId: selectedPlayer && selectedPlayer.id !== undefined ? selectedPlayer.id : null,
      playerName: selectedPlayer && selectedPlayer.name !== undefined ? selectedPlayer.name : null
    });
  };

  // LOCAL STATE - Initialize with sample CSV data as fallback
  const [players, setPlayers] = useState<Player[]>(() => {
    // Use sample CSV data as initial fallback
    return parseCsvToPlayers(sampleCsvData);
  });
  const [csvUploadStatus, setCsvUploadStatus] = useState<CsvUploadStatus>({
    status: 'idle',
    message: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Host-only CSV upload for overriding global player list
  const {
    csvUploadStatus: hostCsvUploadStatus,
    fileInputRef: hostFileInputRef,
    isProcessingFile: isProcessingHostFile,
    handleFileChange: handleHostFileChange
  } = useCsvUpload();
  
  // UI state (stays local)
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("players");
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showBidInterface, setShowBidInterface] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Record<number, boolean>>({});
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState({ owner: "", name: "" });
  
  // Team roster display state
  const [selectedTeamForRoster, setSelectedTeamForRoster] = useState<number | null>(() => {
    return getSelectedTeamId();
  });
  
  // Responsive UI state
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Check screen size for responsive adjustments
  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setShowLeftSidebar(false);
        setShowRightSidebar(false);
      } else {
        setShowLeftSidebar(true);
        setShowRightSidebar(true);
      }
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Initialize Firebase room if host and no existing data
  useEffect(() => {
    if (isHost && teams.length === 0 && isConnected) {
      // Parse sample CSV data for initial player list
      const initialPlayers = parseCsvToPlayers(sampleCsvData);
      
      const initialState = {
        teams: mockTeams.map(team => ({
          ...team,
          budget: initialAuctionBudget,
          players: [],
          draftPosition: team.id
        })),
        draftHistory: [],
        draftSettings: {
          auctionBudget: initialAuctionBudget,
          rosterSize: initialRosterSize,
          auctionRounds: initialAuctionRounds,
          draftTimer: draftTimerSeconds,
          teamCount: mockTeams.length
        },
        leagueName: "Yo Soy FIESTA",
        currentRound: 1,
        currentPick: 1,
        draftMode: "auction" as DraftMode,
        snakeDraftOrder: [],
        timeRemaining: draftTimerSeconds,
        isTimerRunning: false,
        selectedPlayer: null,
        currentBid: 1,
        currentBidTeam: null,
        lastDraftAction: null,
        highlightedTeamIndex: 0,
        highlightDirection: 1,
        currentDraftTeam: null,
        draftedPlayers: [],
        customPlayerList: initialPlayers // Initialize with sample CSV data
      };
      
      (async () => {
        await updateFirebaseState(initialState, 'initialize_room', {
          initialAuctionBudget,
          initialRosterSize,
          initialAuctionRounds,
          draftTimerSeconds
        });
      })();
    }
  }, [isHost, teams.length, isConnected, initialAuctionBudget, initialRosterSize, initialAuctionRounds, draftTimerSeconds]); // updateFirebaseState is stable

  // Update players when custom player list changes from Firebase
  useEffect(() => {
    if (customPlayerList && customPlayerList.length > 0) {
      const dstCount = customPlayerList.filter(p => p.position === 'DST').length;
      
      if (dstCount === 0) {
        // Firebase customPlayerList is missing DST players - add them from sample.csv
        const samplePlayers = parseCsvToPlayers(sampleCsvData);
        const sampleDSTPlayers = samplePlayers.filter(p => p.position === 'DST');
        
        // Combine Firebase list with DST players from sample
        const combinedPlayers = [...customPlayerList, ...sampleDSTPlayers];
        setPlayers(combinedPlayers);
      } else {
        setPlayers(customPlayerList);
      }
    } else {
      // Fallback to sample CSV data if no custom player list
      const fallbackPlayers = parseCsvToPlayers(sampleCsvData);
      setPlayers(fallbackPlayers);
    }
  }, [customPlayerList]);

  // Listen for URL changes to update room ID
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const newRoomId = urlParams.get('roomid') || 'demo-room';
      if (newRoomId !== roomId) {
        setRoomId(newRoomId);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [roomId]);

  // Switch from auction to snake draft when auction rounds are completed (Host only)
  useEffect(() => {
    if (!isHost || !isConnected || teams.length === 0) return;
    
    if (currentRound > draftSettings.auctionRounds) {
      // Only switch if we're currently in auction mode
      if (draftMode === "auction") {
        // Compute draft order based on remaining budget (descending) with random tiebreaker
        const sortedTeams = sortTeamsByBudgetWithTiebreaker(teams);
        const order = sortedTeams.map(t => t.id);
        
        // Update Firebase state to switch to snake mode and start timer
        (async () => {
          await logger.logSnakeDraftOrderCalculation(teams, order, currentRound);
          await updateFirebaseState({
            draftMode: "snake",
            snakeDraftOrder: order,
            isTimerRunning: true,
            timeRemaining: draftSettings.draftTimer
          }, 'transition_to_snake', {
            draftRound: currentRound,
            snakeOrder: order
          });
        })();
      }
    } else {
      // Make sure we're in auction mode for auction rounds
      if (draftMode === "snake") {
        (async () => {
          await logger.logDraftModeChange("snake", "auction", currentRound);
          await updateFirebaseState({
            draftMode: "auction",
            snakeDraftOrder: []
          }, 'transition_to_auction', {
            draftRound: currentRound
          });
        })();
      }
    }
  }, [isHost, isConnected, currentRound, draftSettings.auctionRounds, teams, draftMode, updateFirebaseState]);

  // Calculate current team on the clock for snake mode (Host only)
  useEffect(() => {
    if (!isHost || !isConnected) return;
    
    if (draftMode === "auction") {
      // In auction mode, any team can bid
      if (currentDraftTeam !== null) {
        (async () => {
          await updateFirebaseState({ currentDraftTeam: null }, 'clear_current_team', {
            draftMode: 'auction'
          });
        })();
      }
    } else if (draftMode === "snake") {
      // In snake mode, calculate based on round and pick
      if (snakeDraftOrder.length === 0 || teams.length === 0) return;
      
      // Calculate picks into the current snake round (0-based)
      const snakeRound = currentRound - draftSettings.auctionRounds; // 1-based snake round
      const picksIntoSnakeRound = (currentPick - 1) % teams.length; // 0-based within current round
      const isEvenSnakeRound = snakeRound % 2 === 0; // Even snake rounds reverse order
      
      let orderIndex = isEvenSnakeRound ? (snakeDraftOrder.length - 1 - picksIntoSnakeRound) : picksIntoSnakeRound;
      orderIndex = ((orderIndex % snakeDraftOrder.length) + snakeDraftOrder.length) % snakeDraftOrder.length; // safe
      const newCurrentDraftTeam = snakeDraftOrder[orderIndex];
      
      if (currentDraftTeam !== newCurrentDraftTeam) {
        (async () => {
          await updateFirebaseState({ currentDraftTeam: newCurrentDraftTeam }, 'update_current_team', {
            draftMode: 'snake',
            draftRound: currentRound,
            draftPick: currentPick,
            teamId: newCurrentDraftTeam
          });
        })();
      }
    }
  }, [isHost, isConnected, currentRound, currentPick, draftMode, teams.length, draftSettings.auctionRounds, snakeDraftOrder, currentDraftTeam, updateFirebaseState]);



  // Show welcome popup on first visit (after connection is established)
  useEffect(() => {
    if (isConnected && shouldShowWelcome(isHost)) {
      setShowWelcomePopup(true);
    }
  }, [isConnected, isHost]);

  // Update the highlighted team when auction is complete (Host only)
  const updateHighlightedTeam = async () => {
    if (!isHost || draftMode !== "auction") return;
    
    // Calculate next team index based on current direction
    let nextIndex = highlightedTeamIndex + highlightDirection;
    let nextDirection = highlightDirection;
    
    // Check if we need to reverse direction
    if (nextIndex >= teams.length) {
      // Reached the end, reverse direction
      nextDirection = -1;
      nextIndex = teams.length - 2; // Second to last team
    } else if (nextIndex < 0) {
      // Reached the beginning, reverse direction
      nextDirection = 1;
      nextIndex = 1; // Second team
    }
    
    await updateFirebaseState({
      highlightedTeamIndex: nextIndex,
      highlightDirection: nextDirection
    }, 'cycle_team_highlight', {
      prevIndex: highlightedTeamIndex,
      nextIndex,
      direction: nextDirection
    });
  };


  // Handle host CSV upload for global player list override
  const handleHostCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHost) return;
    
    handleHostFileChange(event, (parsedPlayers: Player[]) => {
      // Update local players immediately
      setPlayers(parsedPlayers);
      
      // Save to Firebase for all participants
      if (updateCustomPlayerList) {
        updateCustomPlayerList(parsedPlayers);
      }
    });
  };

  // CSV file handling
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessingFile) return;

    setIsProcessingFile(true);
    setCsvUploadStatus({ status: 'idle', message: '' });
    
    try {
      const file = event.target?.files?.[0];
      
      if (!file) {
        setCsvUploadStatus({ status: 'error', message: 'No file selected' });
        setIsProcessingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setCsvUploadStatus({ status: 'error', message: 'File must be a CSV file (.csv)' });
        setIsProcessingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      file.text().then(csvText => {
        try {
          const lines = csvText.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            setCsvUploadStatus({ status: 'error', message: 'CSV must have header row and data' });
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          const headerMap: Record<string, string> = {
            'rank': 'rank',
            'position': 'position',
            'pos': 'position',
            'player': 'name',
            'player name': 'name',
            'team': 'team',
            'bye': 'bye',
            'bye week': 'bye',
            'auc $': 'projectedValue',
            'auction value': 'projectedValue', 
            'auction $': 'projectedValue',
            'proj. pts': 'projectedPoints',
            'proj pts': 'projectedPoints',
            'projected points': 'projectedPoints'
          };
          
          const columnIndices: Record<string, number> = {};
          headers.forEach((header, index) => {
            const normalizedHeader = header.toLowerCase().trim();
            if (headerMap[normalizedHeader]) {
              columnIndices[headerMap[normalizedHeader]] = index;
            }
          });
          
          const requiredColumns = ['rank', 'position', 'name', 'team', 'bye', 'projectedValue', 'projectedPoints'];
          const missingColumns = requiredColumns.filter(col => columnIndices[col] === undefined);
          
          if (missingColumns.length > 0) {
            setCsvUploadStatus({ 
              status: 'error', 
              message: `Missing required columns: ${missingColumns.join(', ')}. Expected: RANK, POSITION, PLAYER, TEAM, BYE, AUC $, and PROJ. PTS` 
            });
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          
          // Set up fuzzy search for existing players
          const playerFuse = new Fuse(players, {
            keys: ['name', 'team', 'position'],
            threshold: 0.3,
            includeScore: true
          });

          const errors: string[] = [];
          const updatedPlayers = [...players];
          let matchedCount = 0;
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',').map(v => v.trim());
            
            const getValue = (key: string) => {
              const index = columnIndices[key];
              return index !== undefined && index < values.length ? values[index] : '';
            };
            
            let position = getValue('position').toUpperCase();
            if (['D', 'DEF', 'D/ST'].includes(position)) position = 'DST';
            if (['PK'].includes(position)) position = 'K';
            
            const csvPlayer = {
              name: getValue('name'),
              team: getValue('team').toUpperCase(),
              position: position,
              rank: parseInt(getValue('rank')) || i,
              projectedValue: parseFloat(getValue('projectedValue')) || 0,
              projectedPoints: parseFloat(getValue('projectedPoints')) || 0
            };

            // Try to find exact match first
            let matchedPlayer;
            if (csvPlayer.position === 'DST') {
              // For defense/special teams, only match on team and position (ignore name)
              matchedPlayer = players.find(p => 
                p.team.toLowerCase() === csvPlayer.team.toLowerCase() &&
                p.position === csvPlayer.position
              );
            } else {
              // For other positions, match on name, team, and position
              matchedPlayer = players.find(p => 
                p.name.toLowerCase() === csvPlayer.name.toLowerCase() &&
                p.team.toLowerCase() === csvPlayer.team.toLowerCase() &&
                p.position === csvPlayer.position
              );
            }

            // If no exact match, try fuzzy matching
            if (!matchedPlayer) {
              if (csvPlayer.position === 'DST') {
                // For DST, if team didn't match exactly, report error without fuzzy matching
                errors.push(
                  `Row ${i + 1}: "${csvPlayer.name}" (${csvPlayer.team}, ${csvPlayer.position}) not found. No ${csvPlayer.team} defense found in host data.`
                );
                continue;
              } else {
                // For other positions, use fuzzy matching
                const searchResults = playerFuse.search(`${csvPlayer.name} ${csvPlayer.team} ${csvPlayer.position}`);
                
                if (searchResults.length > 0 && searchResults[0].score! < 0.3) {
                  const suggestion = searchResults[0].item;
                  errors.push(
                    `Row ${i + 1}: "${csvPlayer.name}" (${csvPlayer.team}, ${csvPlayer.position}) not found. Did you mean "${suggestion.name}" (${suggestion.team}, ${suggestion.position})?`
                  );
                  continue;
                } else {
                  errors.push(
                    `Row ${i + 1}: "${csvPlayer.name}" (${csvPlayer.team}, ${csvPlayer.position}) not found in host data.`
                  );
                  continue;
                }
              }
            }

            // Update the matched player with local values
            const playerIndex = updatedPlayers.findIndex(p => p.id === matchedPlayer!.id);
            if (playerIndex !== -1) {
              updatedPlayers[playerIndex] = {
                ...updatedPlayers[playerIndex],
                localRank: csvPlayer.rank,
                localProjectedValue: csvPlayer.projectedValue,
                localProjectedPoints: csvPlayer.projectedPoints
              };

              matchedCount++;
            }
          }

          // Report errors but continue with successful matches
          let statusMessage = '';
          if (matchedCount > 0) {
            statusMessage = `Successfully matched ${matchedCount} players with your local values`;
            if (errors.length > 0) {
              statusMessage += `\n\nWarnings (${errors.length} records skipped):\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? '\n...and more' : ''}`;
            }
          } else if (errors.length > 0) {
            setCsvUploadStatus({ 
              status: 'error', 
              message: `No players matched. Errors found:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...and more' : ''}` 
            });
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          if (matchedCount === 0) {
            setCsvUploadStatus({ status: 'error', message: 'No players matched the host data' });
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          
          setPlayers(updatedPlayers);
          setCsvUploadStatus({ 
            status: errors.length > 0 ? 'success' : 'success', 
            message: statusMessage
          });
          
        } catch (err) {
          console.error("CSV parsing error:", err);
          setCsvUploadStatus({ status: 'error', message: 'Error parsing CSV file' });
        } finally {
          setIsProcessingFile(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }).catch(err => {
        console.error("File reading error:", err);
        setCsvUploadStatus({ status: 'error', message: 'Error reading file' });
        setIsProcessingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
      
    } catch (err) {
      console.error("Unexpected error:", err);
      setCsvUploadStatus({ status: 'error', message: 'Unexpected error processing file' });
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Toggle expanded state for a team
  const toggleTeamExpand = (teamId: number) => {
    setExpandedTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  // Start editing a team's info
  const handleEditTeam = (team: Team) => {
    setEditingTeamId(team.id);
    setEditFormData({ 
      owner: team.owner, 
      name: team.name 
    });
  };

  // Save team's edited info
  const handleSaveTeam = async () => {
    if (!editingTeamId || !isHost) return;
    
    const updatedTeams = teams.map(team => {
      if (team.id === editingTeamId) {
        return {
          ...team,
          owner: editFormData.owner,
          name: editFormData.name
        };
      }
      return team;
    });

    const prevTeam = teams.find(t => t.id === editingTeamId);
    const newTeam = updatedTeams.find(t => t.id === editingTeamId);
    
    if (prevTeam && newTeam) {
      await logger.logTeamEdit(prevTeam, newTeam);
    }
    
    await updateFirebaseState({
      teams: updatedTeams
    }, 'update_team', {
      teamId: editingTeamId,
      changes: prevTeam && newTeam ? {
        name: prevTeam.name !== newTeam.name,
        owner: prevTeam.owner !== newTeam.owner
      } : {}
    });
    
    setEditingTeamId(null);
  };

  // Handle edit form changes
  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle team selection for right sidebar roster
  const handleSelectedTeamChange = (teamId: number | null) => {
    setSelectedTeamForRoster(teamId);
    setSelectedTeamId(teamId);
  };

  // Note: Teams should only expand/retract on user action, not automatically

  // Undo button is always visible when there are picks to undo (no auto-hide)

  // Undo the last draft action
  const handleUndoDraft = async () => {
    if (draftHistory.length === 0 || !isHost) return;

    const lastPick = draftHistory[draftHistory.length - 1];
    const { playerId, teamId, amount } = lastPick;
    
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const updatedTeams = teams.map(team => {
      if (team.id === teamId) {
        return {
          ...team,
          players: team.players.filter(p => p.id !== playerId),
          budget: (lastPick.round || 1) <= draftSettings.auctionRounds ? team.budget + amount : team.budget
        };
      }
      return team;
    });

    const newDraftHistory = draftHistory.slice(0, -1);
    const newLastAction = newDraftHistory.length > 0 ? newDraftHistory[newDraftHistory.length - 1] : null;
    const newRound = lastPick.round || currentRound;
    const newPick = lastPick.pick || currentPick;

    // Determine the new draft mode based on the new round
    const newDraftMode = newRound > draftSettings.auctionRounds ? "snake" : "auction";
    
    // Calculate snake draft order if we're going back to snake mode
    let newSnakeDraftOrder = snakeDraftOrder;
    let newCurrentDraftTeam = currentDraftTeam;
    
    if (newDraftMode === "snake") {
      // Recalculate snake order based on team budgets after undo with random tiebreaker
      const sortedTeams = sortTeamsByBudgetWithTiebreaker(updatedTeams);
      newSnakeDraftOrder = sortedTeams.map(t => t.id);
      
      // Calculate current draft team for snake mode
      const snakeRound = newRound - draftSettings.auctionRounds; // 1-based snake round
      const picksIntoSnakeRound = (newPick - 1) % teams.length; // 0-based within current round
      const isEvenSnakeRound = snakeRound % 2 === 0; // Even snake rounds reverse order
      
      let orderIndex = isEvenSnakeRound ? (newSnakeDraftOrder.length - 1 - picksIntoSnakeRound) : picksIntoSnakeRound;
      orderIndex = ((orderIndex % newSnakeDraftOrder.length) + newSnakeDraftOrder.length) % newSnakeDraftOrder.length;
      newCurrentDraftTeam = newSnakeDraftOrder[orderIndex];
    } else {
      // In auction mode, clear snake order and current draft team
      newSnakeDraftOrder = [];
      newCurrentDraftTeam = null;
    }

    // Log the undo action
    if (player) {
      const undoTeam = teams.find(t => t.id === teamId);
      if (undoTeam) {
        await logger.logUndoPick(
          player,
          undoTeam,
          amount,
          lastPick.round || currentRound,
          lastPick.pick || currentPick,
          teams,
          updatedTeams
        );
      }
    }

    await updateFirebaseState({
      teams: updatedTeams,
      draftedPlayers: draftedPlayers.filter(id => id !== playerId),
      draftHistory: newDraftHistory,
      lastDraftAction: newLastAction,
      currentRound: newRound,
      currentPick: newPick,
      draftMode: newDraftMode,
      snakeDraftOrder: newSnakeDraftOrder,
      currentDraftTeam: newCurrentDraftTeam,
      selectedPlayer: null,
      currentBid: 1,
      currentBidTeam: null
    }, 'undo_pick', {
      playerId,
      teamId,
      amount,
      round: lastPick.round || currentRound,
      pick: lastPick.pick || currentPick
    });
  };

  // Reset all draft picks (host only)
  const handleResetDraft = async () => {
    if (!isHost) return;
    
    const resetTeams = teams.map(team => ({
      ...team,
      players: [],
      budget: draftSettings.auctionBudget
    }));

    const prevState = {
      teams,
      draftHistory,
      draftedPlayers,
      currentRound,
      currentPick,
      draftMode,
      snakeDraftOrder,
      currentDraftTeam
    };

    const newState = {
      teams: resetTeams,
      draftHistory: [],
      draftedPlayers: [],
      lastDraftAction: null,
      currentRound: 1,
      currentPick: 1,
      selectedPlayer: null,
      currentBid: 1,
      currentBidTeam: null,
      isTimerRunning: false,
      timeRemaining: draftSettings.draftTimer,
      draftMode: "auction" as const,
      snakeDraftOrder: [],
      currentDraftTeam: null,
      highlightedTeamIndex: 0,
      highlightDirection: 1
    };

    await logger.logDraftReset(prevState, newState);

    await updateFirebaseState(newState, 'reset_draft', {
      previousPickCount: draftHistory.length,
      previousRound: currentRound,
      previousPick: currentPick
    });
  };

  // Timer controls (host only)
  const startTimer = async () => {
    if (!isHost) return;
    await updateFirebaseState({ isTimerRunning: true }, 'start_timer');
  };

  const pauseTimer = async () => {
    if (!isHost) return;
    await updateFirebaseState({ isTimerRunning: false }, 'pause_timer');
  };



  // Handle draft pick
  const handleDraftPick = async (playerId: number, teamId: number, amount = 0) => {
    if (!isHost) return;
    
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const newLastAction = {
      playerId,
      teamId,
      amount,
      timestamp: new Date()
    };

    const updatedTeams = teams.map(team => {
      if (team.id === teamId) {
        return {
          ...team,
          players: [...team.players, player],
          budget: draftMode === "auction" ? team.budget - amount : team.budget
        };
      }
      return team;
    });

    const newDraftHistory = [
      ...draftHistory,
      {
        playerId,
        teamId,
        amount: draftMode === "auction" ? amount : 0,
        timestamp: new Date(),
        round: currentRound,
        pick: currentPick,
        player,
        team: teams.find(t => t.id === teamId)
      }
    ];

    const newPick = currentPick + 1;
    
    // Calculate new round using the original logic
    let newRound = currentRound;
    if (currentPick % teams.length === 0) {
      newRound = currentRound + 1;
    }

    // Note: Teams should only expand/retract on user action, not automatically when drafting

    // Log the draft pick
    const draftTeam = teams.find(t => t.id === teamId);
    if (draftTeam) {
      await logger.logDraftPick(
        player,
        draftTeam,
        draftMode === "auction" ? amount : 0,
        currentRound,
        currentPick,
        teams,
        updatedTeams
      );
    }

    // Update Firebase state
    await updateFirebaseState({
      teams: updatedTeams,
      draftHistory: newDraftHistory,
      draftedPlayers: [...draftedPlayers, playerId],
      currentRound: newRound,
      currentPick: newPick,
      selectedPlayer: null,
      currentBid: 1,
      currentBidTeam: null,
      timeRemaining: draftSettings.draftTimer,
      isTimerRunning: draftMode === "snake", // Auto-start timer in snake mode
      lastDraftAction: newLastAction
    }, 'draft_pick', {
      playerId,
      playerName: player.name,
      playerPosition: player.position,
      teamId,
      teamName: draftTeam?.name,
      amount: draftMode === "auction" ? amount : 0,
      draftRound: currentRound,
      draftPick: currentPick,
      draftMode
    });

    setShowBidInterface(false);
    
    // Update highlighted team after auction complete
    if (draftMode === "auction") {
      await updateHighlightedTeam();
    }
  };

  // Get player with local values merged in
  const getPlayerWithLocalValues = (playerId: number): Player | null => {
    const localPlayer = players.find(p => p.id === playerId);
    return localPlayer || null;
  };

  // Handle player selection for bidding
  const handlePlayerSelect = async (player: Player) => {
    if (!isHost) return;
    

    
    await logger.logPlayerSelection(player, selectedPlayer);
    
    await updateFirebaseState({
      selectedPlayer: player,
      currentBid: 1,
      currentBidTeam: null,
      timeRemaining: draftSettings.draftTimer,
      isTimerRunning: true
    }, 'select_player', {
      playerId: player.id,
      playerName: player.name,
      playerPosition: player.position,
      previousPlayerId: selectedPlayer && selectedPlayer.id !== undefined ? selectedPlayer.id : null
    });

    setShowBidInterface(true);
    
    if (isMobile) {
      setShowRightSidebar(true);
      setShowLeftSidebar(false);
    }
  };

  // Handle bid submission
  const handleBid = async (teamId: number, bidAmount: number) => {
    if (!isHost || !selectedPlayer) return;
    
    const team = teams.find(t => t.id === teamId);
    if (!team || team.budget < bidAmount) return;
    
    await logger.logBidPlaced(teamId, bidAmount, selectedPlayer);
    
    await updateFirebaseState({
      currentBid: bidAmount,
      currentBidTeam: teamId,
      timeRemaining: draftSettings.draftTimer
    }, 'place_bid', {
      teamId,
      teamName: team.name,
      bidAmount,
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      previousBid: currentBid,
      previousBidTeam: currentBidTeam
    });
  };

  // Handle bid completion
  const handleBidComplete = () => {
    if (!selectedPlayer || !currentBidTeam) return;
    handleDraftPick(selectedPlayer.id, currentBidTeam, currentBid);
  };

  // Handle snake draft pick
  const handleSnakeDraftPick = (playerId: number) => {
    if (currentDraftTeam) {
      handleDraftPick(playerId, currentDraftTeam);
    }
  };

  // Handle settings update
  const handleSettingsUpdate = async (newSettings: DraftSettings) => {
    if (!isHost) return;
    
    let updatedTeams = teams.map(team => ({
      ...team,
      budget: newSettings.auctionBudget
    }));

    if (newSettings.teamCount > updatedTeams.length) {
      for (let i = updatedTeams.length; i < newSettings.teamCount; i++) {
        updatedTeams.push({
          id: i + 1,
          owner: `Owner ${i + 1}`,
          name: `Team ${i + 1}`,
          budget: newSettings.auctionBudget,
          players: [],
          draftPosition: i + 1
        });
      }
    } else if (newSettings.teamCount < updatedTeams.length) {
      updatedTeams = updatedTeams.slice(0, newSettings.teamCount);
    }

    await logger.logSettingsUpdate(draftSettings, newSettings, teams, updatedTeams);

    await updateFirebaseState({
      draftSettings: newSettings,
      teams: updatedTeams
    }, 'settings_update', {
      previousTeamCount: teams.length,
      newTeamCount: updatedTeams.length,
      changedSettings: Object.keys(newSettings).filter(key => 
        draftSettings[key as keyof DraftSettings] !== newSettings[key as keyof DraftSettings]
      )
    });
    
    setShowSettings(false);
  };

  // Filter and sort players
  const filteredPlayers = players
    .filter(player => !draftedPlayers.includes(player.id))
    .filter(player => {
      if (positionFilter === "ALL") return true;
      return player.position === positionFilter;
    })
    .filter(player => {
      if (!searchQuery) return true;
      return player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
             player.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
             player.position.toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === "rank") {
        // Use local rank if available, otherwise use global rank
        const aRank = a.localRank !== undefined ? a.localRank : a.rank;
        const bRank = b.localRank !== undefined ? b.localRank : b.rank;
        comparison = aRank - bRank;
      } else if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === "position") {
        comparison = a.position.localeCompare(b.position);
      } else if (sortBy === "team") {
        comparison = a.team.localeCompare(b.team);
      } else if (sortBy === "projectedPoints") {
        // Use local projected points if available, otherwise use global
        const aPoints = a.localProjectedPoints !== undefined ? a.localProjectedPoints : a.projectedPoints;
        const bPoints = b.localProjectedPoints !== undefined ? b.localProjectedPoints : b.projectedPoints;
        comparison = bPoints - aPoints; // Higher points first (descending)
      } else if (sortBy === "projectedValue") {
        // Use local projected value if available, otherwise use global
        const aValue = a.localProjectedValue !== undefined ? a.localProjectedValue : a.projectedValue;
        const bValue = b.localProjectedValue !== undefined ? b.localProjectedValue : b.projectedValue;
        comparison = bValue - aValue; // Higher value first (descending)
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

  // Group players by position for the position view
  const playersByPosition = Object.keys(positionCategories).reduce((acc, position) => {
    acc[position] = filteredPlayers.filter(player => player.position === position);
    return acc;
  }, {} as Record<string, Player[]>);

  // Sort teams by remaining budget (for snake draft order) with random tiebreaker
  const sortedTeamsByBudget = sortTeamsByBudgetWithTiebreaker(teams);

  // Group roster players by position - Used in Team Rosters tab
  const getPlayersByPosition = (teamPlayers: Player[] = []) => {
    const positionGroups: Record<string, Player[]> = {};
    
    Object.keys(positionCategories).forEach(pos => {
      positionGroups[pos] = (teamPlayers || []).filter(player => player.position === pos);
    });
    
    return positionGroups;
  };

  // Find draft details for a player
  const getPlayerDraftDetails = (playerId: number, teamId: number) => {
    return draftHistory.find(
      history => history.playerId === playerId && history.teamId === teamId
    );
  };

  // Column width style for equal column widths with responsive reduction on mobile
  const columnBaseWidth = isMobile ? 40 : 60;
  const equalColumnStyle = {
    width: `${columnBaseWidth}px`,
    minWidth: `${columnBaseWidth}px`,
    maxWidth: `${columnBaseWidth}px`,
    textAlign: 'center' as const,
    padding: '0'
  };

  // Determine if draft has started (has picks) - used to lock certain settings
  const draftHasStarted = draftHistory.length > 0;

  // Suppress unused variable warnings by referencing them
  void showBidInterface; void getPlayersByPosition; void setRoomId; void snakeDraftOrder; void error; void createRoom;

  return (
    <div className="flex flex-col h-full bg-[#F0F2F5] text-gray-800 font-sans border border-black" style={{boxShadow:'8px 8px 0 #000'}}>
      <FontLoader />
      
      {/* Header */}
      <header 
        className="p-2 md:p-3 text-white relative" 
        style={{ 
          background: `${customColors.headerGradientStart}`,
          borderBottom: '2px solid #000'
        }}
      >
        <div className="relative flex flex-col md:flex-row md:justify-between md:items-center">
          <div className="flex items-center justify-between">
            <h1 
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-[#FCF188]" 
              style={{ 
                fontFamily: monofettFont, 
                textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'
              }}
            >
              {leagueName}
            </h1>
            
            {/* Mobile sidebar toggles */}
            <div className="flex md:hidden space-x-2">
              <button 
                onClick={() => {
                  setShowLeftSidebar(!showLeftSidebar);
                  if (showLeftSidebar) setShowRightSidebar(false);
                }}
                className="bg-black border border-white p-2 text-white"
                style={{ boxShadow: '2px 2px 0 #000' }}
              >
                <Users className="w-5 h-5" />
              </button>
              <button 
                onClick={() => {
                  setShowRightSidebar(!showRightSidebar);
                  if (showRightSidebar) setShowLeftSidebar(false);
                }}
                className="bg-black border border-white p-2 text-white"
                style={{ boxShadow: '2px 2px 0 #000' }}
              >
                <DollarSign className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Status indicators - made more retro with pixel-like styling */}
          <div className="flex flex-wrap items-center justify-between md:justify-end mt-2 md:mt-0 space-x-2 md:space-x-3 px-2">
            {/* Timer in digital display style */}
            <div className="bg-black border-2 border-white px-2 py-1 flex items-center">
              <Clock className="w-3 h-3 md:w-4 md:h-4 mr-1 text-white" />
              <span className="font-mono text-sm text-green-400">
                {Math.floor(timeRemaining / 60).toString().padStart(2, '0')}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </span>
            </div>
            
            {/* Round indicator */}
            <div className="bg-black border-2 border-white px-2 py-1 flex items-center">
              <span className="font-mono text-sm text-[#FF70A6]">R{currentRound}</span>
            </div>
            
            {/* Pick indicator */}
            <div className="bg-black border-2 border-white px-2 py-1 flex items-center">
              <span className="font-mono text-sm text-[#FCF188]">P{currentPick}</span>
            </div>
            
            {/* Draft mode indicator */}
            <div className="bg-black border-2 border-white px-2 py-1 flex items-center">
              <span className="font-mono text-sm text-[#8ED4D3]">{draftMode === "auction" ? "Auc" : "Snake"}</span>
            </div>

            {/* Connection status */}
            <div className={`border-2 border-white px-2 py-1 flex items-center ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
              <span className="font-mono text-sm text-white">
                {isConnected ? (isHost ? "HOST" : "VIEW") : "OFFLINE"}
              </span>
            </div>
            
            {/* Settings button */}
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className="bg-[#EF416E] p-1.5 md:p-2 border-2 border-black hover:bg-[#E4738E]"
              style={{ boxShadow: '2px 2px 0 #000' }}
            >
              <Settings className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div 
            className="bg-white p-4 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto border-4 border-black"
            style={{ boxShadow: '5px 5px 0 #000' }}
          >
            <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-2">
              <h2 className="text-xl font-bold text-black">Draft Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-black hover:text-[#EF416E]">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Draft Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b-2 border-black pb-2">Draft Settings</h3>
                
                {/* Room ID Display */}
                <div className="bg-gray-50 border-2 border-black p-3">
                  <label className="block text-sm font-medium text-black mb-1">
                    Room ID
                  </label>
                  <div className="text-sm text-gray-700 font-mono bg-white border border-gray-300 px-2 py-1 rounded">
                    {roomId}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Share this URL with others: {window.location.origin}{window.location.pathname}?roomid={roomId}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    League Name
                  </label>
                  <input 
                    type="text" 
                    value={leagueName}
                    onChange={(e) => updateLeagueName(e.target.value)}
                    disabled={!isHost}
                    className={`w-full px-3 py-2 bg-white border-2 border-black text-black ${!isHost ? 'opacity-50' : ''}`}
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Auction Budget
                  </label>
                  <input 
                    type="number" 
                    value={draftSettings.auctionBudget}
                    onChange={(e) => !draftHasStarted && updateDraftSetting('auctionBudget', parseInt(e.target.value))}
                    disabled={!isHost || draftHasStarted}
                    className={`w-full px-3 py-2 bg-white border-2 border-black text-black ${(!isHost || draftHasStarted) ? 'opacity-50' : ''}`}
                    min="1"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                  {draftHasStarted && (
                    <div className="text-xs text-gray-500 mt-1">
                      Cannot change after draft has started
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Roster Size
                  </label>
                  <input 
                    type="number" 
                    value={draftSettings.rosterSize}
                    onChange={(e) => !draftHasStarted && updateDraftSetting('rosterSize', parseInt(e.target.value))}
                    disabled={!isHost || draftHasStarted}
                    className={`w-full px-3 py-2 bg-white border-2 border-black text-black ${(!isHost || draftHasStarted) ? 'opacity-50' : ''}`}
                    min="1"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                  {draftHasStarted && (
                    <div className="text-xs text-gray-500 mt-1">
                      Cannot change after draft has started
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Auction Rounds
                  </label>
                  <input 
                    type="number" 
                    value={draftSettings.auctionRounds}
                    onChange={(e) => !draftHasStarted && updateDraftSetting('auctionRounds', parseInt(e.target.value))}
                    disabled={!isHost || draftHasStarted}
                    className={`w-full px-3 py-2 bg-white border-2 border-black text-black ${(!isHost || draftHasStarted) ? 'opacity-50' : ''}`}
                    min="0"
                    max={draftSettings.rosterSize}
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                  {draftHasStarted && (
                    <div className="text-xs text-gray-500 mt-1">
                      Cannot change after draft has started
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Number of Teams
                  </label>
                  <input
                    type="number"
                    value={draftSettings.teamCount}
                    onChange={(e) => !draftHasStarted && updateDraftSetting('teamCount', Math.max(2, parseInt(e.target.value)))}
                    disabled={!isHost || draftHasStarted}
                    className={`w-full px-3 py-2 bg-white border-2 border-black text-black ${(!isHost || draftHasStarted) ? 'opacity-50' : ''}`}
                    min="2"
                    max="20"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                  {draftHasStarted && (
                    <div className="text-xs text-gray-500 mt-1">
                      Cannot change after draft has started
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Draft Timer (seconds)
                  </label>
                  <input 
                    type="number" 
                    value={draftSettings.draftTimer}
                    onChange={(e) => updateDraftSetting('draftTimer', parseInt(e.target.value))}
                    disabled={!isHost}
                    className={`w-full px-3 py-2 bg-white border-2 border-black text-black ${!isHost ? 'opacity-50' : ''}`}
                    min="10"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                </div>
              </div>
              
              {/* Personal Settings Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b-2 border-black pb-2">Personal Settings</h3>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    My Team for Roster Display
                  </label>
                  <div className="text-xs text-gray-600 mb-2">
                    Select your team to persistently show your roster in the right sidebar. This helps you keep track of your own picks throughout the draft.
                  </div>
                  <select
                    value={selectedTeamForRoster || ""}
                    onChange={(e) => handleSelectedTeamChange(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 bg-white border-2 border-black text-black"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  >
                    <option value="">No team selected</option>
                    {teams.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.owner} - {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Player Data Import Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b-2 border-black pb-2">Player Data</h3>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Import Player Rankings
                  </label>
                  <div className="text-xs text-gray-600 mb-2">
                    Upload a CSV file with your personal player values. The CSV must include these column headers: RANK, POSITION, PLAYER, TEAM, BYE, AUC $, and PROJ. PTS. 
                    Your values will appear in parentheses next to the host's values. Player names, teams, and positions must match the host data exactly.
                  </div>
                  <div className="flex items-center justify-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                      id="csv-upload"
                      disabled={isProcessingFile}
                    />
                    <label 
                      htmlFor="csv-upload"
                      className={`flex items-center justify-center px-4 py-2 border-2 border-black bg-white text-black cursor-pointer ${isProcessingFile ? 'opacity-50 cursor-not-allowed' : ''}`}
                      style={{ boxShadow: '2px 2px 0 #000' }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {isProcessingFile ? 'Processing...' : 'Upload CSV'}
                    </label>
                  </div>
                  
                  {csvUploadStatus.status !== 'idle' && (
                    <div className={`mt-2 text-sm ${csvUploadStatus.status === 'success' ? 'text-green-600' : 'text-[#EF416E]'} flex items-center border border-black p-2`}>
                      {csvUploadStatus.status === 'success' ? (
                        <Check className="h-4 w-4 mr-1" />
                      ) : (
                        <AlertCircle className="h-4 w-4 mr-1" />
                      )}
                      {csvUploadStatus.message}
                    </div>
                  )}

                  <div className="mt-4 text-xs text-gray-600">
                    <p className="font-medium mb-1">CSV Format Example:</p>
                    <pre className="bg-white border-2 border-black p-2 overflow-x-auto text-[10px] sm:text-xs">
                      RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS<br/>
                      1,WR,Ja'Marr Chase,CIN,10,57,351.75<br/>
                      2,RB,Bijan Robinson,ATL,5,56,317.44<br/>
                      3,WR,Justin Jefferson,MIN,6,55,311.52
                    </pre>
                  </div>
                </div>
              </div>

              {/* Host-only: Global Player List Override */}
              {isHost && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium border-b-2 border-black pb-2">Host Controls</h3>
                  <div>
                    <label className="block text-sm font-medium text-black mb-2">
                      Override Global Player List
                    </label>
                    <div className="text-xs text-gray-600 mb-2">
                      Upload a CSV file to replace the entire player list for all participants. This will override the default player rankings for everyone in the draft room.
                    </div>
                    <div className="flex items-center justify-center">
                      <input
                        ref={hostFileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleHostCsvUpload}
                        className="hidden"
                        id="host-csv-upload"
                        disabled={isProcessingHostFile}
                      />
                      <label 
                        htmlFor="host-csv-upload"
                        className={`flex items-center justify-center px-4 py-2 border-2 border-black bg-[#FFD700] text-black cursor-pointer ${isProcessingHostFile ? 'opacity-50 cursor-not-allowed' : ''}`}
                        style={{ boxShadow: '2px 2px 0 #000' }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {isProcessingHostFile ? 'Processing...' : 'Override Player List'}
                      </label>
                    </div>
                    
                    {hostCsvUploadStatus.status !== 'idle' && (
                      <div className={`mt-2 text-sm ${hostCsvUploadStatus.status === 'success' ? 'text-green-600' : 'text-[#EF416E]'} flex items-center border border-black p-2`}>
                        {hostCsvUploadStatus.status === 'success' ? (
                          <Check className="h-4 w-4 mr-1" />
                        ) : (
                          <AlertCircle className="h-4 w-4 mr-1" />
                        )}
                        {hostCsvUploadStatus.message}
                      </div>
                    )}

                    <div className="mt-2 text-xs text-gray-600">
                      <p className="font-medium text-orange-600">⚠️ Warning: This will replace the entire player list for all participants in the draft room.</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Team Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b-2 border-black pb-2">Team Information</h3>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-xs text-gray-600">Click on a team name to edit</div>
                  </div>
                  <div className="border-2 border-black mx-2 sm:mx-4">
                    {teams.map((team, index) => (
                      <div key={team.id} className="border-b border-black last:border-b-0">
                        {editingTeamId === team.id ? (
                          <div className="p-3 bg-gray-100">
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className="block text-xs font-medium text-black mb-1">
                                  Owner Name
                                </label>
                                <input
                                  type="text"
                                  name="owner"
                                  value={editFormData.owner}
                                  onChange={handleEditFormChange}
                                  className="w-full px-2 py-1 text-sm bg-white border-2 border-black text-black"
                                  style={{ boxShadow: '1px 1px 0 #000' }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-black mb-1">
                                  Team Name
                                </label>
                                <input
                                  type="text"
                                  name="name"
                                  value={editFormData.name}
                                  onChange={handleEditFormChange}
                                  className="w-full px-2 py-1 text-sm bg-white border-2 border-black text-black"
                                  style={{ boxShadow: '1px 1px 0 #000' }}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end space-x-2 mt-2">
                              <button
                                onClick={() => setEditingTeamId(null)}
                                className="px-2 py-1 text-xs text-white bg-gray-700 border-2 border-black"
                                style={{ boxShadow: '1px 1px 0 #000' }}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSaveTeam}
                                className="px-2 py-1 text-xs text-white bg-black border-2 border-black flex items-center"
                                style={{ boxShadow: '1px 1px 0 #000' }}
                              >
                                <Save className="w-3 h-3 mr-1" />
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between px-3 py-2 hover:bg-gray-100">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="font-bold text-[#EF416E]" style={{fontFamily: dmMonoFont}}>{index + 1}. {team.owner}</div>
                                <button
                                  onClick={() => handleEditTeam(team)}
                                  className="p-1 text-black hover:text-gray-700 border border-black"
                                  title="Edit team info"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="text-sm text-gray-600">{team.name}</div>
                            </div>
                            <div className="flex space-x-1">
                              <button 
                                disabled={index === 0 || !isHost}
                                onClick={async () => {
                                  if (!isHost) return;
                                  const newTeams = [...teams];
                                  [newTeams[index], newTeams[index - 1]] = [newTeams[index - 1], newTeams[index]];
                                  await logger.logTeamReorder(teams, newTeams);
                                  await updateFirebaseState({ teams: newTeams }, 'reorder_teams', {
                                    direction: 'up',
                                    teamId: teams[index].id,
                                    fromIndex: index,
                                    toIndex: index - 1
                                  });
                                }}
                                className={`text-black hover:text-gray-700 disabled:opacity-30 border border-black px-1 ${!isHost ? 'cursor-not-allowed' : ''}`}
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button 
                                disabled={index === teams.length - 1 || !isHost}
                                onClick={async () => {
                                  if (!isHost) return;
                                  const newTeams = [...teams];
                                  [newTeams[index], newTeams[index + 1]] = [newTeams[index + 1], newTeams[index]];
                                  await logger.logTeamReorder(teams, newTeams);
                                  await updateFirebaseState({ teams: newTeams }, 'reorder_teams', {
                                    direction: 'down',
                                    teamId: teams[index].id,
                                    fromIndex: index,
                                    toIndex: index + 1
                                  });
                                }}
                                className={`text-black hover:text-gray-700 disabled:opacity-30 border border-black px-1 ${!isHost ? 'cursor-not-allowed' : ''}`}
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Help Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b-2 border-black pb-2">Help</h3>
                <div>
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      setShowWelcomePopup(true);
                    }}
                    className="w-full flex items-center justify-center px-4 py-3 bg-[#04AEC5] text-white border-2 border-black hover:bg-[#8ED4D3]"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Show Welcome Instructions
                  </button>
                  <div className="text-xs text-gray-600 mt-2 text-center">
                    View role-specific instructions for {isHost ? 'hosting' : 'viewing'} a draft
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-2">
                <button 
                  onClick={handleResetDraft}
                  disabled={!isHost || draftHistory.length === 0}
                  className={`px-4 py-2 border-2 border-red-600 text-red-600 bg-white hover:bg-red-50 ${(!isHost || draftHistory.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={{ boxShadow: '2px 2px 0 #dc2626' }}
                >
                  Reset Draft
                </button>
                <div className="flex space-x-3">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="px-4 py-2 border-2 border-black text-black bg-white"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleSettingsUpdate(draftSettings)}
                    className="px-4 py-2 bg-black text-white border-2 border-black"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar - Teams */}
        <div 
          className={`${showLeftSidebar ? 'block' : 'hidden'} 
                     absolute md:static top-0 left-0 z-30 
                     w-full sm:w-3/4 md:w-64 lg:w-72 h-full 
                     bg-white overflow-y-auto 
                     border-r-2 border-black
                     transition-all duration-300 ease-in-out`}
        >
          <div className="flex justify-between items-center p-2 bg-[#1A202E] text-white border-b-2 border-black">
            <h2 className="font-normal text-lg flex items-center text-[18px] font-[Geist_Mono] mx-[10px] my-[0px]">
              <Users className="w-4 h-4 mr-2" />
              Teams
            </h2>
            {isMobile && (
              <button 
                onClick={() => setShowLeftSidebar(false)} 
                className="text-white border border-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          
          <div className="divide-y-2 divide-black">
            {teams.map((team, index) => (
              <div 
                key={team.id} 
                className={`${
                  (draftMode === "auction" && index === highlightedTeamIndex) 
                    ? 'bg-[#FCF188]' 
                    : (draftMode === "snake" && currentDraftTeam === team.id)
                      ? 'bg-[#FCF188]'
                      : 'bg-white'
                } last:border-b-2 last:border-black`}
              >
                <div 
                  className="p-2 cursor-pointer hover:bg-gray-100 border-b border-gray-300 px-[8px] py-[15px] px-[8px] py-[12px]"
                  onClick={() => toggleTeamExpand(team.id)}
                >
                  <div className="flex justify-between items-center">
                    <div className="font-bold flex items-center text-[#EF416E] bg-[rgba(239,65,110,0)]" style={{fontFamily: dmMonoFont}}>
                      <span className="mr-[15px] border border-black p-0.5 mt-[0px] mb-[0px] ml-[0px] text-[16px] text-black bg-[#FCF188]">
                        {expandedTeams[team.id] ? 
                          <ChevronDown className="w-3 h-3" /> : 
                          <ChevronRight className="w-3 h-3" />
                        }
                      </span>
                      {team.owner}
                    </div>
                    <div className="text-xs text-[#04AEC5] truncate max-w-[8rem] text-right border border-black p-0.5 mx-[5px] my-[0px] px-[10px] py-[2px] font-bold px-[20px] py-[2px]">${team.budget}</div>
                  </div>
                  <div className="flex justify-between mt-1 text-sm">
                    <div className="text-black font-normal text-[11px] not-italic mt-[0px] mr-[0px] mb-[0px] ml-[33px]">{team.name}</div>
                    <div className="text-black text-xs border border-black p-0.5 px-[7px] py-[2px] mx-[5px] my-[0px]">P: {team.players?.length || 0}</div>
                  </div>
                  {draftMode === "snake" && (
                    <div className="text-xs text-black mt-1 border border-black p-0.5 inline-block">
                      Snake: #{sortedTeamsByBudget.findIndex(t => t.id === team.id) + 1}
                    </div>
                  )}
                </div>
                
                {/* Team Roster */}
                {expandedTeams[team.id] && (
                  <div className={`px-2 pb-2 border-b-2 border-black ${((draftMode === "auction" && index === highlightedTeamIndex) || (draftMode === "snake" && currentDraftTeam === team.id)) ? 'bg-[#FCF188]' : 'bg-white'}`}>
                    {(() => {
                      const rosterSlots = assignPlayersToRosterSlots(team.players || [], draftSettings.rosterSize);
                      return (
                        <div className="overflow-x-auto border border-gray-500 mt-2" style={{ backgroundColor: 'rgba(255,255,255,0.85)' }}>
                          <table className="min-w-full border-collapse">
                            <thead className="bg-gray-100 border-b border-gray-500">
                              <tr>
                                <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-gray-500 opacity-70">Slot</th>
                                <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-gray-500 opacity-70">Player</th>
                                <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider opacity-70">
                                  {draftMode === "auction" ? "Price" : "Round"}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {rosterSlots.map((slot, slotIdx) => {
                                const draftDetails = slot.player ? getPlayerDraftDetails(slot.player.id, team.id) : null;
                                const isStartingSlot = slot.position !== 'BEN';
                                return (
                                  <tr key={slot.id} className={`${slotIdx % 2 === 0 ? 'bg-white' : 'bg-[#E8F9FB]'} border-b border-gray-500 last:border-b-0`}>
                                    <td className={`px-2 py-1 whitespace-nowrap text-[10px] border-r border-gray-500 text-center ${isStartingSlot ? 'bg-gray-50 font-bold' : ''}`}>
                                      <span className={`px-1 py-0.5 rounded text-[9px] ${isStartingSlot ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                                        {slot.label}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1 whitespace-nowrap text-[10px] text-black border-r border-gray-500">
                                      {slot.player ? (
                                        <div className="flex items-center space-x-1">
                                          <span className="font-medium">{slot.player.name}</span>
                                          <PositionBadge pos={slot.player.position} />
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 italic text-[9px]">Empty</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1 whitespace-nowrap text-[10px] font-medium">
                                      {draftDetails ? (
                                        draftMode === "auction" ? (
                                          <span className="text-[#EF416E]">${draftDetails.amount}</span>
                                        ) : (
                                          <span className="text-[#04AEC5]">R{draftDetails.round}</span>
                                        )
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className={`flex-1 flex flex-col overflow-hidden bg-white ${showLeftSidebar && isMobile ? 'hidden' : 'block'} ${showRightSidebar && isMobile ? 'hidden' : 'block'}`}>
          {/* Tabs */}
          <div className="bg-[#1A202E] text-white border-b-2 border-black">
            <div className="flex overflow-x-auto">
              <button 
                onClick={() => setActiveTab("players")}
                className={`px-3 sm:px-4 py-2 sm:py-3 font-medium text-xs sm:text-sm whitespace-nowrap border-r-2 border-black ${activeTab === "players" ? 'bg-black text-[#05DF72] underline decoration-[#05DF72] underline-offset-4' : 'text-gray-300 hover:bg-gray-800'}`}
              >
                Available Players
              </button>
              <button 
                onClick={() => setActiveTab("positions")}
                className={`px-3 sm:px-4 py-2 sm:py-3 font-medium text-xs sm:text-sm whitespace-nowrap border-r-2 border-black ${activeTab === "positions" ? 'bg-black text-[#05DF72] underline decoration-[#05DF72] underline-offset-4' : 'text-gray-300 hover:bg-gray-800'}`}
              >
                By Position
              </button>
              <button 
                onClick={() => setActiveTab("draft")}
                className={`px-3 sm:px-4 py-2 sm:py-3 font-medium text-xs sm:text-sm whitespace-nowrap border-r-2 border-black ${activeTab === "draft" ? 'bg-black text-[#05DF72] underline decoration-[#05DF72] underline-offset-4' : 'text-gray-300 hover:bg-gray-800'}`}
              >
                Draft Board
              </button>
              <button 
                onClick={() => setActiveTab("rosters")}
                className={`px-3 sm:px-4 py-2 sm:py-3 font-medium text-xs sm:text-sm whitespace-nowrap ${activeTab === "rosters" ? 'bg-black text-[#05DF72] underline decoration-[#05DF72] underline-offset-4' : 'text-gray-300 hover:bg-gray-800'}`}
              >
                Team Rosters
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          {(activeTab === "players" || activeTab === "positions") && (
            <div className="bg-white p-2 sm:p-3 border-b-2 border-black flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-800 w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="Search players..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-white border-2 border-black w-full text-black"
                  style={{ boxShadow: '2px 2px 0 #000' }}
                />
              </div>
              <select 
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="bg-white border-2 border-black px-3 py-2 text-black w-full sm:w-auto appearance-none"
                style={{ boxShadow: '2px 2px 0 #000' }}
              >
                <option value="ALL">All Positions</option>
                {Object.keys(positionCategories).map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto bg-white p-0">
            {activeTab === "players" && (
              <div className="border-2 border-black m-1 md:m-2">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-gray-200 border-b-2 border-black">
                      <tr>
                        <th className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs font-medium text-black uppercase border-r border-black cursor-pointer"
                            onClick={() => {
                              setSortBy("rank");
                              setSortDirection(sortBy === "rank" && sortDirection === "asc" ? "desc" : "asc");
                            }}>
                          Rank {sortBy === "rank" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs font-medium text-black uppercase border-r border-black">Pos</th>
                        <th className="px-2 sm:px-3 py-1 sm:py-2 text-left text-xs font-medium text-black uppercase border-r border-black cursor-pointer"
                            onClick={() => {
                              setSortBy("name");
                              setSortDirection(sortBy === "name" && sortDirection === "asc" ? "desc" : "asc");
                            }}>
                          Player {sortBy === "name" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs font-medium text-black uppercase border-r border-black hidden sm:table-cell">Team</th>
                        <th className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs font-medium text-black uppercase border-r border-black cursor-pointer"
                            onClick={() => {
                              setSortBy("projectedValue");
                              setSortDirection(sortBy === "projectedValue" && sortDirection === "asc" ? "desc" : "asc");
                            }}>
                          Auc $ {sortBy === "projectedValue" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs font-medium text-black uppercase border-r border-black hidden sm:table-cell cursor-pointer"
                            onClick={() => {
                              setSortBy("projectedPoints");
                              setSortDirection(sortBy === "projectedPoints" && sortDirection === "asc" ? "desc" : "asc");
                            }}>
                          Proj. Pts {sortBy === "projectedPoints" && (sortDirection === "asc" ? "↑" : "↓")}
                        </th>
                        <th className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs font-medium text-black uppercase">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.slice(0, 50).map((player, idx) => (
                        <tr key={player.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#E8F9FB]'} hover:bg-[#FFE5F0] border-b border-black`}>
                          <td className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs text-black border-r border-black">
                            {player.rank}
                            {player.localRank !== undefined && player.localRank !== player.rank && (
                              <span className="text-gray-500"> ({player.localRank})</span>
                            )}

                          </td>
                          <td className="px-2 sm:px-3 py-1 sm:py-2 text-center border-r border-black">
                            <PositionBadge pos={player.position} />
                          </td>
                          <td className="px-2 sm:px-3 py-1 sm:py-2 border-r border-black">
                            <div className="font-medium text-xs sm:text-sm text-black">{player.name}</div>
                            <div className="text-xs text-gray-500 sm:hidden">{player.team}</div>
                          </td>
                          <td className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs text-black border-r border-black hidden sm:table-cell">
                            {player.team}
                          </td>
                          <td className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs text-[#EF416E] font-medium border-r border-black">
                            ${player.projectedValue}
                            {player.localProjectedValue !== undefined && player.localProjectedValue !== player.projectedValue && (
                              <span className="text-gray-500"> (${player.localProjectedValue})</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs text-[#04AEC5] font-medium border-r border-black hidden sm:table-cell">
                            {player.projectedPoints.toFixed(1)}
                            {player.localProjectedPoints !== undefined && player.localProjectedPoints !== player.projectedPoints && (
                              <span className="text-gray-500"> ({player.localProjectedPoints.toFixed(1)})</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-3 py-1 sm:py-2 text-center">
                            {draftMode === "auction" ? (
                              <button
                                onClick={() => handlePlayerSelect(player)}
                                className="text-white bg-[#EF416E] hover:bg-[#E4738E] px-4 sm:px-5 py-1 text-xs border-2 border-black min-w-[60px]"
                                style={{ boxShadow: '2px 2px 0 #000' }}
                              >
                                Bid
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSnakeDraftPick(player.id)}
                                disabled={currentDraftTeam === null}
                                className="text-white bg-[#04AEC5] hover:bg-[#8ED4D3] px-2 sm:px-3 py-1 text-xs border-2 border-black disabled:opacity-50"
                                style={{ boxShadow: '2px 2px 0 #000' }}
                              >
                                Draft
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-2 text-center text-sm text-gray-600 border-t border-black">
                  Showing {Math.min(50, filteredPlayers.length)} of {filteredPlayers.length} players
                </div>
              </div>
            )}

            {activeTab === "positions" && (
              <div className="space-y-4 p-2">
                {Object.keys(positionCategories).map(position => (
                  <div key={position} className="border-2 border-black">
                    <div className="bg-gray-200 px-4 sm:px-6 py-2 sm:py-3 border-b-2 border-black flex items-center justify-between">
                      <h3 className="text-base sm:text-lg font-bold text-[rgba(1,119,134,1)] font-[Geist_Mono] text-[16px] underline">{positionCategories[position]}</h3>
                      <PositionBadge pos={position} />
                    </div>
                    {playersByPosition[position] && playersByPosition[position].length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead className="bg-gray-100 border-b border-black">
                            <tr>
                              <th className="px-3 sm:px-6 py-1 sm:py-2 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-black" style={equalColumnStyle}>
                                <span className="hidden sm:inline">Rank</span>
                                <span className="sm:hidden">#</span>
                              </th>
                              <th className="px-3 sm:px-6 py-1 sm:py-2 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                Pos
                              </th>
                              <th className="px-3 sm:px-6 py-1 sm:py-2 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black">
                                Player
                              </th>
                              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                Team
                              </th>
                              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-black uppercase tracking-wider border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                Bye
                              </th>
                              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black" style={equalColumnStyle}>
                                <span className="hidden sm:inline">Auc $</span>
                                <span className="sm:hidden">$</span>
                              </th>
                              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                Proj
                              </th>
                              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-black uppercase tracking-wider">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {playersByPosition[position].map((player, idx) => (
                              <tr key={player.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#E8F9FB]'} border-b border-black last:border-b-0`}>
                                <td className="px-3 sm:px-6 py-1 sm:py-2 whitespace-nowrap text-[11px] sm:text-xs text-black border-r border-black" style={equalColumnStyle}>
                                  {player.rank}
                                  {player.localRank !== undefined && player.localRank !== player.rank && (
                                    <span className="text-gray-500"> ({player.localRank})</span>
                                  )}
                                </td>
                                <td className="px-3 sm:px-6 py-1 sm:py-2 whitespace-nowrap border-r border-black hidden sm:table-cell text-center" style={equalColumnStyle}>
                                  <PositionBadge pos={player.position} />
                                </td>
                                <td className="px-3 sm:px-6 py-1 sm:py-2 whitespace-nowrap border-r border-black">
                                  <div className="font-medium text-xs sm:text-sm text-black">{player.name}</div>
                                  <div className="text-xs text-gray-500 sm:hidden">{player.team}</div>
                                </td>
                                <td className="px-3 sm:px-6 py-1 sm:py-2 whitespace-nowrap text-[11px] sm:text-xs text-black border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                  {player.team}
                                </td>
                                <td className="px-3 sm:px-6 py-1 sm:py-2 whitespace-nowrap text-[11px] sm:text-xs text-black border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                  {player.bye}
                                </td>
                                <td className="px-3 sm:px-6 py-1 sm:py-2 whitespace-nowrap text-[11px] sm:text-xs text-[#EF416E] font-medium border-r border-black" style={equalColumnStyle}>
                                  ${player.projectedValue}
                                  {player.localProjectedValue !== undefined && player.localProjectedValue !== player.projectedValue && (
                                    <span className="text-gray-500"> (${player.localProjectedValue})</span>
                                  )}
                                </td>
                                <td className="px-3 sm:px-6 py-1 sm:py-2 whitespace-nowrap text-[11px] sm:text-xs text-[#04AEC5] font-medium border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                  {player.projectedPoints.toFixed(1)}
                                  {player.localProjectedPoints !== undefined && player.localProjectedPoints !== player.projectedPoints && (
                                    <span className="text-gray-500"> ({player.localProjectedPoints.toFixed(1)})</span>
                                  )}
                                </td>
                                <td className="px-3 sm:px-6 py-1 sm:py-2 whitespace-nowrap text-center">
                                  {draftMode === "auction" ? (
                                    <button
                                      onClick={() => handlePlayerSelect(player)}
                                      className="text-white bg-[#EF416E] hover:bg-[#E4738E] px-4 sm:px-5 py-1 text-xs border-2 border-black min-w-[60px]"
                                      style={{ boxShadow: '1px 1px 0 #000' }}
                                    >
                                      Bid
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleSnakeDraftPick(player.id)}
                                      disabled={currentDraftTeam === null}
                                      className="text-white bg-[#04AEC5] hover:bg-[#8ED4D3] px-2 sm:px-3 py-1 text-xs border-2 border-black disabled:opacity-50"
                                      style={{ boxShadow: '1px 1px 0 #000' }}
                                    >
                                      Draft
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-4 sm:p-6 text-center text-black border-t border-black">
                        No available players in this position
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === "draft" && (
              <div className="border-2 border-black m-1 md:m-2">
                <div className="bg-gray-200 px-4 sm:px-6 py-2 sm:py-3 border-b-2 border-black">
                  <h3 className="text-base sm:text-lg font-bold text-black">Draft History</h3>
                </div>
                {draftHistory.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead className="bg-gray-100 border-b border-black">
                        <tr>
                          <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black" style={equalColumnStyle}>
                            <span className="hidden sm:inline">Round</span>
                            <span className="sm:hidden">R</span>
                          </th>
                          <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black" style={equalColumnStyle}>
                            <span className="hidden sm:inline">Pick</span>
                            <span className="sm:hidden">P</span>
                          </th>
                          <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black">
                            Team
                          </th>
                          <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black">
                            Player
                          </th>
                          <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                            Position
                          </th>
                          <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-black uppercase tracking-wider" style={equalColumnStyle}>
                            <span className="hidden sm:inline">Amount</span>
                            <span className="sm:hidden">$</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftHistory.map((pick, index) => (
                          <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-[#E8F9FB]'} border-b border-black last:border-b-0`}>
                            <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-black border-r border-black" style={equalColumnStyle}>
                              {pick.round}
                            </td>
                            <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-black border-r border-black" style={equalColumnStyle}>
                              {pick.pick}
                            </td>
                            <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap border-r border-black">
                              <div className="font-medium text-[10px] sm:text-xs text-[rgba(0,0,0,0.5)] truncate max-w-[80px] sm:max-w-full">
                                {pick.team?.name || 'Unknown Team'}
                              </div>
                              <div className="text-base font-bold text-[#EF416E]" style={{fontFamily: dmMonoFont}}>{pick.team?.owner || 'Unknown Owner'}</div>
                            </td>
                            <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap font-medium text-xs sm:text-sm text-black border-r border-black">
                              {pick.player?.name || 'Unknown Player'}
                              <div className="sm:hidden">
                                <PositionBadge pos={pick.player?.position || 'QB'} />
                              </div>
                            </td>
                            <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap border-r border-black hidden sm:table-cell text-center" style={equalColumnStyle}>
                              <PositionBadge pos={pick.player?.position || 'QB'} />
                            </td>
                            <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-[#EF416E] font-medium" style={equalColumnStyle}>
                              {pick.amount > 0 ? `$${pick.amount}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 sm:p-6 text-center text-black border-t border-black">
                    No draft picks yet
                  </div>
                )}
              </div>
            )}

            {/* Team Rosters Tab */}
            {activeTab === "rosters" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-2 border-black m-1 md:m-2">
                {teams.map((team, idx) => (
                  <div key={team.id} className={`
                    border-b-2 border-black 
                    ${idx % 2 === 0 ? 'md:border-r-2 md:border-black' : ''}
                    ${idx >= teams.length - (teams.length % 2 || 2) ? 'md:border-b-0' : ''}
                  `}>
                    <div className="bg-gray-200 px-4 sm:px-6 py-2 sm:py-3 border-b border-black flex flex-col sm:flex-row sm:justify-between sm:items-center">
                      <h3 className="text-lg sm:text-xl font-bold text-[#EF416E] truncate" style={{fontFamily: dmMonoFont}}>{team.owner}</h3>
                      <div className="text-xs sm:text-sm text-[rgba(0,188,94,1)] font-bold mt-1 sm:mt-0 truncate">
                        {team.name}
                      </div>
                    </div>
                    <div className="p-3 sm:p-4">
                      <div className="flex justify-between mb-3">
                        <div className="text-xs sm:text-sm text-black font-medium border border-black px-2 py-0.5">
                          Budget: ${team.budget}
                        </div>
                        <div className="text-xs sm:text-sm text-black font-medium border border-black px-2 py-0.5">
                          Players: {team.players.length}/{draftSettings.rosterSize}
                        </div>
                      </div>
                      {(() => {
                        const rosterSlots = assignPlayersToRosterSlots(team.players, draftSettings.rosterSize);
                        return (
                          <div className="overflow-x-auto border border-black">
                            <table className="min-w-full border-collapse">
                              <thead className="bg-gray-100 border-b border-black">
                                <tr>
                                  <th className="px-2 sm:px-4 py-1 sm:py-2 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black" style={equalColumnStyle}>
                                    Slot
                                  </th>
                                  <th className="px-2 sm:px-4 py-1 sm:py-2 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black">
                                    Player
                                  </th>
                                  <th className="px-2 sm:px-4 py-1 sm:py-2 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                    Team
                                  </th>
                                  <th className="px-2 sm:px-4 py-1 sm:py-2 text-left text-xs font-medium text-black uppercase tracking-wider" style={equalColumnStyle}>
                                    {draftMode === "auction" ? "Price" : "Round"}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {rosterSlots.map((slot, slotIdx) => {
                                  const draftDetails = slot.player ? getPlayerDraftDetails(slot.player.id, team.id) : null;
                                  const isStartingSlot = slot.position !== 'BEN';
                                  return (
                                    <tr key={slot.id} className={`${slotIdx % 2 === 0 ? 'bg-white' : 'bg-[#FFE5F0]'} border-b border-black last:border-b-0 ${isStartingSlot ? 'font-medium' : ''}`}>
                                      <td className={`px-2 sm:px-4 py-1 sm:py-2 whitespace-nowrap text-xs sm:text-sm border-r border-black text-center ${isStartingSlot ? 'bg-gray-50 font-bold' : ''}`} style={equalColumnStyle}>
                                        <span className={`px-1 py-0.5 rounded text-xs ${isStartingSlot ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                                          {slot.label}
                                        </span>
                                      </td>
                                      <td className="px-2 sm:px-4 py-1 sm:py-2 whitespace-nowrap text-xs sm:text-sm text-black border-r border-black">
                                        {slot.player ? (
                                          <div className="flex items-center space-x-2">
                                            <span className="font-medium">{slot.player.name}</span>
                                            <PositionBadge pos={slot.player.position} />
                                          </div>
                                        ) : (
                                          <span className="text-gray-400 italic">Empty</span>
                                        )}
                                      </td>
                                      <td className="px-2 sm:px-4 py-1 sm:py-2 whitespace-nowrap text-xs sm:text-sm text-black border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                        {slot.player?.team || '-'}
                                      </td>
                                      <td className="px-2 sm:px-4 py-1 sm:py-2 whitespace-nowrap text-xs sm:text-sm font-medium" style={equalColumnStyle}>
                                        {draftDetails ? (
                                          draftMode === "auction" ? (
                                            <span className="text-[#EF416E]">${draftDetails.amount}</span>
                                          ) : (
                                            <span className="text-[#04AEC5]">R{draftDetails.round}</span>
                                          )
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Draft Controls */}
        <div 
          className={`${showRightSidebar ? 'block' : 'hidden'} 
                     absolute md:static top-0 right-0 z-30 
                     w-full sm:w-3/4 md:w-64 lg:w-72 h-full 
                     bg-white overflow-y-auto 
                     border-l-2 border-black
                     transition-all duration-300 ease-in-out`}
        >
          <div className="flex justify-between items-center p-2 bg-[#1A202E] text-white border-b-2 border-black">
            <h2 className="font-normal text-lg flex items-center text-[18px] font-[Geist_Mono] mx-[10px] my-[0px]">
              <DollarSign className="w-4 h-4 mr-2" />
              Now Drafting
            </h2>
            {isMobile && (
              <button 
                onClick={() => setShowRightSidebar(false)} 
                className="text-white border border-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          
          <div className="p-2 sm:p-3 border-b-2 border-black">
            {/* Undo Button (always visible when there are picks to undo) */}
            {draftHistory.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={handleUndoDraft}
                  disabled={!isHost}
                  className={`w-full flex items-center justify-center px-3 py-2 bg-black text-white border-2 border-black ${!isHost ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={{ boxShadow: '2px 2px 0 #000' }}
                >
                  <Undo className="w-4 h-4 mr-2" />
                  Undo Last Pick ({draftHistory.length} total)
                </button>
              </div>
            )}
            
            {draftMode === "auction" ? (
              <>
                {/* Auction Mode */}
                <div className="text-center mb-3 border-2 border-black p-2 bg-gray-100">
                  <div className="text-lg font-bold text-[#EF416E] text-[12px] font-[Geist_Mono] underline not-italic">AUCTION</div>
                  <div className="text-sm text-black font-bold">Round {currentRound} • Pick {currentPick}</div>
                </div>
                
                {selectedPlayer ? (() => {
                  const playerWithLocalValues = getPlayerWithLocalValues(selectedPlayer.id) || selectedPlayer;
                  return (
                    /* With player selected - Mobile Optimized Auction Panel */
                    <div className="border-2 border-black mb-3">
                      {/* Player header */}
                      <div className="bg-gray-100 p-2 border-b-2 border-black">
                        <div className="font-extrabold text-base mt-1 text-[rgba(0,0,0,1)] text-center text-[20px] px-[0px] py-[9px] font-[Geist_Mono] p-[0px] px-[0px] py-[2px] px-[0px] py-[2px] pt-[2px] pr-[0px] pb-[5px] pl-[0px]">{playerWithLocalValues.name}</div>
                        <div className="flex items-center justify-center space-x-2 mt-1">
                          <PositionBadge pos={playerWithLocalValues.position} />
                          <span className="text-xs font-medium text-black">{playerWithLocalValues.team}</span>
                        </div>
                        <div className="border-t border-black my-[9px] mx-[0px] mx-[0px] my-[5px]"></div>
                        {/* Stats boxes */}
                        <div className="flex items-center justify-center space-x-2 mt-[4px] mr-[0px] mb-[10px] ml-[0px]">
                          <div className="flex flex-col items-center px-2 py-1 border-2 border-black bg-white min-w-[60px]" style={{boxShadow:'1px 1px 0 #000'}}>
                            <span className="text-[9px] uppercase font-bold text-gray-600">Rank</span>
                            <span className="text-sm font-bold text-black">
                              #{playerWithLocalValues.rank}
                              {playerWithLocalValues.localRank !== undefined && playerWithLocalValues.localRank !== playerWithLocalValues.rank && (
                                <span className="text-gray-500 text-xs"> (#{playerWithLocalValues.localRank})</span>
                              )}
                            </span>
                          </div>
                          <div className="flex flex-col items-center px-2 py-1 border-2 border-black bg-white min-w-[60px]" style={{boxShadow:'1px 1px 0 #000'}}>
                            <span className="text-[9px] uppercase font-bold text-gray-600">Auc $</span>
                            <span className="text-sm font-bold text-[#EF416E]">
                              ${playerWithLocalValues.projectedValue}
                              {playerWithLocalValues.localProjectedValue !== undefined && playerWithLocalValues.localProjectedValue !== playerWithLocalValues.projectedValue && (
                                <span className="text-gray-500 text-xs"> (${playerWithLocalValues.localProjectedValue})</span>
                              )}
                            </span>
                          </div>
                          <div className="flex flex-col items-center px-2 py-1 border-2 border-black bg-white min-w-[60px]" style={{boxShadow:'1px 1px 0 #000'}}>
                            <span className="text-[9px] uppercase font-bold text-gray-600">Proj</span>
                            <span className="text-sm font-bold text-[#04AEC5]">
                              {playerWithLocalValues.projectedPoints.toFixed(1)}
                              {playerWithLocalValues.localProjectedPoints !== undefined && playerWithLocalValues.localProjectedPoints !== playerWithLocalValues.projectedPoints && (
                                <span className="text-gray-500 text-xs"> ({playerWithLocalValues.localProjectedPoints.toFixed(1)})</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Current bid section */}
                    <div className="flex items-center border-b-2 border-black bg-black p-[8px] m-[0px]">
                      <div className="w-1/2 pr-2 flex flex-col items-center">
                        <div className="text-xs text-white font-bold uppercase text-center">Time</div>
                        <div className="font-mono text-xl text-green-400 text-center" style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '16px' }}>
                          {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                        </div>
                      </div>
                      <div className="w-1/2 pl-2 border-l border-gray-600 flex flex-col items-center">
                        <div className="text-xs text-white font-bold uppercase text-center">Current Bid</div>
                        <div className="text-xl font-bold text-[#EF416E] text-center" style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '16px' }}>
                          ${currentBid}
                        </div>
                      </div>
                    </div>
                    
                    {/* Current bidder */}
                    {currentBidTeam && (
                      <div className="p-2 border-b-2 border-black bg-[rgba(255,228,233,1)]">
                        <div className="text-xs text-black font-bold uppercase text-center">Current Bidder</div>
                        <div className="font-bold text-xl text-[#EF416E] text-center" style={{fontFamily: dmMonoFont}}>
                          {teams.find(t => t.id === currentBidTeam)?.owner}
                        </div>
                      </div>
                    )}
                    
                    {/* Bid controls */}
                    <div className="p-2 bg-[rgba(243,244,246,1)]">
                      {(() => {
                        // Calculate the maximum bid across all teams that can still bid
                        const eligibleTeams = teams.filter(team => canTeamBid(team, draftHistory, draftSettings.auctionRounds, currentRound));
                        const globalMaxBid = eligibleTeams.length > 0 ? Math.max(...eligibleTeams.map(team => getMaxBidForTeam(team, draftHistory, draftSettings.auctionRounds, currentRound))) : currentBid;
                        
                        return (
                          <>
                            <div className="flex w-full justify-center items-stretch mb-3">
                              <button 
                                onClick={() => updateCurrentBid(Math.max(1, currentBid - 1))}
                                disabled={!isHost || currentBid <= 1}
                                className={`h-10 w-10 bg-black text-white border-2 border-black flex items-center justify-center ${(!isHost || currentBid <= 1) ? 'opacity-50' : ''}`}
                              >
                                -
                              </button>
                              <input 
                                type="number" 
                                value={currentBid}
                                onChange={(e) => {
                                  if (isHost) {
                                    const newBid = Math.max(1, Math.min(globalMaxBid, parseInt(e.target.value) || 0));
                                    updateCurrentBid(newBid);
                                  }
                                }}
                                disabled={!isHost}
                                className={`h-10 flex-1 min-w-0 text-center bg-white border-y-2 border-black text-black text-lg font-bold focus:outline-none ${!isHost ? 'opacity-50' : ''}`}
                                min="1"
                                max={globalMaxBid}
                              />
                              <button 
                                onClick={() => updateCurrentBid(Math.min(globalMaxBid, currentBid + 1))}
                                disabled={!isHost || currentBid >= globalMaxBid}
                                className={`h-10 w-10 bg-black text-white border-2 border-black flex items-center justify-center ${(!isHost || currentBid >= globalMaxBid) ? 'opacity-50' : ''}`}
                              >
                                +
                              </button>
                            </div>
                            {eligibleTeams.length > 0 && globalMaxBid < 999999 && (
                              <div className="text-xs text-center text-gray-600 mb-2">
                                Max bid: ${globalMaxBid} (teams need ${draftSettings.auctionRounds - currentRound + 1} auction picks)
                              </div>
                            )}
                          </>
                        );
                      })()}
                      
                      {/* Team selection grid */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {teams.map(team => {
                          const isSelected = currentBidTeam === team.id;
                          const canBidForAuction = canTeamBid(team, draftHistory, draftSettings.auctionRounds, currentRound);
                          const maxBid = getMaxBidForTeam(team, draftHistory, draftSettings.auctionRounds, currentRound);
                          const canAffordBid = currentBid <= maxBid;
                          const canBid = canBidForAuction && canAffordBid;
                          const auctionPlayerCount = getAuctionPlayersForTeam(team, draftHistory, draftSettings.auctionRounds);
                          
                          return (
                            <button
                              key={team.id}
                              onClick={() => canBid && isHost && handleBid(team.id, currentBid)}
                              disabled={!canBid || !isHost}
                              className={`py-1 px-2 border-2 border-black text-sm font-bold flex flex-col ${
                                isSelected ? 'bg-[#04AEC5] text-white' : 'bg-white text-black'
                              } ${!canBid ? 'opacity-40' : ''}`}
                              style={{ boxShadow: isSelected ? 'none' : '1px 1px 0 #000' }}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="truncate text-xs">{team.owner}</span>
                                <span className={`ml-1 text-xs ${isSelected ? 'text-white' : 'text-[#04AEC5]'}`}>
                                  {canBidForAuction ? `$${maxBid}` : 'FULL'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between w-full text-xs">
                                <span className={`${isSelected ? 'text-white' : 'text-gray-600'}`}>
                                  {auctionPlayerCount}/{draftSettings.auctionRounds}
                                </span>
                                {!canBidForAuction ? (
                                  <span className="text-red-500 text-xs">FULL</span>
                                ) : !canAffordBid ? (
                                  <span className="text-red-500 text-xs">MAX ${maxBid}</span>
                                ) : (
                                  <span className={`${isSelected ? 'text-white' : 'text-green-600'}`}>✓</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      
                      <div className="flex space-x-1">
                        <button
                          onClick={async () => {
                            if (isHost) {
                              await updateFirebaseState({
                                selectedPlayer: null,
                                currentBid: 1,
                                currentBidTeam: null,
                                isTimerRunning: false
                              });
                            }
                            setShowBidInterface(false);
                          }}
                          className="flex-1 px-3 py-2 border-2 border-black text-black bg-white text-sm font-bold"
                          style={{ boxShadow: '2px 2px 0 #000' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleBidComplete}
                          disabled={!currentBidTeam}
                          className={`flex-1 px-3 py-2 border-2 border-black text-white text-sm font-bold ${
                            currentBidTeam ? 'bg-[#04AEC5]' : 'bg-gray-400'
                          }`}
                          style={{ boxShadow: currentBidTeam ? '2px 2px 0 #000' : 'none' }}
                        >
                          Complete
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })() : (
                  /* No player selected yet */
                  <div className="text-center py-4 border-2 border-black mb-3">
                    <div className="text-sm text-black mb-1">Waiting for auction to start</div>
                    <div className="text-xs text-gray-500">Select a player to begin bidding</div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Snake Draft Mode */}
                <div className="text-center mb-4 border-2 border-black p-2 bg-gray-100">
                  <div className="text-lg font-bold text-[#04AEC5]">SNAKE</div>
                  <div className="text-sm text-black font-bold">Round {currentRound} • Pick {currentPick}</div>
                </div>
                
                <div className="border-2 border-black p-3 mb-4">
                  <div className="text-center">
                    <div className="text-sm text-black uppercase font-bold border-b border-black pb-1 mb-2">On the Clock</div>
                    <div className="font-bold text-base sm:text-lg text-black">
                      {teams.find(t => t.id === currentDraftTeam)?.name}
                    </div>
                    <div className="text-sm text-[#EF416E] font-bold mt-1 border border-black p-1 inline-block">
                      <span style={{fontFamily: dmMonoFont}}>{teams.find(t => t.id === currentDraftTeam)?.owner}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-center mb-4 border-2 border-black p-2 bg-black">
                  <div className="text-xs text-white uppercase font-bold">Time Remaining</div>
                  <div className="font-mono text-xl text-green-400" style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '20px' }}>
                    {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                
                <div className="text-center">
                  <button
                    onClick={() => {
                      if (isTimerRunning) {
                        pauseTimer();
                      } else {
                        startTimer();
                      }
                    }}
                    disabled={!isHost}
                    className={`px-4 py-2 bg-black text-white border-2 border-black text-sm ${!isHost ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  >
                    {isTimerRunning ? "Pause Timer" : "Start Timer"}
                    {!isHost && " (Host Only)"}
                  </button>
                </div>
              </>
            )}
          </div>
          
          {/* Selected Team Roster */}
          {selectedTeamForRoster && (() => {
            const selectedTeam = teams.find(team => team.id === selectedTeamForRoster);
            if (!selectedTeam) return null;
            
            return (
              <div className="border-t-2 border-black">
                <div className="flex justify-between items-center p-2 bg-[#1A202E] text-white border-b-2 border-black">
                  <h3 className="font-normal text-lg flex items-center text-[18px] font-[Geist_Mono] mx-[10px] my-[0px]">
                    <Users className="w-4 h-4 mr-2" />
                    My Team
                  </h3>
                </div>
                
                <div className="p-2 border-b-2 border-black bg-white">
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-bold text-[#EF416E]" style={{fontFamily: dmMonoFont}}>
                      {selectedTeam.owner}
                    </div>
                    <div className="text-xs text-[#04AEC5] border border-black p-0.5 px-[10px] py-[2px] font-bold">
                      ${selectedTeam.budget}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <div className="text-black font-normal text-[11px]">
                      {selectedTeam.name}
                    </div>
                    <div className="text-black text-xs border border-black p-0.5 px-[7px] py-[2px]">
                      P: {selectedTeam.players?.length || 0}
                    </div>
                  </div>
                  {draftMode === "snake" && (
                    <div className="text-xs text-black mt-1 border border-black p-0.5 inline-block">
                      Snake: #{sortedTeamsByBudget.findIndex(t => t.id === selectedTeam.id) + 1}
                    </div>
                  )}
                </div>
                
                <div className="px-2 pb-2 bg-white">
                  {(() => {
                    const rosterSlots = assignPlayersToRosterSlots(selectedTeam.players || [], draftSettings.rosterSize);
                    return (
                      <div className="overflow-x-auto border border-gray-500 mt-2" style={{ backgroundColor: 'rgba(255,255,255,0.85)' }}>
                        <table className="min-w-full border-collapse">
                          <thead className="bg-gray-100 border-b border-gray-500">
                            <tr>
                              <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-gray-500 opacity-70">Slot</th>
                              <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-gray-500 opacity-70">Player</th>
                              <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider opacity-70">
                                {draftMode === "auction" ? "Price" : "Round"}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rosterSlots.map((slot, slotIdx) => {
                              const draftDetails = slot.player ? getPlayerDraftDetails(slot.player.id, selectedTeam.id) : null;
                              const isStartingSlot = slot.position !== 'BEN';
                              return (
                                <tr key={slot.id} className={`${slotIdx % 2 === 0 ? 'bg-white' : 'bg-[#E8F9FB]'} border-b border-gray-500 last:border-b-0`}>
                                  <td className={`px-2 py-1 whitespace-nowrap text-[10px] border-r border-gray-500 text-center ${isStartingSlot ? 'bg-gray-50 font-bold' : ''}`}>
                                    <span className={`px-1 py-0.5 rounded text-[9px] ${isStartingSlot ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                                      {slot.label}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 whitespace-nowrap text-[10px] text-black border-r border-gray-500">
                                    {slot.player ? (
                                      <div className="flex items-center space-x-1">
                                        <span className="font-medium">{slot.player.name}</span>
                                        <PositionBadge pos={slot.player.position} />
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 italic text-[9px]">Empty</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1 whitespace-nowrap text-[10px] font-medium">
                                    {draftDetails ? (
                                      draftMode === "auction" ? (
                                        <span className="text-[#EF416E]">${draftDetails.amount}</span>
                                      ) : (
                                        <span className="text-[#04AEC5]">R{draftDetails.round}</span>
                                      )
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Welcome Popup */}
      {showWelcomePopup && (
        <WelcomePopup
          isHost={isHost}
          onClose={() => setShowWelcomePopup(false)}
          onDontShowAgain={() => {
            dismissWelcome(isHost);
            setShowWelcomePopup(false);
          }}
        />
      )}
    </div>
  );
}
