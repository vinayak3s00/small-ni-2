#!/usr/bin/env bash
# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential.
#
# End-to-end sales-demo smoke test across the four production services.
# Prerequisites: `docker compose -f demo/docker-compose.yaml up --build` running.
#
# It proves the customer-facing guarantees live:
#   1. CRM record created + explainable pipeline (core-crm, RLS)
#   2. Multi-touch attribution -> channel-partner payout truth (attribution-svc)
#   3. KYC lifecycle + append-only disclosure trail (kyc-svc)
#   4. Field order with stock allocation; overselling is rejected (order-svc)
#   5. Cross-tenant isolation is enforced by the database
set -uo pipefail

CORE=${CORE:-http://localhost:3001}
ATTR=${ATTR:-http://localhost:3011}
KYC=${KYC:-http://localhost:3007}
ORDER=${ORDER:-http://localhost:3013}
SECRET=${JWT_SECRET:-demo-secret}

TENANT_A=11111111-1111-1111-1111-111111111111
TENANT_B=22222222-2222-2222-2222-222222222222

pass=0; fail=0
ok()   { echo "  PASS $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL $1"; fail=$((fail+1)); }

# Mint a JWT with the demo secret (roles let KYC create/verify).
mktoken() {
  node -e "console.log(require('jsonwebtoken').sign({sub:'demo',tenant_id:'$1',roles:['sales','compliance_officer','field_rep']},'$SECRET'))"
}
TA=$(mktoken "$TENANT_A")
TB=$(mktoken "$TENANT_B")

jq_get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d)$1)}catch(e){console.log('')}})"; }

echo "== 1. core-crm: create a real-estate lead =="
REC=$(curl -s $CORE/v1/records -H "Authorization: Bearer $TA" -H 'content-type: application/json' \
  -d '{"vertical":"realty","source":"portal:99acres","party":{"name":"Asha Kulkarni","phones":["+919800000001"],"languages":["mr","en"]}}')
REC_ID=$(echo "$REC" | jq_get ".id")
[ -n "$REC_ID" ] && ok "lead created ($REC_ID)" || bad "lead not created: $REC"

echo "== 2. attribution: record touches, resolve last-touch to channel partner =="
curl -s $ATTR/v1/attribution/events -H "Authorization: Bearer $TA" -H 'content-type: application/json' \
  -d "{\"recordId\":\"$REC_ID\",\"source\":\"portal:99acres\",\"occurredAt\":\"2026-06-01T09:00:00Z\"}" >/dev/null
curl -s $ATTR/v1/attribution/events -H "Authorization: Bearer $TA" -H 'content-type: application/json' \
  -d "{\"recordId\":\"$REC_ID\",\"source\":\"cp\",\"partnerCode\":\"CP-042\",\"occurredAt\":\"2026-06-03T09:00:00Z\"}" >/dev/null
CP=$(curl -s "$ATTR/v1/attribution/$REC_ID?model=last_touch" -H "Authorization: Bearer $TA" | jq_get ".shares[0].partnerCode")
[ "$CP" = "CP-042" ] && ok "attribution credits CP-042" || bad "attribution wrong: $CP"

echo "== 3. kyc: pending -> submitted -> verified + disclosure -> suitable =="
KID=$(curl -s $KYC/v1/kyc -H "Authorization: Bearer $TA" -H 'content-type: application/json' -d '{"partyId":"Asha"}' | jq_get ".id")
curl -s $KYC/v1/kyc/$KID/transition -H "Authorization: Bearer $TA" -H 'content-type: application/json' -d '{"to":"submitted"}' >/dev/null
curl -s $KYC/v1/kyc/$KID/transition -H "Authorization: Bearer $TA" -H 'content-type: application/json' -d '{"to":"verified"}' >/dev/null
curl -s $KYC/v1/kyc/$KID/disclosures -H "Authorization: Bearer $TA" -H 'content-type: application/json' -d '{"disclosure":"Risk disclosure v1"}' >/dev/null
SUIT=$(curl -s $KYC/v1/kyc/$KID/suitability -H "Authorization: Bearer $TA" | jq_get ".complete")
[ "$SUIT" = "true" ] && ok "suitability complete" || bad "suitability not complete: $SUIT"

echo "== 4. order: seed stock=10, order 2, then try to oversell 100 =="
curl -s $ORDER/v1/catalog -H "Authorization: Bearer $TA" -H 'content-type: application/json' \
  -d '{"sku":"OIL-1L","name":"Cooking Oil 1L","priceMinor":12000,"gstRate":0.05,"stock":10}' >/dev/null
ORD=$(curl -s $ORDER/v1/orders -H "Authorization: Bearer $TA" -H 'content-type: application/json' \
  -d '{"clientOrderId":"demo-c1","outletId":"outlet-1","currency":"INR","lines":[{"sku":"OIL-1L","qty":2}]}')
TOTAL=$(echo "$ORD" | jq_get ".totalMinor")
[ "$TOTAL" = "25200" ] && ok "order total incl. GST = 25200 paise" || bad "order total wrong: $TOTAL"

OVERSELL_CODE=$(curl -s -o /dev/null -w '%{http_code}' $ORDER/v1/orders -H "Authorization: Bearer $TA" -H 'content-type: application/json' \
  -d '{"clientOrderId":"demo-c2","outletId":"outlet-1","currency":"INR","lines":[{"sku":"OIL-1L","qty":100}]}')
[ "$OVERSELL_CODE" = "409" ] && ok "overselling rejected (HTTP 409)" || bad "oversell not blocked: HTTP $OVERSELL_CODE"

STOCK=$(curl -s $ORDER/v1/stock/OIL-1L -H "Authorization: Bearer $TA" | jq_get ".qty")
[ "$STOCK" = "8" ] && ok "stock correctly at 8 (rollback held)" || bad "stock wrong: $STOCK"

echo "== 5. isolation: tenant B cannot see tenant A's lead =="
B_RECS=$(curl -s $CORE/v1/records -H "Authorization: Bearer $TB")
echo "$B_RECS" | grep -q "$REC_ID" && bad "tenant B saw tenant A record!" || ok "tenant B isolated from tenant A"

echo "=================================="
echo "DEMO SMOKE: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] && echo "ALL DEMO CHECKS PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
