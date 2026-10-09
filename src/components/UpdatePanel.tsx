import { useState } from 'react'
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  isDesktopApp,
  type DownloadProgress,
  type UpdateCheckResult,
} from '../lib/updater'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} octets`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function UpdatePanel() {
  const desktop = isDesktopApp()
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [installError, setInstallError] = useState('')

  if (!desktop) {
    return <p className="mt-3 text-sm text-slate-500">Mises à jour gérées par le déploiement Web.</p>
  }

  const search = async () => {
    setChecking(true)
    setInstallError('')
    setProgress(null)
    setResult(await checkForUpdate())
    setChecking(false)
  }

  const install = async () => {
    setInstallError('')
    setProgress({ phase: 'downloading', downloadedBytes: 0 })
    const outcome = await downloadAndInstallUpdate(setProgress)
    if (!outcome.ok) setInstallError(outcome.message)
  }

  return <div className="mt-3 space-y-3 text-sm">
    <p className="text-slate-500">Canal : Stable</p>
    {checking && <p role="status">Recherche d’une mise à jour…</p>}
    {result?.status === 'up-to-date' && <p className="text-emerald-700">RestoPRO est à jour.</p>}
    {result?.status === 'error' && <p className="text-red-700" role="alert">{result.message}</p>}
    {result?.status === 'available' && <div className="rounded-xl bg-emerald-50 p-4">
      <p className="font-bold text-emerald-900">Version {result.version} disponible</p>
      <p className="mt-2 whitespace-pre-wrap text-slate-700">{result.notes}</p>
      <button className="btn-primary mt-3" disabled={Boolean(progress)} onClick={() => void install()}>
        Télécharger et installer
      </button>
    </div>}
    {progress && <div role="status">
      <p>{progress.phase === 'installing' ? 'Installation…' : 'Téléchargement…'}</p>
      <p className="text-slate-500">
        {formatBytes(progress.downloadedBytes)} téléchargés
        {progress.percentage !== undefined ? ` — ${progress.percentage} %` : ''}
      </p>
      {progress.percentage !== undefined && <progress className="mt-2 w-full" max={100} value={progress.percentage}/>} 
    </div>}
    {installError && <p className="text-red-700" role="alert">{installError}</p>}
    <button className="btn-secondary" disabled={checking || Boolean(progress)} onClick={() => void search()}>
      {checking ? 'Recherche…' : 'Rechercher une mise à jour'}
    </button>
  </div>
}
