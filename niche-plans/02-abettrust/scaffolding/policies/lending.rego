package abettrust.lending

# Deny export of KYC records unless the actor holds the compliance role
default allow = false

allow {
  input.action != "export"
}

allow {
  input.action == "export"
  input.resource == "kyc_record"
  some role
  role := input.actor.roles[_]
  role == "compliance_officer"
}

# Field-level: mask suitability internals from non-advisor roles
deny_fields[f] {
  f := input.fields[_]
  f == "internal_risk_notes"
  not is_advisor
}

is_advisor {
  input.actor.roles[_] == "advisor"
}
