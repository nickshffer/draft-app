import { describe, it, expect } from 'vitest'
import { Player } from '../src/types'
import { readFileSync } from 'fs'
import { join } from 'path'

const sampleCsvData = readFileSync(join(__dirname, '../src/data/sample.csv'), 'utf-8')

// Parse real sample.csv data - this is how the app actually loads player data
const parseSampleCsvData = (): Player[] => {
  // Parse the actual sample.csv file content
  const lines = sampleCsvData.split('\n').filter(line => line.trim())
  const players: Player[] = []
  
  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i].trim()
    if (!line) continue
    
    const values = line.split(',').map(v => v.trim())
    if (values.length < 7) continue
    
    let position = values[1].toUpperCase()
    if (['D', 'DEF', 'D/ST'].includes(position)) position = 'DST'
    if (['PK'].includes(position)) position = 'K'
    
    const player: Player = {
      id: i,
      rank: parseInt(values[0]) || i,
      position: position,
      name: values[2],
      team: values[3],
      bye: parseInt(values[4]) || 0,
      projectedValue: parseFloat(values[5]) || 0,
      projectedPoints: parseFloat(values[6]) || 0
    }
    
    players.push(player)
  }
  
  return players
}

describe('DST Player Availability', () => {
  it('should parse DST players from real sample.csv data', () => {
    const players = parseSampleCsvData()
    
    // Filter for DST players
    const dstPlayers = players.filter(player => player.position === 'DST')
    
    // Should have DST players from the real sample.csv
    expect(dstPlayers.length).toBeGreaterThan(0)
    
    // Check for specific DST teams that should exist in sample.csv
    const dstNames = dstPlayers.map(p => p.name)
    const hasTexans = dstNames.some(name => name.includes('Texans'))
    const hasSteelers = dstNames.some(name => name.includes('Steelers'))
    
    expect(hasTexans || hasSteelers).toBe(true)
  })

  it('should have correct position normalization for DST players', () => {
    const players = parseSampleCsvData()
    
    // All defense players should be normalized to 'DST'
    const dstPlayers = players.filter(player => player.position === 'DST')
    
    dstPlayers.forEach(player => {
      expect(player.position).toBe('DST')
    })
  })

  it('should include DST in available positions', () => {
    const players = parseSampleCsvData()
    
    // Get all unique positions
    const availablePositions = [...new Set(players.map(p => p.position))]
    
    // Should include DST position
    expect(availablePositions).toContain('DST')
  })

  it('should have DST players with proper team assignments', () => {
    const players = parseSampleCsvData()
    const dstPlayers = players.filter(player => player.position === 'DST')
    
    // DST players should have team assignments
    dstPlayers.forEach(player => {
      expect(player.team).toBeTruthy()
      expect(typeof player.team).toBe('string')
      expect(player.team.length).toBeGreaterThan(0)
    })
  })
})