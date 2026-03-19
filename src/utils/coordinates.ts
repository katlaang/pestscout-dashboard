export type CoordinateAxis = 'latitude' | 'longitude'

function coordinateLabel(axis: CoordinateAxis) {
  return axis === 'latitude' ? 'Latitude' : 'Longitude'
}

function axisDirections(axis: CoordinateAxis) {
  return axis === 'latitude' ? ['N', 'S'] : ['E', 'W']
}

export function formatCoordinateInput(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return ''
  return String(value)
}

export function parseCoordinateInput(value: string, axis: CoordinateAxis): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const compact = trimmed.replace(/\s+/g, '')
  const match = compact.match(/^([NSEW])?([+-]?\d+(?:\.\d+)?)([NSEW])?$/i)

  if (!match) {
    throw new Error(
      `${coordinateLabel(axis)} must look like 51.0447 or 51.0447 ${axis === 'latitude' ? 'N' : 'W'}.`,
    )
  }

  const prefixDirection = match[1]?.toUpperCase()
  const suffixDirection = match[3]?.toUpperCase()

  if (prefixDirection && suffixDirection && prefixDirection !== suffixDirection) {
    throw new Error(`${coordinateLabel(axis)} cannot have two different compass directions.`)
  }

  const direction = prefixDirection ?? suffixDirection
  if (direction && !axisDirections(axis).includes(direction)) {
    throw new Error(
      `${coordinateLabel(axis)} only accepts ${axis === 'latitude' ? 'N or S' : 'E or W'} directions.`,
    )
  }

  const rawValue = Number(match[2])
  if (!Number.isFinite(rawValue)) {
    throw new Error(`${coordinateLabel(axis)} is invalid.`)
  }

  const normalizedValue = direction
    ? Math.abs(rawValue) * (direction === 'S' || direction === 'W' ? -1 : 1)
    : rawValue

  if (axis === 'latitude' && (normalizedValue < -90 || normalizedValue > 90)) {
    throw new Error('Latitude must be between -90 and 90.')
  }

  if (axis === 'longitude' && (normalizedValue < -180 || normalizedValue > 180)) {
    throw new Error('Longitude must be between -180 and 180.')
  }

  return normalizedValue
}
