"""Flask app factory."""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from flask import Flask, jsonify, redirect, request, render_template

from src.engine.orchestrator import Orchestrator
from src.solvers.classical import ClassicalSolver
from src.solvers.dwave_stub import DWaveSolver
from src.solvers.qaoa_stub import QAOASolver


SOLVER_REGISTRY = {
    "classical": ClassicalSolver,
    "dwave": DWaveSolver,
    "qaoa": QAOASolver,
}


def create_app(solver_name: str = "classical") -> Flask:
    """Create Flask app with the specified solver backend."""
    app = Flask(__name__, template_folder="templates", static_folder="static")

    solver_cls = SOLVER_REGISTRY.get(solver_name, ClassicalSolver)
    orchestrator = Orchestrator(solver=solver_cls())

    # In-memory store for stakeholder submissions
    # In production this would be a database
    submissions: dict[str, dict] = {}

    @app.route("/api/v1/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "solver": orchestrator.solver.name})

    @app.route("/api/v1/solvers", methods=["GET"])
    def list_solvers():
        solvers = []
        for name, cls in SOLVER_REGISTRY.items():
            available = True
            try:
                cls().solve(None, [], [], [], [])
            except NotImplementedError:
                available = False
            except Exception:
                available = True
            solvers.append({"name": name, "available": available})
        return jsonify(solvers)

    @app.route("/api/v1/generate", methods=["POST"])
    def generate():
        input_data = request.get_json()
        if not input_data:
            return jsonify({"error": "No JSON body provided"}), 400
        try:
            # Demo mode: add randomness to greedy phase to show conflict resolution
            demo = request.args.get("demo", "").lower() in ("1", "true", "yes")
            if demo:
                demo_orchestrator = Orchestrator(
                    solver=ClassicalSolver(seed=42, greedy_randomness=0.6)
                )
                result = demo_orchestrator.generate(input_data)
            else:
                result = orchestrator.generate(input_data)
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/v1/regenerate", methods=["POST"])
    def regenerate():
        body = request.get_json()
        if not body:
            return jsonify({"error": "No JSON body provided"}), 400
        input_data = body.get("input_data", {})
        updated_preferences = body.get("preferences", [])
        try:
            result = orchestrator.regenerate(input_data, updated_preferences)
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/v1/reschedule", methods=["POST"])
    def reschedule():
        body = request.get_json()
        if not body:
            return jsonify({"error": "No JSON body provided"}), 400
        input_data = body.get("input_data", {})
        frozen = body.get("frozen_event_ids", [])
        existing = body.get("existing_assignments", None)
        try:
            result = orchestrator.reschedule(input_data, frozen, existing)
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/v1/validate", methods=["POST"])
    def validate():
        body = request.get_json()
        if not body:
            return jsonify({"error": "No JSON body provided"}), 400
        try:
            result = orchestrator.generate(body)
            return jsonify({"validation": result.get("validation", {})})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── Stakeholder Submission API ───────────────────────────────────────────

    @app.route("/api/v1/submissions", methods=["GET"])
    def list_submissions():
        return jsonify(list(submissions.values()))

    @app.route("/api/v1/submissions", methods=["POST"])
    def create_submission():
        body = request.get_json()
        if not body:
            return jsonify({"error": "No JSON body provided"}), 400
        sub_id = str(uuid.uuid4())[:8]
        body["id"] = sub_id
        body["submitted_at"] = datetime.now().isoformat()
        submissions[sub_id] = body
        return jsonify(body), 201

    @app.route("/api/v1/submissions/<sub_id>", methods=["DELETE"])
    def delete_submission(sub_id):
        if sub_id in submissions:
            del submissions[sub_id]
            return jsonify({"deleted": sub_id})
        return jsonify({"error": "Not found"}), 404

    @app.route("/api/v1/submissions/clear", methods=["POST"])
    def clear_submissions():
        submissions.clear()
        return jsonify({"cleared": True})

    # ── Pages ────────────────────────────────────────────────────────────────

    @app.route("/")
    def index():
        return redirect("/viz")

    @app.route("/viz")
    def viz():
        return render_template("viz.html")

    @app.route("/portal")
    def portal():
        return render_template("portal.html")

    return app
