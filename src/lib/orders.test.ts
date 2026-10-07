import { describe, expect, it } from 'vitest'
import { canTransitionKitchen, elapsedMinutes } from './orders'

describe('commandes restaurant', () => {
  it('calcule le temps écoulé sans valeur négative', () => {
    const now = new Date('2026-10-06T12:30:00Z').getTime()
    expect(elapsedMinutes('2026-10-06T12:00:00Z', now)).toBe(30)
    expect(elapsedMinutes('2026-10-06T13:00:00Z', now)).toBe(0)
  })
  it('n’autorise que les transitions cuisine attendues', () => {
    expect(canTransitionKitchen('a_preparer', 'start')).toBe(true)
    expect(canTransitionKitchen('en_preparation', 'ready')).toBe(true)
    expect(canTransitionKitchen('prete', 'ready')).toBe(false)
    expect(canTransitionKitchen('a_preparer', 'ready')).toBe(false)
  })
})
