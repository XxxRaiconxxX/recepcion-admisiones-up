import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado en la interfaz:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <section className="w-full max-w-lg rounded-2xl border border-rose-900/60 bg-slate-900 p-8 text-center shadow-2xl">
          <h1 className="text-xl font-bold">No se pudo cargar el módulo</h1>
          <p className="mt-3 text-sm text-slate-300">
            El navegador conservó una versión anterior o se produjo un error inesperado.
          </p>
          <button
            type="button"
            className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
            onClick={() => window.location.reload()}
          >
            Recargar aplicación
          </button>
        </section>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
