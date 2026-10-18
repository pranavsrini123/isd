import { Logo } from '../../components/layout/Logo'
import { Button } from '../../components/ui/primitives'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 text-center">
      <Logo />
      <p className="mt-10 font-mono text-sm text-muted">404</p>
      <h1 className="mt-1 text-3xl font-bold">We couldn't find that page</h1>
      <p className="mt-2 text-muted">The link may be old, or the page has moved.</p>
      <Button to="/" className="mt-6">Back to home</Button>
    </div>
  )
}
