import { PackageOpen } from 'lucide-react'

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="grid min-h-56 place-items-center p-8 text-center"><div><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><PackageOpen /></div><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm text-slate-500">{message}</p></div></div>
}
