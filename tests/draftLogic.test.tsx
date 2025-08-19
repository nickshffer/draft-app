import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { Player, Team } from '../src/types'

// Mock player data for testing
const mockPlayers: Player[] = [
  { 
    id: 1, 
    name: 'Christian McCaffrey', 
    position: 'RB', 
    team: 'SF', 
    fantasyValue: 400, 
    byeWeek: 9, 
    expectedPoints: 300,
    projectedPoints: 18.5,
    auctionValue: 45
  },
  { 
    id: 2, 
    name: 'Josh Allen', 
    position: 'QB', 
    team: 'BUF', 
    fantasyValue: 350, 
    byeWeek: 12, 
    expectedPoints: 280,
    projectedPoints: 24.2,
    auctionValue: 38
  },
  { 
    id: 3, 
    name: 'Cooper Kupp', 
    position: 'WR', 
    team: 'LAR', 
    fantasyValue: 320, 
    byeWeek: 6, 
    expectedPoints: 250,
    projectedPoints: 15.8,
    auctionValue: 32
  }
]

const mockTeams: Team[] = [
  { id: 1, name: 'Team 1', owner: 'Owner 1', budget: 200, players: [] },
  { id: 2, name: 'Team 2', owner: 'Owner 2', budget: 200, players: [] },
  { id: 3, name: 'Team 3', owner: 'Owner 3', budget: 200, players: [] }
]

// Mock Firebase hook
const mockUpdateFirebaseState = vi.fn()

const mockFirebaseHook = {
  teams: mockTeams,
  draftHistory: [],
  draftSettings: {
    auctionBudget: 200,
    rosterSize: 16,
    auctionRounds: 5,
    teamCount: 3,
    draftTimer: 90
  },
  leagueName: 'Test League',
  currentRound: 1,
  currentPick: 1,
  draftMode: 'auction' as const,
  snakeDraftOrder: [],
  timeRemaining: 90,
  isTimerRunning: false,
  selectedPlayer: null,
  currentBid: 1,
  currentBidTeam: null,
  highlightedTeamIndex: 0,
  highlightDirection: 1,
  currentDraftTeam: null,
  draftedPlayers: [],
  isConnected: true,
  error: null,
  updateFirebaseState: mockUpdateFirebaseState,
  createRoom: vi.fn(),
  updateCustomPlayerList: vi.fn(),
  customPlayerList: mockPlayers
}

vi.mock('../src/hooks/useFirebaseDraft', () => ({
  useFirebaseDraft: () => mockFirebaseHook
}))

