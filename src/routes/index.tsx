import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return <main aria-label="Hauptinhalt" className="min-h-[calc(100dvh-4rem)]" />
}
