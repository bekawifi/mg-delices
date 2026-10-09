import '../../scripts/assert-test-environment.mjs'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const required = [
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD',
  'TEST_MANAGER_EMAIL', 'TEST_MANAGER_PASSWORD',
  'TEST_CASHIER_EMAIL', 'TEST_CASHIER_PASSWORD',
  'TEST_INACTIVE_EMAIL', 'TEST_INACTIVE_PASSWORD',
]
for (const name of required) assert.ok(process.env[name], `Variable manquante : ${name}`)
assert.ok(!process.env.VITE_SUPABASE_URL.includes('votre-projet'), 'Utilisez une instance TEST dediee')

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const makeClient = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, options)
async function login(email, password, expectedRole) {
  const db = makeClient()
  const auth = await db.auth.signInWithPassword({ email, password })
  assert.ifError(auth.error)
  assert.ok(auth.data.user)
  if (expectedRole) {
    const profile = await db.from('profiles').select('role,is_active').eq('id', auth.data.user.id).single()
    assert.ifError(profile.error)
    assert.equal(profile.data.role, expectedRole)
    assert.equal(profile.data.is_active, true)
  }
  return db
}

const bucketName = 'product-images'
const bucket = db => db.storage.from(bucketName)
const bytes = size => new Uint8Array(size || [137, 80, 78, 71, 13, 10, 26, 10])
const imageBody = (type, size) => new Blob([bytes(size)], { type })
const pathFor = (productId, extension = 'png') => `products/${productId}/${crypto.randomUUID()}.${extension}`
async function upload(db, path, type = 'image/png', size) {
  return bucket(db).upload(path, imageBody(type, size), { contentType: type, upsert: false })
}
async function assertStored(db, path) {
  const result = await bucket(db).download(path)
  assert.ifError(result.error)
  assert.ok(result.data.size > 0)
}
async function assertMissing(db, path) {
  const extension = path.split('.').pop()
  const type = extension === 'webp' ? 'image/webp' : extension === 'jpg' ? 'image/jpeg' : 'image/png'
  const recreated = await upload(db, path, type)
  assert.ifError(recreated.error)
  assert.ifError((await bucket(db).remove([path])).error)
}

console.log('1/11 Connexions TEST')
const admin = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD, 'admin')
const manager = await login(process.env.TEST_MANAGER_EMAIL, process.env.TEST_MANAGER_PASSWORD, 'gestionnaire')
const cashier = await login(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD, 'caissier')
const inactive = await login(process.env.TEST_INACTIVE_EMAIL, process.env.TEST_INACTIVE_PASSWORD)
const anon = makeClient()

