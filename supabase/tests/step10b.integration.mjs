import '../../scripts/assert-test-environment.mjs'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

for(const name of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','TEST_ADMIN_EMAIL','TEST_ADMIN_PASSWORD','TEST_CASHIER_EMAIL','TEST_CASHIER_PASSWORD'])assert.ok(process.env[name],`Variable manquante : ${name}`)
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
async function login(email,password){const db=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,options);const result=await db.auth.signInWithPassword({email,password});assert.ifError(result.error);return db}
const admin=await login(process.env.TEST_ADMIN_EMAIL,process.env.TEST_ADMIN_PASSWORD)
const cashier=await login(process.env.TEST_CASHIER_EMAIL,process.env.TEST_CASHIER_PASSWORD)

console.log('1/6 Lecture des paramètres historiques')
const before=await admin.rpc('get_restaurant_settings');assert.ifError(before.error)
console.log('Diagnostic etat initial',{
  nom:{reelle:before.data.nom,attendue:'valeur existante non vide'},
  show_restopro_branding:{reelle:before.data.show_restopro_branding,attendue:'booleen (defaut de migration : true)'},
  onboarding_completed:{reelle:before.data.onboarding_completed,attendue:'booleen (defaut de migration : false)'},
})
assert.equal(typeof before.data.nom,'string');assert.ok(before.data.nom.trim())
assert.equal(typeof before.data.show_restopro_branding,'boolean')
assert.equal(typeof before.data.onboarding_completed,'boolean')

console.log('2/6 Nouveaux champs présents')
for(const field of ['email','ville','pays','show_restopro_branding','onboarding_completed'])assert.ok(Object.hasOwn(before.data,field),`Champ manquant : ${field}`)

console.log('3/6 Modification réservée à l’administrateur')
let scenarioError
try{
  const denied=await cashier.rpc('update_restaurant_settings',{p_settings:{...before.data,nom:'Interdit'}});assert.ok(denied.error)

  console.log('4/6 Nom restaurant et branding configurables')
  const temporary={...before.data,nom:'CHEZ AWA — VALIDATION 10B',show_restopro_branding:!before.data.show_restopro_branding,onboarding_completed:!before.data.onboarding_completed,email:'validation10b@example.test',ville:'Ville test',pays:'Pays test'}
  const changed=await admin.rpc('update_restaurant_settings',{p_settings:temporary});assert.ifError(changed.error);assert.equal(changed.data.nom,temporary.nom);assert.equal(changed.data.show_restopro_branding,temporary.show_restopro_branding);assert.equal(changed.data.onboarding_completed,temporary.onboarding_completed)

  console.log('5/6 Lecture RPC cohérente après modification')
  const reread=await admin.rpc('get_restaurant_settings');assert.ifError(reread.error);assert.equal(reread.data.nom,temporary.nom);assert.equal(reread.data.email,temporary.email);assert.equal(reread.data.show_restopro_branding,temporary.show_restopro_branding);assert.equal(reread.data.onboarding_completed,temporary.onboarding_completed)
}catch(error){scenarioError=error}
finally{
  console.log('6/6 Restauration exacte de l’état initial')
  const restored=await admin.rpc('update_restaurant_settings',{p_settings:before.data});assert.ifError(restored.error);for(const field of ['nom','telephone','email','adresse','ville','pays','slogan','devise','logo_url','pied_ticket','numero_fiscal','largeur_ticket','show_restopro_branding','onboarding_completed'])assert.deepEqual(restored.data[field],before.data[field],`Restauration incorrecte : ${field}`)
}
if(scenarioError)throw scenarioError
console.log(`Tous les tests d’intégration RestoPRO Étape 10B sont réussis ; l’état initial (${before.data.nom}) est restauré.`)
