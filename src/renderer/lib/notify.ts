import { toast } from '../components/ui/toast'

/** Feature notifications share the Base UI manager mounted at the application root */
export function notify(message: string) { toast.add({ title: message, type: 'info' }) }

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/\.$/, '') : 'The action could not finish — try again'
}

/** A realm or update alert that arrived while the window is on screen; it stays a little longer than routine notices */
export function showAlert(alert: { title: string; body: string }) { toast.add({ title: alert.title, description: alert.body, type: 'info', timeout: 8000 }) }