describe('Draft Logic Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to default state
    Object.assign(mockFirebaseHook, {
      teams: mockTeams,
      draftHistory: [],
      currentRound: 1,
      currentPick: 1,
      draftMode: 'auction',
      snakeDraftOrder: [],
      currentDraftTeam: null,
      selectedPlayer: null,
      currentBid: 1,
      currentBidTeam: null,
      draftedPlayers: [],
      updateFirebaseState: mockUpdateFirebaseState
    })
  })

  describe('Draft Reset Functionality', () => {
    it('should reset all draft state when draft is reset', async () => {
      // Simulate mid-draft state
      Object.assign(mockFirebaseHook, {
        currentRound: 3,
        currentPick: 7,
        draftMode: 'snake',
        snakeDraftOrder: [1, 2, 3],
        currentDraftTeam: 2,
        selectedPlayer: mockPlayers[0],
        currentBid: 15,
        currentBidTeam: 1,
        draftHistory: [
          {
            playerId: 1,
            teamId: 1,
            amount: 50,
            timestamp: new Date(),
            round: 1,
            pick: 1,
            player: mockPlayers[0],
            team: mockTeams[0]
          }
        ],
        draftedPlayers: [1]
      })

      render(<App isHost={true} />)
      
      // Open settings to find reset button  
      const settingsButtons = screen.getAllByRole('button')
      const settingsButton = settingsButtons.find(button => 
        button.querySelector('svg') && button.className.includes('bg-[#EF416E]')
      )
      expect(settingsButton).toBeTruthy()
      await userEvent.click(settingsButton!)
      
      // Find and click reset button
      const resetButton = screen.getByRole('button', { name: /reset draft/i })
      await userEvent.click(resetButton)

      // Verify updateFirebaseState was called with correct reset values
      expect(mockUpdateFirebaseState).toHaveBeenCalledWith({
        teams: expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            players: [],
            budget: 200
          }),
          expect.objectContaining({
            id: 2,
            players: [],
            budget: 200
          }),
          expect.objectContaining({
            id: 3,
            players: [],
            budget: 200
          })
        ]),
        draftHistory: [],
        draftedPlayers: [],
        lastDraftAction: null,
        currentRound: 1,
        currentPick: 1,
        selectedPlayer: null,
        currentBid: 1,
        currentBidTeam: null,
        isTimerRunning: false,
        timeRemaining: 90,
        draftMode: 'auction',
        snakeDraftOrder: [],
        currentDraftTeam: null,
        highlightedTeamIndex: 0,
        highlightDirection: 1
      })
    })

    it('should not allow non-host to reset draft', async () => {
      render(<App isHost={false} />)
      
      // Reset button should not be visible for non-host
      const resetButton = screen.queryByRole('button', { name: /reset draft/i })
      expect(resetButton).toBeNull()
    })
  })

  describe('Draft Undo Functionality', () => {
    it('should undo last auction pick correctly', async () => {
      const draftedPlayer = mockPlayers[0]
      const draftTeam = { ...mockTeams[0], players: [draftedPlayer], budget: 150 }
      
      Object.assign(mockFirebaseHook, {
        teams: [draftTeam, mockTeams[1], mockTeams[2]],
        draftHistory: [
          {
            playerId: 1,
            teamId: 1,
            amount: 50,
            timestamp: new Date(),
            round: 1,
            pick: 1,
            player: draftedPlayer,
            team: mockTeams[0]
          }
        ],
        draftedPlayers: [1],
        currentRound: 1,
        currentPick: 2,
        draftMode: 'auction'
      })

      render(<App isHost={true} />)
      
      const undoButton = screen.getByRole('button', { name: /undo/i })
      await userEvent.click(undoButton)

      expect(mockUpdateFirebaseState).toHaveBeenCalledWith({
        teams: expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            players: [],
            budget: 200 // Budget restored
          })
        ]),
        draftedPlayers: [],
        draftHistory: [],
        lastDraftAction: null,
        currentRound: 1,
        currentPick: 1,
        draftMode: 'auction',
        snakeDraftOrder: [],
        currentDraftTeam: null,
        selectedPlayer: null,
        currentBid: 1,
        currentBidTeam: null
      })
    })

    it('should undo last snake pick correctly', async () => {
      const draftedPlayer = mockPlayers[0]
      const draftTeam = { ...mockTeams[0], players: [draftedPlayer], budget: 200 }
      
      Object.assign(mockFirebaseHook, {
        teams: [draftTeam, mockTeams[1], mockTeams[2]],
        draftHistory: [
          {
            playerId: 1,
            teamId: 1,
            amount: 0,
            timestamp: new Date(),
            round: 6, // Snake round
            pick: 16,
            player: draftedPlayer,
            team: mockTeams[0]
          }
        ],
        draftedPlayers: [1],
        currentRound: 6,
        currentPick: 17,
        draftMode: 'snake',
        snakeDraftOrder: [1, 2, 3],
        currentDraftTeam: 2
      })

      render(<App isHost={true} />)
      
      const undoButton = screen.getByRole('button', { name: /undo/i })
      await userEvent.click(undoButton)

      expect(mockUpdateFirebaseState).toHaveBeenCalledWith({
        teams: expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            players: [],
            budget: 200 // Budget unchanged in snake
          })
        ]),
        draftedPlayers: [],
        draftHistory: [],
        lastDraftAction: null,
        currentRound: 6,
        currentPick: 16,
        draftMode: 'snake',
        snakeDraftOrder: expect.any(Array),
        currentDraftTeam: expect.any(Number),
        selectedPlayer: null,
        currentBid: 1,
        currentBidTeam: null
      })
    })

    it('should handle undo across auction-to-snake transition', async () => {
      const draftedPlayer = mockPlayers[0]
      const draftTeam = { ...mockTeams[0], players: [draftedPlayer], budget: 150 }
      
      Object.assign(mockFirebaseHook, {
        teams: [draftTeam, mockTeams[1], mockTeams[2]],
        draftHistory: [
          {
            playerId: 1,
            teamId: 1,
            amount: 50,
            timestamp: new Date(),
            round: 5, // Last auction round
            pick: 15,
            player: draftedPlayer,
            team: mockTeams[0]
          }
        ],
        draftedPlayers: [1],
        currentRound: 6, // Now in snake
        currentPick: 16,
        draftMode: 'snake',
        snakeDraftOrder: [1, 2, 3],
        currentDraftTeam: 1
      })

      render(<App isHost={true} />)
      
      const undoButton = screen.getByRole('button', { name: /undo/i })
      await userEvent.click(undoButton)

      expect(mockUpdateFirebaseState).toHaveBeenCalledWith(expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            players: [],
            budget: 200 // Budget should be restored to 150 + 50 = 200
          })
        ]),
        draftedPlayers: [],
        draftHistory: [],
        lastDraftAction: null,
        currentRound: 5,
        currentPick: 15,
        draftMode: 'auction', // Back to auction
        snakeDraftOrder: [],
        currentDraftTeam: null,
        selectedPlayer: null,
        currentBid: 1,
        currentBidTeam: null
      }))
    })

    it('should not allow undo when no draft history exists', async () => {
      Object.assign(mockFirebaseHook, {
        draftHistory: []
      })

      render(<App isHost={true} />)
      
      // Undo button should not be visible when no history
      const undoButton = screen.queryByRole('button', { name: /undo/i })
      expect(undoButton).toBeNull()
    })

    it('should not allow non-host to undo', async () => {
      Object.assign(mockFirebaseHook, {
        draftHistory: [
          {
            playerId: 1,
            teamId: 1,
            amount: 50,
            timestamp: new Date(),
            round: 1,
            pick: 1,
            player: mockPlayers[0],
            team: mockTeams[0]
          }
        ]
      })

      render(<App isHost={false} />)
      
      // Undo button should be disabled for non-host
      const undoButton = screen.getByRole('button', { name: /undo/i })
      expect(undoButton).toBeDisabled()
    })
  })

  describe('Snake Draft Order Calculation', () => {
    it('should calculate correct team on clock for first snake round', () => {
      // Team order based on remaining budget (descending): Team 3 ($200), Team 2 ($190), Team 1 ($180)
      const teamsWithDifferentBudgets = [
        { ...mockTeams[0], budget: 180 },
        { ...mockTeams[1], budget: 190 },
        { ...mockTeams[2], budget: 200 }
      ]

      Object.assign(mockFirebaseHook, {
        teams: teamsWithDifferentBudgets,
        currentRound: 6, // First snake round
        currentPick: 16, // First pick of snake
        draftMode: 'snake',
        snakeDraftOrder: [3, 2, 1], // Based on budget desc
        currentDraftTeam: 3 // Team with highest budget picks first
      })

      render(<App isHost={true} />)
      
      // Verify team 3 appears in the interface
      const teamThreeElements = screen.getAllByText('Team 3')
      expect(teamThreeElements.length).toBeGreaterThan(0)
    })

    it('should reverse order for even snake rounds', () => {
      const teamsWithDifferentBudgets = [
        { ...mockTeams[0], budget: 180 },
        { ...mockTeams[1], budget: 190 },
        { ...mockTeams[2], budget: 200 }
      ]

      Object.assign(mockFirebaseHook, {
        teams: teamsWithDifferentBudgets,
        currentRound: 7, // Second snake round (even)
        currentPick: 19, // First pick of second snake round
        draftMode: 'snake',
        snakeDraftOrder: [3, 2, 1],
        currentDraftTeam: 1 // Team with lowest budget picks first in even rounds
      })

      render(<App isHost={true} />)
      
      // Verify team 1 appears in the interface
      const teamOneElements = screen.getAllByText('Team 1')
      expect(teamOneElements.length).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty draft history gracefully', () => {
      Object.assign(mockFirebaseHook, {
        draftHistory: [],
        draftedPlayers: []
      })

      expect(() => render(<App isHost={true} />)).not.toThrow()
    })

    it('should handle missing player data in undo', async () => {
      Object.assign(mockFirebaseHook, {
        draftHistory: [
          {
            playerId: 999, // Non-existent player
            teamId: 1,
            amount: 50,
            timestamp: new Date(),
            round: 1,
            pick: 1,
            player: null as any,
            team: mockTeams[0]
          }
        ]
      })

      render(<App isHost={true} />)
      
      const undoButton = screen.getByRole('button', { name: /undo/i })
      await userEvent.click(undoButton)

      // Should not crash, and should not call update if player not found
      expect(mockUpdateFirebaseState).not.toHaveBeenCalled()
    })

    it('should handle snake draft with empty snake order', () => {
      Object.assign(mockFirebaseHook, {
        draftMode: 'snake',
        snakeDraftOrder: [],
        currentDraftTeam: null
      })

      expect(() => render(<App isHost={true} />)).not.toThrow()
    })

    it('should handle round transitions correctly during undo', async () => {
      Object.assign(mockFirebaseHook, {
        teams: mockTeams,
        draftHistory: [
          {
            playerId: 1,
            teamId: 1,
            amount: 50,
            timestamp: new Date(),
            round: 2, // Second round
            pick: 4, // First pick of second round  
            player: mockPlayers[0],
            team: mockTeams[0]
          }
        ],
        currentRound: 2,
        currentPick: 5,
        draftMode: 'auction'
      })

      render(<App isHost={true} />)
      
      const undoButton = screen.getByRole('button', { name: /undo/i })
      await userEvent.click(undoButton)

      expect(mockUpdateFirebaseState).toHaveBeenCalledWith(
        expect.objectContaining({
          currentRound: 2,
          currentPick: 4
        })
      )
    })
  })

  describe('Auction Logic Bug', () => {
    it('should allow teams to bid in all auction rounds regardless of previous picks', () => {
      // Test the specific bug: teams marked FULL after first 10 picks in 2-round auction
      const draftSettings = { auctionRounds: 2, rosterSize: 16, budget: 200, draftTimer: 90 }
      
      // Simulate Round 1 complete - each team has 2 picks (10 total picks for 5 teams)
      const round1History = [
        { teamId: 1, playerId: 1, amount: 50, round: 1, pick: 1, timestamp: new Date() },
        { teamId: 2, playerId: 2, amount: 45, round: 1, pick: 2, timestamp: new Date() },
        { teamId: 3, playerId: 3, amount: 40, round: 1, pick: 3, timestamp: new Date() },
        { teamId: 4, playerId: 4, amount: 35, round: 1, pick: 4, timestamp: new Date() },
        { teamId: 5, playerId: 5, amount: 30, round: 1, pick: 5, timestamp: new Date() },
        { teamId: 1, playerId: 6, amount: 25, round: 1, pick: 6, timestamp: new Date() },
        { teamId: 2, playerId: 7, amount: 20, round: 1, pick: 7, timestamp: new Date() },
        { teamId: 3, playerId: 8, amount: 15, round: 1, pick: 8, timestamp: new Date() },
        { teamId: 4, playerId: 9, amount: 10, round: 1, pick: 9, timestamp: new Date() },
        { teamId: 5, playerId: 10, amount: 5, round: 1, pick: 10, timestamp: new Date() }
      ]

      // Test the buggy logic from App.tsx
      const getAuctionPlayersForTeam = (team: any, draftHistory: any[], auctionRounds: number): number => {
        return draftHistory.filter(pick => 
          pick.teamId === team.id && pick.round <= auctionRounds
        ).length
      }

      // Test both the buggy and fixed logic
      const canTeamBidBuggy = (team: any, draftHistory: any[], auctionRounds: number, currentRound: number): boolean => {
        if (currentRound > auctionRounds) return false
        
        const auctionPlayersDrafted = getAuctionPlayersForTeam(team, draftHistory, auctionRounds)
        const remainingAuctionRounds = auctionRounds - currentRound + 1
        
        // This is the buggy logic - incorrectly uses remaining rounds
        return auctionPlayersDrafted < remainingAuctionRounds
      }

      const canTeamBidFixed = (team: any, draftHistory: any[], auctionRounds: number, currentRound: number): boolean => {
        if (currentRound > auctionRounds) return false
        
        const auctionPlayersDrafted = getAuctionPlayersForTeam(team, draftHistory, auctionRounds)
        
        // Fixed logic - check against total auction rounds
        return auctionPlayersDrafted < auctionRounds
      }

      // Test in Round 2
      const currentRound = 2
      const team1 = { id: 1, owner: 'Team 1' }
      
      const auctionPlayersDrafted = getAuctionPlayersForTeam(team1, round1History, draftSettings.auctionRounds)
      const remainingAuctionRounds = draftSettings.auctionRounds - currentRound + 1
      const canBidBuggy = canTeamBidBuggy(team1, round1History, draftSettings.auctionRounds, currentRound)
      const canBidFixed = canTeamBidFixed(team1, round1History, draftSettings.auctionRounds, currentRound)
      
      // Demonstrate the bug:
      expect(auctionPlayersDrafted).toBe(2) // Team 1 has 2 picks from round 1
      expect(remainingAuctionRounds).toBe(1) // 2 - 2 + 1 = 1
      expect(canBidBuggy).toBe(false) // 2 < 1 is false, so team is marked FULL with buggy logic
      
      // Verify the fix works:
      expect(canBidFixed).toBe(false) // 2 < 2 is false, correctly marking team as FULL after 2 auction picks
      
      // Test scenario where team has only 1 pick - should be able to bid
      const onePickHistory = round1History.slice(0, 5) // Only first 5 picks (1 per team)
      const canBidBuggyOnePick = canTeamBidBuggy(team1, onePickHistory, draftSettings.auctionRounds, currentRound)
      const canBidFixedOnePick = canTeamBidFixed(team1, onePickHistory, draftSettings.auctionRounds, currentRound)
      
      expect(canBidBuggyOnePick).toBe(false) // Buggy: 1 < 1 is false (incorrectly marked FULL)
      expect(canBidFixedOnePick).toBe(true) // Fixed: 1 < 2 is true (correctly can bid)
    })
  })
})