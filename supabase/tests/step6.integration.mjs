import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const required=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','TEST_ADMIN_EMAIL','TEST_ADMIN_PASSWORD','TEST_CASHIER_EMAIL','TEST_CASHIER_PASSWORD','TEST_SERVER_EMAIL','TEST_SERVER_PASSWORD','TEST_KITCHEN_EMAIL','TEST_KITCHEN_PASSWORD','TEST_INACTIVE_EMAIL','TEST_INACTIVE_PASSWORD']
for(const name of required)assert.ok(process.env[name],`Variable manquante : ${name}`)
assert.ok(!process.env.VITE_SUPABASE_URL.includes('votre-projet'),'Utilisez une instance de test dédiée')
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
const makeClient=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,options)
async function login(email,password){const db=makeClient(),result=await db.auth.signInWithPassword({email,password});assert.ifError(result.error);return db}
async function rpc(db,name,args={}){const result=await db.rpc(name,args);assert.ifError(result.error);return result.data}
const admin=await login(process.env.TEST_ADMIN_EMAIL,process.env.TEST_ADMIN_PASSWORD)
const cashier=await login(process.env.TEST_CASHIER_EMAIL,process.env.TEST_CASHIER_PASSWORD)
const cashier2=await login(process.env.TEST_CASHIER_EMAIL,process.env.TEST_CASHIER_PASSWORD)
const server=await login(process.env.TEST_SERVER_EMAIL,process.env.TEST_SERVER_PASSWORD)
const kitchen=await login(process.env.TEST_KITCHEN_EMAIL,process.env.TEST_KITCHEN_PASSWORD)
const inactive=await login(process.env.TEST_INACTIVE_EMAIL,process.env.TEST_INACTIVE_PASSWORD)
const suffix=Date.now(),today=new Date().toISOString().slice(0,10)
const saleArgs=(productId,quantity,clientId,received=0,mode='orange_money',key=crypto.randomUUID())=>({key,args:{p_idempotency_key:key,p_type_commande:'emporter',p_remise:0,p_montant_recu:received,p_mode_paiement:mode,p_lignes:[{produit_id:productId,quantite:quantity}],p_client_id:clientId}})
async function assertCreditCoherent(clientId){const detail=await rpc(admin,'get_customer_detail',{p_client_id:clientId}),sumRemainders=detail.ventes.reduce((sum,sale)=>sum+Number(sale.reste_a_payer),0),audit=await rpc(admin,'audit_customer_credit',{p_client_id:clientId});assert.equal(Number(detail.encours_credit),sumRemainders);assert.equal(Number(audit[0].somme_restes),sumRemainders);assert.equal(Number(audit[0].dette_calculee),sumRemainders);assert.equal(Number(audit[0].ecart_grand_livre),0);return detail}

console.log('1/23 Préparation matière, produit, recette et client')
const unit=await admin.from('unites').select('id').eq('code','piece').single();assert.ifError(unit.error)
const materialId=await rpc(admin,'save_material',{p_id:null,p_code:`CR-${suffix}`,p_nom:`Matière crédit ${suffix}`,p_unite_id:unit.data.id,p_stock_minimum:0,p_actif:true})
await rpc(admin,'add_stock_entry',{p_matiere_id:materialId,p_quantite:100,p_cout_unitaire:500,p_note:'Stock tests Étape 6'})
const product=await admin.from('produits').insert({nom:`Produit crédit ${suffix}`,prix_vente:5000,cout_estime:500,disponible:true}).select('id').single();assert.ifError(product.error)
await rpc(admin,'save_recipe',{p_produit_id:product.data.id,p_nom:'Recette crédit',p_rendement:1,p_ingredients:[{matiere_id:materialId,quantite:1}]})
const clientId=await rpc(admin,'save_customer',{p_id:null,p_nom:`Client crédit ${suffix}`,p_telephone:`70${String(suffix).slice(-7)}`,p_email:null,p_adresse:null,p_plafond_credit:20000,p_actif:true})
const priorCash=await rpc(admin,'get_cash_session_summary',{p_session_id:null});if(priorCash)await rpc(admin,'close_cash_session',{p_session_id:priorCash.id,p_comptage:[{denomination:1,quantite:Math.max(0,Math.round(Number(priorCash.solde_theorique)))}],p_note:'Préparation crédit sans caisse',p_idempotency_key:crypto.randomUUID()})

