import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import App from '../src/App'

// NO MOCKS - Using real Firebase and real data
// Tests will work with actual Firebase state and real player data

describe('Draft Logic with Real Data', () => {
  beforeEach(() => {
    // Clear any existing state
    localStorage.clear()
    sessionStorage.clear()
  })

  it('should load the app with real Firebase data', async () => {
    render(<App isHost={false} />)
    
    // Wait for the app to load with real Firebase data
    await waitFor(() => {
      const leagueElement = screen.queryByText('Yo Soy FIESTA') || screen.queryByText(/league/i)
      expect(leagueElement).toBeInTheDocument()
    }, { timeout: 10000 })
  }, 15000)

  it('should display real player data including DST players', async () => {
    const { container } = render(<App isHost={false} />)
    
    // Wait for app to load
    await waitFor(() => {
      const leagueElement = screen.queryByText('Yo Soy FIESTA') || screen.queryByText(/league/i)
      expect(leagueElement).toBeInTheDocument()
    }, { timeout: 10000 })

    // Wait for player data to load
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Check that real players are loaded
    const tableRows = container.querySelectorAll('tbody tr')
    expect(tableRows.length).toBeGreaterThan(0)

    // Should have real players like those from sample.csv
    const pageText = container.textContent || ''
    const hasRealPlayers = pageText.includes('Chase') || pageText.includes('Robinson') || pageText.includes('Jefferson')
    expect(hasRealPlayers).toBe(true)
  }, 20000)

  it('should show DST players when filtering by DST position', async () => {
    const user = userEvent.setup()
    const { container } = render(<App isHost={false} />)
    
    // Wait for app to load
    await waitFor(() => {
      const leagueElement = screen.queryByText('Yo Soy FIESTA') || screen.queryByText(/league/i)
      expect(leagueElement).toBeInTheDocument()
    }, { timeout: 10000 })

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Find and use position filter
    const positionFilter = container.querySelector('select')
    expect(positionFilter).toBeInTheDocument()

    if (positionFilter) {
      await user.selectOptions(positionFilter, 'DST')
      
      // Wait for filter to apply
      await waitFor(() => {
        expect(positionFilter.value).toBe('DST')
      }, { timeout: 5000 })

      // Check for DST players
      await waitFor(() => {
        const tableRows = container.querySelectorAll('tbody tr')
        expect(tableRows.length).toBeGreaterThan(0)
        
        // Should show DST players
        const dstElements = container.querySelectorAll('*')
        const hasDSTText = Array.from(dstElements).some(el => 
          el.textContent?.includes('D/ST') || 
          el.textContent?.includes('Texans') || 
          el.textContent?.includes('Steelers')
        )
        expect(hasDSTText).toBe(true)
      }, { timeout: 5000 })
    }
  }, 25000)

  it('should display teams from real Firebase data', async () => {
    render(<App isHost={false} />)
    
    // Wait for app to load
    await waitFor(() => {
      const leagueElement = screen.queryByText('Yo Soy FIESTA') || screen.queryByText(/league/i)
      expect(leagueElement).toBeInTheDocument()
    }, { timeout: 10000 })

    // Wait for team data to load
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Check for real team names from Firebase
    const realTeamNames = ['Licking My Lamb Chops', 'Hurts to be in the Pitts', 'West Coast Wankers', 'Adwai', 'Tommy', 'Neill']
    let foundTeamName = false
    
    for (const teamName of realTeamNames) {
      if (screen.queryByText(teamName)) {
        foundTeamName = true
        break
      }
    }
    
    expect(foundTeamName).toBe(true)
  }, 20000)

  it('should have working position filter with all positions including DST', async () => {
    const { container } = render(<App isHost={false} />)
    
    // Wait for app to load
    await waitFor(() => {
      const leagueElement = screen.queryByText('Yo Soy FIESTA') || screen.queryByText(/league/i)
      expect(leagueElement).toBeInTheDocument()
    }, { timeout: 10000 })

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Find position filter
    const positionFilter = container.querySelector('select')
    expect(positionFilter).toBeInTheDocument()

    if (positionFilter) {
      const options = Array.from(positionFilter.options).map(opt => opt.value)
      expect(options).toContain('ALL')
      expect(options).toContain('QB')
      expect(options).toContain('RB')
      expect(options).toContain('WR')
      expect(options).toContain('TE')
      expect(options).toContain('K')
      expect(options).toContain('DST')
    }
  }, 20000)
})
