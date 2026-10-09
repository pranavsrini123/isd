import { Component } from 'react'

/** Last-resort boundary so a rendering bug shows a recoverable screen, not a blank page. */
export class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('UI error', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    const chunk = /dynamically imported module|Loading chunk/i.test(this.state.error.message || '')
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 text-center">
        <h1 className="text-2xl font-bold">{chunk ? 'A new version is available' : 'Something went wrong'}</h1>
        <p className="mt-2 max-w-md text-muted">
          {chunk ? 'Reload the page to get the latest version of the app.' : 'The page hit an unexpected error. Reloading usually fixes it.'}
        </p>
        <button onClick={() => window.location.reload()} className="mt-6 min-h-11 rounded-xl bg-brand px-5 font-semibold text-white">Reload</button>
      </div>
    )
  }
}
