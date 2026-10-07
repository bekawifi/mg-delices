import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const required = [
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD', 'TEST_CASHIER_EMAIL', 'TEST_CASHIER_PASSWORD',
  'TEST_SERVER_EMAIL', 'TEST_SERVER_PASSWORD', 'TEST_KITCHEN_EMAIL', 'TEST_KITCHEN_PASSWORD',
  'TEST_INACTIVE_EMAIL', 'TEST_INACTIVE_PASSWORD',
]
for (const name of required) assert.ok(process.env[name], `Variable manquante : ${name}`)
assert.ok(!process.env.VITE_SUPABASE_URL.includes('votre-projet'), 'Configurez une instance Supabase de test dédiée')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const newClient = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, options)
const login = async (email, password, role) => {
  const db = newClient()
  const auth = await db.auth.signInWithPassword({ email, password })
  assert.ifError(auth.error); assert.ok(auth.data.user)
  if (role) {
    const profile = await db.from('profiles').select('role,is_active').eq('id', auth.data.user.id).single()
    assert.ifError(profile.error); assert.equal(profile.data.role, role); assert.equal(profile.data.is_active, true)
  }
  return { db, user: auth.data.user }
}
const rpc = async (db, name, args) => { const result = await db.rpc(name, args); assert.ifError(result.error); return result.data }

console.log('1/10 Connexions et préparation isolée')
const { db: admin } = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD, 'admin')
const cashState = await admin.rpc('get_cash_session_summary', { p_session_id: null })
if (!cashState.error && !cashState.data) assert.ifError((await admin.rpc('open_cash_session', { p_fond_ouverture: 100000, p_idempotency_key: crypto.randomUUID() })).error)
const { db: server } = await login(process.env.TEST_SERVER_EMAIL, process.env.TEST_SERVER_PASSWORD, 'serveur')
const { db: kitchen } = await login(process.env.TEST_KITCHEN_EMAIL, process.env.TEST_KITCHEN_PASSWORD, 'cuisine')
const { db: cashier } = await login(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD, 'caissier')
const { db: inactive } = await login(process.env.TEST_INACTIVE_EMAIL, process.env.TEST_INACTIVE_PASSWORD)
const suffix = Date.now()
const zoneInsert = await admin.from('zones').insert({ nom: `Zone test ${suffix}`, ordre: 999, actif: true }).select('id').single()
assert.ifError(zoneInsert.error)
const tableInsert = await admin.from('tables_restaurant').insert({ zone_id: zoneInsert.data.id, nom: `Table test ${suffix}`, numero: 999, capacite: 4, actif: true }).select('id').single()
assert.ifError(tableInsert.error)
const productAResult = await admin.from('produits').insert({
  nom: `Produit prix figé ${suffix}`, prix_vente: 1500, cout_estime: 500, disponible: true,
}).select('id,nom,prix_vente').single()
const productBResult = await admin.from('produits').insert({
  nom: `Produit désactivable ${suffix}`, prix_vente: 700, cout_estime: 250, disponible: true,
}).select('id,nom,prix_vente').single()
assert.ifError(productAResult.error); assert.ifError(productBResult.error)
const productA = productAResult.data
const productB = productBResult.data

console.log('2/10 Ouverture de table et unicité active')
const opened = await rpc(server, 'open_table_order', { p_table_id: tableInsert.data.id, p_notes: 'Test Étape 2' })
assert.match(opened.numero_commande, /^CMD-\d{8}-\d{4,}$/)
const duplicate = await server.rpc('open_table_order', { p_table_id: tableInsert.data.id, p_notes: null })
assert.ok(duplicate.error, 'Une seconde commande active devait être refusée')
assert.ok((await server.from('commandes').insert({})).error, 'INSERT direct commandes devait être refusé')
assert.ok((await server.from('lignes_commande').insert({})).error, 'INSERT direct lignes devait être refusé')

