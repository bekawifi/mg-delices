import '../../scripts/assert-test-environment.mjs'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const required = [
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD',
  'TEST_CASHIER_EMAIL', 'TEST_CASHIER_PASSWORD', 'TEST_SERVER_EMAIL', 'TEST_SERVER_PASSWORD',
  'TEST_KITCHEN_EMAIL', 'TEST_KITCHEN_PASSWORD', 'TEST_INACTIVE_EMAIL', 'TEST_INACTIVE_PASSWORD',
]
for (const name of required) assert.ok(process.env[name], `Variable manquante : ${name}`)
assert.ok(!process.env.VITE_SUPABASE_URL.includes('votre-projet'), 'Utilisez une instance de test dédiée')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const makeClient = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, options)
async function login(email, password, expectedRole) {
  const db = makeClient(); const auth = await db.auth.signInWithPassword({ email, password })
  assert.ifError(auth.error); assert.ok(auth.data.user)
  if (expectedRole) { const p = await db.from('profiles').select('role,is_active').eq('id', auth.data.user.id).single(); assert.ifError(p.error); assert.equal(p.data.role, expectedRole); assert.equal(p.data.is_active, true) }
  return db
}
async function rpc(db, name, args = {}) { const result = await db.rpc(name, args); assert.ifError(result.error); return result.data }
const saleArgs = (productId, quantity, key = crypto.randomUUID()) => ({
  key, args: { p_idempotency_key: key, p_type_commande: 'emporter', p_remise: 0, p_montant_recu: 100000, p_mode_paiement: 'especes', p_lignes: [{ produit_id: productId, quantite: quantity }] },
})

console.log('1/17 Connexions et création matière première')
const admin = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD, 'admin')
const cashState = await admin.rpc('get_cash_session_summary', { p_session_id: null })
if (!cashState.error && !cashState.data) assert.ifError((await admin.rpc('open_cash_session', { p_fond_ouverture: 100000, p_idempotency_key: crypto.randomUUID() })).error)
const cashier = await login(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD, 'caissier')
const cashier2 = await login(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD, 'caissier')
const server = await login(process.env.TEST_SERVER_EMAIL, process.env.TEST_SERVER_PASSWORD, 'serveur')
const kitchen = await login(process.env.TEST_KITCHEN_EMAIL, process.env.TEST_KITCHEN_PASSWORD, 'cuisine')
const inactive = await login(process.env.TEST_INACTIVE_EMAIL, process.env.TEST_INACTIVE_PASSWORD)
const suffix = Date.now()
const units = await admin.from('unites').select('id,code').eq('code', 'piece').single(); assert.ifError(units.error)
const litreUnit = await admin.from('unites').select('id,code').eq('code', 'litre').single(); assert.ifError(litreUnit.error)
const materialId = await rpc(admin, 'save_material', { p_id: null, p_code: `TST-${suffix}`, p_nom: `Matière test ${suffix}`, p_unite_id: units.data.id, p_stock_minimum: 2, p_actif: true })
const oilId = await rpc(admin, 'save_material', { p_id: null, p_code: `OIL-${suffix}`, p_nom: `Huile snapshot ${suffix}`, p_unite_id: litreUnit.data.id, p_stock_minimum: 1, p_actif: true })
await rpc(admin, 'add_stock_entry', { p_matiere_id: oilId, p_quantite: 10, p_cout_unitaire: 1500, p_note: 'Stock test snapshots' })

console.log('2/17 Première entrée de 10 unités')
let entry = await rpc(admin, 'add_stock_entry', { p_matiere_id: materialId, p_quantite: 10, p_cout_unitaire: 1000, p_note: 'Entrée test 1' })
assert.equal(Number(entry.stock_avant), 0); assert.equal(Number(entry.stock_apres), 10); assert.equal(Number(entry.cout_unitaire_moyen), 1000)

