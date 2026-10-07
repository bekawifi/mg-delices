export const TICKET_WIDTHS=[58,80] as const
export function isValidRestaurantSettings(settings:{nom:string;devise:string;pied_ticket:string;largeur_ticket:number}){
  return Boolean(settings.nom.trim()&&settings.devise.trim()&&settings.pied_ticket.trim()&&TICKET_WIDTHS.includes(settings.largeur_ticket as 58|80))
}