console.log('3/10 Ajouts successifs, snapshot serveur et changement de prix catalogue')
await rpc(server, 'add_order_items', { p_commande_id: opened.id, p_items: [{ produit_id: productA.id, quantite: 2, prix_unitaire_snapshot: 1, notes: 'Snapshot attendu : 1 500' }] })
await rpc(server, 'send_order_to_kitchen', { p_commande_id: opened.id })
let detail = await rpc(server, 'get_order_detail', { p_commande_id: opened.id })
assert.equal(detail.lignes.length, 1)
assert.equal(Number(detail.lignes[0].prix_unitaire_snapshot), 1500)
assert.ifError((await admin.from('produits').update({ prix_vente: 2000 }).eq('id', productA.id)).error)
const changedProduct = await admin.from('produits').select('prix_vente').eq('id', productA.id).single()
assert.ifError(changedProduct.error); assert.equal(Number(changedProduct.data.prix_vente), 2000)
await rpc(server, 'add_order_items', { p_commande_id: opened.id, p_items: [{ produit_id: productB.id, quantite: 2, prix_unitaire_snapshot: 1 }] })
detail = await rpc(server, 'get_order_detail', { p_commande_id: opened.id })
assert.equal(detail.lignes.length, 2)
assert.equal(Number(detail.total), 4400)
assert.deepEqual(Object.fromEntries(detail.lignes.map(line => [line.produit_id, Number(line.prix_unitaire_snapshot)])), { [productA.id]: 1500, [productB.id]: 700 })
await rpc(server, 'send_order_to_kitchen', { p_commande_id: opened.id })

console.log('4/10 Produit indisponible et commande non modifiable directement')
const unavailable = await admin.from('produits').insert({ nom: `Indisponible ${suffix}`, prix_vente: 100, cout_estime: 50, disponible: false }).select('id').single()
assert.ifError(unavailable.error)
assert.ok((await server.rpc('add_order_items', { p_commande_id: opened.id, p_items: [{ produit_id: unavailable.data.id, quantite: 1 }] })).error)
assert.ok((await server.from('commandes').update({ statut: 'cloturee' }).eq('id', opened.id)).error)
assert.ok((await admin.from('lignes_commande').update({ prix_unitaire_snapshot: 1 }).eq('id', detail.lignes[0].id)).error, 'Même un admin API ne doit pas falsifier le snapshot')
assert.ifError((await admin.from('produits').delete().eq('id', unavailable.data.id)).error)

console.log('5/10 Rôles cuisine et transitions strictes')
assert.ok((await cashier.rpc('start_kitchen_item', { p_ligne_id: detail.lignes[0].id })).error, 'Le caissier ne doit pas gérer la cuisine')
assert.ok((await kitchen.rpc('add_order_items', { p_commande_id: opened.id, p_items: [{ produit_id: productA.id, quantite: 1 }] })).error, 'La cuisine ne doit pas ajouter des articles')
const board = await rpc(kitchen, 'get_kitchen_board')
assert.ok(board.some(group => group.commande_id === opened.id))
for (const line of detail.lignes) {
  await rpc(kitchen, 'start_kitchen_item', { p_ligne_id: line.id })
  assert.ok((await kitchen.rpc('start_kitchen_item', { p_ligne_id: line.id })).error, 'Transition répétée devait échouer')
  await rpc(kitchen, 'mark_kitchen_item_ready', { p_ligne_id: line.id })
  assert.ok((await kitchen.rpc('mark_kitchen_item_ready', { p_ligne_id: line.id })).error, 'Un article prêt ne doit pas être remis prêt')
}
detail = await rpc(server, 'get_order_detail', { p_commande_id: opened.id })
assert.equal(detail.statut, 'prete')

