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
      <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-hero px-6 text-center text-white">
        <div aria-hidden className="tex-grid pointer-events-none absolute inset-0 -z-10" />
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{chunk ? 'A new version is available' : 'Something went wrong'}</h1>
        <p className="mt-3 max-w-md text-[#B9C6DE]">
          {chunk ? 'Reload the page to get the latest version of the app.' : 'The page hit an unexpected error. Reloading usually fixes it.'}
        </p>
        <button onClick={() => window.location.reload()}
          className="mt-7 min-h-11 rounded-xl bg-cyan px-6 font-semibold text-night transition-shadow hover:shadow-[0_0_0_1px_rgb(34_211_238/0.35),0_10px_28px_-8px_rgb(34_211_238/0.55)]">Reload</button>
      </div>
    )
  }
}
