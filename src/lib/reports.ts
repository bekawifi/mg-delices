export type PeriodPreset='today'|'yesterday'|'week'|'month'
const iso=(date:Date)=>date.toISOString().slice(0,10)
export function reportRange(preset:PeriodPreset,now=new Date()){
  const end=new Date(now);const start=new Date(now)
  if(preset==='yesterday'){start.setDate(start.getDate()-1);end.setDate(end.getDate()-1)}
  if(preset==='week'){const day=(start.getDay()+6)%7;start.setDate(start.getDate()-day)}
  if(preset==='month')start.setDate(1)
  return{from:iso(start),to:iso(end)}
}
export function reportFileName(domain:string,from:string,to:string,extension:string){return`mg-delices-${domain}-${from}-${to}.${extension}`}
export function reportSummary(report:{ventes:{ca_brut:number;retours:number;nombre:number};encaissements:{par_mode:Array<{montant?:string|number|null}>;remboursements:number}}){
  const caBrut=Number(report.ventes.ca_brut||0),retours=Number(report.ventes.retours||0)
  const encaissements=report.encaissements.par_mode.reduce((sum,row)=>sum+Number(row.montant||0),0)
  return{caBrut,retours,caNet:caBrut-retours,panierMoyen:report.ventes.nombre?caBrut/report.ventes.nombre:0,encaissementsNets:encaissements-Number(report.encaissements.remboursements||0)}
}
