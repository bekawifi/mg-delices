import type { ReactNode } from 'react'

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
    <div><h1 className="text-2xl font-black tracking-tight text-slate-900 lg:text-3xl">{title}</h1>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
    {action}
  </div>
}
