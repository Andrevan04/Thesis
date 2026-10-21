const distanceBetweenCoordinatesKm = (first, second) => {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitude1 = radians(first[0])
  const latitude2 = radians(second[0])
  const latitudeDelta = latitude2 - latitude1
  const longitudeDelta = radians(second[1] - first[1])
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export const normalizeRoadGeometry = (rawGeometry, from, to) => {
  if (rawGeometry == null) return { positions: null, error: 'Road-edge geometry is not recorded' }
  let geometry = rawGeometry
  if (typeof geometry === 'string') {
    try {
      geometry = JSON.parse(geometry)
    } catch {
      return { positions: null, error: 'Road-edge geometry is not valid GeoJSON' }
    }
  }
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
    return { positions: null, error: 'Road-edge geometry must be a GeoJSON LineString' }
  }

  const positions = geometry.coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null
    const longitude = Number(coordinate[0])
    const latitude = Number(coordinate[1])
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null
  })
  if (positions.some((position) => !position)) {
    return { positions: null, error: 'Road-edge geometry contains invalid coordinates' }
  }

  const endpoints = [
    [Number(from?.latitude), Number(from?.longitude)],
    [Number(to?.latitude), Number(to?.longitude)],
  ]
  if (endpoints.flat().some((coordinate) => !Number.isFinite(coordinate))) {
    return { positions: null, error: 'Road-edge endpoint nodes have invalid coordinates' }
  }
  const endpointToleranceKm = 0.01
  if (distanceBetweenCoordinatesKm(positions[0], endpoints[0]) > endpointToleranceKm
    || distanceBetweenCoordinatesKm(positions.at(-1), endpoints[1]) > endpointToleranceKm) {
    return { positions: null, error: 'Road-edge geometry does not match its directed endpoint nodes' }
  }

  return { positions, error: null }
}
