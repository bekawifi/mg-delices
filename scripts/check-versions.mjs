import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const tauriConfig = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const cargoToml = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8')
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1]

const versions = {
  'package.json': packageJson.version,
  'src-tauri/Cargo.toml': cargoVersion,
  'src-tauri/tauri.conf.json': tauriConfig.version,
}
const uniqueVersions = new Set(Object.values(versions))

if (uniqueVersions.size !== 1 || [...uniqueVersions].some(version => !version)) {
  console.error('Versions incohérentes :')
  for (const [file, version] of Object.entries(versions)) console.error(`- ${file}: ${version ?? 'introuvable'}`)
  process.exit(1)
}

console.log(`Version cohérente : ${packageJson.version}`)
