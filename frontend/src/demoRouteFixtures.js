const demoRouteScenarios = {
  '1->3': [
    { type: 'recommended', distanceKm: 2.228, condition: 'Passable' },
    { type: 'passable', distanceKm: 3.1163, condition: 'Passable', via: [120.81, 14.852] },
    { type: 'impassable', distanceKm: 7.3576, condition: 'Impassable', via: [120.83, 14.85] },
  ],
  '2->5': [
    { type: 'recommended', distanceKm: 4.6077, condition: 'Passable' },
    { type: 'passable', distanceKm: 5.881, condition: 'Passable', via: [120.835, 14.83] },
    { type: 'impassable', distanceKm: 7.354, condition: 'Impassable', via: [120.83, 14.85] },
  ],
  '5->4': [
    { type: 'recommended', distanceKm: 4.5206, condition: 'Passable' },
    { type: 'passable', distanceKm: 7.8679, condition: 'Passable', via: [120.86, 14.83] },
    { type: 'impassable', distanceKm: 9.5402, condition: 'Impassable', via: [120.83, 14.85] },
  ],
}

export const getDemoRouteFixtures = (startNodeId, endNodeId, start, end) => {
  const scenario = demoRouteScenarios[`${startNodeId}->${endNodeId}`]
  if (!scenario || !Array.isArray(start) || !Array.isArray(end)) return []

  return scenario.map(({ type, distanceKm, condition, via }) => ({
    id: `demo-route-${startNodeId}-${endNodeId}-${type}`,
    from_node_id: String(startNodeId),
    to_node_id: String(endNodeId),
    distanceKm,
    condition,
    demoRouteType: type,
    demoRouteFixture: true,
    allowRouterGeometry: true,
    from: { latitude: start[0], longitude: start[1] },
    to: { latitude: end[0], longitude: end[1] },
    viaCoordinates: via ? [via] : [],
  }))
}

export const getDemoRouteFixtureScenarios = () => demoRouteScenarios
