#!/usr/bin/env bash
# Hardcoded-values guardrail — fails CI on new suspicious literals in
# feature folders.  Uses an explicit allowlist with a reason per entry.
#
# Usage:
#   scripts/check-hardcoded.sh
#   npm run lint:data   # (frontend only — wired in package.json)
#
# Exit codes:
#   0 — no new violations
#   1 — new violation found (printed with file:line + the literal)
#
# Extending the allowlist:
#   Append "<regex>,<reason>" to scripts/hardcoded-allowlist.txt.
#   The regex is matched against the file path + the matched literal's
#   surrounding context (so you can allow "812 listings" in
#   component-preview but flag it everywhere else).

set -euo pipefail

cd "$(dirname "$0")/.."

# The patterns we scan for.  Each pattern is a grep regex that matches
# a SUSPICIOUS literal — a digit run alongside a unit (counties, listings,
# %, KSh, v\d) or a verdict threshold.  False positives are filtered by
# the allowlist.
#
# Tuning principles:
# - Match on the literal + a nearby unit word so we don't flag every
#   "10" in pixel sizes / grid columns.
# - Keep the patterns conservative — false positives erode trust.
PATTERNS=(
    # Digit runs alongside "counties" / "listings" / "lst"
    '\b[0-9]+\s+(counties|listings|lst)\b'
    # KSh amounts (typed numbers)
    'KSh\s*[0-9]+'
    # Percentage thresholds that look like verdict cut-offs
    '1[0-9]\s*%\s*(below|above)'
    # Version strings that look like model versions
    '\bv[0-9]+\.[0-9]+\b'
    # The known literals from the audit
    '\b(47|812|118|540|154)\b'
    # The old FX rate
    '\b129\b'
    # The hard-coded Nairobi reference (only flagged in feature code,
    # not in the shared geo module's canonical constant)
    '(-1\.2921|36\.8219)'
    # Property-type enum violations (Residential / Industrial outside
    # the canonical Land / Farm / Commercial)
    '\b(Residential|Industrial)\b'
)

# Paths we scan — feature code on both sides.  Skips tests, mocks,
# node_modules, .venv, build artifacts.
SCAN_PATHS=(
    frontend/src/features
    frontend/src/app
    frontend/src/components
    frontend/src/lib
    backend/app
)

# Paths we explicitly skip (test fixtures, mocks, generated code, the
# canonical constants in geo.py / config.py).
SKIP_GLOBS=(
    '*/__tests__/*'
    '*.test.*'
    '*.spec.*'
    '*/test/*'
    '*/__mocks__/*'
    '*/node_modules/*'
    '*/.venv/*'
    '*/__pycache__/*'
    '*/dist/*'
    '*/component-preview/*'  # intentionally mock showcase
    '*/geo.py'                # canonical Nairobi reference constant
    '*/config.py'             # canonical FX default
    '*/format.ts'             # canonical FX fallback (clearly marked)
)

# Load the allowlist (regex + reason per line, comma-separated).
ALLOWLIST_FILE=scripts/hardcoded-allowlist.txt
if [[ ! -f "$ALLOWLIST_FILE" ]]; then
    echo "ERROR: allowlist file $ALLOWLIST_FILE not found" >&2
    exit 2
fi

# Build the grep args.
GREP_ARGS=(-rE -n)
for skip in "${SKIP_GLOBS[@]}"; do
    GREP_ARGS+=("--exclude-dir=$(basename "$skip")")
done
# Use --include to limit to source files.
for ext in ts tsx py; do
    GREP_ARGS+=("--include=*.$ext")
done

# Run the scan.
VIOLATIONS=0
for pattern in "${PATTERNS[@]}"; do
    while IFS= read -r line; do
        # line is "file:lineno:matched text"
        file=${line%%:*}
        rest=${line#*:}
        lineno=${rest%%:*}
        matched=${rest#*:}
        # Check skip globs against the file path.
        skip=0
        for glob in "${SKIP_GLOBS[@]}"; do
            case "$file" in
                *$(basename "$glob")*) skip=1; break ;;
            esac
        done
        [[ $skip -eq 1 ]] && continue
        # Check the allowlist.
        allowed=0
        while IFS=, read -r areason aregex; do
            # Allowlist format: "regex,reason" — match the regex against
            # the file path + the matched text.
            if [[ "$file $matched" =~ $aregex ]]; then
                allowed=1
                break
            fi
        done < "$ALLOWLIST_FILE"
        if [[ $allowed -eq 0 ]]; then
            echo "VIOLATION: $file:$lineno  matched: $matched"
            VIOLATIONS=$((VIOLATIONS + 1))
        fi
    done < <(grep "${GREP_ARGS[@]}" "${SCAN_PATHS[@]}" -- "$pattern" 2>/dev/null || true)
done

if [[ $VIOLATIONS -gt 0 ]]; then
    echo ""
    echo "Found $VIOLATIONS hardcoded-value violation(s)."
    echo "If these are intentional, add an entry to scripts/hardcoded-allowlist.txt"
    echo "with the regex + a reason.  Otherwise, fix the code to derive the value"
    echo "from data or an endpoint."
    exit 1
fi

echo "No hardcoded-value violations."
exit 0
