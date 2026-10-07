import{describe,expect,it}from'vitest'
import{rowsToCsv}from'./exports'
describe('exports',()=>{it('cree un CSV UTF-8 lisible',()=>{const csv=rowsToCsv([{nom:'Café; crème',montant:1500}]);expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv).toContain('"Café; crème"');expect(csv).toContain('"1500"')})})
