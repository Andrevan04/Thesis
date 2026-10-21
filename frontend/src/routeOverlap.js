const metersPerDegree = 111_320

const distanceToSegmentMeters = (point, start, end) => {
  const cosine = Math.cos(point[0] * Math.PI / 180)
  const project = ([latitude, longitude]) => [longitude * cosine * metersPerDegree, latitude * metersPerDegree]
  const projectedPoint = project(point)
  const projectedStart = project(start)
  const projectedEnd = project(end)
  const deltaX = projectedEnd[0] - projectedStart[0]
  const deltaY = projectedEnd[1] - projectedStart[1]
  const lengthSquared = deltaX ** 2 + deltaY ** 2
  const progress = lengthSquared
    ? Math.max(0, Math.min(1, ((projectedPoint[0] - projectedStart[0]) * deltaX
      + (projectedPoint[1] - projectedStart[1]) * deltaY) / lengthSquared))
    : 0
  return Math.hypot(
    projectedPoint[0] - (projectedStart[0] + progress * deltaX),
    projectedPoint[1] - (projectedStart[1] + progress * deltaY),
  )
}

const distanceToPolylineMeters = (point, line) => {
  let nearest = Infinity
  for (let index = 1; index < line.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegmentMeters(point, line[index - 1], line[index]))
  }
  return nearest
}

const interpolatePosition = (start, end, progress) => [
  start[0] + (end[0] - start[0]) * progress,
  start[1] + (end[1] - start[1]) * progress,
]

export const removeOverlappingRouteSegments = (
  route,
  recommended,
  { toleranceMeters = 10, maxSampleSpacingMeters = 4 } = {},
) => {
  if (route.length < 2 || recommended.length < 2) return route.length >= 2 ? [route] : []

  const sampledRoute = [route[0]]
  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1]
    const end = route[index]
    const segmentLength = distanceToSegmentMeters(end, start, start)
    const steps = Math.max(1, Math.ceil(segmentLength / maxSampleSpacingMeters))
    for (let step = 1; step <= steps; step += 1) {
      sampledRoute.push(interpolatePosition(start, end, step / steps))
    }
  }

  const visibleSegments = []
  let currentSegment = []
  const finishSegment = () => {
    if (currentSegment.length >= 2) visibleSegments.push(currentSegment)
    currentSegment = []
  }

  for (const position of sampledRoute) {
    if (distanceToPolylineMeters(position, recommended) <= toleranceMeters) {
      finishSegment()
      continue
    }
    currentSegment.push(position)
  }
  finishSegment()
  return visibleSegments
}
