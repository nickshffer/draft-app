import { draftLogger } from './draftLogger';
import { Player, Team, DraftSettings } from '../types';

/**
 * Specialized logging functions for different draft actions
 */
export class DraftActionLogger {
  constructor(private roomId: string, private isHost: boolean) {}

  async logDraftPick(
    player: Player,
    team: Team,
    amount: number,
    round: number,
    pick: number,
    prevTeams: Team[],
    newTeams: Team[]
  ) {
    return draftLogger.logAction(
      this.roomId,
      'draft_pick',
      { teams: prevTeams },
      { teams: newTeams },
      {
        isHost: this.isHost,
        playerId: player.id,
        playerName: player.name,
        playerPosition: player.position,
        teamId: team.id,
        teamName: team.name,
        amount,
        draftRound: round,
        draftPick: pick
      }
    );
  }

  async logUndoPick(
    player: Player,
    team: Team,
    amount: number,
    round: number,
    pick: number,
    prevTeams: Team[],
    newTeams: Team[]
  ) {
    return draftLogger.logAction(
      this.roomId,
      'undo_pick',
      { teams: prevTeams },
      { teams: newTeams },
      {
        isHost: this.isHost,
        playerId: player.id,
        playerName: player.name,
        playerPosition: player.position,
        teamId: team.id,
        teamName: team.name,
        amount,
        draftRound: round,
        draftPick: pick
      }
    );
  }

  async logDraftReset(prevState: any, newState: any) {
    return draftLogger.logAction(
      this.roomId,
      'draft_reset',
      prevState,
      newState,
      {
        isHost: this.isHost,
        resetTimestamp: new Date().toISOString()
      }
    );
  }

  async logSettingsUpdate(
    prevSettings: DraftSettings,
    newSettings: DraftSettings,
    prevTeams?: Team[],
    newTeams?: Team[]
  ) {
    const prevState: any = { draftSettings: prevSettings };
    const newState: any = { draftSettings: newSettings };

    if (prevTeams && newTeams) {
      prevState.teams = prevTeams;
      newState.teams = newTeams;
    }

    return draftLogger.logAction(
      this.roomId,
      'settings_update',
      prevState,
      newState,
      {
        isHost: this.isHost,
        settingsChanged: this.getSettingsChanges(prevSettings, newSettings)
      }
    );
  }

  async logTimerAction(action: 'start' | 'pause' | 'update', prevTime?: number, newTime?: number) {
    return draftLogger.logSimpleAction(
      this.roomId,
      `timer_${action}`,
      `Timer ${action}${prevTime !== undefined ? ` from ${prevTime}s` : ''}${newTime !== undefined ? ` to ${newTime}s` : ''}`,
      {
        isHost: this.isHost,
        prevTime,
        newTime
      }
    );
  }

  async logPlayerSelection(player: Player | null, prevPlayer: Player | null) {
    return draftLogger.logAction(
      this.roomId,
      'player_selected',
      { selectedPlayer: prevPlayer },
      { selectedPlayer: player },
      {
        isHost: this.isHost,
        playerId: player?.id || null,
        playerName: player?.name || null,
        playerPosition: player?.position || null,
        prevPlayerId: prevPlayer?.id || null
      }
    );
  }

  async logBidPlaced(teamId: number, amount: number, player: Player) {
    return draftLogger.logSimpleAction(
      this.roomId,
      'bid_placed',
      `Team ${teamId} bid $${amount} on ${player.name}`,
      {
        isHost: this.isHost,
        teamId,
        amount,
        playerId: player.id,
        playerName: player.name
      }
    );
  }

  async logDraftModeChange(prevMode: string, newMode: string, round: number) {
    return draftLogger.logAction(
      this.roomId,
      'draft_mode_change',
      { draftMode: prevMode },
      { draftMode: newMode },
      {
        isHost: this.isHost,
        prevMode,
        newMode,
        draftRound: round
      }
    );
  }

  async logSnakeDraftOrderCalculation(teams: Team[], snakeOrder: number[], round: number) {
    return draftLogger.logSimpleAction(
      this.roomId,
      'snake_order_calculated',
      `Snake order calculated for round ${round}: [${snakeOrder.join(', ')}]`,
      {
        isHost: this.isHost,
        snakeOrder,
        draftRound: round,
        teamBudgets: teams.map(t => ({ id: t.id, name: t.name, budget: t.budget }))
      }
    );
  }

  async logTeamEdit(prevTeam: Team, newTeam: Team) {
    return draftLogger.logAction(
      this.roomId,
      'team_edited',
      { team: prevTeam },
      { team: newTeam },
      {
        isHost: this.isHost,
        teamId: newTeam.id,
        changes: this.getTeamChanges(prevTeam, newTeam)
      }
    );
  }

  async logTeamReorder(prevTeams: Team[], newTeams: Team[]) {
    return draftLogger.logAction(
      this.roomId,
      'teams_reordered',
      { teams: prevTeams },
      { teams: newTeams },
      {
        isHost: this.isHost,
        prevOrder: prevTeams.map(t => ({ id: t.id, name: t.name })),
        newOrder: newTeams.map(t => ({ id: t.id, name: t.name }))
      }
    );
  }

  async logCustomPlayerListUpdate(prevPlayers: Player[] | undefined, newPlayers: Player[]) {
    return draftLogger.logAction(
      this.roomId,
      'custom_players_updated',
      { customPlayerList: prevPlayers },
      { customPlayerList: newPlayers },
      {
        isHost: this.isHost,
        prevPlayerCount: prevPlayers?.length || 0,
        newPlayerCount: newPlayers.length
      }
    );
  }

  async logError(action: string, error: Error | string, context?: any) {
    return draftLogger.logSimpleAction(
      this.roomId,
      'error_occurred',
      `Error during ${action}: ${error instanceof Error ? error.message : error}`,
      {
        isHost: this.isHost,
        action,
        error: error instanceof Error ? error.message : error,
        context
      }
    );
  }

  private getSettingsChanges(prev: DraftSettings, current: DraftSettings): string[] {
    const changes: string[] = [];
    
    if (prev.auctionBudget !== current.auctionBudget) {
      changes.push(`auctionBudget: ${prev.auctionBudget} → ${current.auctionBudget}`);
    }
    if (prev.rosterSize !== current.rosterSize) {
      changes.push(`rosterSize: ${prev.rosterSize} → ${current.rosterSize}`);
    }
    if (prev.auctionRounds !== current.auctionRounds) {
      changes.push(`auctionRounds: ${prev.auctionRounds} → ${current.auctionRounds}`);
    }
    if (prev.teamCount !== current.teamCount) {
      changes.push(`teamCount: ${prev.teamCount} → ${current.teamCount}`);
    }
    if (prev.draftTimer !== current.draftTimer) {
      changes.push(`draftTimer: ${prev.draftTimer} → ${current.draftTimer}`);
    }
    
    return changes;
  }

  private getTeamChanges(prev: Team, current: Team): string[] {
    const changes: string[] = [];
    
    if (prev.name !== current.name) {
      changes.push(`name: "${prev.name}" → "${current.name}"`);
    }
    if (prev.owner !== current.owner) {
      changes.push(`owner: "${prev.owner}" → "${current.owner}"`);
    }
    if (prev.budget !== current.budget) {
      changes.push(`budget: ${prev.budget} → ${current.budget}`);
    }
    
    return changes;
  }
}

/**
 * Factory function to create a logger for a specific room and host status
 */
export function createDraftActionLogger(roomId: string, isHost: boolean): DraftActionLogger {
  return new DraftActionLogger(roomId, isHost);
}
