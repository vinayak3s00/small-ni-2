from mapping import (
    FieldMap,
    MappingSpec,
    TargetStore,
    cutover,
    rollback,
)

SPEC = MappingSpec(
    natural_key="email",
    field_maps=[
        FieldMap("Email", "email", "lower"),
        FieldMap("Name", "name", "strip"),
        FieldMap("Amount", "amount_minor", "to_minor"),
    ],
)

SOURCE = [
    {"id": "sf-1", "Email": "ASHA@EXAMPLE.COM", "Name": " Asha ", "Amount": "100.50"},
    {"id": "sf-2", "Email": "ravi@example.com", "Name": "Ravi", "Amount": "0"},
]


def test_map_record_applies_transforms():
    mapped = SPEC.map_record(SOURCE[0])
    assert mapped["email"] == "asha@example.com"
    assert mapped["name"] == "Asha"
    assert mapped["amount_minor"] == 10050


def test_cutover_inserts_then_is_idempotent():
    store = TargetStore()
    r1 = cutover(store, SPEC, "salesforce", SOURCE)
    assert r1.inserted == 2 and r1.updated == 0
    assert len(store.rows) == 2

    # Re-running the same source must NOT duplicate rows (idempotent upsert).
    r2 = cutover(store, SPEC, "salesforce", SOURCE)
    assert r2.inserted == 0 and r2.updated == 2
    assert len(store.rows) == 2


def test_provenance_is_recorded():
    store = TargetStore()
    cutover(store, SPEC, "salesforce", SOURCE)
    row = store.rows["asha@example.com"]
    assert row["_provenance"] == {"source_kind": "salesforce", "source_id": "sf-1"}


def test_rollback_restores_previous_state():
    store = TargetStore()
    cutover(store, SPEC, "salesforce", SOURCE)  # inserts asha + ravi

    # Second cutover updates asha's name; capture its rollback journal.
    updated_source = [{"id": "sf-1", "Email": "asha@example.com", "Name": "Asha K", "Amount": "200"}]
    result = cutover(store, SPEC, "salesforce", updated_source)
    assert store.rows["asha@example.com"]["name"] == "Asha K"

    restored = rollback(store, result.rollback)
    assert restored == 1
    # Rolled back to the pre-update name.
    assert store.rows["asha@example.com"]["name"] == "Asha"


def test_rollback_deletes_newly_created_rows():
    store = TargetStore()
    result = cutover(store, SPEC, "salesforce", SOURCE)
    rollback(store, result.rollback)
    assert store.rows == {}


def test_missing_natural_key_raises():
    spec = MappingSpec(natural_key="email", field_maps=[FieldMap("Name", "name")])
    try:
        spec.map_record({"Name": "X"})
        assert False, "expected ValueError"
    except ValueError as e:
        assert "natural key" in str(e)
