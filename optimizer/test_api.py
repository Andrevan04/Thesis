
import json
import urllib.request

url = "http://127.0.0.1:5001/optimize"

data = {
    "edges": [
        {
            "from_node_id": 1,
            "to_node_id": 2,
            "distance_km": 2.0,
            "is_passable": True
        },
        {
            "from_node_id": 2,
            "to_node_id": 3,
            "distance_km": 1.5,
            "is_passable": True
        },
        {
            "from_node_id": 3,
            "to_node_id": 2,
            "distance_km": 1.5,
            "is_passable": True
        },
        {
            "from_node_id": 2,
            "to_node_id": 1,
            "distance_km": 2.0,
            "is_passable": True
        },
        {
            "from_node_id": 1,
            "to_node_id": 3,
            "distance_km": 5.0,
            "is_passable": True
        }
    ],
    "units": [
        {
            "unit_id": 101,
            "current_node_id": 1,
            "capacity": 10,
            "status": "Available"
        },
        {
            "unit_id": 102,
            "current_node_id": 3,
            "capacity": 5,
            "status": "Available"
        }
    ],
    "incidents": [
        {
            "incident_id": 201,
            "location_node_id": 3,
            "affected_residents": 8,
            "status": "Pending"
        },
        {
            "incident_id": 202,
            "location_node_id": 2,
            "affected_residents": 4,
            "status": "Pending"
        },
        {
            "incident_id": 203,
            "location_node_id": 1,
            "affected_residents": 20,
            "status": "Pending"
        }
    ]
}

request = urllib.request.Request(
    url,
    data=json.dumps(data).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

with urllib.request.urlopen(request) as response:
    result = json.loads(response.read().decode("utf-8"))

print("Flask API response:")
print(json.dumps(result, indent=2))

assert len(result["assignments"]) == 2
assert result["unassigned_incident_ids"] == [203]
assert result["total_distance_km"] == 5.0

print("\nFlask API test passed!")
