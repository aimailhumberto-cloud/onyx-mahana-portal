/**
 * Download a CSV file from an API endpoint
 */
export async function downloadCSV(url: string, filename: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  } catch (err) {
    console.error('Export error:', err)
    alert('Error al exportar. Intenta de nuevo.')
  }
}
