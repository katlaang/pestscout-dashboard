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

interface RowLayout {
  bayIndex: number
  bayTag: string
  bedTags: string[]
}

export default function HeatmapGrid({
  section,
  cellSize = 24,
  gap = 3,
  showLegend = false,
}: HeatmapGridProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const { bayCount, benchesPerBay, cells } = section
  const cellMap = new Map<string, HeatmapCellResponse>()
  cells.forEach(cell => cellMap.set(`${cell.bayIndex}:${cell.benchIndex}`, cell))

  function getCell(bayIndex: number, bedIndex: number): HeatmapCellResponse {
    return cellMap.get(`${bayIndex}:${bedIndex}`) ?? {
      bayIndex,
      benchIndex: bedIndex,
      pestCount: 0,
      diseaseCount: 0,
      beneficialCount: 0,
      totalCount: 0,
      severityLevel: 'ZERO' as SeverityLevel,
      colorHex: SEVERITY_COLORS.ZERO,
    }
  }

  const layouts: RowLayout[] =
    section.bayLayouts && section.bayLayouts.length > 0
      ? [...section.bayLayouts]
          .sort((a, b) => a.bayIndex - b.bayIndex)
          .map(layout => {
            const bedCount = layout.bedTags?.length ?? layout.bedCount ?? benchesPerBay
            return {
              bayIndex: layout.bayIndex,
              bayTag: layout.bayTag ?? cellMap.get(`${layout.bayIndex}:1`)?.bayTag ?? `Bay ${layout.bayIndex}`,
              bedTags: Array.from({ length: bedCount }, (_, index) => (
                layout.bedTags?.[index] ??
                cellMap.get(`${layout.bayIndex}:${index + 1}`)?.benchTag ??
                String(index + 1)
              )),
            }
          })
      : Array.from({ length: bayCount }, (_, index) => ({
          bayIndex: index + 1,
          bayTag: cellMap.get(`${index + 1}:1`)?.bayTag ?? `Bay ${index + 1}`,
          bedTags: Array.from({ length: benchesPerBay }, (_, bedIndex) => (
            cellMap.get(`${index + 1}:${bedIndex + 1}`)?.benchTag ?? String(bedIndex + 1)
          )),
        }))

  const maxBedCount = layouts.reduce((max, layout) => Math.max(max, layout.bedTags.length), 0)
  const columnCount = Math.max(maxBedCount, 1)
  const headerBedTags =
    layouts.find(layout => layout.bedTags.length > 0)?.bedTags ??
    Array.from({ length: benchesPerBay }, (_, index) => String(index + 1))
  const gridWidth = columnCount * (cellSize + gap) - gap

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap, paddingTop: cellSize + gap }}>
          {layouts.map(layout => (
            <div
              key={layout.bayIndex}
              style={{
                height: cellSize,
                minWidth: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                fontSize: 9,
                color: '#9ca3af',
                fontFamily: 'DM Mono, monospace',
                paddingRight: 4,
              }}
            >
              {layout.bayTag}
            </div>
          ))}
        </div>

        <div>
          <div style={{ display: 'flex', gap, marginBottom: gap }}>
            {Array.from({ length: columnCount }, (_, bedIndex) => (
              <div
                key={bedIndex}
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
                {headerBedTags[bedIndex] ?? bedIndex + 1}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap, width: gridWidth }}>
            {layouts.map(layout => (
              <div
                key={layout.bayIndex}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columnCount}, ${cellSize}px)`,
                  gap,
                }}
              >
                {Array.from({ length: columnCount }, (_, bedIndex) => {
                  if (bedIndex >= layout.bedTags.length) {
                    return (
                      <div
                        key={`${layout.bayIndex}-${bedIndex}`}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          borderRadius: 3,
                          background: '#f9fafb',
                          border: '0.5px solid #f3f4f6',
                        }}
                      />
                    )
                  }

                  const cell = getCell(layout.bayIndex, bedIndex + 1)
                  const bg = SEVERITY_COLORS[cell.severityLevel] ?? cell.colorHex

                  return (
                    <div
                      key={`${layout.bayIndex}-${bedIndex}`}
                      className="hm-cell"
                      style={{ background: bg }}
                      onMouseEnter={e => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setTooltip({
                          cell: {
                            ...cell,
                            bayTag: cell.bayTag ?? layout.bayTag,
                            benchTag: cell.benchTag ?? layout.bedTags[bedIndex],
                          },
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

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
            {tooltip.cell.bayTag ?? `Bay ${tooltip.cell.bayIndex}`} - {tooltip.cell.benchTag ?? `Bed ${tooltip.cell.benchIndex}`}
          </p>
          <p style={{ color: '#d1d5db' }}>{SEVERITY_LABELS[tooltip.cell.severityLevel]}</p>
          {tooltip.cell.totalCount > 0 && (
            <p style={{ color: '#d1d5db' }}>
              Pests: {tooltip.cell.pestCount} - Disease: {tooltip.cell.diseaseCount}
            </p>
          )}
        </div>
      )}

      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 10 }}>
          {SEVERITY_ORDER.map(level => (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: SEVERITY_COLORS[level],
                  border: '0.5px solid rgba(0,0,0,0.06)',
                }}
              />
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
