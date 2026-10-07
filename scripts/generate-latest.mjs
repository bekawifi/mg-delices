import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!name?.startsWith('--') || value === undefined) {
    console.error('Usage : npm.cmd run release:latest -- --sig <fichier.sig> --notes <texte> --pub-date <RFC3339> [--output latest.json]')
    process.exit(1)
  }
  args.set(name.slice(2), value)
}

const sigPath = args.get('sig')
const notes = args.get('notes')
const pubDate = args.get('pub-date')
const outputPath = resolve(args.get('output') ?? 'latest.json')

if (!sigPath || !notes || !pubDate) {
  console.error('Les options --sig, --notes et --pub-date sont obligatoires.')
  process.exit(1)
}
if (Number.isNaN(Date.parse(pubDate)) || !/^\d{4}-\d{2}-\d{2}T/.test(pubDate)) {
  console.error('--pub-date doit être une date RFC 3339 valide.')
  process.exit(1)
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = packageJson.version
const signature = readFileSync(resolve(sigPath), 'utf8').trim()
if (!signature || signature.includes('CONTENU_DU_FICHIER_SIG')) {
  console.error('Le fichier .sig est vide ou contient un placeholder.')
  process.exit(1)
}

const fileName = `MG DELICES_${version}_x64-setup.exe`
const artifactUrl = `https://github.com/bekawifi/mg-delices/releases/download/v${version}/${encodeURIComponent(fileName)}`
const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms: {
    'windows-x86_64': {
      signature,
      url: artifactUrl,
    },
  },
}

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`latest.json généré pour MG DELICES ${version} : ${outputPath}`)
console.log(`Artefact attendu : ${artifactUrl}`)
