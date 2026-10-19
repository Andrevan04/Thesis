
from routing import build_road_graph, find_shortest_route


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
        "from_node_id": 1,
        "to_node_id": 3,
        "distance_km": 5.0,
        "is_passable": True,
    },
]

graph = build_road_graph(edges)
result = find_shortest_route(graph, 1, 3)

print("Shortest route result:")
print(result)

assert result["distance_km"] == 3.5
assert result["path"] == [1, 2, 3]

print("Dijkstra test passed!")
