import { EventClient } from '@tanstack/devtools-event-client'
import { useEffect, useState } from 'react'
import { themeModeLabels, themeStore } from './theme-store'
import type { ThemeMode } from './theme-store'

type EventMap = {
  state: {
    mode: ThemeMode
  }
}

class StoreDevtoolsEventClient extends EventClient<EventMap> {
  constructor() {
    super({ pluginId: 'store-devtools' })
  }
}

const eventClient = new StoreDevtoolsEventClient()

function emitCurrentState() {
  eventClient.emit('state', { mode: themeStore.store.state.mode })
}

themeStore.store.subscribe(emitCurrentState)

function DevtoolPanel() {
  const [mode, setMode] = useState(themeStore.store.state.mode)

  useEffect(() => {
    const unsubscribe = eventClient.on('state', (event) =>
      setMode(event.payload.mode),
    )
    emitCurrentState()
    return unsubscribe
  }, [])

  return (
    <div className="grid grid-cols-[auto_1fr] gap-4 p-4">
      <span className="text-sm font-semibold text-muted-foreground">
        Darstellung
      </span>
      <span className="text-sm">{themeModeLabels[mode]}</span>
    </div>
  )
}

export default {
  name: 'TanStack Store',
  render: <DevtoolPanel />,
}
