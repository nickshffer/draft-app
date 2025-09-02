import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
    await act(async () => {
      render(<App isHost={false} />)
    })
    
    // Wait for the app to load with real Firebase data
    await waitFor(() => {
      const leagueElement = screen.queryByText('Yo Soy FIESTA') || screen.queryByText(/league/i)
      expect(leagueElement).toBeInTheDocument()
    }, { timeout: 10000 })
  }, 15000)

  // Core DST functionality test - combines multiple checks in one test
  it('should display DST players and allow filtering', async () => {
    const user = userEvent.setup()
    let container: HTMLElement
    
    await act(async () => {
      const result = render(<App isHost={false} />)
      container = result.container
    })
    
    // Wait for app to load
    await waitFor(() => {
      const leagueElement = screen.queryByText('Yo Soy FIESTA') || screen.queryByText(/league/i)
      expect(leagueElement).toBeInTheDocument()
    }, { timeout: 10000 })

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Check position filter has DST option
    const positionFilter = container.querySelector('select')
    expect(positionFilter).toBeInTheDocument()
    
    if (positionFilter) {
      const options = Array.from(positionFilter.options).map(opt => opt.value)
      expect(options).toContain('DST')
      
      // Filter by DST and verify DST players appear
      await user.selectOptions(positionFilter, 'DST')
      
      await waitFor(() => {
        const tableRows = container.querySelectorAll('tbody tr')
        expect(tableRows.length).toBeGreaterThan(0)
      }, { timeout: 5000 })
    }
  }, 20000)
})