console.log('Backfill ventes historiques sans créance artificielle')
const historical=await admin.from('ventes').select('total_final,montant_initial_paye,montant_paye,reste_a_payer,statut_paiement').is('client_id',null);assert.ifError(historical.error)
for(const sale of historical.data){assert.equal(Number(sale.montant_initial_paye),Number(sale.total_final));assert.equal(Number(sale.montant_paye),Number(sale.total_final));assert.equal(Number(sale.reste_a_payer),0);assert.equal(sale.statut_paiement,'payee')}
const historicalStockMoves=await admin.from('mouvements_stock').select('reference_id,matiere_premiere_id').eq('reference_type','vente');assert.ifError(historicalStockMoves.error);assert.equal(new Set(historicalStockMoves.data.map(move=>`${move.reference_id}:${move.matiere_premiere_id}`)).size,historicalStockMoves.data.length)

console.log('2/23 Vente à crédit avec paiement initial nul')
let stock=await rpc(admin,'get_stock_overview'),beforeStock=Number(stock.find(x=>x.id===materialId).stock_actuel)
const cashMovesBeforeZero=await admin.from('mouvements_caisse').select('id',{count:'exact',head:true});assert.ifError(cashMovesBeforeZero.error)
const zeroSaleArgs=saleArgs(product.data.id,1,clientId),zeroSale=await rpc(cashier,'create_sale',zeroSaleArgs.args)
assert.equal(Number(zeroSale.montant_paye),0);assert.equal(Number(zeroSale.reste_a_payer),5000);assert.equal(zeroSale.statut_paiement,'impayee')
let saleRow=await admin.from('ventes').select('*').eq('id',zeroSale.sale_id).single();assert.ifError(saleRow.error);assert.equal(saleRow.data.client_id,clientId)
const cashMovesAfterZero=await admin.from('mouvements_caisse').select('id',{count:'exact',head:true});assert.equal(cashMovesAfterZero.count,cashMovesBeforeZero.count)
let creditDetail=await assertCreditCoherent(clientId);assert.equal(Number(creditDetail.points_fidelite),0)

console.log('3/23 Déstockage immédiat sans paiement')
stock=await rpc(admin,'get_stock_overview');assert.equal(Number(stock.find(x=>x.id===materialId).stock_actuel),beforeStock-1)
let saleMoves=await admin.from('mouvements_stock').select('id').eq('reference_type','vente').eq('reference_id',zeroSale.sale_id);assert.ifError(saleMoves.error);assert.equal(saleMoves.data.length,1)
let payments=await admin.from('paiements').select('id').eq('vente_id',zeroSale.sale_id);assert.ifError(payments.error);assert.equal(payments.data.length,0)

console.log('4/23 Rejeu vente sans nouveau déstockage')
const zeroReplay=await rpc(cashier,'create_sale',zeroSaleArgs.args);assert.equal(zeroReplay.sale_id,zeroSale.sale_id);assert.equal(zeroReplay.idempotent_replay,true)
saleMoves=await admin.from('mouvements_stock').select('id').eq('reference_id',zeroSale.sale_id);assert.equal(saleMoves.data.length,1)

console.log('5/23 Premier règlement partiel mobile')
const paymentKey=crypto.randomUUID(),payment1=await rpc(cashier,'add_customer_payment',{p_vente_id:zeroSale.sale_id,p_montant:2000,p_mode_paiement:'orange_money',p_idempotency_key:paymentKey,p_reference:'OM-test',p_note:null})
assert.equal(Number(payment1.reste_a_payer),3000);assert.equal(payment1.statut_paiement,'partiellement_payee')
await assertCreditCoherent(clientId)

