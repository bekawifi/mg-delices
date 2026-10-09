import '../../scripts/assert-test-environment.mjs'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const required = [
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD',
  'TEST_CASHIER_EMAIL', 'TEST_CASHIER_PASSWORD',
  'TEST_MANAGER_EMAIL', 'TEST_MANAGER_PASSWORD',
  'TEST_SERVER_EMAIL', 'TEST_SERVER_PASSWORD',
  'TEST_KITCHEN_EMAIL', 'TEST_KITCHEN_PASSWORD',
  'TEST_INACTIVE_EMAIL', 'TEST_INACTIVE_PASSWORD',
]
for (const name of required) assert.ok(process.env[name], `Variable TEST manquante : ${name}`)
assert.ok(!process.env.VITE_SUPABASE_URL.includes('votre-projet'), 'Utilisez uniquement une instance TEST dediee')

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const client = key => createClient(process.env.VITE_SUPABASE_URL, key, options)
async function login(email, password) {
  const db = client(process.env.VITE_SUPABASE_ANON_KEY)
  const result = await db.auth.signInWithPassword({ email, password })
  assert.ifError(result.error)
  return db
}
async function expectDenied(promise, message) {
  const result = await promise
  assert.ok(result.error, message)
}

console.log('1/12 Connexions TEST et role super_admin')
const superAdmin = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
const cashier = await login(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD)
const manager = await login(process.env.TEST_MANAGER_EMAIL, process.env.TEST_MANAGER_PASSWORD)
const server = await login(process.env.TEST_SERVER_EMAIL, process.env.TEST_SERVER_PASSWORD)
const kitchen = await login(process.env.TEST_KITCHEN_EMAIL, process.env.TEST_KITCHEN_PASSWORD)
const inactive = await login(process.env.TEST_INACTIVE_EMAIL, process.env.TEST_INACTIVE_PASSWORD)
const me = await superAdmin.rpc('get_my_profile')
assert.ifError(me.error)
assert.equal(me.data.role, 'super_admin')
assert.equal(me.data.is_active, true)

console.log('2/12 Liste et recherche utilisateurs')
const listed = await superAdmin.rpc('list_user_profiles', { p_search: process.env.TEST_CASHIER_EMAIL, p_role: null, p_active: true, p_limit: 20, p_offset: 0 })
assert.ifError(listed.error)
assert.ok(listed.data.rows.some(row => row.email === process.env.TEST_CASHIER_EMAIL))
const allUsers = await superAdmin.rpc('list_user_profiles', { p_search: null, p_role: null, p_active: null, p_limit: 200, p_offset: 0 })
assert.ifError(allUsers.error)
const cashierRow = allUsers.data.rows.find(row => row.email === process.env.TEST_CASHIER_EMAIL)
const managerRow = allUsers.data.rows.find(row => row.email === process.env.TEST_MANAGER_EMAIL)
assert.ok(cashierRow && managerRow)

console.log('3/12 Refus des roles non administratifs, compte inactif et anon')
for (const [name, db] of [['gestionnaire', manager], ['caissier', cashier], ['serveur', server], ['cuisine', kitchen]]) {
  await expectDenied(db.rpc('list_user_profiles'), `${name} ne doit pas lister les utilisateurs`)
}
await expectDenied(inactive.rpc('list_user_profiles'), 'Le compte inactif ne doit pas lister les utilisateurs')
await expectDenied(client(process.env.VITE_SUPABASE_ANON_KEY).rpc('list_user_profiles'), 'Anon ne doit pas lister les utilisateurs')

console.log('4/12 Creation temporaire d un admin normal a partir du gestionnaire')
const promoted = await superAdmin.rpc('update_user_profile', { p_user_id: managerRow.id, p_full_name: managerRow.full_name, p_role: 'admin', p_is_active: true })
assert.ifError(promoted.error)
assert.equal(promoted.data.role, 'admin')
const normalAdmin = manager
let createdUserId = null

