
import networkx as nx


def build_road_graph(edges):
    """
    Build a directed road graph using passable roads only.
    Dijkstra uses estimated travel time as the edge weight.
    """

    graph = nx.DiGraph()

    for edge in edges:
        if not edge.get("is_passable", False):
            continue

        travel_time = edge.get("travel_time_minutes")
        distance = edge.get("distance_km")

        if travel_time is None or float(travel_time) < 0:
            raise ValueError(
                "Every passable road needs a non-negative "
                "travel_time_minutes value."
            )

        if distance is not None and float(distance) < 0:
            raise ValueError(
                "Road distance cannot be negative."
            )

        graph.add_edge(
            int(edge["from_node_id"]),
            int(edge["to_node_id"]),
            weight=float(travel_time),
            distance_km=(
                float(distance) if distance is not None else None
            ),
        )

    return graph


def find_shortest_route(graph, start_node, destination_node):
    """
    Find the minimum-time route between two road nodes.
    Return estimated travel time, distance, and node sequence.
    """

    try:
        travel_time, path = nx.single_source_dijkstra(
            graph,
            source=int(start_node),
            target=int(destination_node),
            weight="weight",
        )

        # Only report a total distance if every road on the
        # selected route has a known distance.
        segment_distances = [
            graph[u][v]["distance_km"]
            for u, v in zip(path, path[1:])
        ]

        distance = (
            round(sum(segment_distances), 3)
            if all(value is not None for value in segment_distances)
            else None
        )

        return {
            "estimated_time_minutes": round(travel_time, 2),
            "distance_km": distance,
            "path": path,
        }

    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None
