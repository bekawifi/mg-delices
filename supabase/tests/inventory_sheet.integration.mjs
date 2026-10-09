import '../../scripts/assert-test-environment.mjs'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const required = [
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD',
  'TEST_CASHIER_EMAIL', 'TEST_CASHIER_PASSWORD',
  'TEST_INACTIVE_EMAIL', 'TEST_INACTIVE_PASSWORD',
]
for (const name of required) assert.ok(process.env[name], `Variable manquante : ${name}`)
assert.ok(!process.env.VITE_SUPABASE_URL.includes('votre-projet'), 'Utilisez une instance de test dediee')

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
async function rpc(db, name, args = {}) {
  const result = await db.rpc(name, args)
  assert.ifError(result.error)
  return result.data
}
const draftPayload = (inventory, values = {}) => inventory.lignes.map(line => ({
  matiere_id: line.matiere_id,
  quantite_comptee: Object.hasOwn(values, line.matiere_id) ? values[line.matiere_id].quantity : null,
  motif: Object.hasOwn(values, line.matiere_id) ? values[line.matiere_id].reason ?? null : null,
  commentaire: Object.hasOwn(values, line.matiere_id) ? values[line.matiere_id].comment ?? null : null,
}))

console.log('1/12 Connexions et inventaire historique')
const admin = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD, 'admin')
const cashier = await login(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD, 'caissier')
const inactive = await login(process.env.TEST_INACTIVE_EMAIL, process.env.TEST_INACTIVE_PASSWORD)
const historicalOverview = await rpc(admin, 'get_inventories_overview')
assert.ok(historicalOverview.length > 0, 'Un inventaire anterieur est requis pour le test de compatibilite')
const historical = await rpc(admin, 'get_inventory_detail', { p_inventaire_id: historicalOverview[historicalOverview.length - 1].id })
assert.ok(Array.isArray(historical.lignes))
for (const line of historical.lignes) {
  assert.equal(line.motif, null)
  assert.equal(line.commentaire, null)
}
if (historicalOverview[historicalOverview.length - 1].statut === 'valide') assert.equal(historical.statut, 'valide')

console.log('2/12 Creation des matieres et de la fiche')
const suffix = Date.now()
const piece = await admin.from('unites').select('id,precision_decimale').eq('code', 'piece').single(); assert.ifError(piece.error)
const litre = await admin.from('unites').select('id,precision_decimale').eq('code', 'litre').single(); assert.ifError(litre.error)
assert.equal(Number(piece.data.precision_decimale), 0)
assert.ok(Number(litre.data.precision_decimale) >= 2)
const pieceId = await rpc(admin, 'save_material', { p_id: null, p_code: `INV-P-${suffix}`, p_nom: `Inventaire piece ${suffix}`, p_unite_id: piece.data.id, p_stock_minimum: 1, p_actif: true })
const litreId = await rpc(admin, 'save_material', { p_id: null, p_code: `INV-L-${suffix}`, p_nom: `Inventaire litre ${suffix}`, p_unite_id: litre.data.id, p_stock_minimum: 1, p_actif: true })
await rpc(admin, 'add_stock_entry', { p_matiere_id: pieceId, p_quantite: 5, p_cout_unitaire: 100, p_note: 'Test fiche inventaire' })
await rpc(admin, 'add_stock_entry', { p_matiere_id: litreId, p_quantite: 2.5, p_cout_unitaire: 200, p_note: 'Test fiche inventaire' })
const inventoryId = await rpc(admin, 'create_inventory', { p_note: 'Note initiale' })
let inventory = await rpc(admin, 'get_inventory_detail', { p_inventaire_id: inventoryId })
assert.equal(inventory.statut, 'brouillon')
assert.ok(inventory.lignes.some(line => line.matiere_id === pieceId))
assert.ok(inventory.lignes.some(line => line.matiere_id === litreId))

console.log('3/12 Precision invalide refusee atomiquement')
const invalid = await admin.rpc('save_inventory_draft', {
  p_inventaire_id: inventoryId,
  p_note: 'Cette note ne doit pas persister',
  p_lignes: draftPayload(inventory, { [pieceId]: { quantity: 1.5, reason: 'casse', comment: 'invalide' } }),
})
assert.ok(invalid.error)
inventory = await rpc(admin, 'get_inventory_detail', { p_inventaire_id: inventoryId })
assert.equal(inventory.note, 'Note initiale')
assert.equal(inventory.lignes.find(line => line.matiere_id === pieceId).quantite_comptee, null)

console.log('4/12 Sauvegarde incomplete, zero, decimal et annotations')
const stockBeforeDraft = await rpc(admin, 'get_stock_overview')
const pieceStockBefore = Number(stockBeforeDraft.find(row => row.id === pieceId).stock_actuel)
const litreStockBefore = Number(stockBeforeDraft.find(row => row.id === litreId).stock_actuel)
const movesBeforeDraft = await admin.from('mouvements_stock').select('id', { count: 'exact', head: true }).eq('reference_id', inventoryId)
assert.ifError(movesBeforeDraft.error)
await rpc(admin, 'save_inventory_draft', {
  p_inventaire_id: inventoryId,
  p_note: 'Brouillon repris',
  p_lignes: draftPayload(inventory, {
    [pieceId]: { quantity: 0, reason: 'casse', comment: 'bouteille cassee' },
    [litreId]: { quantity: 1.25, reason: 'perte', comment: 'reste cuisine' },
  }),
})

