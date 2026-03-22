"""Tests for the Flask API."""

import json
import pytest

from src.api.app import create_app


@pytest.fixture
def client():
    app = create_app("classical")
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


class TestAPI:
    def test_health(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "ok"
        assert data["solver"] == "classical"

    def test_solvers(self, client):
        resp = client.get("/api/v1/solvers")
        assert resp.status_code == 200
        data = resp.get_json()
        names = [s["name"] for s in data]
        assert "classical" in names

    def test_generate(self, client, sample_input_data):
        resp = client.post(
            "/api/v1/generate",
            data=json.dumps(sample_input_data),
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert "assignments" in data
        assert "metrics" in data
        assert "validation" in data

    def test_generate_no_body(self, client):
        resp = client.post("/api/v1/generate")
        assert resp.status_code in (400, 415)  # 415 if no content-type header