console.log('6/23 Deuxième règlement et paiements multiples')
const payment2=await rpc(cashier,'add_customer_payment',{p_vente_id:zeroSale.sale_id,p_montant:3000,p_mode_paiement:'moov_money',p_idempotency_key:crypto.randomUUID(),p_reference:'MOOV-test',p_note:null})
assert.equal(Number(payment2.reste_a_payer),0);payments=await admin.from('paiements').select('id').eq('vente_id',zeroSale.sale_id);assert.equal(payments.data.length,2)
await assertCreditCoherent(clientId)

console.log('7/23 Règlements ultérieurs sans redéstockage')
saleMoves=await admin.from('mouvements_stock').select('id').eq('reference_id',zeroSale.sale_id);assert.equal(saleMoves.data.length,1)

console.log('8/23 Idempotence règlement')
const paymentReplay=await rpc(cashier,'add_customer_payment',{p_vente_id:zeroSale.sale_id,p_montant:2000,p_mode_paiement:'orange_money',p_idempotency_key:paymentKey,p_reference:'OM-test',p_note:null});assert.equal(paymentReplay.payment_id,payment1.payment_id);assert.equal(paymentReplay.idempotent_replay,true)

console.log('9/23 Fidélité attribuée une seule fois au solde')
let detail=await rpc(admin,'get_customer_detail',{p_client_id:clientId});assert.equal(Number(detail.encours_credit),0);assert.equal(Number(detail.points_fidelite),5);assert.equal(detail.fidelite.filter(x=>x.vente_id===zeroSale.sale_id).length,1)

console.log('10/23 Client obligatoire pour tout reste dû')
const noClient=await cashier.rpc('create_sale',saleArgs(product.data.id,1,null,0).args);assert.ok(noClient.error);assert.match(noClient.error.message,/client est obligatoire/i)

console.log('11/23 Plafond contrôlé côté serveur')
const limitedId=await rpc(admin,'save_customer',{p_id:null,p_nom:`Client limité ${suffix}`,p_telephone:null,p_email:`limited-${suffix}@example.test`,p_adresse:null,p_plafond_credit:5000,p_actif:true})
const overLimit=await cashier.rpc('create_sale',saleArgs(product.data.id,2,limitedId,0).args);assert.ok(overLimit.error);assert.match(overLimit.error.message,/plafond de crédit/i)

console.log('12/23 Deux ventes concurrentes sérialisées par client')
const concurrentProduct=await admin.from('produits').insert({nom:`Produit concurrence crédit ${suffix}`,prix_vente:4000,cout_estime:500,disponible:true}).select('id').single();assert.ifError(concurrentProduct.error)
await rpc(admin,'save_recipe',{p_produit_id:concurrentProduct.data.id,p_nom:'Recette concurrence crédit',p_rendement:1,p_ingredients:[{matiere_id:materialId,quantite:1}]})
const concurrent=await Promise.all([cashier.rpc('create_sale',saleArgs(concurrentProduct.data.id,1,limitedId,0).args),cashier2.rpc('create_sale',saleArgs(concurrentProduct.data.id,1,limitedId,0).args)])
assert.equal(concurrent.filter(x=>!x.error).length,1);assert.equal(concurrent.filter(x=>x.error).length,1)
detail=await rpc(admin,'get_customer_detail',{p_client_id:limitedId});assert.equal(Number(detail.encours_credit),4000)
await assertCreditCoherent(limitedId)

console.log('13/23 Deux règlements concurrents ne dépassent pas le dû')
const concurrentSale=detail.ventes.find(x=>Number(x.reste_a_payer)===4000);assert.ok(concurrentSale)
const concurrentPayments=await Promise.all([cashier.rpc('add_customer_payment',{p_vente_id:concurrentSale.id,p_montant:3000,p_mode_paiement:'orange_money',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:null}),cashier2.rpc('add_customer_payment',{p_vente_id:concurrentSale.id,p_montant:3000,p_mode_paiement:'moov_money',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:null})])
assert.equal(concurrentPayments.filter(x=>!x.error).length,1);assert.equal(concurrentPayments.filter(x=>x.error).length,1)
saleRow=await admin.from('ventes').select('reste_a_payer,montant_paye').eq('id',concurrentSale.id).single();assert.equal(Number(saleRow.data.reste_a_payer),1000);assert.equal(Number(saleRow.data.montant_paye),3000)
assert.ok((await cashier.rpc('add_customer_payment',{p_vente_id:concurrentSale.id,p_montant:1001,p_mode_paiement:'orange_money',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:null})).error)
await assertCreditCoherent(limitedId)

