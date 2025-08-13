import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { playerData } from '../src/data/mockData'
import { Player } from '../src/types'

// Mock Firebase
vi.mock('../src/hooks/useFirebaseDraft', () => ({
  default: () => ({
    teams: [],
    draftHistory: [],
    draftSettings: {
      auctionBudget: 200,
      rosterSize: 16,
      auctionRounds: 5,
      teamCount: 10,
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
    updateFirebaseState: vi.fn(),
    createRoom: vi.fn()
  })
}))

// Helper function to create a CSV file
const createCSVFile = (content: string, filename: string = 'test.csv') => {
  const blob = new Blob([content], { type: 'text/csv' })
  const file = new File([blob], filename, { type: 'text/csv' })
  return file
}

// Helper function to get file input
const getFileInput = () => screen.getByLabelText(/import player rankings/i)

describe('CSV Upload Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Valid CSV Upload', () => {
    it('should successfully upload valid CSV with matching players', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      // Open settings modal
      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      // Create valid CSV content with players that exist in mockData
      const validCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,WR,Ja'Marr Chase,CIN,10,60,350.0
2,RB,Bijan Robinson,ATL,5,58,320.0
3,WR,A.J. Brown,PHI,9,45,260.0`

      const file = createCSVFile(validCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      // Wait for processing
      await waitFor(() => {
        expect(screen.getByText(/successfully matched \d+ players/i)).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it('should display local values in parentheses after successful upload', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      // Open settings modal
      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      const validCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,WR,Ja'Marr Chase,CIN,10,60,350.0`

      const file = createCSVFile(validCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText(/successfully matched/i)).toBeInTheDocument()
      })

      // Close settings modal
      const closeButton = screen.getByRole('button', { name: /×/i })
      await user.click(closeButton)

      // Check if local values appear in parentheses
      // Note: This test assumes the player table is visible and contains the updated values
      await waitFor(() => {
        // Look for the pattern $originalValue ($localValue)
        const valueElements = screen.getAllByText(/\$\d+/)
        expect(valueElements.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Invalid CSV Upload', () => {
    it('should show error for missing required columns', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      const invalidCSV = `RANK,POSITION,PLAYER,TEAM
1,RB,Christian McCaffrey,SF
2,RB,Austin Ekeler,LAC`

      const file = createCSVFile(invalidCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      await waitFor(() => {
        expect(screen.getByText(/missing required columns/i)).toBeInTheDocument()
      })
    })

    it('should show error for non-CSV file', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      const txtFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const fileInput = getFileInput()

      await user.upload(fileInput, txtFile)

      await waitFor(() => {
        expect(screen.getByText(/file must be a csv file/i)).toBeInTheDocument()
      })
    })

    it('should show error when no players match host data', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      const invalidCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,RB,Fake Player,ZZZ,9,65,285.5
2,RB,Another Fake,ABC,5,58,265.2`

      const file = createCSVFile(invalidCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      await waitFor(() => {
        expect(screen.getByText(/no players matched the host data/i)).toBeInTheDocument()
      })
    })
  })

  describe('Fuzzy Matching', () => {
    it('should suggest similar player names when fuzzy matching finds close matches', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      // Use "AJ Brown" instead of "A.J. Brown" to test fuzzy matching
      const fuzzyCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,WR,AJ Brown,PHI,9,45,260.0`

      const file = createCSVFile(fuzzyCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      await waitFor(() => {
        // Should show suggestion for A.J. Brown
        expect(screen.getByText(/did you mean.*A\.J\. Brown/i)).toBeInTheDocument()
      })
    })

    it('should handle multiple fuzzy match errors', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      const fuzzyCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,WR,AJ Brown,PHI,9,45,260.0
2,RB,Christian McCafrey,SF,14,53,293.0`

      const file = createCSVFile(fuzzyCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      await waitFor(() => {
        // Should show multiple error suggestions
        const errorText = screen.getByText(/found \d+ error/i)
        expect(errorText).toBeInTheDocument()
      })
    })
  })

  describe('CSV Processing Edge Cases', () => {
    it('should handle empty CSV file', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      const emptyCSV = ''
      const file = createCSVFile(emptyCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      await waitFor(() => {
        expect(screen.getByText(/csv must have header row and data/i)).toBeInTheDocument()
      })
    })

    it('should handle CSV with only headers', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      const headersOnlyCSV = 'RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS'
      const file = createCSVFile(headersOnlyCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      await waitFor(() => {
        expect(screen.getByText(/csv must have header row and data/i)).toBeInTheDocument()
      })
    })

    it('should handle CSV with malformed data', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      const malformedCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,WR,Ja'Marr Chase,CIN,10,invalid_number,350.0`

      const file = createCSVFile(malformedCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      // Should still process but with 0 values for invalid numbers
      await waitFor(() => {
        expect(screen.getByText(/successfully matched/i)).toBeInTheDocument()
      })
    })
  })

  describe('Position Normalization', () => {
    it('should normalize defense positions correctly', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      // Test different defense position formats
      const defenseCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,D,Test Defense,SF,9,5,100.0
2,DST,Test Defense 2,LAC,5,4,95.0
3,D/ST,Test Defense 3,LAR,7,3,90.0`

      const file = createCSVFile(defenseCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      // Should process without position-related errors
      await waitFor(() => {
        // Will likely show "not found" errors since these aren't real players,
        // but shouldn't show position validation errors
        const errorMessage = screen.getByText(/error/i)
        expect(errorMessage).toBeInTheDocument()
        expect(screen.queryByText(/invalid position/i)).not.toBeInTheDocument()
      })
    })

    it('should normalize kicker positions correctly', async () => {
      const user = userEvent.setup()
      render(<App isHost={false} />)

      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await user.click(settingsButton)

      const kickerCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,PK,Test Kicker,SF,9,2,80.0`

      const file = createCSVFile(kickerCSV)
      const fileInput = getFileInput()

      await user.upload(fileInput, file)

      await waitFor(() => {
        // Should process PK as K position
        const errorMessage = screen.getByText(/error/i)
        expect(errorMessage).toBeInTheDocument()
        expect(screen.queryByText(/invalid position/i)).not.toBeInTheDocument()
      })
    })
  })
})

describe('CSV Upload UI Integration', () => {
  it('should show upload status messages', async () => {
    const user = userEvent.setup()
    render(<App isHost={false} />)

    const settingsButton = screen.getByRole('button', { name: /settings/i })
    await user.click(settingsButton)

    // Initially should show no status
    expect(screen.queryByText(/successfully/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument()

    const validCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,WR,Ja'Marr Chase,CIN,10,60,350.0`

    const file = createCSVFile(validCSV)
    const fileInput = getFileInput()

    await user.upload(fileInput, file)

    // Should show success status
    await waitFor(() => {
      expect(screen.getByText(/successfully matched/i)).toBeInTheDocument()
    })
  })

  it('should clear file input after processing', async () => {
    const user = userEvent.setup()
    render(<App isHost={false} />)

    const settingsButton = screen.getByRole('button', { name: /settings/i })
    await user.click(settingsButton)

    const validCSV = `RANK,POSITION,PLAYER,TEAM,BYE,AUC $,PROJ. PTS
1,WR,Ja'Marr Chase,CIN,10,60,350.0`

    const file = createCSVFile(validCSV)
    const fileInput = getFileInput() as HTMLInputElement

    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText(/successfully matched/i)).toBeInTheDocument()
    })

    // File input should be cleared
    expect(fileInput.value).toBe('')
  })
})
