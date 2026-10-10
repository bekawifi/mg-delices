import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TEST_PROJECT_REF = 'psxwcqnolkyfaznpidhd'
const envPath = fileURLToPath(new URL('../.env.production.local', import.meta.url))

function fail(message) {
  console.error(`Configuration Production refusee : ${message}`)
  process.exit(1)
}

function parseEnv(text) {
  const values = new Map()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) fail('ligne invalide dans .env.production.local')
    const name = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values.set(name, value)
  }
  return values
}

let values
try {
  values = parseEnv(readFileSync(envPath, 'utf8'))
} catch (error) {
  if (error?.code === 'ENOENT') fail('.env.production.local absent')
  throw error
}

const environment = values.get('RESTOPRO_ENV')
const url = values.get('VITE_SUPABASE_URL')
const publicKey = values.get('VITE_SUPABASE_PUBLISHABLE_KEY')

if (environment !== 'production') fail('RESTOPRO_ENV doit valoir production')
if (!url) fail('VITE_SUPABASE_URL absente du fichier Production')
if (!publicKey) fail('VITE_SUPABASE_PUBLISHABLE_KEY absente du fichier Production')
if (url.includes(TEST_PROJECT_REF)) fail('le project ref TEST est interdit en Production')
if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) fail('URL Supabase Production invalide')
if (/service[_-]?role/i.test(publicKey)) fail('une cle service_role est interdite')
if (publicKey.startsWith('sb_secret_')) fail('une cle sb_secret_ est interdite')

try {
  const payload = publicKey.split('.')[1]
  if (payload) {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (decoded?.role === 'service_role') fail('une cle JWT service_role est interdite')
  }
} catch {
  // Les cles publishable modernes ne sont pas des JWT.
}

for (const name of values.keys()) {
  if (/service[_-]?role|private[_-]?key|secret/i.test(name)) {
    fail(`variable interdite dans le frontend : ${name}`)
  }
}

const projectRef = new URL(url).hostname.split('.')[0]
console.log(`Configuration Production validee pour le projet ${projectRef}.`)
