
from flask import Flask, jsonify, request

from routing import build_road_graph
from assignment import optimize_assignments

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "Python Optimization API"
    }), 200


@app.post("/optimize")
def optimize():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Request body must be a JSON object."
        }), 400

    edges = data.get("edges")
    units = data.get("units")
    incidents = data.get("incidents")

    if not all([
        isinstance(edges, list),
        isinstance(units, list),
        isinstance(incidents, list)
    ]):
        return jsonify({
            "error": "edges, units, and incidents must be arrays."
        }), 400

    try:
        graph = build_road_graph(edges)

        result = optimize_assignments(
            graph,
            units,
            incidents
        )

        return jsonify(result), 200

    except (KeyError, TypeError, ValueError) as error:
        return jsonify({
            "error": f"Invalid optimization data: {error}"
        }), 400

    except Exception:
        app.logger.exception("Optimization failed")

        return jsonify({
            "error": "An internal optimization error occurred."
        }), 500


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5001,
        debug=True
    )
  