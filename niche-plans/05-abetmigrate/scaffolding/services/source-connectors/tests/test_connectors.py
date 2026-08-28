# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

import pytest
from app import app
from connectors import StagingRecord, extract, get_connector
from fastapi.testclient import TestClient

client = TestClient(app)

CSV = "id,Email,Name\nsf-1,ASHA@x.com, Asha \nsf-2,ravi@x.com,Ravi"

HUBSPOT = {
    "results": [
        {"id": "101", "properties": {"email": "asha@x.com", "firstname": "Asha"}},
        {"id": "102", "properties": {"email": "ravi@x.com", "firstname": "Ravi"}},
    ]
}


def test_csv_connector_reads_rows_with_provenance():
    records = extract("csv", CSV)
    assert len(records) == 2
    assert records[0].source_id == "sf-1"
    assert records[0].data["Email"] == "ASHA@x.com"
    assert records[0].provenance == {"source_kind": "csv", "source_id": "sf-1"}


def test_hubspot_connector_flattens_properties():
    records = extract("hubspot", HUBSPOT)
    assert len(records) == 2
    assert records[0].source_id == "101"
    assert records[0].data["firstname"] == "Asha"
    assert records[0].source_kind == "hubspot"


def test_csv_without_id_column_falls_back_to_row_index():
    conn = get_connector("csv")
    records = conn.extract("Email,Name\na@x.com,A")
    assert records[0].source_id == "row-0"


def test_unknown_kind_raises():
    with pytest.raises(ValueError):
        extract("salesforce_xml", "")


def test_staging_record_autofills_provenance():
    r = StagingRecord("csv", "id-9", {"x": 1})
    assert r.provenance["source_id"] == "id-9"


def test_api_extract_hubspot():
    resp = client.post("/v1/extract", json={"kind": "hubspot", "payload": HUBSPOT})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert body[0]["sourceKind"] == "hubspot"


def test_api_extract_unknown_kind_422():
    resp = client.post("/v1/extract", json={"kind": "nope", "payload": {}})
    assert resp.status_code == 422
