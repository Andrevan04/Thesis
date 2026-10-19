
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

url = "http://127.0.0.1:5001/optimize"

test_data = {
    "edges": [
        {
            "from_node_id": 1,
            "to_node_id": 2,
            "distance_km": 5.0,
            "travel_time_minutes": 10.0,
            "is_passable": True
        }
    ],
    "units": [
        {
            "unit_id": 1,
            "current_node_id": 1,
            "capacity": 10,
            "status": "Available"
        }
    ],
    "incidents": [
        {
            "incident_id": 1,
            "location_node_id": 2,
            "affected_residents": 5,
            "urgency_level": "Critical",
            "status": "Pending"
        }
    ]
}

request = Request(
    url,
    data=json.dumps(test_data).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urlopen(request, timeout=10) as response:
        print("HTTP Status:", response.status)
        print(json.dumps(json.loads(response.read()), indent=2))

except HTTPError as error:
    print("HTTP Error:", error.code)
    print(error.read().decode("utf-8"))

except URLError as error:
    print("Connection Error:", error.reason)
