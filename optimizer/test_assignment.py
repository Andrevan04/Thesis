
from routing import build_road_graph
from assignment import optimize_assignments

edges = [
    {
        "from_node_id": 1,
        "to_node_id": 2,
        "distance_km": 2.0,
        "is_passable": True,
    },
    {
        "from_node_id": 2,
        "to_node_id": 3,
        "distance_km": 1.5,
        "is_passable": True,
    },
    {
        "from_node_id": 3,
        "to_node_id": 2,
        "distance_km": 1.5,
        "is_passable": True,
    },
    {
        "from_node_id": 2,
        "to_node_id": 1,
        "distance_km": 2.0,
        "is_passable": True,
    },
    {
        "from_node_id": 1,
        "to_node_id": 3,
        "distance_km": 5.0,
        "is_passable": True,
    },
]

units = [
    {
        "unit_id": 101,
        "current_node_id": 1,
        "capacity": 10,
        "status": "Available",
    },
    {
        "unit_id": 102,
        "current_node_id": 3,
        "capacity": 5,
        "status": "Available",
    },
]

incidents = [
    {
        "incident_id": 201,
        "location_node_id": 3,
        "affected_residents": 8,
        "status": "Pending",
    },
    {
        "incident_id": 202,
        "location_node_id": 2,
        "affected_residents": 4,
        "status": "Pending",
    },
    {
        "incident_id": 203,
        "location_node_id": 1,
        "affected_residents": 20,
        "status": "Pending",
    },
]

graph = build_road_graph(edges)
result = optimize_assignments(graph, units, incidents)

print("Capacity-aware assignment result:")
print(result)

assert len(result["assignments"]) == 2
assert result["unassigned_incident_ids"] == [203]
assert result["total_distance_km"] == 5.0

for assignment in result["assignments"]:
    unit = next(
        unit for unit in units
        if unit["unit_id"] == assignment["unit_id"]
    )
    incident = next(
        incident for incident in incidents
        if incident["incident_id"] == assignment["incident_id"]
    )

    assert unit["capacity"] >= incident["affected_residents"]

print("Capacity-aware assignment test passed!")