console.log('Concurrence plafond exacte : 40 000 + deux ventes de 8 000 sous plafond 50 000')
const ceilingClient=await rpc(admin,'save_customer',{p_id:null,p_nom:`Client plafond ${suffix}`,p_telephone:null,p_email:`ceiling-${suffix}@example.test`,p_adresse:null,p_plafond_credit:50000,p_actif:true})
await rpc(cashier,'create_sale',saleArgs(product.data.id,8,ceilingClient,0).args);assert.equal(Number((await assertCreditCoherent(ceilingClient)).encours_credit),40000)
const ceilingProduct=await admin.from('produits').insert({nom:`Produit plafond ${suffix}`,prix_vente:8000,cout_estime:500,disponible:true}).select('id').single();assert.ifError(ceilingProduct.error);await rpc(admin,'save_recipe',{p_produit_id:ceilingProduct.data.id,p_nom:'Recette plafond',p_rendement:1,p_ingredients:[{matiere_id:materialId,quantite:1}]})
const ceilingRace=await Promise.all([cashier.rpc('create_sale',saleArgs(ceilingProduct.data.id,1,ceilingClient,0).args),cashier2.rpc('create_sale',saleArgs(ceilingProduct.data.id,1,ceilingClient,0).args)]);assert.equal(ceilingRace.filter(x=>!x.error).length,1);assert.equal(ceilingRace.filter(x=>x.error).length,1);assert.equal(Number((await assertCreditCoherent(ceilingClient)).encours_credit),48000)

console.log('14/23 Règlement espèces refusé sans session ouverte')
let cash=await rpc(admin,'get_cash_session_summary',{p_session_id:null});if(cash)await rpc(admin,'close_cash_session',{p_session_id:cash.id,p_comptage:[{denomination:1,quantite:Math.max(0,Math.round(Number(cash.solde_theorique)))}],p_note:'Préparation test Étape 6',p_idempotency_key:crypto.randomUUID()})
const cashSaleWithoutSession=await cashier.rpc('create_sale',saleArgs(product.data.id,1,null,5000,'especes').args);assert.ok(cashSaleWithoutSession.error);assert.match(cashSaleWithoutSession.error.message,/Aucune caisse/i)
const cashWithoutSession=await cashier.rpc('add_customer_payment',{p_vente_id:concurrentSale.id,p_montant:500,p_mode_paiement:'especes',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:null});assert.ok(cashWithoutSession.error);assert.match(cashWithoutSession.error.message,/Aucune caisse/i)

console.log('15/23 Règlement espèces intégré à la session ouverte')
await rpc(admin,'open_cash_session',{p_fond_ouverture:20000,p_idempotency_key:crypto.randomUUID()})
const cashSale=await rpc(cashier,'create_sale',saleArgs(product.data.id,1,null,5000,'especes').args);assert.equal(Number(cashSale.reste_a_payer),0)
const cashPayment=await rpc(cashier,'add_customer_payment',{p_vente_id:concurrentSale.id,p_montant:500,p_mode_paiement:'especes',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:null})
let cashMovement=await admin.from('mouvements_caisse').select('id,montant').eq('reference_type','paiement_client').eq('reference_id',cashPayment.payment_id);assert.ifError(cashMovement.error);assert.equal(cashMovement.data.length,1);assert.equal(Number(cashMovement.data[0].montant),500)

console.log('16/23 Paiement mobile sans mouvement espèces')
const mobilePayment=await rpc(cashier,'add_customer_payment',{p_vente_id:concurrentSale.id,p_montant:500,p_mode_paiement:'orange_money',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:null})
cashMovement=await admin.from('mouvements_caisse').select('id').eq('reference_type','paiement_client').eq('reference_id',mobilePayment.payment_id);assert.equal(cashMovement.data.length,0)
await assertCreditCoherent(limitedId)

