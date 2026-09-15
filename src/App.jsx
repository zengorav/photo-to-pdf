import { jsPDF } from 'jspdf'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const PAGE_SIZES = {
  A4: [210, 297],
  Letter: [216, 279],
}

const QUALITY_PRESETS = {
  high: 0.92,
  balanced: 0.82,
  compact: 0.72,
}

const createImageFromUrl = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })

const drawProcessedImage = async (item, maxDimension) => {
  const sourceImage = await createImageFromUrl(item.src)

  const left = Math.max(0, Math.min(item.crop.left, 90))
  const right = Math.max(0, Math.min(item.crop.right, 90))
  const top = Math.max(0, Math.min(item.crop.top, 90))
  const bottom = Math.max(0, Math.min(item.crop.bottom, 90))

  const sx = (sourceImage.width * left) / 100
  const sy = (sourceImage.height * top) / 100
  const sw = Math.max(1, sourceImage.width - sx - (sourceImage.width * right) / 100)
  const sh = Math.max(1, sourceImage.height - sy - (sourceImage.height * bottom) / 100)

  const rotation = ((item.rotation % 360) + 360) % 360
  const radians = (rotation * Math.PI) / 180

  const rotatedCanvas = document.createElement('canvas')
  const swapDimensions = rotation === 90 || rotation === 270
  rotatedCanvas.width = swapDimensions ? sh : sw
  rotatedCanvas.height = swapDimensions ? sw : sh

  const rotatedContext = rotatedCanvas.getContext('2d')
  rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2)
  rotatedContext.rotate(radians)
  rotatedContext.drawImage(sourceImage, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)

  const resizeScale = Math.min(1, maxDimension / Math.max(rotatedCanvas.width, rotatedCanvas.height))

  if (resizeScale === 1) {
    return rotatedCanvas
  }

  const resizedCanvas = document.createElement('canvas')
  resizedCanvas.width = Math.max(1, Math.round(rotatedCanvas.width * resizeScale))
  resizedCanvas.height = Math.max(1, Math.round(rotatedCanvas.height * resizeScale))

  const resizedContext = resizedCanvas.getContext('2d')
  resizedContext.drawImage(
    rotatedCanvas,
    0,
    0,
    rotatedCanvas.width,
    rotatedCanvas.height,
    0,
    0,
    resizedCanvas.width,
    resizedCanvas.height,
  )

  return resizedCanvas
}

const moveItem = (items, fromIndex, toIndex) => {
  if (toIndex < 0 || toIndex >= items.length) {
    return items
  }

  const updated = [...items]
  const [moved] = updated.splice(fromIndex, 1)
  updated.splice(toIndex, 0, moved)
  return updated
}

const initialExportOptions = {
  pageSize: 'A4',
  margin: 12,
  fit: 'contain',
  quality: 'balanced',
  maxDimension: 2200,
}

