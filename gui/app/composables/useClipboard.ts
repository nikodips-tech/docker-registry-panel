/** Copy text and show a short toast. */
export function useClipboard() {
  const toast = useState<string | null>('toast', () => null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function show(message: string) {
    toast.value = message
    clearTimeout(timer)
    timer = setTimeout(() => {
      toast.value = null
    }, 1800)
  }

  async function copy(text: string, label = 'Copied') {
    try {
      await navigator.clipboard.writeText(text)
      show(label)
    }
    catch {
      show('Copy failed')
    }
  }

  return { toast, copy, show }
}
