import { APP_IDENTIFIER, APP_NAME, APP_VERSION } from './version'

interface SupportEntry { at: string; level: 'info'|'error'; message: string }
const entries: SupportEntry[] = []

function sanitize(value: unknown) {
  return String(value instanceof Error ? value.message : value)
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [REDACTED]')
    .replace(/(password|token|secret|apikey|api_key|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]')
    .slice(0, 500)
}

export function supportLog(level: SupportEntry['level'], message: unknown) {
  entries.push({ at: new Date().toISOString(), level, message: sanitize(message) })
  if (entries.length > 200) entries.shift()
}

export function installSupportLogging() {
  supportLog('info', 'Application démarrée')
  window.addEventListener('online', () => supportLog('info', 'Connexion réseau restaurée'))
  window.addEventListener('offline', () => supportLog('error', 'Connexion réseau perdue'))
  window.addEventListener('error', event => supportLog('error', event.error || event.message))
  window.addEventListener('unhandledrejection', event => supportLog('error', event.reason))
}

export function downloadSupportDiagnostic(extra: Record<string, string>) {
  const lines = [`${APP_NAME} ${APP_VERSION}`, `Identifiant: ${APP_IDENTIFIER}`, `Généré: ${new Date().toISOString()}`, `OS/navigateur: ${navigator.userAgent}`, ...Object.entries(extra).map(([key, value]) => `${key}: ${sanitize(value)}`), '', 'Journal technique:', ...entries.map(entry => `${entry.at} [${entry.level}] ${entry.message}`)]
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `restopro-diagnostic-${Date.now()}.txt`; anchor.click(); URL.revokeObjectURL(url)
}