function App() {
  const [items, setItems] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [exportOptions, setExportOptions] = useState(initialExportOptions)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const previewCanvasRef = useRef(null)

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? items[0] ?? null,
    [activeId, items],
  )

  useEffect(
    () => () => {
      items.forEach((item) => URL.revokeObjectURL(item.src))
    },
    [items],
  )

  useEffect(() => {
    const renderPreview = async () => {
      if (!activeItem || !previewCanvasRef.current) {
        return
      }

      try {
        const canvas = await drawProcessedImage(activeItem, 1200)
        const previewContext = previewCanvasRef.current.getContext('2d')
        previewCanvasRef.current.width = canvas.width
        previewCanvasRef.current.height = canvas.height
        previewContext.clearRect(0, 0, canvas.width, canvas.height)
        previewContext.drawImage(canvas, 0, 0)
      } catch {
        setError('Unable to render image preview for editing.')
      }
    }

    renderPreview()
  }, [activeItem])

  const handleAddFiles = (event) => {
    const selectedFiles = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    )

    if (!selectedFiles.length) {
      return
    }

    setError('')

    const nextItems = selectedFiles.map((file) => ({
      id: `${Date.now()}-${crypto.randomUUID()}`,
      src: URL.createObjectURL(file),
      fileName: file.name,
      rotation: 0,
      crop: {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      },
    }))

    setItems((current) => [...current, ...nextItems])
    if (!activeId) {
      setActiveId(nextItems[0].id)
    }
    event.target.value = ''
  }

  const updateActiveItem = (updater) => {
    if (!activeItem) {
      return
    }

    setItems((current) =>
      current.map((item) =>
        item.id === activeItem.id ? { ...item, ...updater(item) } : item,
      ),
    )
  }

  const rotateActive = (step) => {
    if (!activeItem) {
      return
    }

    updateActiveItem((item) => ({ rotation: (item.rotation + step + 360) % 360 }))
  }

  const updateCropEdge = (edge, value) => {
    if (!activeItem) {
      return
    }

    const numericValue = Number.parseInt(value, 10)

    updateActiveItem((item) => {
      const crop = { ...item.crop }
      crop[edge] = Number.isFinite(numericValue) ? numericValue : 0

      const widthCrop = crop.left + crop.right
      const heightCrop = crop.top + crop.bottom

      if (widthCrop > 95) {
        if (edge === 'left') {
          crop.right = 95 - crop.left
        } else {
          crop.left = 95 - crop.right
        }
      }

      if (heightCrop > 95) {
        if (edge === 'top') {
          crop.bottom = 95 - crop.top
        } else {
          crop.top = 95 - crop.bottom
        }
      }

      return { crop }
    })
  }

  const removeItem = (id) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target) {
        URL.revokeObjectURL(target.src)
      }
      const updated = current.filter((item) => item.id !== id)
      if (activeId === id) {
        setActiveId(updated[0]?.id ?? null)
      }
      return updated
    })
  }

  const exportPdf = async () => {
    if (!items.length || isExporting) {
      return
    }

    setError('')
    setIsExporting(true)

    try {
      const [pageWidth, pageHeight] = PAGE_SIZES[exportOptions.pageSize]
      const margin = exportOptions.margin
      const imageQuality = QUALITY_PRESETS[exportOptions.quality]

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: exportOptions.pageSize.toLowerCase(),
        compress: true,
      })

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]
        const processedCanvas = await drawProcessedImage(item, exportOptions.maxDimension)
        const imageData = processedCanvas.toDataURL('image/jpeg', imageQuality)

        if (index > 0) {
          pdf.addPage(exportOptions.pageSize.toLowerCase(), 'portrait')
        }

        const usableWidth = pageWidth - margin * 2
        const usableHeight = pageHeight - margin * 2

        const widthRatio = usableWidth / processedCanvas.width
        const heightRatio = usableHeight / processedCanvas.height

        const ratio =
          exportOptions.fit === 'cover'
            ? Math.max(widthRatio, heightRatio)
            : Math.min(widthRatio, heightRatio)

        const renderWidth = processedCanvas.width * ratio
        const renderHeight = processedCanvas.height * ratio

        const x = margin + (usableWidth - renderWidth) / 2
        const y = margin + (usableHeight - renderHeight) / 2

        pdf.addImage(imageData, 'JPEG', x, y, renderWidth, renderHeight, undefined, 'FAST')
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      pdf.save(`photos-${timestamp}.pdf`)
    } catch {
      setError('PDF generation failed. Please try again with fewer/lower-resolution photos.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Photo to PDF</h1>
        <p>Capture, arrange, edit, and export your photos as a PDF in your browser.</p>
      </header>

      <section className="panel">
        <h2>Add photos</h2>
        <div className="input-row">
          <label className="action-button">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handleAddFiles}
            />
            Take photo
          </label>
          <label className="action-button action-button--secondary">
            <input type="file" accept="image/*" multiple onChange={handleAddFiles} />
            Upload from gallery
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Pages ({items.length})</h2>
        </div>

        {items.length ? (
          <ul className="thumb-grid">
            {items.map((item, index) => (
              <li key={item.id} className={`thumb-card${activeId === item.id ? ' is-active' : ''}`}>
                <button type="button" className="thumb-image" onClick={() => setActiveId(item.id)}>
                  <img src={item.src} alt={item.fileName} loading="lazy" />
                  <span>{index + 1}</span>
                </button>
                <div className="thumb-actions">
                  <button
                    type="button"
                    onClick={() => setItems((current) => moveItem(current, index, index - 1))}
                    disabled={index === 0}
                    aria-label={`Move ${item.fileName} earlier`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems((current) => moveItem(current, index, index + 1))}
                    disabled={index === items.length - 1}
                    aria-label={`Move ${item.fileName} later`}
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.fileName}`}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No photos yet. Take a picture or upload from your gallery.</p>
        )}
      </section>

      <section className="panel">
        <h2>Edit selected photo</h2>
        {activeItem ? (
          <>
            <canvas ref={previewCanvasRef} className="preview-canvas" aria-label="Edited preview" />

            <div className="editor-controls">
              <div className="editor-row">
                <strong>Rotate</strong>
                <div className="inline-buttons">
                  <button type="button" onClick={() => rotateActive(-90)}>
                    Rotate left
                  </button>
                  <button type="button" onClick={() => rotateActive(90)}>
                    Rotate right
                  </button>
                </div>
              </div>

              <div className="editor-row">
                <strong>Crop</strong>
                <label>
                  Left ({activeItem.crop.left}%)
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={activeItem.crop.left}
                    onChange={(event) => updateCropEdge('left', event.target.value)}
                  />
                </label>
                <label>
                  Right ({activeItem.crop.right}%)
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={activeItem.crop.right}
                    onChange={(event) => updateCropEdge('right', event.target.value)}
                  />
                </label>
                <label>
                  Top ({activeItem.crop.top}%)
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={activeItem.crop.top}
                    onChange={(event) => updateCropEdge('top', event.target.value)}
                  />
                </label>
                <label>
                  Bottom ({activeItem.crop.bottom}%)
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={activeItem.crop.bottom}
                    onChange={(event) => updateCropEdge('bottom', event.target.value)}
                  />
                </label>
              </div>
            </div>
          </>
        ) : (
          <p className="empty-state">Select a photo to crop and rotate it.</p>
        )}
      </section>

      <section className="panel">
        <h2>Export settings</h2>

        <div className="settings-grid">
          <label>
            Page size
            <select
              value={exportOptions.pageSize}
              onChange={(event) =>
                setExportOptions((current) => ({ ...current, pageSize: event.target.value }))
              }
            >
              {Object.keys(PAGE_SIZES).map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <label>
            Fit mode
            <select
              value={exportOptions.fit}
              onChange={(event) =>
                setExportOptions((current) => ({ ...current, fit: event.target.value }))
              }
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
            </select>
          </label>

          <label>
            Margin (mm)
            <input
              type="number"
              min="0"
              max="30"
              value={exportOptions.margin}
              onChange={(event) =>
                setExportOptions((current) => ({
                  ...current,
                  margin: Number.parseInt(event.target.value, 10) || 0,
                }))
              }
            />
          </label>

          <label>
            Max image size (px)
            <input
              type="number"
              min="800"
              max="4000"
              step="100"
              value={exportOptions.maxDimension}
              onChange={(event) =>
                setExportOptions((current) => ({
                  ...current,
                  maxDimension: Number.parseInt(event.target.value, 10) || 2200,
                }))
              }
            />
          </label>

          <label>
            Export quality
            <select
              value={exportOptions.quality}
              onChange={(event) =>
                setExportOptions((current) => ({ ...current, quality: event.target.value }))
              }
            >
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </div>

        <button type="button" className="export-button" disabled={!items.length || isExporting} onClick={exportPdf}>
          {isExporting ? 'Generating PDF...' : 'Download PDF'}
        </button>
      </section>

      {error && <p className="error-message">{error}</p>}
    </main>
  )
}

export default App
