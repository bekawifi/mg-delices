import { describe, expect, it } from 'vitest'
import { applyDownloadEvent, isDesktopApp, mapUpdaterError, shouldShowUpdaterControls } from './updater'

describe('updater desktop', () => {
  it('distingue Tauri du navigateur', () => {
    expect(isDesktopApp({})).toBe(false)
    expect(isDesktopApp({ __TAURI_INTERNALS__: {} })).toBe(true)
    expect(shouldShowUpdaterControls(false)).toBe(false)
  })

  it('calcule la progression avec et sans taille connue', () => {
    let progress = applyDownloadEvent(
      { phase: 'downloading', downloadedBytes: 12 },
      { event: 'Started', data: { contentLength: 100 } },
    )
    progress = applyDownloadEvent(progress, { event: 'Progress', data: { chunkLength: 25 } })
    expect(progress).toMatchObject({ downloadedBytes: 25, totalBytes: 100, percentage: 25 })
    expect(applyDownloadEvent(progress, { event: 'Finished' }).phase).toBe('installing')
  })

  it('bloque clairement une signature invalide et masque les erreurs techniques', () => {
    expect(mapUpdaterError(new Error('invalid signature'))).toContain('Installation bloquée')
    expect(mapUpdaterError(new Error('ECONNREFUSED'))).not.toContain('ECONNREFUSED')
  })
})
