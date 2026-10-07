import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const tauriCli = fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url))
const hasSigningKey = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY)
const args = [tauriCli, 'build']

if (!hasSigningKey) {
  console.warn('Clé updater absente : build NSIS normal, sans artefact .sig.')
  args.push('--config', JSON.stringify({ bundle: { createUpdaterArtifacts: false } }))
}

const result = spawnSync(process.execPath, args, {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: process.env,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
