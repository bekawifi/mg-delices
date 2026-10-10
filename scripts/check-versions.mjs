import { readFileSync, readdirSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const tauriConfig = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const cargoToml = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8')
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const cargoName = cargoToml.match(/^name\s*=\s*"([^"]+)"/m)?.[1]
const cargoLibName = cargoToml.match(/^\[lib\][\s\S]*?^name\s*=\s*"([^"]+)"/m)?.[1]

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

const branding={
  'package.json name':packageJson.name,
  'Cargo package':cargoName,
  'Cargo lib':cargoLibName,
  'Tauri productName':tauriConfig.productName,
  'Tauri identifier':tauriConfig.identifier,
}
const expected={
  'package.json name':'restopro',
  'Cargo package':'restopro',
  'Cargo lib':'restopro_lib',
  'Tauri productName':'RestoPRO',
  'Tauri identifier':'com.restopro.desktop',
}
const invalid=Object.entries(expected).filter(([key,value])=>branding[key]!==value)
if(invalid.length){console.error('Identité RestoPRO incohérente :');for(const[key,value]of invalid)console.error(`- ${key}: attendu ${value}, reçu ${branding[key]??'introuvable'}`);process.exit(1)}
if(packageJson.version!=='1.1.1'){console.error(`Version de distribution attendue : 1.1.1, reçue ${packageJson.version}`);process.exit(1)}
console.log('Identité RestoPRO cohérente : restopro / RestoPRO / com.restopro.desktop')

const expectedArtifact=`RestoPRO_${packageJson.version}_x64-setup.exe`
if(expectedArtifact!=='RestoPRO_1.1.1_x64-setup.exe'){console.error(`Nom d’artefact inattendu : ${expectedArtifact}`);process.exit(1)}
const sourceRoot=new URL('../src/',import.meta.url)
const sourceFiles=readdirSync(sourceRoot,{recursive:true}).filter(name=>typeof name==='string'&&/\.(ts|tsx)$/.test(name)&&!name.endsWith('.test.ts')&&!name.endsWith('.test.tsx'))
const forbidden=[]
for(const name of sourceFiles){const content=readFileSync(new URL(name.replaceAll('\\','/'),sourceRoot),'utf8');if(/MG DELICES|MG-DELICE|mg-delices|mg_delices|com\.mgdelices|MG\.DELICES/i.test(content))forbidden.push(name)}
if(forbidden.length){console.error(`Ancienne marque trouvée dans le code métier : ${forbidden.join(', ')}`);process.exit(1)}
console.log(`Artefact attendu : ${expectedArtifact}; aucune dépendance métier à l’ancienne marque`)