console.log('3/17 Deuxième entrée et coût moyen pondéré')
entry = await rpc(admin, 'add_stock_entry', { p_matiere_id: materialId, p_quantite: 10, p_cout_unitaire: 1200, p_note: 'Entrée test 2' })
assert.equal(Number(entry.stock_apres), 20); assert.equal(Number(entry.cout_unitaire_moyen), 1100)
let moves = await rpc(admin, 'get_stock_movements', { p_matiere_id: materialId, p_type: null, p_from: null, p_to: null })
assert.equal(moves.filter(m => m.type_mouvement === 'entree').length, 2)

console.log('4/17 Produit et recette')
const productResult = await admin.from('produits').insert({ nom: `Produit stock ${suffix}`, prix_vente: 5000, cout_estime: 0, disponible: true }).select('id').single(); assert.ifError(productResult.error)
const productId = productResult.data.id
await rpc(admin, 'save_recipe', { p_produit_id: productId, p_nom: 'Recette test', p_rendement: 1, p_ingredients: [{ matiere_id: materialId, quantite: 1 }, { matiere_id: oilId, quantite: 0.05 }] })

console.log('5/17 Vente caisse et mouvement lié')
const direct = saleArgs(productId, 2); const directSale = await rpc(cashier, 'create_sale', direct.args)
let stock = await rpc(admin, 'get_stock_overview'); let material = stock.find(m => m.id === materialId)
assert.equal(Number(material.stock_actuel), 18)
moves = await rpc(admin, 'get_stock_movements', { p_matiere_id: materialId, p_type: 'vente', p_from: null, p_to: null })
assert.ok(moves.some(m => m.reference_id === directSale.sale_id && Number(m.quantite) === -2))

console.log('6/17 Rejeu idempotent de create_sale')
const replay = await rpc(cashier, 'create_sale', direct.args); assert.equal(replay.sale_id, directSale.sale_id)
stock = await rpc(admin, 'get_stock_overview'); assert.equal(Number(stock.find(m => m.id === materialId).stock_actuel), 18)
assert.equal((await rpc(admin, 'get_stock_movements', { p_matiere_id: materialId, p_type: 'vente', p_from: null, p_to: null })).filter(m => m.reference_id === directSale.sale_id).length, 1)

console.log('7/17 Snapshot restaurant figé, rejeu d’envoi et recette modifiée')
const zone = await admin.from('zones').insert({ nom: `Zone stock ${suffix}`, ordre: 998, actif: true }).select('id').single(); assert.ifError(zone.error)
const table = await admin.from('tables_restaurant').insert({ zone_id: zone.data.id, nom: `Table stock ${suffix}`, numero: 998, capacite: 2, actif: true }).select('id').single(); assert.ifError(table.error)
const order = await rpc(server, 'open_table_order', { p_table_id: table.data.id, p_notes: 'Test stock' })
await rpc(server, 'add_order_items', { p_commande_id: order.id, p_items: [{ produit_id: productId, quantite: 1 }] })
await rpc(server, 'send_order_to_kitchen', { p_commande_id: order.id })
let orderDetail = await rpc(server, 'get_order_detail', { p_commande_id: order.id })
let snapshots = await admin.from('commande_ligne_ingredients_snapshot').select('*').eq('ligne_commande_id', orderDetail.lignes[0].id); assert.ifError(snapshots.error)
assert.equal(snapshots.data.length, 2)
assert.equal(Number(snapshots.data.find(row => row.matiere_premiere_id === oilId).quantite_totale), 0.05)
const replaySend = await server.rpc('send_order_to_kitchen', { p_commande_id: order.id }); assert.ok(replaySend.error)
const snapshotReplayCount = await admin.from('commande_ligne_ingredients_snapshot').select('id', { count: 'exact', head: true }).eq('ligne_commande_id', orderDetail.lignes[0].id); assert.ifError(snapshotReplayCount.error); assert.equal(snapshotReplayCount.count, 2)
await rpc(admin, 'save_recipe', { p_produit_id: productId, p_nom: 'Recette modifiée', p_rendement: 1, p_ingredients: [{ matiere_id: materialId, quantite: 1 }, { matiere_id: oilId, quantite: 0.08 }] })
await rpc(kitchen, 'start_kitchen_item', { p_ligne_id: orderDetail.lignes[0].id })
await rpc(kitchen, 'mark_kitchen_item_ready', { p_ligne_id: orderDetail.lignes[0].id })
await rpc(server, 'mark_order_served', { p_commande_id: order.id })
assert.ifError((await admin.from('produits').update({ disponible: false }).eq('id', productId)).error)
const orderKey = crypto.randomUUID()
const orderCheckout = { p_commande_id: order.id, p_idempotency_key: orderKey, p_remise: 0, p_montant_recu: 10000, p_mode_paiement: 'especes' }
const orderSale = await rpc(cashier, 'checkout_order', orderCheckout)
stock = await rpc(admin, 'get_stock_overview')
assert.equal(Number(stock.find(m => m.id === materialId).stock_actuel), 17)
assert.equal(Number(stock.find(m => m.id === oilId).stock_actuel), 9.85)