try {
console.log('5/12 Admin limite aux roles non privilegies')
const harmlessUpdate = await normalAdmin.rpc('update_user_profile', { p_user_id: cashierRow.id, p_full_name: cashierRow.full_name, p_role: cashierRow.role, p_is_active: cashierRow.is_active })
assert.ifError(harmlessUpdate.error)
await expectDenied(normalAdmin.rpc('update_user_profile', { p_user_id: cashierRow.id, p_full_name: cashierRow.full_name, p_role: 'super_admin', p_is_active: true }), 'Un admin ne peut pas promouvoir super_admin')
await expectDenied(normalAdmin.rpc('update_user_profile', { p_user_id: me.data.id, p_full_name: me.data.full_name, p_role: 'admin', p_is_active: true }), 'Un admin ne peut pas modifier un super_admin')

console.log('6/12 Protection du dernier super_admin actif')
await expectDenied(superAdmin.rpc('update_user_profile', { p_user_id: me.data.id, p_full_name: me.data.full_name, p_role: 'admin', p_is_active: true }), 'Le dernier super_admin ne peut pas etre retrograde')
await expectDenied(superAdmin.rpc('update_user_profile', { p_user_id: me.data.id, p_full_name: me.data.full_name, p_role: 'super_admin', p_is_active: false }), 'Le dernier super_admin ne peut pas etre desactive')

console.log('7/12 Creation securisee et invitation par Edge Function')
if (process.env.TEST_INVITE_EMAIL) {
  const existing = await superAdmin.rpc('list_user_profiles', { p_search: process.env.TEST_INVITE_EMAIL, p_role: null, p_active: null, p_limit: 20, p_offset: 0 })
  assert.ifError(existing.error)
  const exact = existing.data.rows.filter(row => row.email.toLowerCase() === process.env.TEST_INVITE_EMAIL.toLowerCase())
  assert.ok(exact.length <= 1, 'La boite TEST ne doit correspondre qu a un compte')
  if (exact.length === 1) {
    createdUserId = exact[0].id
    console.log('  Compte invite existant reutilise pour la suite du test')
  } else {
    const created = await superAdmin.functions.invoke('admin-users', { body: { action: 'create', email: process.env.TEST_INVITE_EMAIL, full_name: 'Utilisateur validation TEST', role: 'serveur', is_active: true } })
    assert.ifError(created.error)
    assert.equal(created.data.invitation_sent, true)
    assert.equal(created.data.user.email, process.env.TEST_INVITE_EMAIL.toLowerCase())
    assert.equal(created.data.user.role, 'serveur')
    createdUserId = created.data.user.id
  }
} else {
  console.log('  SKIP: TEST_INVITE_EMAIL doit designer une boite TEST reelle et controlee')
}

console.log('8/12 Modification, desactivation et reactivation')
const disabled = await superAdmin.rpc('update_user_profile', { p_user_id: cashierRow.id, p_full_name: cashierRow.full_name, p_role: cashierRow.role, p_is_active: false })
assert.ifError(disabled.error)
assert.equal(disabled.data.is_active, false)
const reenabled = await superAdmin.rpc('update_user_profile', { p_user_id: cashierRow.id, p_full_name: cashierRow.full_name, p_role: cashierRow.role, p_is_active: true })
assert.ifError(reenabled.error)
assert.equal(reenabled.data.is_active, true)
assert.equal(reenabled.data.email, process.env.TEST_CASHIER_EMAIL)

console.log('9/12 Recuperation mot de passe declenchee')
if (createdUserId) {
  const reset = await superAdmin.functions.invoke('admin-users', { body: { action: 'send_password_reset', user_id: createdUserId } })
  assert.ifError(reset.error)
  assert.equal(reset.data.password_reset_sent, true)
} else {
  console.log('  SKIP: recuperation email liee a TEST_INVITE_EMAIL')
}

console.log('10/12 Activite utilisateur issue de audit_log')
const activity = await superAdmin.rpc('get_user_activity', { p_user_id: cashierRow.id, p_from: null, p_to: null, p_domain: null, p_action: null, p_limit: 100, p_offset: 0 })
assert.ifError(activity.error)
assert.ok(Array.isArray(activity.data.rows))

console.log('11/12 Ecriture directe profiles refusee')
await expectDenied(superAdmin.from('profiles').update({ full_name: me.data.full_name }).eq('id', me.data.id), 'Meme le super_admin doit passer par la RPC')

console.log('12/12 Second bootstrap refuse')
await expectDenied(normalAdmin.rpc('bootstrap_super_admin'), 'Le bootstrap ne peut pas creer un second super_admin')
} finally {
  const restored = await superAdmin.rpc('update_user_profile', { p_user_id: managerRow.id, p_full_name: managerRow.full_name, p_role: 'gestionnaire', p_is_active: true })
  assert.ifError(restored.error)
  if (createdUserId) {
    if (process.env.TEST_SERVICE_ROLE_KEY) {
      const service = client(process.env.TEST_SERVICE_ROLE_KEY)
      assert.ifError((await service.auth.admin.deleteUser(createdUserId)).error)
      console.log('Compte invite jetable supprime via environnement TEST protege')
    } else {
      const cleanup = await superAdmin.rpc('update_user_profile', { p_user_id: createdUserId, p_full_name: 'Utilisateur validation TEST', p_role: 'caissier', p_is_active: false })
      assert.ifError(cleanup.error)
      console.log(`Compte invite conserve inactif pour audit TEST: ${createdUserId}`)
    }
  }
}

console.log(createdUserId ? 'Tests utilisateurs/super_admin: 12/12 OK' : 'Tests utilisateurs/super_admin: 10 OK, 2 SKIP email')