console.log('Paiement initial partiel espèces, règlement final concurrent et fidélité unique')
const partialClient=await rpc(admin,'save_customer',{p_id:null,p_nom:`Client partiel ${suffix}`,p_telephone:null,p_email:`partial-${suffix}@example.test`,p_adresse:null,p_plafond_credit:20000,p_actif:true})
const partialStockBefore=Number((await rpc(admin,'get_stock_overview')).find(x=>x.id===materialId).stock_actuel)
const partialSale=await rpc(cashier,'create_sale',saleArgs(product.data.id,2,partialClient,4000,'especes').args);assert.equal(Number(partialSale.montant_paye),4000);assert.equal(Number(partialSale.reste_a_payer),6000)
let partialPayments=await admin.from('paiements').select('id,montant').eq('vente_id',partialSale.sale_id);assert.equal(partialPayments.data.length,1);assert.equal(Number(partialPayments.data[0].montant),4000)
let partialCashMovement=await admin.from('mouvements_caisse').select('montant').eq('reference_id',partialPayments.data[0].id);assert.equal(partialCashMovement.data.length,1);assert.equal(Number(partialCashMovement.data[0].montant),4000)
assert.equal(Number((await rpc(admin,'get_stock_overview')).find(x=>x.id===materialId).stock_actuel),partialStockBefore-2)
creditDetail=await assertCreditCoherent(partialClient);assert.equal(Number(creditDetail.points_fidelite),0)
const currentCash=await rpc(admin,'get_cash_session_summary',{p_session_id:null});await rpc(admin,'close_cash_session',{p_session_id:currentCash.id,p_comptage:[{denomination:1,quantite:Math.max(0,Math.round(Number(currentCash.solde_theorique)))}],p_note:'Test règlement mobile caisse fermée',p_idempotency_key:crypto.randomUUID()})
const finalPayments=await Promise.all([cashier.rpc('add_customer_payment',{p_vente_id:partialSale.sale_id,p_montant:6000,p_mode_paiement:'orange_money',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:null}),cashier2.rpc('add_customer_payment',{p_vente_id:partialSale.sale_id,p_montant:6000,p_mode_paiement:'moov_money',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:null})]);assert.equal(finalPayments.filter(x=>!x.error).length,1);assert.equal(finalPayments.filter(x=>x.error).length,1)
creditDetail=await assertCreditCoherent(partialClient);assert.equal(Number(creditDetail.encours_credit),0);assert.equal(Number(creditDetail.points_fidelite),10);assert.equal(creditDetail.fidelite.filter(x=>x.vente_id===partialSale.sale_id).length,1)
assert.equal((await admin.from('mouvements_stock').select('id').eq('reference_id',partialSale.sale_id)).data.length,1)

console.log('Client inactif : nouvelles ventes refusées, ancienne dette remboursable')
const inactiveClient=await rpc(admin,'save_customer',{p_id:null,p_nom:`Client désactivé ${suffix}`,p_telephone:null,p_email:`inactive-${suffix}@example.test`,p_adresse:null,p_plafond_credit:10000,p_actif:true})
const inactiveDebtSale=await rpc(cashier,'create_sale',saleArgs(product.data.id,1,inactiveClient,0).args);await assertCreditCoherent(inactiveClient)
await rpc(admin,'save_customer',{p_id:inactiveClient,p_nom:`Client désactivé ${suffix}`,p_telephone:null,p_email:`inactive-${suffix}@example.test`,p_adresse:null,p_plafond_credit:10000,p_actif:false})
assert.ok((await cashier.rpc('create_sale',saleArgs(product.data.id,1,inactiveClient,5000).args)).error);assert.ok((await cashier.rpc('create_sale',saleArgs(product.data.id,1,inactiveClient,0).args)).error)
await rpc(cashier,'add_customer_payment',{p_vente_id:inactiveDebtSale.sale_id,p_montant:5000,p_mode_paiement:'orange_money',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:'Remboursement client inactif'});assert.equal(Number((await assertCreditCoherent(inactiveClient)).encours_credit),0)

