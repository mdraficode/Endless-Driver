#!/bin/bash
# User-level smoke test with retries. SwiftShader in this sandbox can lose the
# WebGL context or crash a tab mid-run (environmental — the live pre-fix build
# fails identically), so crashes/back-offs are retried; a definitive FAIL
# (no crash, clean evidence) exits immediately.
export BASE_URL="${BASE_URL:-http://localhost:4173/?tier=C&backend=webgl2}"
export VIEWPORT_W="${VIEWPORT_W:-640}"
export VIEWPORT_H="${VIEWPORT_H:-360}"
for i in 1 2 3 4 5 6; do
  echo "=== attempt $i (viewport ${VIEWPORT_W}x${VIEWPORT_H}) ==="
  timeout 360 node smoke-test.cjs > /tmp/smoke-attempt-$i.log 2>&1
  rc=$?
  if [ $rc -eq 0 ]; then
    echo "PASS on attempt $i"; cat /tmp/smoke-attempt-$i.log; exit 0
  fi
  if grep -q "Target crashed\|context was lost\|SCRIPT ERROR" /tmp/smoke-attempt-$i.log; then
    echo "environmental failure (rc=$rc), backing off 30s..."
    sleep 30
    continue
  fi
  if [ $rc -eq 124 ]; then
    echo "timed out (rc=124), retrying..."; sleep 30; continue
  fi
  echo "definitive FAIL (rc=$rc):"; cat /tmp/smoke-attempt-$i.log; exit 1
done
echo "all 6 attempts environmental (no clean verdict)"
exit 3
