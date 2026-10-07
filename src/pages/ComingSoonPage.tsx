import { Construction } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'

export function ComingSoonPage({ title }: { title: string }) {
  return <><PageHeader title={title} description="Cet espace fait partie de la prochaine phase de MG DELICES."/><div className="card grid min-h-[55vh] place-items-center p-8 text-center"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-brand-50 text-brand-600"><Construction size={38}/></div><h2 className="mt-6 text-2xl font-black">Module bientôt disponible</h2><p className="mx-auto mt-2 max-w-md text-slate-500">Nous préparons ce module pour qu’il s’intègre naturellement à votre activité.</p></div></div></>
}