console.log('2/11 Upload admin PNG et lecture publique')
const adminProbe = pathFor(crypto.randomUUID(), 'png')
assert.ifError((await upload(admin, adminProbe)).error)
await assertStored(admin, adminProbe)
const publicUrl = bucket(admin).getPublicUrl(adminProbe).data.publicUrl
assert.match(publicUrl, /^https:\/\//)
assert.ok(!publicUrl.startsWith('data:'))
const publicResponse = await fetch(publicUrl)
assert.equal(publicResponse.status, 200)

console.log('3/11 Upload et suppression gestionnaire')
const managerProbe = pathFor(crypto.randomUUID(), 'webp')
assert.ifError((await upload(manager, managerProbe, 'image/webp')).error)
await assertStored(manager, managerProbe)
assert.ifError((await bucket(manager).remove([managerProbe])).error)
await assertMissing(admin, managerProbe)

console.log('4/11 Ecritures refusees aux roles non autorises')
for (const [name, client] of [['caissier', cashier], ['inactif', inactive], ['anon', anon]]) {
  const denied = await upload(client, pathFor(crypto.randomUUID()))
  assert.ok(denied.error, `Upload ${name} devait etre refuse`)
}

console.log('5/11 Suppressions refusees aux roles non autorises')
for (const [name, client] of [['caissier', cashier], ['inactif', inactive], ['anon', anon]]) {
  await bucket(client).remove([adminProbe])
  await assertStored(admin, adminProbe)
  console.log(`  suppression ${name} sans effet confirmee`)
}
assert.ifError((await bucket(admin).remove([adminProbe])).error)
await assertMissing(admin, adminProbe)

console.log('6/11 Limite 5 Mo et MIME')
const tooLarge = await upload(admin, pathFor(crypto.randomUUID()), 'image/png', 5 * 1024 * 1024 + 1)
assert.ok(tooLarge.error)
const badMime = await upload(admin, pathFor(crypto.randomUUID(), 'txt'), 'text/plain')
assert.ok(badMime.error)

console.log('7/11 Creation produit avec image locale')
const suffix = Date.now()
const productId = crypto.randomUUID()
const firstPath = pathFor(productId, 'jpg')
assert.ifError((await upload(admin, firstPath, 'image/jpeg')).error)
const firstUrl = bucket(admin).getPublicUrl(firstPath).data.publicUrl
const inserted = await admin.from('produits').insert({ id: productId, nom: `Produit image ${suffix}`, prix_vente: 2500, cout_estime: 1000, image_url: firstUrl, disponible: true }).select('id,image_url,nom').single()
assert.ifError(inserted.error)
assert.equal(inserted.data.image_url, firstUrl)
assert.ok(!inserted.data.image_url.startsWith('data:'))
const reread = await admin.from('produits').select('id,image_url,nom').eq('id', productId).single()
assert.ifError(reread.error)
assert.equal(reread.data.image_url, firstUrl)
assert.equal((await fetch(firstUrl)).status, 200)

console.log('8/11 Modification sans changer image')
const unchanged = await admin.from('produits').update({ nom: `Produit image modifie ${suffix}` }).eq('id', productId).select('image_url').single()
assert.ifError(unchanged.error)
assert.equal(unchanged.data.image_url, firstUrl)
await assertStored(admin, firstPath)

console.log('9/11 Remplacement et nettoyage ancienne image')
const secondPath = pathFor(productId, 'webp')
assert.ifError((await upload(admin, secondPath, 'image/webp')).error)
const secondUrl = bucket(admin).getPublicUrl(secondPath).data.publicUrl
const replaced = await admin.from('produits').update({ image_url: secondUrl }).eq('id', productId).select('image_url').single()
assert.ifError(replaced.error)
assert.ifError((await bucket(admin).remove([firstPath])).error)
await assertMissing(admin, firstPath)
await assertStored(admin, secondPath)
assert.equal(replaced.data.image_url, secondUrl)

console.log('10/11 URL externe puis suppression image')
const externalUrl = `https://images.example.test/${crypto.randomUUID()}.png`
const external = await admin.from('produits').update({ image_url: externalUrl }).eq('id', productId).select('image_url').single()
assert.ifError(external.error)
assert.equal(external.data.image_url, externalUrl)
assert.ifError((await bucket(admin).remove([secondPath])).error)
await assertMissing(admin, secondPath)
const removed = await admin.from('produits').update({ image_url: null }).eq('id', productId).select('image_url').single()
assert.ifError(removed.error)
assert.equal(removed.data.image_url, null)

console.log('11/11 Echecs sans produit incoherent et nettoyage')
const failedName = `Produit upload refuse ${suffix}`
const rejectedUpload = await upload(admin, pathFor(crypto.randomUUID(), 'txt'), 'text/plain')
assert.ok(rejectedUpload.error)
const absentAfterUpload = await admin.from('produits').select('id').eq('nom', failedName)
assert.ifError(absentAfterUpload.error)
assert.equal(absentAfterUpload.data.length, 0)
const failedProductId = crypto.randomUUID()
const cleanupPath = pathFor(failedProductId)
assert.ifError((await upload(admin, cleanupPath)).error)
const cleanupUrl = bucket(admin).getPublicUrl(cleanupPath).data.publicUrl
const invalidSave = await admin.from('produits').insert({ id: failedProductId, nom: '', prix_vente: 1, cout_estime: 0, image_url: cleanupUrl, disponible: true })
assert.ok(invalidSave.error)
assert.ifError((await bucket(admin).remove([cleanupPath])).error)
await assertMissing(admin, cleanupPath)
const absentInvalid = await admin.from('produits').select('id').eq('id', failedProductId)
assert.ifError(absentInvalid.error)
assert.equal(absentInvalid.data.length, 0)

await Promise.all([admin.auth.signOut(), manager.auth.signOut(), cashier.auth.signOut(), inactive.auth.signOut()])
console.log('Tous les tests Storage et cycle Produit sont reussis sur TEST.')
