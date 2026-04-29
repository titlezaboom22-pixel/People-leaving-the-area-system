#!/bin/bash
# Test script - ยิง webhook ครบทุกประเภทเอกสาร
# Usage: bash test-all-types.sh [WEBHOOK_URL]

WEBHOOK_URL="${1:-http://localhost:5678/webhook/soc-new-approval}"

echo "🧪 Testing n8n webhook: $WEBHOOK_URL"
echo "=============================================="

DOC_TYPES=("vehicle" "outing" "goods" "visitor" "drink" "food")
EMOJIS=("🚗" "🚶" "📦" "👤" "☕" "🍱")

for i in "${!DOC_TYPES[@]}"; do
  TYPE="${DOC_TYPES[$i]}"
  EMOJI="${EMOJIS[$i]}"

  echo ""
  echo "$EMOJI Testing: $TYPE"
  echo "-----------------------------------------------"

  curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"documentId\": \"WF-TEST-$TYPE-$(date +%s)\",
      \"documentType\": \"$TYPE\",
      \"requesterName\": \"ทดสอบ $TYPE\",
      \"requesterDept\": \"EEE\",
      \"requesterEmail\": \"test@example.com\",
      \"approverEmail\": \"approver@example.com\",
      \"approveUrl\": \"https://tbkk-system.web.app/approve?id=test\",
      \"details\": \"Test payload for $TYPE\"
    }"
  echo ""
  sleep 1
done

echo ""
echo "✅ Test complete - check n8n Executions tab"
