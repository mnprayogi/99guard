import { renderToStaticMarkup } from 'react-dom/server'
import CheckpointPoster from '@/components/admin/CheckpointPoster'

export interface PrintPosterItem {
  name: string
  qrCode: string
  site: string
  description: string | null
  qrDataUrl: string
}

export function writePosterPrintWindow(win: Window, items: PrintPosterItem[]) {
  if (items.length === 0) return
  const head = document.head.cloneNode(true) as HTMLHeadElement
  head.querySelectorAll('script').forEach((s) => s.remove())
  head.querySelectorAll('link[rel="modulepreload"]').forEach((l) => l.remove())
  const grids = Array.from({ length: Math.ceil(items.length / 4) })
    .map((_, gi) => {
      const cells = items
        .slice(gi * 4, gi * 4 + 4)
        .map(
          (it) =>
            `<div class="poster-cell">${renderToStaticMarkup(
              <CheckpointPoster
                name={it.name}
                qrCode={it.qrCode}
                site={it.site}
                description={it.description}
                qrDataUrl={it.qrDataUrl}
              />,
            )}</div>`,
        )
        .join('')
      return `<div class="poster-grid">${cells}</div>`
    })
    .join('')
  const html = `<!doctype html>
<html lang="id">
  <head>
    ${head.innerHTML}
    <title>Cetak Poster QR - 99Guard</title>
  </head>
  <body>
    <div class="print-area">
      <div class="print-preview-wrap">${grids}</div>
    </div>
  </body>
</html>`
  win.document.open()
  win.document.write(html)
  win.document.close()
  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      win.focus()
    } catch {
      /* noop */
    }
    win.print()
  }
  if (win.document.readyState === 'complete') doPrint()
  else win.addEventListener('load', doPrint)
  setTimeout(() => {
    if (!printed && win.document.readyState !== 'complete') doPrint()
  }, 1500)
  win.onafterprint = () => {
    try {
      win.close()
    } catch {
      /* noop */
    }
  }
}