const distanceBetweenPositionsKm = (first, second) => {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitudeDelta = radians(second[0] - first[0])
  const longitudeDelta = radians(second[1] - first[1])
  const latitude1 = radians(first[0])
  const latitude2 = radians(second[0])
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

const sameGeometry = (first, second) => first.length === second.length
  && first.every(([latitude, longitude], index) => (
    Math.abs(latitude - second[index][0]) < 1e-7
    && Math.abs(longitude - second[index][1]) < 1e-7
  ))

export const normalizeDemoStreetRoutes = (routes, start, end) => {
  if (!Array.isArray(routes) || !Array.isArray(start) || !Array.isArray(end)) {
    throw new Error('Street router returned invalid route data or endpoints')
  }
  const normalized = routes.flatMap((route) => {
    const coordinates = route.geometry?.coordinates
    const distanceKm = Number(route.distance) / 1000
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !Number.isFinite(distanceKm) || distanceKm <= 0) return []

    const positions = coordinates.map((coordinate) => (
      Array.isArray(coordinate) && coordinate.length >= 2
        ? [Number(coordinate[1]), Number(coordinate[0])]
        : null
    ))
    if (positions.some((position) => !position?.every(Number.isFinite))) return []
    if (distanceBetweenPositionsKm(positions[0], start) > 0.1
      || distanceBetweenPositionsKm(positions.at(-1), end) > 0.1) return []

    return [{ distanceKm, positions }]
  }).sort((first, second) => first.distanceKm - second.distanceKm)

  if (!normalized.length) {
    throw new Error('Street router returned no road-following route reaching both map markers')
  }

  const recommended = normalized[0]
  const passable = normalized.find((route) => (
    route.distanceKm > recommended.distanceKm + 1e-6
    && !sameGeometry(route.positions, recommended.positions)
  ))
  return { recommended, passable: passable || null }
}
