
import numpy as np
from scipy.optimize import linear_sum_assignment

from routing import find_shortest_route


def optimize_assignments(graph, units, incidents):
    """
    Minimize total estimated travel time while enforcing:
    - One incident at most per rescue unit.
    - One rescue unit at most per incident.
    - Sufficient unit capacity.
    - A reachable route through passable roads.
    """

    available_units = [
        unit for unit in units
        if str(unit.get("status", "")).strip().lower() == "available"
    ]

    pending_incidents = [
        incident for incident in incidents
        if str(incident.get("status", "")).strip().lower() == "pending"
    ]

    def unassigned_result(reason):
        return {
            "assignments": [],
            "unassigned_incident_ids": [
                incident["incident_id"]
                for incident in pending_incidents
            ],
            "total_distance_km": 0.0,
            "message": reason,
        }

    if not pending_incidents:
        return {
            "assignments": [],
            "unassigned_incident_ids": [],
            "total_distance_km": 0.0,
            "message": "No pending incidents.",
        }

    if not available_units:
        return unassigned_result("No available rescue units.")

    # Each pair is either feasible with a route or excluded.
    routes = {}
    valid_times = []

    for i, unit in enumerate(available_units):
        for j, incident in enumerate(pending_incidents):
            capacity = unit.get("capacity")
            affected = incident.get("affected_residents")

            if capacity is None or affected is None:
                raise ValueError(
                    "Each unit needs capacity and each incident "
                    "needs affected_residents."
                )

            if float(capacity) < 0 or float(affected) < 0:
                raise ValueError(
                    "Capacity and affected_residents must be non-negative."
                )

            if float(capacity) < float(affected):
                routes[(i, j)] = None
                continue

            route = find_shortest_route(
                graph,
                unit["current_node_id"],
                incident["location_node_id"],
            )

            routes[(i, j)] = route

            if route is not None:
                valid_times.append(route["estimated_time_minutes"])

    if not valid_times:
        return unassigned_result(
            "No feasible unit-to-incident assignments exist."
        )

    # Dummy columns allow a unit to remain unassigned.
    # Their penalty makes feasible assignments preferable to leaving
    # an incident unserved, while invalid pairings cost even more.
    max_time = max(valid_times)
    max_assignments = min(
        len(available_units),
        len(pending_incidents),
    )

    dummy_cost = (max_time + 1) * (max_assignments + 1)
    invalid_cost = dummy_cost * (len(available_units) + 2)

    cost_matrix = []

    for i in range(len(available_units)):
        row = []

        for j in range(len(pending_incidents)):
            route = routes[(i, j)]

            if route is None:
                row.append(invalid_cost)
            else:
                row.append(route["estimated_time_minutes"])

        # One dummy column per unit.
        row.extend([dummy_cost] * len(available_units))
        cost_matrix.append(row)

    cost_matrix = np.array(cost_matrix, dtype=float)

    unit_indices, column_indices = linear_sum_assignment(cost_matrix)

    assignments = []
    assigned_incident_ids = set()
    total_distance = 0.0
    total_time = 0.0

    for i, j in zip(unit_indices, column_indices):
        # Dummy columns represent units that are not assigned.
        if j >= len(pending_incidents):
            continue

        route = routes[(i, j)]

        # Never accept an infeasible pairing.
        if route is None:
            continue

        unit = available_units[i]
        incident = pending_incidents[j]

        assignments.append({
            "unit_id": unit["unit_id"],
            "incident_id": incident["incident_id"],
            "estimated_time_minutes": route["estimated_time_minutes"],
            "distance_km": route["distance_km"],
            "path": route["path"],
        })

        assigned_incident_ids.add(incident["incident_id"])
        total_distance += route["distance_km"]
        total_time += route["estimated_time_minutes"]

    unassigned_incidents = [
        incident["incident_id"]
        for incident in pending_incidents
        if incident["incident_id"] not in assigned_incident_ids
    ]

    return {
        "assignments": assignments,
        "unassigned_incident_ids": unassigned_incidents,
        "total_distance_km": round(total_distance, 3),
        "total_estimated_time_minutes": round(total_time, 2),
        "message": (
            "Optimization completed."
            if not unassigned_incidents
            else "Optimization completed with unassigned incidents."
        ),
    }
