import React, { useState, useEffect, useRef } from "react";
import { Search, Settings, DollarSign, Users, Clock, ChevronDown, ChevronUp, X, Check, ChevronRight, Edit, Save, Upload, AlertCircle } from "lucide-react";

// Import types
import { FantasyFootballDraftProps, Team, Player, ActiveTab, SortBy, SortDirection, DraftSettings, DraftAction, CsvUploadStatus, DraftMode } from './types';

// Import data and styles
import { mockTeams, playerData, positionCategories } from './data/mockData';
import { customColors } from './styles/colors';

// Import components
import FontLoader from './components/FontLoader';
import PositionBadge from './components/PositionBadge';

export default function FantasyFootballDraft({
  initialAuctionBudget = 200,
  initialRosterSize = 16,
  initialAuctionRounds = 5,
  draftTimerSeconds = 90
}: FantasyFootballDraftProps) {
  // Font families (used directly in inline styles)
  const monofettFont = '"Monofett", cursive';
  const dmMonoFont = '"Geist Mono", monospace';

  // Draft settings
  const [draftSettings, setDraftSettings] = useState<DraftSettings>({
    auctionBudget: initialAuctionBudget,
    rosterSize: initialRosterSize,
    auctionRounds: initialAuctionRounds,
    draftTimer: draftTimerSeconds,
    teamCount: mockTeams.length
  });
  
  // UI state
  const [leagueName, setLeagueName] = useState("Yo Soy FIESTA");
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("players");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentBid, setCurrentBid] = useState(1);
  const [currentBidTeam, setCurrentBidTeam] = useState<number | null>(null);
  const [showBidInterface, setShowBidInterface] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentPick, setCurrentPick] = useState(1);
  const [draftMode, setDraftMode] = useState<DraftMode>("auction");
  const [snakeDraftOrder, setSnakeDraftOrder] = useState<number[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(draftSettings.draftTimer);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Record<number, boolean>>({});
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState({ owner: "", name: "" });
  const [lastDraftAction, setLastDraftAction] = useState<DraftAction | null>(null);
  const [showUndoButton, setShowUndoButton] = useState(false);
  
  // CSV upload state
  const [csvUploadStatus, setCsvUploadStatus] = useState<CsvUploadStatus>({
    status: 'idle',
    message: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  
  // Responsive UI state
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  // State for highlighted team in auction
  const [highlightedTeamIndex, setHighlightedTeamIndex] = useState(0);
  const [highlightDirection, setHighlightDirection] = useState(1);

  // Draft data
  const [teams, setTeams] = useState<Team[]>(mockTeams.map(team => ({
    ...team,
    budget: draftSettings.auctionBudget,
    players: [],
    draftPosition: team.id
  })));
  const [players, setPlayers] = useState<Player[]>(playerData);
  const [draftedPlayers, setDraftedPlayers] = useState<number[]>([]);
  const [draftHistory, setDraftHistory] = useState<any[]>([]);
  const [currentDraftTeam, setCurrentDraftTeam] = useState<number | null>(null);

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
          
          const parsedPlayers: Player[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',').map(v => v.trim());
            
            const getValue = (key: string) => {
              const index = columnIndices[key];
              return index !== undefined && index < values.length ? values[index] : '';
            };
            
            let position = getValue('position').toUpperCase();
            
            if (['D', 'DST', 'D/ST'].includes(position)) position = 'DEF';
            if (['PK'].includes(position)) position = 'K';
            
            if (!Object.keys(positionCategories).includes(position)) {
              continue;
            }
            
            const rank = parseInt(getValue('rank')) || i;
            const bye = parseInt(getValue('bye')) || 0;
            const projectedValue = parseFloat(getValue('projectedValue')) || 0;
            const projectedPoints = parseFloat(getValue('projectedPoints')) || 0;
            
            const player: Player = {
              id: i,
              rank: rank,
              position: position,
              name: getValue('name'),
              team: getValue('team'),
              bye: bye,
              projectedValue: projectedValue,
              projectedPoints: projectedPoints
            };
            
            parsedPlayers.push(player);
          }
          
          if (parsedPlayers.length === 0) {
            setCsvUploadStatus({ status: 'error', message: 'No valid player data found in CSV' });
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
          
          setPlayers(parsedPlayers);
          setCsvUploadStatus({ 
            status: 'success', 
            message: `Successfully imported ${parsedPlayers.length} players` 
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
  const handleSaveTeam = () => {
    if (!editingTeamId) return;
    
    setTeams(prevTeams => {
      return prevTeams.map(team => {
        if (team.id === editingTeamId) {
          return {
            ...team,
            owner: editFormData.owner,
            name: editFormData.name
          };
        }
        return team;
      });
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

  // Auto-expand highlighted/current team accordion
  useEffect(() => {
    const teamToExpandId = draftMode === "auction" ? teams[highlightedTeamIndex]?.id : currentDraftTeam;
    if (teamToExpandId) {
      setExpandedTeams(prev => ({ ...prev, [teamToExpandId]: true }));
    }
  }, [highlightedTeamIndex, currentDraftTeam, draftMode, teams]);

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

  // Undo the last draft action
  const handleUndoDraft = () => {
    if (!lastDraftAction) return;

    const { playerId, teamId, amount } = lastDraftAction;
    
    const player = players.find(p => p.id === playerId);
    if (!player) return;

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

    setDraftedPlayers(prev => prev.filter(id => id !== playerId));
    setDraftHistory(prev => prev.slice(0, -1));
    setLastDraftAction(null);
    setShowUndoButton(false);
  };

  // Update the highlighted team when auction is complete
  const updateHighlightedTeam = () => {
    if (draftMode === "auction") {
      let nextIndex = highlightedTeamIndex + highlightDirection;
      
      if (nextIndex >= teams.length) {
        setHighlightDirection(-1);
        nextIndex = teams.length - 2;
      } else if (nextIndex < 0) {
        setHighlightDirection(1);
        nextIndex = 1;
      }
      
      setHighlightedTeamIndex(nextIndex);
    }
  };

  // Handle draft pick
  const handleDraftPick = (playerId: number, teamId: number, amount = 0) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    setLastDraftAction({
      playerId,
      teamId,
      amount,
      timestamp: new Date()
    });
    setShowUndoButton(true);

    setTeams(prevTeams => {
      return prevTeams.map(team => {
        if (team.id === teamId) {
          setExpandedTeams(prev => ({
            ...prev,
            [teamId]: true
          }));
          
          return {
            ...team,
            players: [...team.players, player],
            budget: draftMode === "auction" ? team.budget - amount : team.budget
          };
        }
        return team;
      });
    });

    setDraftedPlayers(prev => [...prev, playerId]);

    setDraftHistory(prev => [
      ...prev,
      {
        round: currentRound,
        pick: currentPick,
        player,
        team: teams.find(t => t.id === teamId),
        amount: draftMode === "auction" ? amount : 0,
        timestamp: new Date()
      }
    ]);

    if (currentPick % teams.length === 0) {
      setCurrentRound(prev => prev + 1);
    }
    setCurrentPick(prev => prev + 1);

    setShowBidInterface(false);
    setSelectedPlayer(null);
    setCurrentBid(1);
    setCurrentBidTeam(null);
    setTimeRemaining(draftSettings.draftTimer);
    setIsTimerRunning(false);
    
    if (draftMode === "auction") {
      updateHighlightedTeam();
    }
  };

  // Handle player selection for bidding
  const handlePlayerSelect = (player: Player) => {
    setSelectedPlayer(player);
    setShowBidInterface(true);
    setCurrentBid(1);
    setCurrentBidTeam(null);
    setTimeRemaining(draftSettings.draftTimer);
    setIsTimerRunning(true);
    
    if (isMobile) {
      setShowRightSidebar(true);
      setShowLeftSidebar(false);
    }
  };

  // Handle bid submission
  const handleBid = (teamId: number, bidAmount: number) => {
    if (!selectedPlayer) return;
    
    const team = teams.find(t => t.id === teamId);
    if (!team || team.budget < bidAmount) return;
    
    setCurrentBid(bidAmount);
    setCurrentBidTeam(teamId);
    setTimeRemaining(draftSettings.draftTimer);
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
  const handleSettingsUpdate = (newSettings: DraftSettings) => {
    setDraftSettings(newSettings);
    setTeams(prevTeams => {
      let updated = prevTeams.map(team => ({
        ...team,
        budget: newSettings.auctionBudget
      }));
      if (newSettings.teamCount > updated.length) {

        for (let i = updated.length; i < newSettings.teamCount; i++) {
          updated.push({
            id: i + 1,
            owner: `Owner ${i + 1}`,
            name: `Team ${i + 1}`,
            budget: newSettings.auctionBudget,
            players: [],
            draftPosition: i + 1
          });
        }
      } else if (newSettings.teamCount < updated.length) {
        updated = updated.slice(0, newSettings.teamCount);
      }
      return updated;
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
        comparison = a.rank - b.rank;
      } else if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === "position") {
        comparison = a.position.localeCompare(b.position);
      } else if (sortBy === "team") {
        comparison = a.team.localeCompare(b.team);
      } else if (sortBy === "projectedPoints") {
        comparison = b.projectedPoints - a.projectedPoints;
      } else if (sortBy === "projectedValue") {
        comparison = b.projectedValue - a.projectedValue;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

  // Group players by position for the position view
  const playersByPosition = Object.keys(positionCategories).reduce((acc, position) => {
    acc[position] = filteredPlayers.filter(player => player.position === position);
    return acc;
  }, {} as Record<string, Player[]>);

  // Sort teams by remaining budget (for snake draft order)
  const sortedTeamsByBudget = [...teams].sort((a, b) => b.budget - a.budget);

  // Group roster players by position - Used in Team Rosters tab
  const getPlayersByPosition = (teamPlayers: Player[]) => {
    const positionGroups: Record<string, Player[]> = {};
    
    Object.keys(positionCategories).forEach(pos => {
      positionGroups[pos] = teamPlayers.filter(player => player.position === pos);
    });
    
    return positionGroups;
  };

  // Find draft details for a player
  const getPlayerDraftDetails = (playerId: number, teamId: number) => {
    return draftHistory.find(
      history => history.player.id === playerId && history.team.id === teamId
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

  // Suppress unused variable warnings by referencing them
  void showBidInterface; void getPlayersByPosition;

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
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    League Name
                  </label>
                  <input 
                    type="text" 
                    value={leagueName}
                    onChange={(e) => setLeagueName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border-2 border-black text-black"
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
                    onChange={(e) => setDraftSettings({...draftSettings, auctionBudget: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 bg-white border-2 border-black text-black"
                    min="1"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Roster Size
                  </label>
                  <input 
                    type="number" 
                    value={draftSettings.rosterSize}
                    onChange={(e) => setDraftSettings({...draftSettings, rosterSize: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 bg-white border-2 border-black text-black"
                    min="1"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Auction Rounds
                  </label>
                  <input 
                    type="number" 
                    value={draftSettings.auctionRounds}
                    onChange={(e) => setDraftSettings({...draftSettings, auctionRounds: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 bg-white border-2 border-black text-black"
                    min="0"
                    max={draftSettings.rosterSize}
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Number of Teams
                  </label>
                  <input
                    type="number"
                    value={draftSettings.teamCount}
                    onChange={(e) => setDraftSettings({...draftSettings, teamCount: Math.max(2, parseInt(e.target.value))})}
                    className="w-full px-3 py-2 bg-white border-2 border-black text-black"
                    min="2"
                    max="20"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Draft Timer (seconds)
                  </label>
                  <input 
                    type="number" 
                    value={draftSettings.draftTimer}
                    onChange={(e) => setDraftSettings({...draftSettings, draftTimer: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 bg-white border-2 border-black text-black"
                    min="10"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  />
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
                    Upload a CSV file with player rankings. The CSV must include these column headers: RANK, POSITION, PLAYER, TEAM, BYE, AUC $, and PROJ. PTS
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
                                disabled={index === 0}
                                onClick={() => {
                                  const newTeams = [...teams];
                                  [newTeams[index], newTeams[index - 1]] = [newTeams[index - 1], newTeams[index]];
                                  setTeams(newTeams);
                                }}
                                className="text-black hover:text-gray-700 disabled:opacity-30 border border-black px-1"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button 
                                disabled={index === teams.length - 1}
                                onClick={() => {
                                  const newTeams = [...teams];
                                  [newTeams[index], newTeams[index + 1]] = [newTeams[index + 1], newTeams[index]];
                                  setTeams(newTeams);
                                }}
                                className="text-black hover:text-gray-700 disabled:opacity-30 border border-black px-1"
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
              
              <div className="flex justify-end space-x-3 pt-2">
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
                    <div className="text-black text-xs border border-black p-0.5 px-[7px] py-[2px] mx-[5px] my-[0px]">P: {team.players.length}</div>
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
                    {team.players.length > 0 ? (
                      <div className="overflow-x-auto border border-gray-500 mt-2" style={{ backgroundColor: 'rgba(255,255,255,0.85)' }}>
                        <table className="min-w-full border-collapse">
                          <thead className="bg-gray-100 border-b border-gray-500">
                            <tr>
                              <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-gray-500 opacity-70">Player</th>
                              <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-gray-500 opacity-70" style={equalColumnStyle}>Pos</th>
                              <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-gray-500 opacity-70" style={equalColumnStyle}>Team</th>
                              <th className="px-2 py-1 text-left text-[10px] font-bold text-black uppercase tracking-wider opacity-70" style={equalColumnStyle}>
                                {draftMode === "auction" ? "Price" : "Round"}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {team.players.map((player, pidx) => {
                              const draftDetails = getPlayerDraftDetails(player.id, team.id);
                              return (
                                <tr key={player.id} className={`${pidx % 2 === 0 ? 'bg-white' : 'bg-[#E8F9FB]'} border-b border-gray-500 last:border-b-0`}>
                                  <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border-r border-gray-500">{player.name}</td>
                                  <td className="px-2 py-1 whitespace-nowrap border-r border-gray-500 text-center" style={equalColumnStyle}><PositionBadge pos={player.position} /></td>
                                  <td className="px-2 py-1 whitespace-nowrap text-[11px] text-black border-r border-gray-500" style={equalColumnStyle}>{player.team}</td>
                                  <td className="px-2 py-1 whitespace-nowrap text-[11px] font-medium" style={equalColumnStyle}>
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
                    ) : (
                      <div className="text-center text-sm text-gray-500 py-2 border border-black mt-2 bg-white" style={{backgroundColor:'rgba(255,255,255,0.8)'}}>
                        No players drafted yet
                      </div>
                    )}
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
                          </td>
                          <td className="px-2 sm:px-3 py-1 sm:py-2 text-center text-xs text-[#04AEC5] font-medium border-r border-black hidden sm:table-cell">
                            {player.projectedPoints.toFixed(1)}
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
                                </td>
                                <td className="px-3 sm:px-6 py-1 sm:py-2 whitespace-nowrap text-[11px] sm:text-xs text-[#04AEC5] font-medium border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                  {player.projectedPoints.toFixed(1)}
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
                                {pick.team.name}
                              </div>
                              <div className="text-base font-bold text-[#EF416E]" style={{fontFamily: dmMonoFont}}>{pick.team.owner}</div>
                            </td>
                            <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap font-medium text-xs sm:text-sm text-black border-r border-black">
                              {pick.player.name}
                              <div className="sm:hidden">
                                <PositionBadge pos={pick.player.position} />
                              </div>
                            </td>
                            <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap border-r border-black hidden sm:table-cell text-center" style={equalColumnStyle}>
                              <PositionBadge pos={pick.player.position} />
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
                      {team.players.length > 0 ? (
                        <div className="overflow-x-auto border border-black">
                          <table className="min-w-full border-collapse">
                            <thead className="bg-gray-100 border-b border-black">
                              <tr>
                                <th className="px-2 sm:px-4 py-1 sm:py-2 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black">
                                  Player
                                </th>
                                <th className="px-2 sm:px-4 py-1 sm:py-2 text-left text-xs font-medium text-black uppercase tracking-wider border-r border-black" style={equalColumnStyle}>
                                  Pos
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
                              {team.players.map((player, playerIdx) => {
                                const draftDetails = getPlayerDraftDetails(player.id, team.id);
                                return (
                                  <tr key={player.id} className={`${playerIdx % 2 === 0 ? 'bg-white' : 'bg-[#FFE5F0]'} border-b border-black last:border-b-0`}>
                                    <td className="px-2 sm:px-4 py-1 sm:py-2 whitespace-nowrap font-medium text-xs sm:text-sm text-black border-r border-black">
                                      {player.name}
                                    </td>
                                    <td className="px-2 sm:px-4 py-1 sm:py-2 whitespace-nowrap border-r border-black text-center" style={equalColumnStyle}>
                                      <PositionBadge pos={player.position} />
                                    </td>
                                    <td className="px-2 sm:px-4 py-1 sm:py-2 whitespace-nowrap text-xs sm:text-sm text-black border-r border-black hidden sm:table-cell" style={equalColumnStyle}>
                                      {player.team}
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
                      ) : (
                        <div className="text-center text-black py-4 text-sm border border-black">
                          No players drafted yet
                        </div>
                      )}
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
            {/* Undo Button (appears after a pick is made) */}
            {showUndoButton && (
              <div className="mb-4">
                <button
                  onClick={handleUndoDraft}
                  className="w-full flex items-center justify-center px-3 py-2 bg-black text-white border-2 border-black"
                  style={{ boxShadow: '2px 2px 0 #000' }}
                >
                  Undo Last Draft
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
                
                {selectedPlayer ? (
                  /* With player selected - Mobile Optimized Auction Panel */
                  <div className="border-2 border-black mb-3">
                    {/* Player header */}
                    <div className="bg-gray-100 p-2 border-b-2 border-black">
                      <div className="font-extrabold text-base mt-1 text-[rgba(0,0,0,1)] text-center text-[20px] px-[0px] py-[9px] font-[Geist_Mono] p-[0px] px-[0px] py-[2px] px-[0px] py-[2px] pt-[2px] pr-[0px] pb-[5px] pl-[0px]">{selectedPlayer.name}</div>
                      <div className="flex items-center justify-center space-x-2 mt-1">
                        <PositionBadge pos={selectedPlayer.position} />
                        <span className="text-xs font-medium text-black">{selectedPlayer.team}</span>
                      </div>
                      <div className="border-t border-black my-[9px] mx-[0px] mx-[0px] my-[5px]"></div>
                      {/* Stats boxes */}
                      <div className="flex items-center justify-center space-x-2 mt-[4px] mr-[0px] mb-[10px] ml-[0px]">
                        <div className="flex flex-col items-center px-2 py-1 border-2 border-black bg-white min-w-[60px]" style={{boxShadow:'1px 1px 0 #000'}}>
                          <span className="text-[9px] uppercase font-bold text-gray-600">Rank</span>
                          <span className="text-sm font-bold text-black">#{selectedPlayer.rank}</span>
                        </div>
                        <div className="flex flex-col items-center px-2 py-1 border-2 border-black bg-white min-w-[60px]" style={{boxShadow:'1px 1px 0 #000'}}>
                          <span className="text-[9px] uppercase font-bold text-gray-600">Auc $</span>
                          <span className="text-sm font-bold text-[#EF416E]">${selectedPlayer.projectedValue}</span>
                        </div>
                        <div className="flex flex-col items-center px-2 py-1 border-2 border-black bg-white min-w-[60px]" style={{boxShadow:'1px 1px 0 #000'}}>
                          <span className="text-[9px] uppercase font-bold text-gray-600">Proj</span>
                          <span className="text-sm font-bold text-[#04AEC5]">{selectedPlayer.projectedPoints.toFixed(1)}</span>
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
                      <div className="flex w-full justify-center items-stretch mb-3">
                        <button 
                          onClick={() => setCurrentBid(Math.max(1, currentBid - 1))}
                          className="h-10 w-10 bg-black text-white border-2 border-black flex items-center justify-center"
                        >
                          -
                        </button>
                        <input 
                          type="number" 
                          value={currentBid}
                          onChange={(e) => setCurrentBid(Math.max(1, parseInt(e.target.value) || 0))}
                          className="h-10 flex-1 min-w-0 text-center bg-white border-y-2 border-black text-black text-lg font-bold focus:outline-none m-[0px] p-[0px] py-[0px] py-[0px] py-[0px] py-[0px]"
                          min="1"
                        />
                        <button 
                          onClick={() => setCurrentBid(currentBid + 1)}
                          className="h-10 w-10 bg-black text-white border-2 border-black flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                      
                      {/* Team selection grid */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {teams.map(team => {
                          const isSelected = currentBidTeam === team.id;
                          const canAfford = team.budget >= currentBid;
                          return (
                            <button
                              key={team.id}
                              onClick={() => canAfford && handleBid(team.id, currentBid)}
                              disabled={!canAfford}
                              className={`py-1 px-2 border-2 border-black text-sm font-bold flex items-center justify-between ${
                                isSelected ? 'bg-[#04AEC5] text-white' : 'bg-white text-black'
                              } ${!canAfford ? 'opacity-40' : ''}`}
                              style={{ boxShadow: isSelected ? 'none' : '1px 1px 0 #000' }}
                            >
                              <span className="truncate">{team.owner}</span>
                              <span className={`ml-1 text-xs ${isSelected ? 'text-white' : 'text-[#04AEC5]'}`}>${team.budget}</span>
                            </button>
                          );
                        })}
                      </div>
                      
                      <div className="flex space-x-1">
                        <button
                          onClick={() => {
                            setShowBidInterface(false);
                            setSelectedPlayer(null);
                            setCurrentBid(1);
                            setCurrentBidTeam(null);
                            setIsTimerRunning(false);
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
                ) : (
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
                      setIsTimerRunning(!isTimerRunning);
                    }}
                    className="px-4 py-2 bg-black text-white border-2 border-black text-sm"
                    style={{ boxShadow: '2px 2px 0 #000' }}
                  >
                    {isTimerRunning ? "Pause Timer" : "Start Timer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
