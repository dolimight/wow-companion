import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { WindowChrome } from './components/WindowChrome'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/toast'
import { installFrameResizeObserver } from './lib/frame-resize-observer'

installFrameResizeObserver()
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15000 } } })
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><TooltipProvider><WindowChrome /><App /><Toaster timeout={4500} limit={3} /></TooltipProvider></QueryClientProvider></React.StrictMode>,
)