console.log('6/10 Service et restrictions de rôle')
assert.ok((await kitchen.rpc('checkout_order', { p_commande_id: opened.id, p_idempotency_key: crypto.randomUUID(), p_remise: 0, p_montant_recu: 5000, p_mode_paiement: 'especes' })).error)
assert.ok((await server.rpc('create_sale', { p_idempotency_key: crypto.randomUUID(), p_type_commande: 'sur_place', p_remise: 0, p_montant_recu: 5000, p_mode_paiement: 'especes', p_lignes: [{ produit_id: productA.id, quantite: 1 }] })).error, 'Le serveur ne doit pas accéder directement à la caisse')
await rpc(server, 'mark_order_served', { p_commande_id: opened.id })
detail = await rpc(server, 'get_order_detail', { p_commande_id: opened.id })
assert.equal(detail.statut, 'servie')
assert.ifError((await admin.from('produits').update({ disponible: false }).eq('id', productB.id)).error)
const disabledProduct = await admin.from('produits').select('disponible').eq('id', productB.id).single()
assert.ifError(disabledProduct.error); assert.equal(disabledProduct.data.disponible, false)

console.log('7/10 Checkout atomique et idempotent')
const checkoutKey = crypto.randomUUID()
const checkoutArgs = { p_commande_id: opened.id, p_idempotency_key: checkoutKey, p_remise: 400, p_montant_recu: 5000, p_mode_paiement: 'especes' }
const sale = await rpc(cashier, 'checkout_order', checkoutArgs)
assert.equal(Number(sale.total_final), 4000); assert.equal(Number(sale.monnaie_rendue), 1000)
const replay = await rpc(cashier, 'checkout_order', checkoutArgs)
assert.equal(replay.sale_id, sale.sale_id); assert.equal(replay.idempotent_replay, true)
const sales = await cashier.from('ventes').select('*').eq('commande_id', opened.id)
assert.ifError(sales.error); assert.equal(sales.data.length, 1); assert.equal(sales.data[0].idempotency_key, checkoutKey)
const saleLines = await cashier.from('lignes_vente').select('*').eq('vente_id', sale.sale_id)
const payments = await cashier.from('paiements').select('*').eq('vente_id', sale.sale_id)
assert.ifError(saleLines.error); assert.ifError(payments.error); assert.equal(saleLines.data.length, 2); assert.equal(payments.data.length, 1)
assert.deepEqual(Object.fromEntries(saleLines.data.map(line => [line.produit_id, Number(line.prix_unitaire)])), { [productA.id]: 1500, [productB.id]: 700 })
assert.equal(Number(sales.data[0].sous_total), 4400, 'La vente doit utiliser les snapshots, pas le catalogue modifié')

console.log('8/10 Clôture, refus d’ajout et libération de table')
detail = await rpc(cashier, 'get_order_detail', { p_commande_id: opened.id })
assert.equal(detail.statut, 'cloturee')
assert.ok((await server.rpc('add_order_items', { p_commande_id: opened.id, p_items: [{ produit_id: productA.id, quantite: 1 }] })).error)
const tables = await rpc(server, 'get_tables_overview')
const testTable = tables.find(item => item.id === tableInsert.data.id)
assert.equal(testTable.etat, 'libre'); assert.equal(testTable.commande_id, null)

console.log('9/10 Compte inactif et RLS direct')
assert.ok((await inactive.rpc('get_tables_overview')).error)
assert.ok((await inactive.rpc('open_table_order', { p_table_id: tableInsert.data.id, p_notes: null })).error)
assert.ok((await server.from('commandes').delete().eq('id', opened.id)).error)
assert.ok((await server.from('lignes_commande').update({ quantite: 99 }).eq('commande_id', opened.id)).error)

console.log('10/10 Listes commandes et liaison vente')
const closed = await rpc(cashier, 'get_orders_overview', { p_filter: 'cloturees' })
assert.ok(closed.some(order => order.id === opened.id))

await Promise.all([admin.auth.signOut(), server.auth.signOut(), kitchen.auth.signOut(), cashier.auth.signOut(), inactive.auth.signOut()])
console.log('Tous les tests d’intégration Étape 2 sont réussis. Les données créées restent dans cette instance de test.')