console.log('8/17 Nouvelle commande, recette désactivée et checkout idempotent')
const orderReplay = await rpc(cashier, 'checkout_order', orderCheckout); assert.equal(orderReplay.sale_id, orderSale.sale_id)
assert.equal((await rpc(admin, 'get_stock_movements', { p_matiere_id: materialId, p_type: 'vente', p_from: null, p_to: null })).filter(m => m.reference_id === orderSale.sale_id).length, 1)
stock = await rpc(admin, 'get_stock_overview'); assert.equal(Number(stock.find(m => m.id === oilId).stock_actuel), 9.85)
assert.ifError((await admin.from('produits').update({ disponible: true }).eq('id', productId)).error)
const secondOrder = await rpc(server, 'open_table_order', { p_table_id: table.data.id, p_notes: 'Nouvelle recette' })
await rpc(server, 'add_order_items', { p_commande_id: secondOrder.id, p_items: [{ produit_id: productId, quantite: 1 }] })
await rpc(server, 'send_order_to_kitchen', { p_commande_id: secondOrder.id })
let secondDetail = await rpc(server, 'get_order_detail', { p_commande_id: secondOrder.id })
snapshots = await admin.from('commande_ligne_ingredients_snapshot').select('*').eq('ligne_commande_id', secondDetail.lignes[0].id); assert.ifError(snapshots.error)
assert.equal(Number(snapshots.data.find(row => row.matiere_premiere_id === oilId).quantite_totale), 0.08)
await rpc(admin, 'save_recipe', { p_produit_id: productId, p_nom: 'Recette future', p_rendement: 1, p_ingredients: [{ matiere_id: materialId, quantite: 1 }, { matiere_id: oilId, quantite: 0.1 }] })
await rpc(kitchen, 'start_kitchen_item', { p_ligne_id: secondDetail.lignes[0].id })
await rpc(kitchen, 'mark_kitchen_item_ready', { p_ligne_id: secondDetail.lignes[0].id })
await rpc(server, 'mark_order_served', { p_commande_id: secondOrder.id })
const secondSale = await rpc(cashier, 'checkout_order', { p_commande_id: secondOrder.id, p_idempotency_key: crypto.randomUUID(), p_remise: 0, p_montant_recu: 10000, p_mode_paiement: 'especes' })
stock = await rpc(admin, 'get_stock_overview')
assert.equal(Number(stock.find(m => m.id === materialId).stock_actuel), 16)
assert.equal(Number(stock.find(m => m.id === oilId).stock_actuel), 9.77)
assert.equal((await rpc(admin, 'get_stock_movements', { p_matiere_id: oilId, p_type: 'vente', p_from: null, p_to: null })).filter(m => m.reference_id === secondSale.sale_id).length, 1)

