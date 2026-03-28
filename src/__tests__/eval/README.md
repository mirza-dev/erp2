# Eval Test Suite

Structural regression tests for all 5 AI capabilities. When a model or prompt changes, run this suite to detect behavioral regressions without comparing exact text.

## Purpose

- Catch regressions when the model, prompt, or parsing logic changes
- Verify schema, category values, confidence ranges, and array bounds
- No exact wording checks — structure and behavior only
- No real API calls — all AI responses are mocked with golden fixtures

## Running the eval suite

```sh
# Run all eval tests only
npx vitest run src/__tests__/eval/

# Run the full test suite (eval + all other tests)
npx vitest run
```

## Adding a new fixture scenario

1. **Add input rows and golden response** to the relevant fixture file:
   - `src/__tests__/fixtures/import-fixtures.ts` — customer/product/order batch parse
   - `src/__tests__/fixtures/order-risk-fixtures.ts` — order scoring
   - `src/__tests__/fixtures/ops-summary-fixtures.ts` — ops summary
   - `src/__tests__/fixtures/purchase-fixtures.ts` — purchase enrichment

2. **Add the scenario to `ALL_*_SCENARIOS`** at the bottom of the fixture file with:
   - `label`: human-readable name (shown in test output)
   - `goldenResponse`: what a well-behaved model returns for this input
   - `expected`: structural assertions (confidence range, categories, array bounds)

3. **Re-export** the new golden from `golden-responses.ts` if needed.

4. **Run** `npx vitest run src/__tests__/eval/` — the parametric runner will pick it up automatically.

## Fixture schema

```typescript
// Import scenarios
interface ImportFixtureScenario {
    label: string;
    entity_type: "customer" | "product" | "order";
    rows: Array<Record<string, string>>;
    goldenResponse: string;           // JSON string: { items: [...] }
    expected: {
        minConfidence: number;        // 0–1
        requiredParsedKeys: string[]; // must exist in parsed_data
        maxUnmatchedCount: number;    // upper bound on unmatched_fields.length
    };
}

// Order risk scenarios
interface OrderRiskScenario {
    label: string;
    order: OrderRiskFixtureOrder;
    goldenResponse: string;           // "CONFIDENCE: X\nRISK_LEVEL: y\nREASON: ..."
    expected: {
        risk_level: "low" | "medium" | "high";
        minConfidence: number;
        maxConfidence: number;
    };
}

// Ops summary scenarios
interface OpsScenario {
    label: string;
    metrics: OpsSummaryInput;
    goldenResponse: string;           // JSON string: { summary, insights, anomalies }
    expected: {
        minInsights: number;
        maxInsights: number;
        minAnomalies: number;
        maxAnomalies: number;
        minSummaryLength: number;     // characters
    };
}

// Purchase copilot scenarios
interface PurchaseScenario {
    label: string;
    items: PurchaseSuggestionItem[];
    goldenResponse: string;           // JSON string: { enrichments: [...] }
    expected: {
        urgencyLevel: "critical" | "high" | "moderate";
        minConfidence: number;
        maxConfidence: number;
    };
}
```

## Design principles

- **Structural scoring, not exact text** — tests check schema, enum values, numeric ranges, and array lengths. Never compare `summary === "exact string"`.
- **Golden responses are realistic** — they simulate a well-behaved model output, not an ideal one. Update goldens when prompt behavior deliberately changes.
- **No real API in CI** — `ANTHROPIC_API_KEY` is not required. All AI calls are intercepted by `mockCreate`.
- **Universal degradation** — `ALL_UNIVERSAL_FAILURES` in `golden-responses.ts` covers 5 error conditions (garbled, empty JSON, malformed, HTML, empty) that every capability must survive without throwing.

## When to update golden responses

Update a golden response when:
- A prompt change intentionally changes the output format
- A new field is added to the response schema
- The urgency/risk classification logic changes

Do **not** update goldens to match random wording differences — that defeats the purpose.
