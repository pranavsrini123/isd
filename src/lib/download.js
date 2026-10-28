// Hands a file to the browser's download manager.

export function downloadFile(content, fileName, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** CSV with a byte-order mark so Excel reads UTF-8 names correctly. */
export function downloadCsv(csv, fileName) {
  downloadFile('﻿' + csv, fileName, 'text/csv;charset=utf-8')
}

export function downloadPdf(bytes, fileName) {
  downloadFile(bytes, fileName, 'application/pdf')
}