console.log('17/23 Commande restaurant validée à crédit et table libérée')
const restaurantClient=await rpc(admin,'save_customer',{p_id:null,p_nom:`Client restaurant ${suffix}`,p_telephone:null,p_email:`restaurant-${suffix}@example.test`,p_adresse:null,p_plafond_credit:10000,p_actif:true})
const zone=await admin.from('zones').insert({nom:`Zone crédit ${suffix}`,ordre:996,actif:true}).select('id').single();assert.ifError(zone.error)
const table=await admin.from('tables_restaurant').insert({zone_id:zone.data.id,nom:`Table crédit ${suffix}`,numero:996,capacite:2,actif:true}).select('id').single();assert.ifError(table.error)
const order=await rpc(server,'open_table_order',{p_table_id:table.data.id,p_notes:'Crédit Étape 6'})
await rpc(server,'add_order_items',{p_commande_id:order.id,p_items:[{produit_id:product.data.id,quantite:1}]});await rpc(server,'send_order_to_kitchen',{p_commande_id:order.id})
let orderDetail=await rpc(server,'get_order_detail',{p_commande_id:order.id});await rpc(kitchen,'start_kitchen_item',{p_ligne_id:orderDetail.lignes[0].id});await rpc(kitchen,'mark_kitchen_item_ready',{p_ligne_id:orderDetail.lignes[0].id});await rpc(server,'mark_order_served',{p_commande_id:order.id})
const orderCheckoutKey=crypto.randomUUID(),orderCheckoutArgs={p_commande_id:order.id,p_idempotency_key:orderCheckoutKey,p_remise:0,p_montant_recu:0,p_mode_paiement:'orange_money',p_client_id:restaurantClient}
const orderSale=await rpc(cashier,'checkout_order',orderCheckoutArgs)
assert.equal(Number(orderSale.reste_a_payer),5000);orderDetail=await rpc(server,'get_order_detail',{p_commande_id:order.id});assert.equal(orderDetail.statut,'cloturee')
const freeTable=await rpc(server,'get_tables_overview');assert.equal(freeTable.find(x=>x.id===table.data.id).commande_id,null)
const orderReplay=await rpc(cashier,'checkout_order',orderCheckoutArgs);assert.equal(orderReplay.sale_id,orderSale.sale_id);assert.equal(orderReplay.idempotent_replay,true)

console.log('18/23 Déstockage restaurant immédiat sans paiement')
saleMoves=await admin.from('mouvements_stock').select('id').eq('reference_id',orderSale.sale_id);assert.equal(saleMoves.data.length,1)
payments=await admin.from('paiements').select('id').eq('vente_id',orderSale.sale_id);assert.equal(payments.data.length,0)
await assertCreditCoherent(restaurantClient)

console.log('Checkout restaurant partiel, table libérée et règlement sans redéstockage')
const secondOrder=await rpc(server,'open_table_order',{p_table_id:table.data.id,p_notes:'Crédit partiel Étape 6'});await rpc(server,'add_order_items',{p_commande_id:secondOrder.id,p_items:[{produit_id:product.data.id,quantite:1}]});await rpc(server,'send_order_to_kitchen',{p_commande_id:secondOrder.id})
let secondDetail=await rpc(server,'get_order_detail',{p_commande_id:secondOrder.id});await rpc(kitchen,'start_kitchen_item',{p_ligne_id:secondDetail.lignes[0].id});await rpc(kitchen,'mark_kitchen_item_ready',{p_ligne_id:secondDetail.lignes[0].id});await rpc(server,'mark_order_served',{p_commande_id:secondOrder.id})
const secondOrderSale=await rpc(cashier,'checkout_order',{p_commande_id:secondOrder.id,p_idempotency_key:crypto.randomUUID(),p_remise:0,p_montant_recu:2000,p_mode_paiement:'orange_money',p_client_id:restaurantClient});assert.equal(Number(secondOrderSale.reste_a_payer),3000)
secondDetail=await rpc(server,'get_order_detail',{p_commande_id:secondOrder.id});assert.equal(secondDetail.statut,'cloturee');assert.equal((await rpc(server,'get_tables_overview')).find(x=>x.id===table.data.id).commande_id,null)
const secondOrderStockMoves=await admin.from('mouvements_stock').select('id').eq('reference_id',secondOrderSale.sale_id);assert.equal(secondOrderStockMoves.data.length,1)
await rpc(cashier,'add_customer_payment',{p_vente_id:secondOrderSale.sale_id,p_montant:3000,p_mode_paiement:'moov_money',p_idempotency_key:crypto.randomUUID(),p_reference:null,p_note:null});assert.equal((await admin.from('mouvements_stock').select('id').eq('reference_id',secondOrderSale.sale_id)).data.length,1)
await assertCreditCoherent(restaurantClient)

