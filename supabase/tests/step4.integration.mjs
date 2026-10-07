import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD',
  'TEST_CASHIER_EMAIL', 'TEST_CASHIER_PASSWORD', 'TEST_INACTIVE_EMAIL', 'TEST_INACTIVE_PASSWORD']
for (const name of required) assert.ok(process.env[name], `Variable manquante : ${name}`)
assert.ok(!process.env.VITE_SUPABASE_URL.includes('votre-projet'), 'Utilisez une instance de test dédiée')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const makeClient = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, options)
async function login(email, password, expectedRole, expectedActive = true) {
  const db = makeClient(); const auth = await db.auth.signInWithPassword({ email, password }); assert.ifError(auth.error); assert.ok(auth.data.user)
  // Un profil inactif est volontairement invisible via RLS. Son refus est
  // vérifié ensuite sur les RPC métier, sans affaiblir la policy de production.
  if (!expectedActive) return db
  const profile = await db.from('profiles').select('role,is_active').eq('id', auth.data.user.id).single(); assert.ifError(profile.error)
  if (expectedRole) assert.equal(profile.data.role, expectedRole); assert.equal(profile.data.is_active, true); return db
}
async function rpc(db, name, args = {}) { const result = await db.rpc(name, args); assert.ifError(result.error); return result.data }

const admin = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD, 'admin')
const cashState = await admin.rpc('get_cash_session_summary', { p_session_id: null })
if (!cashState.error && !cashState.data) assert.ifError((await admin.rpc('open_cash_session', { p_fond_ouverture: 100000, p_idempotency_key: crypto.randomUUID() })).error)
const admin2 = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD, 'admin')
const cashier = await login(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD, 'caissier')
const inactive = await login(process.env.TEST_INACTIVE_EMAIL, process.env.TEST_INACTIVE_PASSWORD, null, false)
const suffix = Date.now()
const piece = await admin.from('unites').select('id').eq('code', 'piece').single(); assert.ifError(piece.error)
const materialId = await rpc(admin, 'save_material', { p_id: null, p_code: `P4-A-${suffix}`, p_nom: `Matière achat A ${suffix}`, p_unite_id: piece.data.id, p_stock_minimum: 0, p_actif: true })
const material2Id = await rpc(admin, 'save_material', { p_id: null, p_code: `P4-B-${suffix}`, p_nom: `Matière achat B ${suffix}`, p_unite_id: piece.data.id, p_stock_minimum: 0, p_actif: true })
await rpc(admin, 'add_stock_entry', { p_matiere_id: materialId, p_quantite: 10, p_cout_unitaire: 1000, p_note: 'Base coût moyen Étape 4' })

console.log('1/26 Création fournisseur')
const supplierId = await rpc(admin, 'save_supplier', { p_id: null, p_code: `SUP-${suffix}`, p_nom: `Fournisseur test ${suffix}`, p_telephone: '0102030405', p_email: null, p_adresse: null, p_notes: 'Intégration Étape 4', p_actif: true })
assert.ok(supplierId)

console.log('2/26 Fournisseur inactif refusé')
const inactiveSupplierId = await rpc(admin, 'save_supplier', { p_id: null, p_code: `OFF-${suffix}`, p_nom: `Fournisseur inactif ${suffix}`, p_telephone: '0100000000', p_email: null, p_adresse: null, p_notes: null, p_actif: false })
const inactivePurchase = await admin.rpc('create_purchase', { p_idempotency_key: crypto.randomUUID(), p_fournisseur_id: inactiveSupplierId, p_date_achat: new Date().toISOString().slice(0, 10), p_notes: null, p_lignes: [{ matiere_id: materialId, quantite: 1, cout_unitaire: 1 }] })
assert.ok(inactivePurchase.error); assert.match(inactivePurchase.error.message, /Fournisseur inactif/i)

