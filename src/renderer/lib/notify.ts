let dispatch: ((value: string) => void) | undefined

/** The shell registers the toast; features call notify without importing the shell */
export function setToastDispatch(next: ((value: string) => void) | undefined) { dispatch = next }
export function notify(message: string) { dispatch?.(message) }

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/\.$/, '') : 'The action could not finish — try again'
}
