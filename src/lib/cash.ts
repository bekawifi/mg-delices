export const theoreticalCash=(opening:number,entries:number[],outputs:number[])=>opening+entries.reduce((a,b)=>a+b,0)-outputs.reduce((a,b)=>a+b,0)
export const cashDifference=(counted:number,theoretical:number)=>counted-theoretical
export const countTotal=(counts:Array<{denomination:number;quantite:number}>)=>counts.reduce((sum,x)=>sum+x.denomination*x.quantite,0)
export const classifyCash=(amount:number,direction:'entree'|'sortie')=>({entree:direction==='entree'?amount:0,sortie:direction==='sortie'?amount:0})
export const simplifiedOperatingResult=(revenue:number,materialCost:number,expenses:number)=>revenue-materialCost-expenses

type CashMovement={type_mouvement:string;sens:'entree'|'sortie';montant:number}

export const progressiveCashBalances=(opening:number,movements:CashMovement[])=>{
  let balance=opening
  return movements.map(movement=>{
    if(movement.type_mouvement!=='ouverture') balance+=movement.sens==='entree'?Number(movement.montant):-Number(movement.montant)
    return balance
  })
}
