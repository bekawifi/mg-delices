import{describe,expect,it}from'vitest'
import{isValidRestaurantSettings}from'./settings'
describe('paramètres restaurant',()=>{it('accepte uniquement une identité complète et une largeur thermique prévue',()=>{expect(isValidRestaurantSettings({nom:'MG DELICES',devise:'F CFA',pied_ticket:'Merci',largeur_ticket:80})).toBe(true);expect(isValidRestaurantSettings({nom:'',devise:'F CFA',pied_ticket:'Merci',largeur_ticket:72})).toBe(false)})})
