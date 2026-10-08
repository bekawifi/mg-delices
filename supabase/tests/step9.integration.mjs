import '../../scripts/assert-test-environment.mjs'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const required=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','TEST_ADMIN_EMAIL','TEST_ADMIN_PASSWORD','TEST_CASHIER_EMAIL','TEST_CASHIER_PASSWORD','TEST_SERVER_EMAIL','TEST_SERVER_PASSWORD','TEST_KITCHEN_EMAIL','TEST_KITCHEN_PASSWORD']
for(const name of required)assert.ok(process.env[name],`Variable manquante : ${name}`)
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
const client=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,options)
async function login(email,password){const db=client(),result=await db.auth.signInWithPassword({email,password});assert.ifError(result.error);return db}
async function rpc(db,name,args={}){const result=await db.rpc(name,args);assert.ifError(result.error);return result.data}
async function rejected(promise,label){const result=await promise;assert.ok(result.error,`${label} devait être refusé`);assert.match(result.error.message,/ouvrir une session de caisse/i);return result.error}
let count=0
async function check(label,fn){count+=1;process.stdout.write(`${count}/23 ${label} ... `);await fn();console.log('OK')}

const admin=await login(process.env.TEST_ADMIN_EMAIL,process.env.TEST_ADMIN_PASSWORD)
const cashier=await login(process.env.TEST_CASHIER_EMAIL,process.env.TEST_CASHIER_PASSWORD)
const server=await login(process.env.TEST_SERVER_EMAIL,process.env.TEST_SERVER_PASSWORD)
const kitchen=await login(process.env.TEST_KITCHEN_EMAIL,process.env.TEST_KITCHEN_PASSWORD)
const suffix=Date.now(),today=new Date().toISOString().slice(0,10)

const active=await rpc(admin,'get_cash_session_summary',{p_session_id:null})
if(active)await rpc(admin,'close_cash_session',{p_session_id:active.id,p_comptage:[{denomination:1,quantite:Math.max(0,Math.round(Number(active.solde_theorique)))}],p_note:'Préparation validation Étape 9',p_idempotency_key:crypto.randomUUID()})
const product=await admin.from('produits').insert({nom:`Validation 9 ${suffix}`,prix_vente:1000,cout_estime:0,disponible:true}).select('id').single();assert.ifError(product.error)
const customerId=await rpc(admin,'save_customer',{p_id:null,p_nom:`Client validation 9 ${suffix}`,p_telephone:null,p_email:`step9-${suffix}@example.test`,p_adresse:null,p_plafond_credit:100000,p_actif:true})
const saleArgs=(mode,received=1000,clientId=null)=>({p_idempotency_key:crypto.randomUUID(),p_type_commande:'emporter',p_remise:0,p_montant_recu:received,p_mode_paiement:mode,p_lignes:[{produit_id:product.data.id,quantite:1}],p_client_id:clientId})

await check('A vente espèces sans session refusée',()=>rejected(cashier.rpc('create_sale',saleArgs('especes')),'vente espèces'))
await check('B vente Orange Money sans session refusée',()=>rejected(cashier.rpc('create_sale',saleArgs('orange_money')),'vente Orange Money'))
await check('C vente Moov Money sans session refusée',()=>rejected(cashier.rpc('create_sale',saleArgs('moov_money')),'vente Moov Money'))
await check('D vente crédit total sans session refusée',()=>rejected(cashier.rpc('create_sale',saleArgs('orange_money',0,customerId)),'vente crédit'))

const unit=await admin.from('unites').select('id').eq('code','piece').single();assert.ifError(unit.error)
const materialId=await rpc(admin,'save_material',{p_id:null,p_code:`S9-${suffix}`,p_nom:`Matière validation 9 ${suffix}`,p_unite_id:unit.data.id,p_stock_minimum:0,p_actif:true})
const supplierId=await rpc(admin,'save_supplier',{p_id:null,p_code:`S9F-${suffix}`,p_nom:`Fournisseur validation 9 ${suffix}`,p_telephone:`70${String(suffix).slice(-7)}`,p_email:null,p_adresse:null,p_notes:'Test Étape 9',p_actif:true})
const purchase=await rpc(admin,'create_purchase',{p_idempotency_key:crypto.randomUUID(),p_fournisseur_id:supplierId,p_date_achat:today,p_notes:'Validation Étape 9',p_lignes:[{matiere_id:materialId,quantite:2,cout_unitaire:500}]})
await rpc(admin,'receive_purchase',{p_achat_id:purchase.achat_id,p_idempotency_key:crypto.randomUUID(),p_montant_paye:0,p_mode_paiement:null,p_payment_idempotency_key:null,p_reference:null,p_note:null})
await check('F paiement fournisseur mobile sans session refusé',()=>rejected(admin.rpc('add_supplier_payment',{p_achat_id:purchase.achat_id,p_montant:500,p_mode_paiement:'orange_money',p_idempotency_key:crypto.randomUUID(),p_reference:'S9',p_note:null}),'paiement fournisseur'))
const category=await admin.from('categories_depense').select('id').eq('actif',true).limit(1).single();assert.ifError(category.error)
await check('G dépense mobile sans session refusée',()=>rejected(admin.rpc('create_expense',{p_idempotency_key:crypto.randomUUID(),p_categorie_id:category.data.id,p_libelle:'Validation Étape 9',p_montant:100,p_mode_paiement:'orange_money',p_reference:'S9',p_note:null,p_date_depense:today}),'dépense'))

