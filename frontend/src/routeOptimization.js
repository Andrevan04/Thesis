export const findRoadPath = (
  roads,
  startNodeId,
  endNodeId,
  { excludedEdgeIds = new Set(), excludedNodeIds = new Set() } = {},
) => {
  const start = String(startNodeId ?? '')
  const end = String(endNodeId ?? '')
  if (!start || !end || excludedNodeIds.has(start) || excludedNodeIds.has(end)) return null
  if (start === end) return { distanceKm: 0, nodeIds: [start], edgeIds: [] }

  const adjacency = new Map()
  for (const road of roads) {
    const fromId = String(road.from_node_id ?? road.fromNodeId ?? road.from?.node_id ?? road.from?.nodeId ?? road.from?.id ?? '')
    const toId = String(road.to_node_id ?? road.toNodeId ?? road.to?.node_id ?? road.to?.nodeId ?? road.to?.id ?? '')
    const edgeId = String(road.id ?? road.edge_id ?? road.edgeId ?? '')
    const distanceKm = Number(road.distanceKm)
    if (
      !fromId || !toId || !edgeId
      || excludedEdgeIds.has(edgeId)
      || excludedNodeIds.has(fromId)
      || excludedNodeIds.has(toId)
      || road.condition !== 'Passable'
      || road.distanceKm == null
      || !Number.isFinite(distanceKm)
      || distanceKm <= 0
    ) continue
    if (!adjacency.has(fromId)) adjacency.set(fromId, [])
    adjacency.get(fromId).push({ edgeId, fromId, toId, distanceKm })
  }

  const distances = new Map([[start, 0]])
  const previous = new Map()
  const visited = new Set()

  while (true) {
    let currentNodeId = null
    let bestDistance = Infinity
    for (const [nodeId, distance] of distances) {
      if (!visited.has(nodeId) && distance < bestDistance) {
        currentNodeId = nodeId
        bestDistance = distance
      }
    }
    if (currentNodeId === null) break
    if (currentNodeId === end) break

    visited.add(currentNodeId)
    for (const edge of adjacency.get(currentNodeId) || []) {
      const nextDistance = bestDistance + edge.distanceKm
      if (nextDistance < (distances.get(edge.toId) ?? Infinity)) {
        distances.set(edge.toId, nextDistance)
        previous.set(edge.toId, { nodeId: currentNodeId, edgeId: edge.edgeId })
      }
    }
  }

  if (!distances.has(end)) return null
  const nodeIds = [end]
  const edgeIds = []
  let currentNodeId = end
  while (currentNodeId !== start) {
    const step = previous.get(currentNodeId)
    if (!step) return null
    edgeIds.unshift(step.edgeId)
    nodeIds.unshift(step.nodeId)
    currentNodeId = step.nodeId
  }
  return { distanceKm: distances.get(end), nodeIds, edgeIds }
}

const getRoadId = (road) => String(road.id ?? road.edge_id ?? road.edgeId ?? '')
const getRoadFromId = (road) => String(road.from_node_id ?? road.fromNodeId ?? road.from?.node_id ?? road.from?.nodeId ?? road.from?.id ?? '')
const getRoadToId = (road) => String(road.to_node_id ?? road.toNodeId ?? road.to?.node_id ?? road.to?.nodeId ?? road.to?.id ?? '')
const samePath = (first, second) => first.edgeIds.length === second.edgeIds.length
  && first.edgeIds.every((edgeId, index) => edgeId === second.edgeIds[index])

const getSecondShortestPath = (roads, shortest) => {
  if (!shortest?.edgeIds.length) return null
  const candidates = new Map()
  const roadsById = new Map(roads.map((road) => [getRoadId(road), road]))
  for (let index = 0; index < shortest.edgeIds.length; index += 1) {
    const rootNodes = shortest.nodeIds.slice(0, index + 1)
    const rootEdges = shortest.edgeIds.slice(0, index)
    const excludedEdgeIds = new Set([shortest.edgeIds[index]])

    const spurPath = findRoadPath(roads, rootNodes.at(-1), shortest.nodeIds.at(-1), {
      excludedEdgeIds,
      excludedNodeIds: new Set(rootNodes.slice(0, -1)),
    })
    if (!spurPath) continue

    const rootDistanceKm = rootEdges.reduce(
      (distance, edgeId) => distance + Number(roadsById.get(edgeId)?.distanceKm),
      0,
    )
    const candidate = {
      distanceKm: rootDistanceKm + spurPath.distanceKm,
      nodeIds: [...rootNodes.slice(0, -1), ...spurPath.nodeIds],
      edgeIds: [...rootEdges, ...spurPath.edgeIds],
    }
    if (samePath(candidate, shortest) || candidate.distanceKm <= shortest.distanceKm + 1e-6) continue
    candidates.set(candidate.edgeIds.join(','), candidate)
  }

  return [...candidates.values()].sort((first, second) => first.distanceKm - second.distanceKm)[0] || null
}

const getShortestImpassablePath = (roads, startNodeId, endNodeId) => {
  const blockedRoads = roads.filter((road) => road.condition === 'Impassable'
    && getRoadId(road)
    && Number.isFinite(Number(road.distanceKm))
    && Number(road.distanceKm) > 0)
  const candidates = new Map()

  for (const blockedRoad of blockedRoads) {
    const fromNodeId = getRoadFromId(blockedRoad)
    const toNodeId = getRoadToId(blockedRoad)
    const approach = findRoadPath(roads, startNodeId, fromNodeId)
    if (!approach) continue
    const departure = findRoadPath(roads, toNodeId, endNodeId, {
      excludedNodeIds: new Set(approach.nodeIds.slice(0, -1)),
    })
    if (!departure) continue

    const blockedEdgeId = getRoadId(blockedRoad)
    const route = {
      distanceKm: approach.distanceKm + Number(blockedRoad.distanceKm) + departure.distanceKm,
      nodeIds: [...approach.nodeIds, ...departure.nodeIds],
      edgeIds: [...approach.edgeIds, blockedEdgeId, ...departure.edgeIds],
      blockedEdgeId,
    }
    if (new Set(route.nodeIds).size !== route.nodeIds.length) continue
    candidates.set(route.edgeIds.join(','), route)
  }

  return [...candidates.values()].sort((first, second) => first.distanceKm - second.distanceKm)[0] || null
}

export const getMapRouteOptions = (roads, startNodeId, endNodeId) => {
  const recommended = findRoadPath(roads, startNodeId, endNodeId)
  return {
    recommended,
    passable: getSecondShortestPath(roads, recommended),
    impassable: getShortestImpassablePath(roads, startNodeId, endNodeId),
  }
}