console.log('5/12 Fermeture logique, relecture et filtre non comptes')
inventory = await rpc(admin, 'get_inventory_detail', { p_inventaire_id: inventoryId })
assert.equal(inventory.note, 'Brouillon repris')
const savedPiece = inventory.lignes.find(line => line.matiere_id === pieceId)
const savedLitre = inventory.lignes.find(line => line.matiere_id === litreId)
assert.equal(Number(savedPiece.quantite_comptee), 0)
assert.equal(Number(savedLitre.quantite_comptee), 1.25)
assert.equal(savedPiece.motif, 'casse')
assert.equal(savedPiece.commentaire, 'bouteille cassee')
assert.equal(savedLitre.motif, 'perte')
assert.equal(savedLitre.commentaire, 'reste cuisine')
const uncounted = inventory.lignes.filter(line => line.quantite_comptee === null)
assert.equal(uncounted.length, inventory.lignes.length - 2)

console.log('6/12 Aucun effet stock ni mouvement pendant le brouillon')
const stockAfterDraft = await rpc(admin, 'get_stock_overview')
assert.equal(Number(stockAfterDraft.find(row => row.id === pieceId).stock_actuel), pieceStockBefore)
assert.equal(Number(stockAfterDraft.find(row => row.id === litreId).stock_actuel), litreStockBefore)
const movesAfterDraft = await admin.from('mouvements_stock').select('id', { count: 'exact', head: true }).eq('reference_id', inventoryId)
assert.ifError(movesAfterDraft.error)
assert.equal(movesAfterDraft.count, movesBeforeDraft.count)

console.log('7/12 Roles non autorises et compte inactif')
const unauthorized = await cashier.rpc('save_inventory_draft', { p_inventaire_id: inventoryId, p_note: null, p_lignes: [] })
assert.ok(unauthorized.error)
const inactiveAttempt = await inactive.rpc('save_inventory_draft', { p_inventaire_id: inventoryId, p_note: null, p_lignes: [] })
assert.ok(inactiveAttempt.error)

console.log('8/12 Toutes les lignes renseignees en un appel')
const finalLines = inventory.lignes.map(line => ({
  matiere_id: line.matiere_id,
  quantite_comptee: Number(line.stock_theorique) + (line.matiere_id === pieceId ? 2 : 0),
  motif: line.matiere_id === pieceId ? 'surplus' : null,
  commentaire: line.matiere_id === pieceId ? 'ecart de test' : null,
}))
await rpc(admin, 'save_inventory_draft', { p_inventaire_id: inventoryId, p_note: 'Pret a valider', p_lignes: finalLines })
inventory = await rpc(admin, 'get_inventory_detail', { p_inventaire_id: inventoryId })
assert.equal(inventory.lignes.filter(line => line.quantite_comptee === null).length, 0)

console.log('9/12 Validation et ajustement unique')
const validation = await rpc(admin, 'validate_inventory', { p_inventaire_id: inventoryId })
assert.equal(validation.deja_valide, false)
assert.equal(Number(validation.mouvements), 1)
const stockAfterValidation = await rpc(admin, 'get_stock_overview')
assert.equal(Number(stockAfterValidation.find(row => row.id === pieceId).stock_actuel), pieceStockBefore + 2)
assert.equal(Number(stockAfterValidation.find(row => row.id === litreId).stock_actuel), litreStockBefore)
const inventoryMoves = await admin.from('mouvements_stock').select('id,matiere_premiere_id,quantite').eq('reference_id', inventoryId).eq('type_mouvement', 'inventaire')
assert.ifError(inventoryMoves.error)
assert.equal(inventoryMoves.data.length, 1)
assert.equal(inventoryMoves.data[0].matiere_premiere_id, pieceId)
assert.equal(Number(inventoryMoves.data[0].quantite), 2)

console.log('10/12 Lecture seule apres validation')
inventory = await rpc(admin, 'get_inventory_detail', { p_inventaire_id: inventoryId })
assert.equal(inventory.statut, 'valide')
assert.ok(inventory.validated_at)
const immutableDraft = await admin.rpc('save_inventory_draft', { p_inventaire_id: inventoryId, p_note: 'Interdit', p_lignes: finalLines })
assert.ok(immutableDraft.error)
const immutableLine = await admin.rpc('set_inventory_count', { p_inventaire_id: inventoryId, p_matiere_id: pieceId, p_quantite_comptee: 0 })
assert.ok(immutableLine.error)

console.log('11/12 Double validation idempotente')
const replay = await rpc(admin, 'validate_inventory', { p_inventaire_id: inventoryId })
assert.equal(replay.deja_valide, true)
const movesAfterReplay = await admin.from('mouvements_stock').select('id', { count: 'exact', head: true }).eq('reference_id', inventoryId).eq('type_mouvement', 'inventaire')
assert.ifError(movesAfterReplay.error)
assert.equal(movesAfterReplay.count, 1)

console.log('12/12 Fin du test inventaire')
await Promise.all([admin.auth.signOut(), cashier.auth.signOut(), inactive.auth.signOut()])
console.log('Tous les tests de la fiche inventaire sont reussis. Les donnees restent dans cette instance TEST.')
