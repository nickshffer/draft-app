import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Player, Team, DraftSettings } from '../src/types'
import { push } from 'firebase/database'

// Mock Firebase first
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  push: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' }))
}))

vi.mock('../src/firebase/config', () => ({
  database: {}
}))

// Import after mocking
import { DraftLogger } from '../src/utils/draftLogger'
import { DraftActionLogger, createDraftActionLogger } from '../src/utils/draftActionLogger'

describe('Draft Logger', () => {
  let logger: DraftLogger

  beforeEach(() => {
    logger = new DraftLogger()
    logger.clearQueue()
  })

  describe('Undefined Value Sanitization', () => {
    test('should convert undefined metadata values to null', async () => {
      const mockPush = vi.mocked(push);
      mockPush.mockClear();

      await logger.logAction(
        'test-room',
        'test_action',
        { someKey: 'oldValue' },
        { someKey: 'newValue' },
        {
          isHost: true,
          undefinedValue: undefined,
          nullValue: null,
          playerOptional: undefined,
          nestedObject: {
            deepUndefined: undefined,
            deepNull: null,
            deepValue: 'test'
          }
        }
      );

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check that push was called with sanitized metadata
      expect(mockPush).toHaveBeenCalledWith(
        undefined, // Firebase ref (mocked)
        expect.objectContaining({
          action: 'test_action',
          roomId: 'test-room',
          metadata: {
            isHost: true,
            undefinedValue: null,
            nullValue: null,
            playerOptional: null,
            nestedObject: {
              deepUndefined: null,
              deepNull: null,
              deepValue: 'test'
            }
          }
        })
      );
    });

    test('should sanitize undefined values in changes array', async () => {
      const mockPush = vi.mocked(push);
      mockPush.mockClear();

      await logger.logAction(
        'test-room',
        'test_action',
        { 
          player: undefined,
          team: { id: 1, players: undefined }
        },
        { 
          player: { id: 1, name: 'Test' },
          team: { id: 1, players: [{ id: 1 }] }
        },
        { isHost: true }
      );

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockPush).toHaveBeenCalledWith(
        undefined, // Firebase ref (mocked)
        expect.objectContaining({
          action: 'test_action',
          roomId: 'test-room',
          changes: expect.arrayContaining([
            expect.objectContaining({
              key: 'player',
              prevValue: null, // undefined converted to null
              newValue: { id: 1, name: 'Test' }
            }),
            expect.objectContaining({
              key: 'team',
              prevValue: { id: 1, players: null }, // nested undefined converted to null
              newValue: { id: 1, players: [{ id: 1 }] }
            })
          ])
        })
      );
    });

    test('should handle arrays with undefined values', async () => {
      const mockPush = vi.mocked(push);
      mockPush.mockClear();

      await logger.logAction(
        'test-room',
        'test_action',
        { players: [{ id: 1 }, undefined, { id: 3 }] },
        { players: [{ id: 1 }, { id: 2 }, { id: 3 }] },
        { isHost: true }
      );

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockPush).toHaveBeenCalledWith(
        undefined, // Firebase ref (mocked)
        expect.objectContaining({
          action: 'test_action',
          roomId: 'test-room',
          changes: expect.arrayContaining([
            expect.objectContaining({
              key: 'players',
              prevValue: [{ id: 1 }, null, { id: 3 }], // undefined in array converted to null
              newValue: [{ id: 1 }, { id: 2 }, { id: 3 }]
            })
          ])
        })
      );
    });
  });

  describe('DraftLogger Core', () => {
    it('should detect changes between different states', () => {
      const prevState = { currentRound: 1 }
      const newState = { currentRound: 2 }

      // Use internal method for testing
      const changes = (logger as any).calculateChanges(prevState, newState)
      
      expect(changes).toHaveLength(1)
      expect(changes[0].key).toBe('currentRound')
      expect(changes[0].prevValue).toBe(1)
      expect(changes[0].newValue).toBe(2)
    })

    it('should detect no changes for identical states', () => {
      const state = { currentRound: 1, currentPick: 1 }

      const changes = (logger as any).calculateChanges(state, state)
      
      expect(changes).toHaveLength(0)
    })

    it('should handle deep object comparisons', () => {
      const prevState = {
        teams: [{ id: 1, name: 'Team 1', players: [] }]
      }

      const newState = {
        teams: [{ id: 1, name: 'Team 1', players: [{ id: 1, name: 'Player 1' }] }]
      }

      const changes = (logger as any).calculateChanges(prevState, newState)
      
      expect(changes).toHaveLength(1)
      expect(changes[0].key).toBe('teams')
    })

    it('should handle null/undefined differences', () => {
      const prevState = { value: null }
      const newState = { value: undefined }

      const changes = (logger as any).calculateChanges(prevState, newState)
      
      expect(changes).toHaveLength(1)
    })

    it('should sanitize large objects', () => {
      const largeData = 'x'.repeat(15000)
      const sanitized = (logger as any).sanitizeValue({ data: largeData })
      
      expect(typeof sanitized).toBe('string')
      expect(sanitized).toContain('Large object')
    })

    it('should handle circular references', () => {
      const obj: any = { name: 'test' }
      obj.self = obj

      const sanitized = (logger as any).sanitizeValue(obj)
      
      expect(typeof sanitized).toBe('string')
      expect(sanitized).toBe('[Unserializable object]')
    })

    it('should enable/disable logging', () => {
      expect(logger['isEnabled']).toBe(true)
      
      logger.setEnabled(false)
      expect(logger['isEnabled']).toBe(false)
      
      logger.setEnabled(true)
      expect(logger['isEnabled']).toBe(true)
    })
  })

  describe('Queue Management', () => {
    it('should manage queue size correctly', () => {
      expect(logger.getQueueSize()).toBe(0)
      
      logger['logQueue'].push({
        timestamp: Date.now(),
        roomId: 'test',
        action: 'test',
        changes: [],
        metadata: {}
      } as any)
      
      expect(logger.getQueueSize()).toBe(1)
      
      logger.clearQueue()
      expect(logger.getQueueSize()).toBe(0)
    })
  })

  describe('DraftActionLogger', () => {
    let actionLogger: DraftActionLogger
    let mockPlayer: Player
    let mockTeam: Team

    beforeEach(() => {
      actionLogger = createDraftActionLogger('test-room', true)
      
      mockPlayer = {
        id: 1,
        name: 'Test Player',
        position: 'RB',
        team: 'SF',
        fantasyValue: 300,
        byeWeek: 9,
        expectedPoints: 250,
        projectedPoints: 18.5,
        auctionValue: 45
      }

      mockTeam = {
        id: 1,
        name: 'Test Team',
        owner: 'Test Owner',
        budget: 200,
        players: []
      }
    })

    it('should create action logger with correct room and host status', () => {
      expect(actionLogger).toBeDefined()
      expect(actionLogger['roomId']).toBe('test-room')
      expect(actionLogger['isHost']).toBe(true)
    })

    it('should identify settings changes correctly', () => {
      const prevSettings: DraftSettings = {
        auctionBudget: 200,
        rosterSize: 16,
        auctionRounds: 5,
        teamCount: 10,
        draftTimer: 90
      }

      const newSettings: DraftSettings = {
        ...prevSettings,
        auctionBudget: 250,
        teamCount: 12
      }

      const changes = (actionLogger as any).getSettingsChanges(prevSettings, newSettings)
      
      expect(changes).toContain('auctionBudget: 200 → 250')
      expect(changes).toContain('teamCount: 10 → 12')
      expect(changes).toHaveLength(2)
    })

    it('should identify team changes correctly', () => {
      const prevTeam = { ...mockTeam }
      const newTeam = { ...mockTeam, name: 'Updated Team', owner: 'New Owner' }

      const changes = (actionLogger as any).getTeamChanges(prevTeam, newTeam)
      
      expect(changes).toContain('name: "Test Team" → "Updated Team"')
      expect(changes).toContain('owner: "Test Owner" → "New Owner"')
      expect(changes).toHaveLength(2)
    })
  })
})