console.log('9/17 Stock insuffisant : transaction entière refusée')
const scarceId = await rpc(admin, 'save_material', { p_id: null, p_code: `LOW-${suffix}`, p_nom: `Stock rare ${suffix}`, p_unite_id: units.data.id, p_stock_minimum: 0, p_actif: true })
await rpc(admin, 'add_stock_entry', { p_matiere_id: scarceId, p_quantite: 1, p_cout_unitaire: 100, p_note: 'Dernière unité' })
const scarceProduct = await admin.from('produits').insert({ nom: `Produit rare ${suffix}`, prix_vente: 1000, cout_estime: 0, disponible: true }).select('id').single(); assert.ifError(scarceProduct.error)
await rpc(admin, 'save_recipe', { p_produit_id: scarceProduct.data.id, p_nom: 'Recette insuffisante', p_rendement: 1, p_ingredients: [{ matiere_id: scarceId, quantite: 2 }] })
const failed = saleArgs(scarceProduct.data.id, 1); const failedSale = await cashier.rpc('create_sale', failed.args); assert.ok(failedSale.error); assert.match(failedSale.error.message, /Stock insuffisant/i)
const absentSale = await cashier.from('ventes').select('id').eq('idempotency_key', failed.key); assert.ifError(absentSale.error); assert.equal(absentSale.data.length, 0)
stock = await rpc(admin, 'get_stock_overview'); assert.equal(Number(stock.find(m => m.id === scarceId).stock_actuel), 1)

console.log('10/17 Produit sans recette autorisé')
const noRecipe = await admin.from('produits').insert({ nom: `Sans recette ${suffix}`, prix_vente: 500, cout_estime: 0, disponible: true }).select('id').single(); assert.ifError(noRecipe.error)
const noRecipeSale = await rpc(cashier, 'create_sale', saleArgs(noRecipe.data.id, 1).args)
assert.equal((await rpc(admin, 'get_stock_movements', { p_matiere_id: null, p_type: 'vente', p_from: null, p_to: null })).filter(m => m.reference_id === noRecipeSale.sale_id).length, 0)
const noRecipeOrder = await rpc(server, 'open_table_order', { p_table_id: table.data.id, p_notes: 'Snapshot vide' })
await rpc(server, 'add_order_items', { p_commande_id: noRecipeOrder.id, p_items: [{ produit_id: noRecipe.data.id, quantite: 1 }] })
await rpc(server, 'send_order_to_kitchen', { p_commande_id: noRecipeOrder.id })
const noRecipeDetail = await rpc(server, 'get_order_detail', { p_commande_id: noRecipeOrder.id })
assert.ok(noRecipeDetail.lignes[0].sent_to_kitchen_at)
const emptySnapshotMarker = await admin.from('lignes_commande').select('recette_snapshotted_at').eq('id', noRecipeDetail.lignes[0].id).single(); assert.ifError(emptySnapshotMarker.error); assert.ok(emptySnapshotMarker.data.recette_snapshotted_at)
const emptySnapshot = await admin.from('commande_ligne_ingredients_snapshot').select('id').eq('ligne_commande_id', noRecipeDetail.lignes[0].id); assert.ifError(emptySnapshot.error); assert.equal(emptySnapshot.data.length, 0)
await rpc(kitchen, 'start_kitchen_item', { p_ligne_id: noRecipeDetail.lignes[0].id })
await rpc(kitchen, 'mark_kitchen_item_ready', { p_ligne_id: noRecipeDetail.lignes[0].id })
await rpc(server, 'mark_order_served', { p_commande_id: noRecipeOrder.id })
const noRecipeOrderSale = await rpc(cashier, 'checkout_order', { p_commande_id: noRecipeOrder.id, p_idempotency_key: crypto.randomUUID(), p_remise: 0, p_montant_recu: 1000, p_mode_paiement: 'especes' })
assert.equal((await rpc(admin, 'get_stock_movements', { p_matiere_id: null, p_type: 'vente', p_from: null, p_to: null })).filter(m => m.reference_id === noRecipeOrderSale.sale_id).length, 0)

