import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Player } from '../src/types'

// Mock the entire App component with controlled player data
const MockPlayerTable = ({ players }: { players: Player[] }) => {
  return (
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th>AUC $</th>
          <th>PROJ. PTS</th>
        </tr>
      </thead>
      <tbody>
        {players.map(player => (
          <tr key={player.id}>
            <td>{player.name}</td>
            <td>
              ${player.projectedValue}
              {player.localProjectedValue !== undefined && player.localProjectedValue !== player.projectedValue && (
                <span className="text-gray-500"> (${player.localProjectedValue})</span>
              )}
            </td>
            <td>
              {player.projectedPoints.toFixed(1)}
              {player.localProjectedPoints !== undefined && player.localProjectedPoints !== player.projectedPoints && (
                <span className="text-gray-500"> ({player.localProjectedPoints.toFixed(1)})</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

describe('Local Value Display', () => {
  describe('Parenthetical Value Display', () => {
    it('should show local values in parentheses when different from host values', () => {
      const playersWithLocalValues: Player[] = [
        {
          id: 1,
          rank: 1,
          position: "WR",
          name: "Ja'Marr Chase",
          team: "CIN",
          bye: 10,
          projectedValue: 57,
          projectedPoints: 351.75,
          localProjectedValue: 60,
          localProjectedPoints: 350.0
        }
      ]

      render(<MockPlayerTable players={playersWithLocalValues} />)

      // Should show host value with local value in parentheses
      expect(screen.getByText('$57')).toBeInTheDocument()
      expect(screen.getByText('($60)')).toBeInTheDocument()
      expect(screen.getByText('351.8')).toBeInTheDocument() // toFixed(1)
      expect(screen.getByText('(350.0)')).toBeInTheDocument()
    })

    it('should not show parentheses when local values match host values', () => {
      const playersWithSameValues: Player[] = [
        {
          id: 1,
          rank: 1,
          position: "WR",
          name: "Ja'Marr Chase",
          team: "CIN",
          bye: 10,
          projectedValue: 57,
          projectedPoints: 351.75,
          localProjectedValue: 57,
          localProjectedPoints: 351.75
        }
      ]

      render(<MockPlayerTable players={playersWithSameValues} />)

      // Should only show host values, no parentheses
      expect(screen.getByText('$57')).toBeInTheDocument()
      expect(screen.queryByText('($57)')).not.toBeInTheDocument()
      expect(screen.getByText('351.8')).toBeInTheDocument()
      expect(screen.queryByText('(351.8)')).not.toBeInTheDocument()
    })

    it('should not show parentheses when no local values are set', () => {
      const playersWithoutLocalValues: Player[] = [
        {
          id: 1,
          rank: 1,
          position: "WR",
          name: "Ja'Marr Chase",
          team: "CIN",
          bye: 10,
          projectedValue: 57,
          projectedPoints: 351.75
        }
      ]

      render(<MockPlayerTable players={playersWithoutLocalValues} />)

      // Should only show host values, no parentheses
      expect(screen.getByText('$57')).toBeInTheDocument()
      expect(screen.queryByText(/\(\$\d+\)/)).not.toBeInTheDocument()
      expect(screen.getByText('351.8')).toBeInTheDocument()
      expect(screen.queryByText(/\(\d+\.\d+\)/)).not.toBeInTheDocument()
    })

    it('should handle zero local values correctly', () => {
      const playersWithZeroLocalValues: Player[] = [
        {
          id: 1,
          rank: 1,
          position: "WR",
          name: "Ja'Marr Chase",
          team: "CIN",
          bye: 10,
          projectedValue: 57,
          projectedPoints: 351.75,
          localProjectedValue: 0,
          localProjectedPoints: 0
        }
      ]

      render(<MockPlayerTable players={playersWithZeroLocalValues} />)

      // Should show parentheses even for zero values since they're different
      expect(screen.getByText('$57')).toBeInTheDocument()
      expect(screen.getByText('($0)')).toBeInTheDocument()
      expect(screen.getByText('351.8')).toBeInTheDocument()
      expect(screen.getByText('(0.0)')).toBeInTheDocument()
    })

    it('should handle decimal values correctly', () => {
      const playersWithDecimalValues: Player[] = [
        {
          id: 1,
          rank: 1,
          position: "WR",
          name: "Ja'Marr Chase",
          team: "CIN",
          bye: 10,
          projectedValue: 57,
          projectedPoints: 351.75,
          localProjectedValue: 59.5,
          localProjectedPoints: 348.25
        }
      ]

      render(<MockPlayerTable players={playersWithDecimalValues} />)

      // Should show decimal values correctly
      expect(screen.getByText('$57')).toBeInTheDocument()
      expect(screen.getByText('($59.5)')).toBeInTheDocument()
      expect(screen.getByText('351.8')).toBeInTheDocument()
      expect(screen.getByText('(348.3)')).toBeInTheDocument() // toFixed(1)
    })
  })

  describe('Multiple Players Display', () => {
    it('should handle mixed scenarios with multiple players', () => {
      const mixedPlayers: Player[] = [
        {
          id: 1,
          rank: 1,
          position: "WR",
          name: "Ja'Marr Chase",
          team: "CIN",
          bye: 10,
          projectedValue: 57,
          projectedPoints: 351.75,
          localProjectedValue: 60,
          localProjectedPoints: 350.0
        },
        {
          id: 2,
          rank: 2,
          position: "RB",
          name: "Bijan Robinson",
          team: "ATL",
          bye: 5,
          projectedValue: 56,
          projectedPoints: 317.44
          // No local values
        },
        {
          id: 3,
          rank: 3,
          position: "WR",
          name: "A.J. Brown",
          team: "PHI",
          bye: 9,
          projectedValue: 42,
          projectedPoints: 255.62,
          localProjectedValue: 42,
          localProjectedPoints: 255.62
        }
      ]

      render(<MockPlayerTable players={mixedPlayers} />)

      // First player: should show parentheses (different values)
      expect(screen.getByText('$57')).toBeInTheDocument()
      expect(screen.getByText('($60)')).toBeInTheDocument()

      // Second player: should not show parentheses (no local values)
      expect(screen.getByText('$56')).toBeInTheDocument()
      expect(screen.queryByText('($56)')).not.toBeInTheDocument()

      // Third player: should not show parentheses (same values)
      expect(screen.getByText('$42')).toBeInTheDocument()
      expect(screen.queryByText('($42)')).not.toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined local values gracefully', () => {
      const playersWithUndefinedValues: Player[] = [
        {
          id: 1,
          rank: 1,
          position: "WR",
          name: "Ja'Marr Chase",
          team: "CIN",
          bye: 10,
          projectedValue: 57,
          projectedPoints: 351.75,
          localProjectedValue: undefined,
          localProjectedPoints: undefined
        }
      ]

      render(<MockPlayerTable players={playersWithUndefinedValues} />)

      // Should only show host values
      expect(screen.getByText('$57')).toBeInTheDocument()
      expect(screen.queryByText(/\(\$\d+\)/)).not.toBeInTheDocument()
    })

    it('should handle very large numbers correctly', () => {
      const playersWithLargeValues: Player[] = [
        {
          id: 1,
          rank: 1,
          position: "QB",
          name: "Josh Allen",
          team: "BUF",
          bye: 7,
          projectedValue: 45,
          projectedPoints: 385.2,
          localProjectedValue: 999,
          localProjectedPoints: 999.99
        }
      ]

      render(<MockPlayerTable players={playersWithLargeValues} />)

      expect(screen.getByText('$45')).toBeInTheDocument()
      expect(screen.getByText('($999)')).toBeInTheDocument()
      expect(screen.getByText('385.2')).toBeInTheDocument()
      expect(screen.getByText('(1000.0)')).toBeInTheDocument() // toFixed(1)
    })
  })
})
