import { useEffect, useState } from 'react'

export function ConnectionStatus() {
  const [online,setOnline]=useState(()=>navigator.onLine)
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
  if(online)return null
  return <div role="alert" className="fixed inset-x-0 top-0 z-[100] bg-red-700 px-4 py-2 text-center text-sm font-bold text-white">Connexion Internet indisponible. RestoPRO dépend de Supabase Cloud.</div>
}
