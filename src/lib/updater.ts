import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater'

export type UpdateCheckResult =
  | { status: 'unavailable' }
  | { status: 'up-to-date' }
  | { status: 'available'; version: string; notes: string }
  | { status: 'error'; message: string }

export interface DownloadProgress {
  phase: 'downloading' | 'installing'
  downloadedBytes: number
  totalBytes?: number
  percentage?: number
}

let pendingUpdate: Update | null = null

export function isDesktopApp(scope: unknown = globalThis): boolean {
  return Boolean(scope && typeof scope === 'object' && '__TAURI_INTERNALS__' in scope)
}

export function shouldShowUpdaterControls(desktop = isDesktopApp()): boolean {
  return desktop
}

export function mapUpdaterError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw.toLowerCase()

  if (message.includes('signature')) return 'La signature de la mise à jour est invalide. Installation bloquée.'
  if (message.includes('json') || message.includes('manifest')) return 'Le fichier latest.json du serveur est invalide.'
  if (message.includes('endpoint') || message.includes('url') || message.includes('configuration')) return 'Le service de mise à jour n’est pas encore configuré.'
  if (message.includes('network') || message.includes('dns') || message.includes('offline') || message.includes('connect')) return 'Connexion Internet indisponible ou serveur de mise à jour inaccessible.'
  if (message.includes('download')) return 'Le téléchargement de la mise à jour a été interrompu.'
  if (message.includes('install')) return 'L’installation de la mise à jour a échoué.'
  return 'Impossible de vérifier ou d’installer la mise à jour pour le moment.'
}

export function applyDownloadEvent(current: DownloadProgress, event: DownloadEvent): DownloadProgress {
  if (event.event === 'Started') {
    return { phase: 'downloading', downloadedBytes: 0, totalBytes: event.data.contentLength }
  }
  if (event.event === 'Finished') {
    return { ...current, phase: 'installing', percentage: 100 }
  }

  const downloadedBytes = current.downloadedBytes + event.data.chunkLength
  const percentage = current.totalBytes
    ? Math.min(100, Math.round((downloadedBytes / current.totalBytes) * 100))
    : undefined
  return { ...current, downloadedBytes, percentage }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!isDesktopApp()) return { status: 'unavailable' }

  try {
    if (pendingUpdate) {
      await pendingUpdate.close()
      pendingUpdate = null
    }
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check({ timeout: 15_000, allowDowngrades: false })
    if (!update) return { status: 'up-to-date' }

    pendingUpdate = update
    return {
      status: 'available',
      version: update.version,
      notes: update.body?.trim() || 'Corrections et améliorations.',
    }
  } catch (error) {
    return { status: 'error', message: mapUpdaterError(error) }
  }
}

export async function downloadAndInstallUpdate(
  onProgress: (progress: DownloadProgress) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDesktopApp()) return { ok: false, message: 'Les mises à jour intégrées ne sont disponibles que dans RestoPRO Desktop.' }
  if (!pendingUpdate) return { ok: false, message: 'Recherchez d’abord une mise à jour disponible.' }

  let progress: DownloadProgress = { phase: 'downloading', downloadedBytes: 0 }
  try {
    await pendingUpdate.downloadAndInstall(event => {
      progress = applyDownloadEvent(progress, event)
      onProgress(progress)
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, message: mapUpdaterError(error) }
  }
}
