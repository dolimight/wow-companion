import { toast } from '../components/ui/toast'

/** Feature notifications share the Base UI manager mounted at the application root */
export function notify(message: string) { toast.add({ title: message, type: 'info' }) }

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/\.$/, '') : 'The action could not finish — try again'
}
