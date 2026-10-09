export const TICKET_WIDTHS=[58,80] as const
export interface RestaurantSettings {
  nom:string
  telephone:string|null
  email:string|null
  adresse:string|null
  ville:string|null
  pays:string|null
  slogan:string|null
  devise:string
  logo_url:string|null
  pied_ticket:string
  numero_fiscal:string|null
  largeur_ticket:number
  show_restopro_branding:boolean
  onboarding_completed:boolean
}
export const DEFAULT_RESTAURANT_SETTINGS:RestaurantSettings={nom:'Mon restaurant',telephone:null,email:null,adresse:null,ville:null,pays:null,slogan:null,devise:'F CFA',logo_url:null,pied_ticket:'Merci pour votre confiance.',numero_fiscal:null,largeur_ticket:80,show_restopro_branding:true,onboarding_completed:false}
export function isValidRestaurantSettings(settings:{nom:string;devise:string;pied_ticket:string;largeur_ticket:number}){
  return Boolean(settings.nom.trim()&&settings.devise.trim()&&settings.pied_ticket.trim()&&TICKET_WIDTHS.includes(settings.largeur_ticket as 58|80))
}
export function needsRestaurantOnboarding(settings:RestaurantSettings){return !settings.onboarding_completed}
