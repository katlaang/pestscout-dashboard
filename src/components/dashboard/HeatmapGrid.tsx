import { useState } from 'react'
import type { HeatmapCellResponse, HeatmapSectionResponse, SeverityLevel } from '@/types'
import { SEVERITY_COLORS, SEVERITY_LABELS, SEVERITY_ORDER } from '@/utils'

interface TooltipState {
  cell: HeatmapCellResponse
  x: number
  y: number
}

interface HeatmapGridProps {
  section: HeatmapSectionResponse
  cellSize?: number
  gap?: number
  showLegend?: boolean
}

export default function HeatmapGrid({
  section,
  cellSize = 24,
  gap = 3,
  showLegend = false,
}: HeatmapGridProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const { bayCount, benchesPerBay, cells } = section

  // Build lookup map
  const cellMap = new Map<string, HeatmapCellResponse>()
  cells.forEach(c => cellMap.set(`${c.bayIndex}:${c.benchIndex}`, c))

  function getCell(bay: number, bench: number): HeatmapCellResponse {
    return cellMap.get(`${bay}:${bench}`) ?? {
      bayIndex: bay,
      benchIndex: bench,
      pestCount: 0,
      diseaseCount: 0,
      beneficialCount: 0,
      totalCount: 0,
      severityLevel: 'ZERO' as SeverityLevel,
      colorHex: SEVERITY_COLORS.ZERO,
    }
  }

  const gridWidth = benchesPerBay * (cellSize + gap) - gap
  const gridHeight = bayCount * (cellSize + gap) - gap

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Row labels + grid */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        {/* Bay labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap, paddingTop: cellSize + gap }}>
          {Array.from({ length: bayCount }, (_, b) => (
            <div
              key={b}
              style={{
                height: cellSize,
                width: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                fontSize: 9,
                color: '#9ca3af',
                fontFamily: 'DM Mono, monospace',
                paddingRight: 4,
              }}
            >
              B{b + 1}
            </div>
          ))}
        </div>

        <div>
          {/* Bench column headers */}
          <div style={{ display: 'flex', gap, marginBottom: gap }}>
            {Array.from({ length: benchesPerBay }, (_, b) => (
              <div
                key={b}
                style={{
                  width: cellSize,
                  height: cellSize,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  color: '#9ca3af',
                  fontFamily: 'DM Mono, monospace',
                }}
              >
                {b + 1}
              </div>
            ))}
          </div>

          {/* Cell grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${benchesPerBay}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${bayCount}, ${cellSize}px)`,
              gap,
              width: gridWidth,
              height: gridHeight,
            }}
          >
            {Array.from({ length: bayCount }, (_, bay) =>
              Array.from({ length: benchesPerBay }, (_, bench) => {
                const cell = getCell(bay + 1, bench + 1)
                const bg = SEVERITY_COLORS[cell.severityLevel] ?? cell.colorHex

                return (
                  <div
                    key={`${bay}-${bench}`}
                    className="hm-cell"
                    style={{ background: bg }}
                    onMouseEnter={e => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect()
                      setTooltip({ cell, x: rect.left + rect.width / 2, y: rect.top })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
            background: '#111827',
            color: '#f9fafb',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 11,
            pointerEvents: 'none',
            zIndex: 9999,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <p style={{ fontWeight: 500, marginBottom: 2 }}>
            Bay {tooltip.cell.bayIndex} · Bench {tooltip.cell.benchIndex}
          </p>
          <p style={{ color: '#d1d5db' }}>
            {SEVERITY_LABELS[tooltip.cell.severityLevel]}
          </p>
          {tooltip.cell.totalCount > 0 && (
            <p style={{ color: '#d1d5db' }}>
              Pests: {tooltip.cell.pestCount} · Disease: {tooltip.cell.diseaseCount}
            </p>
          )}
        </div>
      )}

      {/* Legend */}
      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 10 }}>
          {SEVERITY_ORDER.map(level => (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 10, height: 10,
                borderRadius: 2,
                background: SEVERITY_COLORS[level],
                border: '0.5px solid rgba(0,0,0,0.06)'
              }} />
              <span style={{ fontSize: 10, color: '#6b7280' }}>
                {level.charAt(0) + level.slice(1).toLowerCase().replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