const zone=await admin.from('zones').insert({nom:`Zone S9 ${suffix}`,ordre:999,actif:true}).select('id').single();assert.ifError(zone.error)
const table=await admin.from('tables_restaurant').insert({zone_id:zone.data.id,nom:`Table S9 ${suffix}`,numero:999,capacite:2,actif:true}).select('id').single();assert.ifError(table.error)
let order
await check('I ouverture table sans session autorisée',async()=>{order=await rpc(server,'open_table_order',{p_table_id:table.data.id,p_notes:'Validation Étape 9'});assert.ok(order.id)})
await check('J commande cuisine sans session autorisée',async()=>{await rpc(server,'add_order_items',{p_commande_id:order.id,p_items:[{produit_id:product.data.id,quantite:1,notes:'Sans sel'}]});await rpc(server,'send_order_to_kitchen',{p_commande_id:order.id});let detail=await rpc(server,'get_order_detail',{p_commande_id:order.id});for(const line of detail.lignes){await rpc(admin,'start_kitchen_item',{p_ligne_id:line.id});await rpc(admin,'mark_kitchen_item_ready',{p_ligne_id:line.id})}await rpc(server,'mark_order_served',{p_commande_id:order.id})})
await check('K checkout sans session refusé',()=>rejected(cashier.rpc('checkout_order',{p_commande_id:order.id,p_idempotency_key:crypto.randomUUID(),p_remise:0,p_montant_recu:1000,p_mode_paiement:'orange_money',p_client_id:null}),'checkout'))

let session
await check('session ouverte par admin A',async()=>{const opened=await rpc(admin,'open_cash_session',{p_fond_ouverture:10000,p_idempotency_key:crypto.randomUUID()});session=await rpc(admin,'get_cash_session_summary',{p_session_id:opened.session_id});const row=await admin.from('sessions_caisse').select('opened_by').eq('id',session.id).single();assert.ifError(row.error);const me=await admin.auth.getUser();assert.equal(row.data.opened_by,me.data.user.id)})
let mobileSale,mobilePayment
await check('L Orange Money autorisé sans mouvement espèces',async()=>{const before=await admin.from('mouvements_caisse').select('id',{count:'exact',head:true}).eq('session_caisse_id',session.id);mobileSale=await rpc(cashier,'create_sale',saleArgs('orange_money'));const payment=await admin.from('paiements').select('id,created_by,session_caisse_id').eq('vente_id',mobileSale.sale_id).single();assert.ifError(payment.error);mobilePayment=payment.data;const after=await admin.from('mouvements_caisse').select('id',{count:'exact',head:true}).eq('session_caisse_id',session.id);assert.equal(after.count,before.count)})
await check('opérateur B distinct de opened_by',async()=>{const cashierUser=await cashier.auth.getUser();assert.equal(mobilePayment.created_by,cashierUser.data.user.id);assert.equal(mobilePayment.session_caisse_id,session.id);const cashRow=await admin.from('sessions_caisse').select('opened_by').eq('id',session.id).single();assert.notEqual(mobilePayment.created_by,cashRow.data.opened_by)})
await check('M espèces autorisées avec mouvement exact',async()=>{const sale=await rpc(cashier,'create_sale',saleArgs('especes'));const payment=await admin.from('paiements').select('id,session_caisse_id').eq('vente_id',sale.sale_id).single();assert.ifError(payment.error);const movement=await admin.from('mouvements_caisse').select('montant,session_caisse_id').eq('reference_id',payment.data.id).single();assert.ifError(movement.error);assert.equal(Number(movement.data.montant),1000);assert.equal(movement.data.session_caisse_id,session.id)})
let debtSale,creditNoteId
await check('vente crédit avec session autorisée',async()=>{debtSale=await rpc(cashier,'create_sale',saleArgs('orange_money',0,customerId));assert.equal(Number(debtSale.reste_a_payer),1000)})
await check('préparation avoir remboursable',async()=>{const paid=await rpc(cashier,'create_sale',saleArgs('orange_money'));const detail=await rpc(admin,'get_sale_returnable_detail',{p_vente_id:paid.sale_id});const returned=await rpc(admin,'create_customer_return',{p_vente_id:paid.sale_id,p_lignes:[{ligne_vente_id:detail.lignes[0].id,quantite:1}],p_stock_reintegrable:false,p_motif:'Validation Étape 9',p_idempotency_key:crypto.randomUUID(),p_est_annulation:false});const credit=await admin.from('avoirs_clients').select('id').eq('retour_id',returned.retour_id).single();assert.ifError(credit.error);creditNoteId=credit.data.id})
await check('inventaire créé, repris et validé',async()=>{
  const inventoryId=await rpc(admin,'create_inventory',{p_note:'Validation Étape 9'})
  let detail=await rpc(admin,'get_inventory_detail',{p_inventaire_id:inventoryId});assert.ok(detail.lignes.length>0)
  const changed=detail.lignes[0]
  for(const line of detail.lignes)await rpc(admin,'set_inventory_count',{p_inventaire_id:inventoryId,p_matiere_id:line.matiere_id,p_quantite_comptee:Number(line.stock_theorique)+(line.matiere_id===changed.matiere_id?1:0)})
  detail=await rpc(admin,'get_inventory_detail',{p_inventaire_id:inventoryId});assert.equal(detail.statut,'brouillon');assert.equal(Number(detail.lignes.find(line=>line.matiere_id===changed.matiere_id).ecart),1)
  await rpc(admin,'validate_inventory',{p_inventaire_id:inventoryId});detail=await rpc(admin,'get_inventory_detail',{p_inventaire_id:inventoryId});assert.equal(detail.statut,'valide')
  const mutation=await admin.rpc('set_inventory_count',{p_inventaire_id:inventoryId,p_matiere_id:changed.matiere_id,p_quantite_comptee:0});assert.ok(mutation.error)
  const moves=await admin.from('mouvements_stock').select('quantite').eq('reference_type','inventaire').eq('reference_id',inventoryId);assert.ifError(moves.error);assert.equal(moves.data.length,1);assert.equal(Number(moves.data[0].quantite),1)
})
await check('Inventaires rôles administratifs',async()=>{assert.ifError((await admin.rpc('get_inventories_overview')).error);assert.ok((await cashier.rpc('get_inventories_overview')).error);assert.ok((await server.rpc('get_inventories_overview')).error);assert.ok((await kitchen.rpc('get_inventories_overview')).error)})

