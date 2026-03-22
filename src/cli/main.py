"""Click CLI for the timetable generator."""

from __future__ import annotations

import json
import sys

import click

from src.engine.orchestrator import Orchestrator
from src.solvers.classical import ClassicalSolver


@click.group()
def cli():
    """Quantum-Capable Timetable Generator."""


@cli.command()
@click.option("--input", "input_path", required=True, help="Input JSON file path")
@click.option("--output", "output_path", default=None, help="Output JSON file path (default: stdout)")
@click.option("--solver", "solver_name", default="classical", help="Solver backend name")
def generate(input_path: str, output_path: str | None, solver_name: str):
    """Generate a timetable from input data."""
    with open(input_path) as f:
        input_data = json.load(f)

    orchestrator = Orchestrator(solver=_get_solver(solver_name))
    result = orchestrator.generate(input_data)

    output = json.dumps(result, indent=2)
    if output_path:
        with open(output_path, "w") as f:
            f.write(output)
        click.echo(f"Timetable written to {output_path}")
    else:
        click.echo(output)


@cli.command()
@click.option("--input", "input_path", required=True, help="Input JSON file to validate")
def validate(input_path: str):
    """Validate a timetable for constraint violations."""
    with open(input_path) as f:
        input_data = json.load(f)

    orchestrator = Orchestrator()
    result = orchestrator.generate(input_data)
    validation = result.get("validation", {})

    if validation.get("valid"):
        click.echo("Timetable is valid (no hard constraint violations).")
    else:
        click.echo("Hard violations found:")
        for v in validation.get("hard_violations", []):
            click.echo(f"  - {v}")

    soft = validation.get("soft_violations", [])
    if soft:
        click.echo(f"\nSoft violations ({len(soft)}):")
        for v in soft:
            click.echo(f"  - {v}")


@cli.command()
@click.option("--port", default=5000, help="Port to serve on")
@click.option("--solver", "solver_name", default="classical", help="Solver backend")
def serve(port: int, solver_name: str):
    """Start the Flask API server with visualization."""
    from src.api.app import create_app

    app = create_app(solver_name=solver_name)
    click.echo(f"Starting server on http://localhost:{port}")
    click.echo(f"Visualization at http://localhost:{port}/viz")
    app.run(host="0.0.0.0", port=port, debug=True)


def _get_solver(name: str):
    if name == "classical":
        return ClassicalSolver(seed=42)
    elif name == "dwave":
        from src.solvers.dwave_stub import DWaveSolver
        return DWaveSolver()
    elif name == "qaoa":
        from src.solvers.qaoa_stub import QAOASolver
        return QAOASolver()
    else:
        click.echo(f"Unknown solver: {name}, falling back to classical")
        return ClassicalSolver(seed=42)


if __name__ == "__main__":
    cli()