console.log('11/17 Concurrence sur la dernière unité')
const lastId = await rpc(admin, 'save_material', { p_id: null, p_code: `LAST-${suffix}`, p_nom: `Dernier stock ${suffix}`, p_unite_id: units.data.id, p_stock_minimum: 0, p_actif: true })
await rpc(admin, 'add_stock_entry', { p_matiere_id: lastId, p_quantite: 1, p_cout_unitaire: 100, p_note: 'Concurrence' })
const lastProduct = await admin.from('produits').insert({ nom: `Produit concurrence ${suffix}`, prix_vente: 500, cout_estime: 0, disponible: true }).select('id').single(); assert.ifError(lastProduct.error)
await rpc(admin, 'save_recipe', { p_produit_id: lastProduct.data.id, p_nom: 'Recette concurrence', p_rendement: 1, p_ingredients: [{ matiere_id: lastId, quantite: 1 }] })
const concurrentA = saleArgs(lastProduct.data.id, 1); const concurrentB = saleArgs(lastProduct.data.id, 1)
const concurrent = await Promise.all([cashier.rpc('create_sale', concurrentA.args), cashier2.rpc('create_sale', concurrentB.args)])
assert.equal(concurrent.filter(result => !result.error).length, 1); assert.equal(concurrent.filter(result => result.error).length, 1)
stock = await rpc(admin, 'get_stock_overview'); assert.equal(Number(stock.find(m => m.id === lastId).stock_actuel), 0)

console.log('12/17 Ajustement négatif')
const adjusted = await rpc(admin, 'adjust_stock', { p_matiere_id: materialId, p_type: 'ajustement_negatif', p_quantite: 1, p_note: 'Correction test' })
assert.equal(Number(adjusted.stock_avant) - Number(adjusted.stock_apres), 1)

console.log('13/17 Rôles non autorisés')
assert.ok((await server.rpc('add_stock_entry', { p_matiere_id: materialId, p_quantite: 1, p_cout_unitaire: 1, p_note: null })).error)
assert.ok((await kitchen.rpc('adjust_stock', { p_matiere_id: materialId, p_type: 'ajustement_positif', p_quantite: 1, p_note: null })).error)

console.log('14/17 Compte inactif')
assert.ok((await inactive.rpc('add_stock_entry', { p_matiere_id: materialId, p_quantite: 1, p_cout_unitaire: 1, p_note: null })).error)

console.log('15/17 Écritures directes sensibles refusées')
assert.ok((await admin.from('matieres_premieres').update({ stock_actuel: 999 }).eq('id', materialId)).error)
assert.ok((await admin.from('mouvements_stock').insert({})).error)
assert.ok((await admin.from('mouvements_stock').delete().eq('matiere_premiere_id', materialId)).error)
assert.ok((await admin.from('commande_ligne_ingredients_snapshot').update({ quantite_totale: 999 }).eq('id', snapshots.data[0].id)).error)
assert.ok((await admin.from('commande_ligne_ingredients_snapshot').delete().eq('id', snapshots.data[0].id)).error)

console.log('16/17 Inventaire et idempotence')
const inventoryId = await rpc(admin, 'create_inventory', { p_note: 'Inventaire test Étape 3' })
let inventory = await rpc(admin, 'get_inventory_detail', { p_inventaire_id: inventoryId })
for (const line of inventory.lignes) {
  const counted = line.matiere_id === materialId ? Number(line.stock_theorique) + 3 : Number(line.stock_theorique)
  await rpc(admin, 'set_inventory_count', { p_inventaire_id: inventoryId, p_matiere_id: line.matiere_id, p_quantite_comptee: counted })
}
const validation = await rpc(admin, 'validate_inventory', { p_inventaire_id: inventoryId }); assert.equal(validation.deja_valide, false)
const validationReplay = await rpc(admin, 'validate_inventory', { p_inventaire_id: inventoryId }); assert.equal(validationReplay.deja_valide, true)
assert.equal((await rpc(admin, 'get_stock_movements', { p_matiere_id: materialId, p_type: 'inventaire', p_from: null, p_to: null })).filter(m => m.reference_id === inventoryId).length, 1)

console.log('17/17 Cohérence finale')
inventory = await rpc(admin, 'get_inventory_detail', { p_inventaire_id: inventoryId }); assert.equal(inventory.statut, 'valide')
assert.ok((await admin.rpc('set_inventory_count', { p_inventaire_id: inventoryId, p_matiere_id: materialId, p_quantite_comptee: 0 })).error)

await Promise.all([admin.auth.signOut(), cashier.auth.signOut(), cashier2.auth.signOut(), server.auth.signOut(), kitchen.auth.signOut(), inactive.auth.signOut()])
console.log('Tous les tests d’intégration Étape 3 sont réussis. Les données restent dans cette instance de test.')