await check('clôture de session',async()=>{const current=await rpc(admin,'get_cash_session_summary',{p_session_id:session.id});await rpc(admin,'close_cash_session',{p_session_id:session.id,p_comptage:[{denomination:1,quantite:Math.max(0,Math.round(Number(current.solde_theorique)))}],p_note:'Validation clôture Étape 9',p_idempotency_key:crypto.randomUUID()})})
await check('vente refusée après clôture',()=>rejected(cashier.rpc('create_sale',saleArgs('orange_money')),'vente après clôture'))
await check('E règlement client mobile refusé après clôture',()=>rejected(cashier.rpc('add_customer_payment',{p_vente_id:debtSale.sale_id,p_montant:1000,p_mode_paiement:'orange_money',p_idempotency_key:crypto.randomUUID(),p_reference:'S9',p_note:null}),'règlement client'))
await check('dépense et fournisseur refusés après clôture',async()=>{await rejected(admin.rpc('create_expense',{p_idempotency_key:crypto.randomUUID(),p_categorie_id:category.data.id,p_libelle:'Après clôture',p_montant:100,p_mode_paiement:'moov_money',p_reference:'S9',p_note:null,p_date_depense:today}),'dépense après clôture');await rejected(admin.rpc('add_supplier_payment',{p_achat_id:purchase.achat_id,p_montant:500,p_mode_paiement:'moov_money',p_idempotency_key:crypto.randomUUID(),p_reference:'S9',p_note:null}),'fournisseur après clôture')})
await check('H remboursement mobile refusé après clôture',()=>rejected(admin.rpc('refund_customer',{p_avoir_id:creditNoteId,p_montant:1000,p_mode:'orange_money',p_motif:'Validation Étape 9',p_idempotency_key:crypto.randomUUID(),p_reference:'S9'}),'remboursement'))
await check('nouvelle session réautorise les opérations',async()=>{await rpc(admin,'open_cash_session',{p_fond_ouverture:0,p_idempotency_key:crypto.randomUUID()});const sale=await rpc(cashier,'create_sale',saleArgs('moov_money'));assert.ok(sale.sale_id)})

const finalSession=await rpc(admin,'get_cash_session_summary',{p_session_id:null});if(finalSession)await rpc(admin,'close_cash_session',{p_session_id:finalSession.id,p_comptage:[{denomination:1,quantite:Math.max(0,Math.round(Number(finalSession.solde_theorique)))}],p_note:'Fin validation Étape 9',p_idempotency_key:crypto.randomUUID()})
await Promise.all([admin.auth.signOut(),cashier.auth.signOut(),server.auth.signOut(),kitchen.auth.signOut()])
assert.equal(count,23)
console.log('Tous les 23 scénarios de validation Étape 9 sont réussis.')
