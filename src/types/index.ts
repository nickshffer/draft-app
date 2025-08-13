// Player types
export interface Player {
  id: number;
  rank: number;
  position: string;
  name: string;
  team: string;
  bye: number;
  projectedValue: number;
  projectedPoints: number;
  // Local values for readers (not synced to Firebase)
  localRank?: number;
  localProjectedValue?: number;
  localProjectedPoints?: number;
}

// Team types
export interface Team {
  id: number;
  owner: string;
  name: string;
  budget: number;
  players: Player[];
  draftPosition: number;
}

// Draft types
export interface DraftHistory {
  round: number;
  pick: number;
  player: Player;
  team: Team;
  amount: number;
  timestamp: Date;
}

export interface DraftAction {
  playerId: number;
  teamId: number;
  amount: number;
  timestamp: Date;
  round?: number;
  pick?: number;
  player?: Player;
  team?: Team;
}

// Settings types
export interface DraftSettings {
  auctionBudget: number;
  rosterSize: number;
  auctionRounds: number;
  draftTimer: number;
  teamCount: number;
}

// CSV Upload types
export interface CsvUploadStatus {
  status: 'idle' | 'success' | 'error';
  message: string;
}

// Position types
export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';

export interface PositionCategories {
  [key: string]: string;
}

export interface PositionBadgeColors {
  [key: string]: {
    bg: string;
    text: string;
  };
}

// Draft mode types
export type DraftMode = 'auction' | 'snake';

// Sort types
export type SortBy = 'rank' | 'name' | 'position' | 'team' | 'projectedPoints' | 'projectedValue';
export type SortDirection = 'asc' | 'desc';

// Tab types
export type ActiveTab = 'players' | 'positions' | 'draft' | 'rosters';

// Component prop types
export interface PositionBadgeProps {
  pos: string;
}

export interface ImageWithFallbackProps {
  src: string;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
  [key: string]: any;
}

export interface DigitalClockProps {
  minutes: number;
  seconds: number;
}

export interface FantasyFootballDraftProps {
  initialAuctionBudget?: number;
  initialRosterSize?: number;
  initialAuctionRounds?: number;
  draftTimerSeconds?: number;
  isHost?: boolean;
}
