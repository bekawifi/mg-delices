import{reportFileName}from'./reports'

type Row=Record<string,unknown>
const isTauri=()=>typeof window!=='undefined'&&'__TAURI_INTERNALS__'in window
const text=(value:unknown)=>value==null?'':typeof value==='object'?JSON.stringify(value):String(value)
const csvCell=(value:unknown)=>`"${text(value).replace(/"/g,'""')}"`
export function rowsToCsv(rows:Row[]){if(!rows.length)return'\uFEFF';const columns=Object.keys(rows[0]);return'\uFEFF'+[columns.map(csvCell).join(';'),...rows.map(row=>columns.map(column=>csvCell(row[column])).join(';'))].join('\r\n')}

async function saveBytes(bytes:Uint8Array,name:string,filters:{name:string;extensions:string[]}[]){
  if(isTauri()){const[{save},{writeFile}]=await Promise.all([import('@tauri-apps/plugin-dialog'),import('@tauri-apps/plugin-fs')]);const path=await save({defaultPath:name,filters});if(path)await writeFile(path,bytes);return}
  const blob=new Blob([bytes],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)
}
export async function exportCsv(domain:string,from:string,to:string,rows:Row[]){await saveBytes(new TextEncoder().encode(rowsToCsv(rows)),reportFileName(domain,from,to,'csv'),[{name:'CSV UTF-8',extensions:['csv']}])}
export async function exportXlsx(domain:string,from:string,to:string,rows:Row[]){
  const{default:writeXlsxFile}=await import('write-excel-file/browser')
  const columns=Object.keys(rows[0]||{})
  const totalRow=columns.map((column,index)=>{
    const values=rows.map(row=>row[column])
    if(values.length&&values.every(value=>typeof value==='number'))return{value:values.reduce<number>((sum,value)=>sum+Number(value),0),type:Number,fontWeight:'bold' as const}
    return{value:index===0?'Totaux':'',type:String,fontWeight:'bold' as const}
  })
  const data=[
    [{value:`MG DELICES · ${domain.toUpperCase()}`,fontWeight:'bold' as const,fontSize:16}],
    [{value:`Période du ${from} au ${to}`}],
    [],
    columns.map(value=>({value,fontWeight:'bold' as const,backgroundColor:'#DCFCE7'})),
    ...rows.map(row=>columns.map(column=>{
      const value=row[column]
      if(typeof value==='number')return{value,type:Number}
      if(typeof value==='boolean')return{value,type:Boolean}
      return{value:text(value),type:String}
    })),
    totalRow
  ]
  const file=writeXlsxFile(data,{sheet:'Rapport',columns:columns.map(column=>({width:Math.max(12,Math.min(35,column.length+8))}))})
  const blob=await file.toBlob()
  await saveBytes(new Uint8Array(await blob.arrayBuffer()),reportFileName(domain,from,to,'xlsx'),[{name:'Excel',extensions:['xlsx']}])
}
export async function exportPdf(title:string,from:string,to:string,rows:Row[],user:string){const{jsPDF}=await import('jspdf');const pdf=new jsPDF({unit:'mm',format:'a4'});pdf.setFontSize(18);pdf.text('MG DELICES',14,16);pdf.setFontSize(12);pdf.text(title,14,24);pdf.setFontSize(9);pdf.text(`Période : ${from} au ${to} · Imprimé le ${new Date().toLocaleString('fr-FR')} · ${user}`,14,31);let y=40;for(const row of rows.slice(0,120)){const line=Object.entries(row).map(([k,v])=>`${k}: ${text(v)}`).join('  |  ');const parts=pdf.splitTextToSize(line,180);if(y+parts.length*4>285){pdf.addPage();y=15}pdf.text(parts,14,y);y+=parts.length*4+2}const bytes=pdf.output('arraybuffer');await saveBytes(new Uint8Array(bytes),reportFileName(title.toLowerCase().replace(/\s+/g,'-'),from,to,'pdf'),[{name:'PDF',extensions:['pdf']}])}
