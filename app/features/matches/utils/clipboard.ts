export async function copyTextToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false

  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch (error) {
    console.error('Unable to copy text to clipboard:', error)
    return false
  }
}