console.log('Compatibilité ancienne API create_sale sans paramètre client')
const legacyPayload={p_idempotency_key:crypto.randomUUID(),p_type_commande:'emporter',p_remise:0,p_montant_recu:5000,p_mode_paiement:'orange_money',p_lignes:[{produit_id:product.data.id,quantite:1}]}
const legacySale=await rpc(cashier,'create_sale',legacyPayload);assert.equal(Number(legacySale.reste_a_payer),0)
const legacyOrder=await rpc(server,'open_table_order',{p_table_id:table.data.id,p_notes:'Compatibilité API Étape 2'});await rpc(server,'add_order_items',{p_commande_id:legacyOrder.id,p_items:[{produit_id:product.data.id,quantite:1}]});await rpc(server,'send_order_to_kitchen',{p_commande_id:legacyOrder.id})
const legacyOrderDetail=await rpc(server,'get_order_detail',{p_commande_id:legacyOrder.id});await rpc(kitchen,'start_kitchen_item',{p_ligne_id:legacyOrderDetail.lignes[0].id});await rpc(kitchen,'mark_kitchen_item_ready',{p_ligne_id:legacyOrderDetail.lignes[0].id});await rpc(server,'mark_order_served',{p_commande_id:legacyOrder.id})
const legacyCheckout=await rpc(cashier,'checkout_order',{p_commande_id:legacyOrder.id,p_idempotency_key:crypto.randomUUID(),p_remise:0,p_montant_recu:5000,p_mode_paiement:'orange_money'});assert.equal(Number(legacyCheckout.reste_a_payer),0)

console.log('19/23 RLS et écritures directes')
assert.ok((await cashier.from('clients').insert({})).error);assert.ok((await admin.from('ventes').update({reste_a_payer:0}).eq('id',orderSale.sale_id)).error);assert.ok((await admin.from('paiements').insert({})).error);assert.ok((await admin.from('paiements').update({montant:1}).eq('id',payment1.payment_id)).error);assert.ok((await admin.from('paiements').delete().eq('id',payment1.payment_id)).error);assert.ok((await admin.from('mouvements_fidelite').insert({})).error)

console.log('20/23 Compte inactif refusé')
assert.ok((await inactive.rpc('get_customers_overview',{p_search:null,p_only_with_debt:false})).error)

console.log('21/23 Dashboard créances')
const dashboard=await rpc(admin,'dashboard_stats');assert.ok('creances_clients'in dashboard);assert.ok(Number(dashboard.creances_clients)>=5000)

console.log('22/23 Synthèse journalière crédit/encaissements')
const daily=await rpc(admin,'daily_operating_summary',{p_date:today});assert.ok('nouvelles_creances'in daily);assert.ok('creances_clients_actuelles'in daily)

console.log('23/23 Cohérence finale client et paiements')
detail=await assertCreditCoherent(restaurantClient);assert.equal(Number(detail.encours_credit),5000);assert.equal(detail.ventes.filter(x=>x.id===orderSale.sale_id).length,1)

await Promise.all([admin.auth.signOut(),cashier.auth.signOut(),cashier2.auth.signOut(),server.auth.signOut(),kitchen.auth.signOut(),inactive.auth.signOut()])
console.log('Tous les tests d’intégration Étape 6 sont réussis. Les données restent dans cette instance de test.')
