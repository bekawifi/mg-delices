const allow = process.env.MG_DELICES_ALLOW_DESTRUCTIVE_TESTS === 'true'
const environment = process.env.MG_DELICES_ENV
const url = process.env.VITE_SUPABASE_URL || ''

if (!allow || environment !== 'test') {
  throw new Error('Tests destructifs refuses : MG_DELICES_ENV=test et MG_DELICES_ALLOW_DESTRUCTIVE_TESTS=true sont obligatoires.')
}
if (!url || !/^https?:\/\//.test(url)) {
  throw new Error('Tests destructifs refuses : VITE_SUPABASE_URL de test est absente ou invalide.')
}
if (process.env.MG_DELICES_PRODUCTION_SUPABASE_URL && url === process.env.MG_DELICES_PRODUCTION_SUPABASE_URL) {
  throw new Error('Tests destructifs refuses : la cible correspond explicitement a la production.')
}
