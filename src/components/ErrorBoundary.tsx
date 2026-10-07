import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State { failed: boolean; error?: Error }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }
  static getDerivedStateFromError(error: Error): State { return { failed: true, error } }
  componentDidCatch(error: Error, info: ErrorInfo) { if (import.meta.env.DEV) console.error('Erreur React non interceptee', error, info) }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="card max-w-lg p-8 text-center"><h1 className="text-2xl font-black">Une erreur inattendue est survenue.</h1><p className="mt-2 text-slate-500">Vos données n’ont pas été modifiées par cet écran.</p>{import.meta.env.DEV&&this.state.error&&<pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-slate-950 p-3 text-left text-xs text-white">{this.state.error.message}</pre>}<div className="mt-6 flex justify-center gap-3"><button className="btn-primary" onClick={()=>this.setState({failed:false,error:undefined})}>Réessayer</button><button className="btn-secondary" onClick={()=>{window.location.href='/'}}>Retour au tableau de bord</button></div></section></main>
  }
}
