# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

from abet_meter import InMemoryMeterSink, MeterEmitter


def test_emit_stamps_event_shape():
    sink = InMemoryMeterSink()
    m = MeterEmitter(service="policy-engine", sink=sink)
    m.count("ai_actions", "tenant-a", event_id="e1", source="policy:export")
    assert len(sink.events) == 1
    e = sink.events[0]
    assert e["meter"] == "ai_actions"
    assert e["tenantId"] == "tenant-a"
    assert e["quantity"] == 1
    assert e["eventId"] == "e1"
    assert e["service"] == "policy-engine"
    assert e["source"] == "policy:export"
    assert "at" in e


def test_generates_event_id_when_absent():
    sink = InMemoryMeterSink()
    MeterEmitter("svc", sink).emit("records", "t1")
    assert sink.events[0]["eventId"]


def test_no_tenant_emits_nothing():
    sink = InMemoryMeterSink()
    MeterEmitter("svc", sink).count("ai_actions", None)
    assert sink.events == []


def test_negative_quantity_ignored():
    sink = InMemoryMeterSink()
    MeterEmitter("svc", sink).emit("records", "t1", quantity=-3)
    assert sink.events == []


def test_never_raises_on_bad_sink():
    def boom(_event):
        raise RuntimeError("sink down")

    MeterEmitter("svc", boom).count("records", "t1")  # must not raise
