# Cortex + Animus Integration Guide

## Quick Install

```bash
npm install -g cortex-dev
npm install animus-sdk
```

Then scaffold both tools in your project:

```bash
cortex init --with-animus
```

Or individually:

```bash
cortex init          # creates .genome/ + AGENTS.md
animus init          # creates animus/agent.schema.json + appends to AGENTS.md
```

---

## Per-Call Pattern (TypeScript)

```typescript
import { execSync } from 'child_process';
import { Animus } from 'animus-sdk';

const agent = new Animus({
  schema: './animus/agent.schema.json',
  memory: './animus/agent.memory.json',
});

// 1. Build the context bundle (genome + comprehension + current mood)
const bundleJson = execSync('cortex context', { encoding: 'utf8' });
const bundle = JSON.parse(bundleJson);

// 2. Map comprehension state → agent events and advance state
execSync('cortex context | animus inject --from-cortex', { stdio: 'inherit' });
agent.load(); // reload memory after inject

// 3. Compile mood-line and inject into your system prompt
const moodLine = agent.compile();

const systemPrompt = `
${bundle.genome.focus ?? ''}

State: ${moodLine}
`.trim();

// 4. Call your LLM here with systemPrompt ...

// 5. After the response, advance state naturally
agent.tick();
agent.save();
```

---

## Data Flow

```
.genome/                cortex context
 GENOTYPE   ─────────┐       │
 PHENOTYPE  ─────────┤   CortexContextBundle (JSON stdout)
 EPIGENOME  ─────────┤       │
 SELECTION  ─────────┤       ▼
 SHADOW     ─────────┘  animus inject --from-cortex
                              │
                    AnimusEvent[] (confusion, delight …)
                              │
                              ▼
                    animus/agent.memory.json
                              │
                              ▼
                        agent.compile()
                              │
                              ▼
                    mood-line → system prompt
```

---

## `cortex context` JSON Reference

```jsonc
{
  "version": 1,
  "generatedAt": 1700000000000,        // epoch ms
  "genome": {
    "focus": "string | null",          // PHENOTYPE §1 current focus
    "openQuestions": ["..."],          // PHENOTYPE §3 bullet points
    "hasGenotype": true,
    "hasEpigenome": true,
    "hasShadow": false,
    "hasSelection": true
  },
  "comprehension": {
    "riskConcepts": [                  // concepts below their policy threshold
      { "concept": "auth/session", "criticality": "GENOTYPE", "score": 0.19 }
    ],
    "criticalConcepts": [...],         // all GENOTYPE concepts (regardless of score)
    "totalConcepts": 12,
    "overallHealth": "green"           // "green" | "yellow" | "red"
  },
  "animus": {
    "present": true,
    "moodLine": "Bright and joyful...",
    "schemaName": "my-agent"
  }
}
```

**`overallHealth` logic:**
- `red` — any GENOTYPE concept below threshold, or any SHADOW concept present in store
- `yellow` — any SELECTION or neutral concept below threshold
- `green` — all concepts at or above their thresholds

---

## Default Cortex → Animus Event Mapping

| Condition | Event | Intensity |
|---|---|---|
| 3+ open questions in PHENOTYPE §3 | `confusion` | 0.40 |
| Any GENOTYPE concept score < 0.40 | `confusion` | 0.30 |
| `overallHealth === 'green'` | `delight` | 0.20 |

Override the mapping:

```typescript
import { cortexToEvents } from 'animus-sdk';

const events = cortexToEvents(bundle, {
  multipleOpenQuestions: { threshold: 5, event: 'curiosity', intensity: 0.25 },
  overallHealthGreen:    { event: 'delight', intensity: 0.35 },
});
```

---

## Tuning Guide

### Homeostasis Rate (λ)

Controls how quickly variables return to baseline. Set in `agent.schema.json`:

```json
{ "homeostasis_rate": 0.08 }
```

| λ value | Behaviour |
|---|---|
| 0.02–0.05 | Slow recovery — events linger for many sessions |
| 0.08–0.12 | Moderate — default; recovers in ~15–25 ticks |
| 0.20+ | Fast — rebounds within a single session |

### Coupling

Variables can influence each other's baselines. Example: low `mood` drags down `energy`:

```json
{
  "coupling": {
    "energy": { "mood": 0.30, "curiosity": 0.25, "focus": 0.20 }
  }
}
```

The coupling term is: `κ × (src_value − src_baseline)` — only the *deviation* from baseline propagates.

### Circadian

Modulates `energy` baseline through the day using a cosine curve. `floor` prevents it falling below a minimum:

```json
{
  "circadian": {
    "peaks": ["09:00", "14:00"],
    "floor": 0.15
  }
}
```

Energy at time `t`: `floor + (baseline − floor) × max(cos(...peaks...))`

### Noise

Adds realistic micro-variation. `autocorrelation` makes noise drift slowly rather than jumping randomly:

```json
{
  "noise": { "magnitude": 0.02, "autocorrelation": 0.70 }
}
```

Set `magnitude: 0` for a deterministic agent.

---

## CI Integration

Run `cortex check` as a pre-merge gate to block PRs when comprehension of critical concepts falls below policy:

```yaml
# .github/workflows/cortex-check.yml
name: Cortex Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g cortex-dev
      - run: cortex check
        # exits 1 if GENOTYPE concepts are below threshold
```

Policy thresholds live in `.genome/30_SELECTION.md`:

```markdown
## Policy Thresholds
- GENOTYPE concepts must score above 0.60 before merge
- SELECTION concepts must score above 0.50 before merge
- Neutral concepts must score above 0.75 before merge
```

---

## Troubleshooting

**`cortex context` emits `"overallHealth": "red"` unexpectedly**
Check `cortex map` — it shows every tracked concept with its current score and threshold. A SHADOW concept in the confidence store always forces red.

**`animus inject` outputs "no events generated"**
The bundle has no open questions, no low-confidence GENOTYPE concepts, and health is not green. Fire a manual event to test: `node -e "require('./dist').events"` or use `animus simulate`.

**State drifts to extremes with large kicks**
Reduce event intensity in `DEFAULT_MAPPING` or your custom mapping. Kicks > 0.30 per variable per tick push quickly toward 0 or 1; homeostasis takes multiple ticks to recover.

**`cortex map` shows no concepts**
Run `cortex watch` in background while editing `.genome/` files, or use `cortex concept <path>` to manually register a file. Concept extraction requires at least one `## heading`, `**bold term**`, or `` `backtick` `` term in GENOTYPE or SELECTION.

**Build error: `dist/index.js not found`**
Run `npm run build` in both `cortex-dev` and `animus-sdk` before the first use. The CLI loads compiled output from `dist/` at runtime.