console.log('A/26 Payload create_purchase avec matière répétée refusé')
const duplicateCreate = await admin.rpc('create_purchase', { p_idempotency_key: crypto.randomUUID(), p_fournisseur_id: supplierId, p_date_achat: new Date().toISOString().slice(0, 10), p_notes: null, p_lignes: [{ matiere_id: materialId, quantite: 2, cout_unitaire: 1000 }, { matiere_id: materialId, quantite: 3, cout_unitaire: 900 }] })
assert.ok(duplicateCreate.error); assert.match(duplicateCreate.error.message, /Cette matière première est déjà présente dans l'achat\./i)

console.log('3/26 Création achat avec plusieurs lignes')
const createKey = crypto.randomUUID()
const createArgs = { p_idempotency_key: createKey, p_fournisseur_id: supplierId, p_date_achat: new Date().toISOString().slice(0, 10), p_notes: 'Brouillon initial', p_lignes: [{ matiere_id: materialId, quantite: 10, cout_unitaire: 1200 }, { matiere_id: material2Id, quantite: 5, cout_unitaire: 500 }] }
const purchase = await rpc(admin, 'create_purchase', createArgs); assert.equal(Number(purchase.total), 14500)

console.log('4/26 Idempotence create_purchase')
const purchaseReplay = await rpc(admin, 'create_purchase', createArgs); assert.equal(purchaseReplay.achat_id, purchase.achat_id); assert.equal(purchaseReplay.idempotent_replay, true)
const purchaseCount = await admin.from('achats').select('id', { count: 'exact', head: true }).eq('idempotency_key', createKey); assert.ifError(purchaseCount.error); assert.equal(purchaseCount.count, 1)

console.log('5/26 Modification du brouillon')
console.log('B/26 Doublon refusé dans update_purchase_draft sans altérer le brouillon')
const duplicateUpdate = await admin.rpc('update_purchase_draft', { p_achat_id: purchase.achat_id, p_fournisseur_id: supplierId, p_date_achat: createArgs.p_date_achat, p_notes: null, p_lignes: [{ matiere_id: material2Id, quantite: 1, cout_unitaire: 500 }, { matiere_id: material2Id, quantite: 2, cout_unitaire: 450 }] })
assert.ok(duplicateUpdate.error); assert.match(duplicateUpdate.error.message, /Cette matière première est déjà présente dans l'achat\./i)
assert.equal(Number((await rpc(admin, 'get_purchase_detail', { p_achat_id: purchase.achat_id })).total), 14500)
const updated = await rpc(admin, 'update_purchase_draft', { p_achat_id: purchase.achat_id, p_fournisseur_id: supplierId, p_date_achat: createArgs.p_date_achat, p_notes: 'Brouillon corrigé', p_lignes: [{ matiere_id: materialId, quantite: 10, cout_unitaire: 1200 }, { matiere_id: material2Id, quantite: 4, cout_unitaire: 500 }] })
assert.equal(Number(updated.total), 14000)

console.log('6/26 C — Achat distinct et réception atomique avec premier paiement partiel')
const receptionKey = crypto.randomUUID(); const initialPaymentKey = crypto.randomUUID()
const received = await rpc(admin, 'receive_purchase', { p_achat_id: purchase.achat_id, p_idempotency_key: receptionKey, p_montant_paye: 4000, p_mode_paiement: 'especes', p_payment_idempotency_key: initialPaymentKey, p_reference: 'TEST-INITIAL', p_note: null })
assert.equal(Number(received.reste_a_payer), 10000)

console.log('7/26 Stocks augmentés')
let stock = await rpc(admin, 'get_stock_overview')
assert.equal(Number(stock.find(item => item.id === materialId).stock_actuel), 20)
assert.equal(Number(stock.find(item => item.id === material2Id).stock_actuel), 4)

console.log('8/26 Coût moyen pondéré')
assert.equal(Number(stock.find(item => item.id === materialId).cout_unitaire_moyen), 1100)

console.log('9/26 Mouvements achat uniques')
let purchaseMoves = await rpc(admin, 'get_stock_movements', { p_matiere_id: null, p_type: 'entree', p_from: null, p_to: null })
assert.equal(purchaseMoves.filter(move => move.reference_type === 'achat' && move.reference_id === purchase.achat_id).length, 2)

console.log('10/26 D — Double réception sans mouvement ni stock supplémentaire')
const receiveReplay = await rpc(admin2, 'receive_purchase', { p_achat_id: purchase.achat_id, p_idempotency_key: receptionKey, p_montant_paye: 4000, p_mode_paiement: 'especes', p_payment_idempotency_key: initialPaymentKey, p_reference: null, p_note: null })
assert.equal(receiveReplay.idempotent_replay, true)
stock = await rpc(admin, 'get_stock_overview'); assert.equal(Number(stock.find(item => item.id === materialId).stock_actuel), 20)
purchaseMoves = await rpc(admin, 'get_stock_movements', { p_matiere_id: null, p_type: 'entree', p_from: null, p_to: null })
assert.equal(purchaseMoves.filter(move => move.reference_type === 'achat' && move.reference_id === purchase.achat_id).length, 2)

console.log('11/26 Premier paiement enregistré exactement une fois')
let payments = await admin.from('paiements_fournisseur').select('*').eq('achat_id', purchase.achat_id); assert.ifError(payments.error)
assert.equal(payments.data.length, 1); assert.equal(Number(payments.data[0].montant), 4000)

console.log('12/26 Règlement ultérieur')
await rpc(admin, 'add_supplier_payment', { p_achat_id: purchase.achat_id, p_montant: 2000, p_mode_paiement: 'orange_money', p_idempotency_key: crypto.randomUUID(), p_reference: 'OM-TEST', p_note: null })
let detail = await rpc(admin, 'get_purchase_detail', { p_achat_id: purchase.achat_id }); assert.equal(Number(detail.reste_a_payer), 8000)

console.log('13/26 Dépassement du reste refusé')
assert.ok((await admin.rpc('add_supplier_payment', { p_achat_id: purchase.achat_id, p_montant: 9000, p_mode_paiement: 'especes', p_idempotency_key: crypto.randomUUID(), p_reference: null, p_note: null })).error)

console.log('14/26 Idempotence règlement')
const paymentKey = crypto.randomUUID(); const paymentArgs = { p_achat_id: purchase.achat_id, p_montant: 1000, p_mode_paiement: 'virement', p_idempotency_key: paymentKey, p_reference: 'VIR-TEST', p_note: null }
const payment = await rpc(admin, 'add_supplier_payment', paymentArgs); const paymentReplay = await rpc(admin, 'add_supplier_payment', paymentArgs)
assert.equal(paymentReplay.payment_id, payment.payment_id); assert.equal(Number(paymentReplay.reste_a_payer), 7000)

console.log('15/26 Paiements concurrents sur le dernier reste')
const concurrent = await Promise.all([admin.rpc('add_supplier_payment', { p_achat_id: purchase.achat_id, p_montant: 7000, p_mode_paiement: 'especes', p_idempotency_key: crypto.randomUUID(), p_reference: null, p_note: null }), admin2.rpc('add_supplier_payment', { p_achat_id: purchase.achat_id, p_montant: 7000, p_mode_paiement: 'especes', p_idempotency_key: crypto.randomUUID(), p_reference: null, p_note: null })])
assert.equal(concurrent.filter(result => !result.error).length, 1); assert.equal(concurrent.filter(result => result.error).length, 1)

console.log('16/26 Achat soldé')
detail = await rpc(admin, 'get_purchase_detail', { p_achat_id: purchase.achat_id }); assert.equal(detail.statut, 'paye'); assert.equal(Number(detail.reste_a_payer), 0); assert.equal(Number(detail.montant_paye), 14000)

console.log('17/26 Dette fournisseur correcte')
let balances = await rpc(admin, 'get_suppliers_balances'); let balance = balances.find(item => item.id === supplierId)
assert.equal(Number(balance.reste_du), 0); assert.equal(Number(balance.total_achats), 14000); assert.equal(Number(balance.total_paye), 14000)

console.log('18/26 Annulation brouillon')
const draft = await rpc(admin, 'create_purchase', { ...createArgs, p_idempotency_key: crypto.randomUUID(), p_notes: 'À annuler' })
await rpc(admin, 'cancel_purchase', { p_achat_id: draft.achat_id }); assert.equal((await rpc(admin, 'get_purchase_detail', { p_achat_id: draft.achat_id })).statut, 'annule')

console.log('19/26 Annulation réceptionnée refusée')
assert.ok((await admin.rpc('cancel_purchase', { p_achat_id: purchase.achat_id })).error)

console.log('20/26 Lignes réceptionnées immuables')
assert.ok((await admin.from('lignes_achat').update({ quantite: 999 }).eq('achat_id', purchase.achat_id)).error)
assert.ok((await admin.from('lignes_achat').delete().eq('achat_id', purchase.achat_id)).error)

console.log('21/26 Paiements immuables')
payments = await admin.from('paiements_fournisseur').select('id').eq('achat_id', purchase.achat_id).limit(1); assert.ifError(payments.error)
assert.ok((await admin.from('paiements_fournisseur').update({ montant: 1 }).eq('id', payments.data[0].id)).error)
assert.ok((await admin.from('paiements_fournisseur').delete().eq('id', payments.data[0].id)).error)

console.log('22/26 Rôle non autorisé refusé')
assert.ok((await cashier.rpc('save_supplier', { p_id: null, p_code: `NO-${suffix}`, p_nom: 'Interdit', p_telephone: '0', p_email: null, p_adresse: null, p_notes: null, p_actif: true })).error)
assert.ok((await cashier.rpc('add_supplier_payment', { p_achat_id: purchase.achat_id, p_montant: 1, p_mode_paiement: 'especes', p_idempotency_key: crypto.randomUUID(), p_reference: null, p_note: null })).error)

console.log('23/26 Compte inactif refusé')
assert.ok((await inactive.rpc('get_suppliers_balances')).error); assert.ok((await inactive.rpc('create_purchase', createArgs)).error)

console.log('24/26 Écritures directes refusées')
assert.ok((await admin.from('fournisseurs').insert({ code: `RAW-${suffix}`, nom: 'Direct', telephone: '0' })).error)
assert.ok((await admin.from('achats').update({ total: 1 }).eq('id', purchase.achat_id)).error)
assert.ok((await admin.from('paiements_fournisseur').insert({})).error)

console.log('25/26 Historique fournisseur cohérent')
const history = await rpc(admin, 'get_supplier_history', { p_fournisseur_id: supplierId })
assert.ok(history.achats.some(item => item.id === purchase.achat_id && Number(item.reste_a_payer) === 0))
assert.equal(history.paiements.filter(item => item.achat_id === purchase.achat_id).reduce((sum, item) => sum + Number(item.montant), 0), 14000)

console.log('26/26 Dashboard fournisseurs cohérent')
const dashboard = await rpc(admin, 'dashboard_supplier_stats')
assert.ok(Number(dashboard.achats_du_jour) >= 14000); assert.ok(Number(dashboard.paiements_du_jour) >= 14000); assert.ok(Number(dashboard.dette_fournisseurs) >= 0)

await Promise.all([admin.auth.signOut(), admin2.auth.signOut(), cashier.auth.signOut(), inactive.auth.signOut()])
console.log('Tous les tests d’intégration Étape 4 sont réussis. Les données restent dans cette instance de test.')
