# Product Researcher — Roadmap

## Current State

A single-agent research loop: one pi process per run, one prompt, file system as shared state. The agent searches the web, reads pages, creates typed nodes, and updates a living index. Works well for breadth. Has structural weaknesses in rigor.

---

## Feature: Multi-Agent Review Loop

### Motivation

The single-agent loop has four structural blind spots:

1. **Confirmation bias** — the agent builds on its own prior nodes, deepening grooves rather than challenging them. In practice, the local-agentic-workflows seed ran 8 times before the core premise collapsed. A counterpoint agent in run 2 would likely have caught it.

2. **Self-assigned confidence** — confidence scores are set by the same agent that wrote the node. No external calibration. An agent that just constructed a hypothesis rates its own certainty.

3. **Weak falsification** — the system finds evidence *for* hypotheses well. It rarely actively seeks disconfirming evidence. The PS6 Compute SKU conjecture required a dedicated research run to debunk; it should have been challenged when created.

4. **Product plans inherit bad assumptions** — if research is wrong, the product plan is confidently wrong. No adversarial layer sits between research output and strategic recommendation.

---

### Design

#### New Node Types

Two new types join the existing schema:

**`review`** — written by a review agent against a specific node.

```yaml
---
id: rev-hyp-005-001
type: review
seed: console-llm-scalping
target: hyp-005          # the node being reviewed
review_type: assumption  # assumption | counterpoint | logic | failure_mode
created: 2026-03-22
reviewer: assumption-checker
verdict: challenged      # approved | challenged | blocked
confidence_adjustment: -0.15  # suggested delta to target node's confidence
---

Body: The claim that Magnus achieves 15-18 t/s for 70B Q4 assumes 82-88% GDDR7 
efficiency. This figure is extrapolated from LPDDR5x Strix Halo data at 84% 
efficiency. No GDDR7 LLM benchmark data exists. The efficiency assumption should 
be flagged as unvalidated until GDDR7 hardware is available.
```

**`rebuttal`** — written by the primary agent in response to a review.

```yaml
---
id: reb-hyp-005-001
type: rebuttal
seed: console-llm-scalping
target_review: rev-hyp-005-001
created: 2026-03-22
resolution: accepted | rejected | partial
confidence_adjustment_accepted: -0.10
---

Body: Accepted in part. Revised efficiency assumption from 82-88% to 70-80% 
(conservative). Updated hyp-005 confidence from 0.70 to 0.60. The GDDR7 
efficiency gap vs LPDDR5x is a real unknown.
```

#### New Tool: `create_review`

Registers in the pi extension alongside `create_node`:

```typescript
pi.registerTool({
  name: 'create_review',
  label: 'Create Review',
  description: 'Write a review of an existing node — assumption check, counterpoint, logic check, or failure mode analysis.',
  parameters: Type.Object({
    seed: Type.String(),
    target: Type.String({ description: 'Node id being reviewed, e.g. hyp-005' }),
    review_type: Type.Union([
      Type.Literal('assumption'),
      Type.Literal('counterpoint'),
      Type.Literal('logic'),
      Type.Literal('failure_mode'),
    ]),
    verdict: Type.Union([
      Type.Literal('approved'),
      Type.Literal('challenged'),
      Type.Literal('blocked'),
    ]),
    confidence_adjustment: Type.Optional(Type.Number({ description: 'Suggested delta to target confidence, e.g. -0.15' })),
    content: Type.String({ description: 'Review body text' }),
  }),
  async execute(_id, params) {
    await createReview(params, seedsDir)
    return { content: [{ type: 'text', text: `Review of '${params.target}' created.` }], details: {} }
  },
})
```

Writes to: `seeds/{slug}/reviews/{target-id}-{review-type}-{n}.md`

#### New Tool: `query_reviews`

```typescript
pi.registerTool({
  name: 'query_reviews',
  label: 'Query Reviews',
  description: 'Read pending reviews for a node or all unresolved reviews in a seed.',
  parameters: Type.Object({
    seed: Type.String(),
    target: Type.Optional(Type.String({ description: 'Filter to reviews of a specific node' })),
    verdict: Type.Optional(Type.String({ description: 'Filter by verdict: challenged | blocked | approved' })),
  }),
  // ...
})
```

#### New Command: `/review`

```typescript
pi.registerCommand('review', {
  description: 'Run a review pass on a node or all unreviewed nodes in a seed: /review <seed> [node-id]',
  handler: async (args, ctx) => {
    // Reads the target node(s), loads the appropriate reviewer prompt,
    // and asks the model to produce create_review calls
  },
})
```

---

### The Four Review Agents

Each is a distinct system prompt injected when `/review` is called with a `--role` flag (or auto-selected by node type).

#### 1. Assumption Checker

**Trigger:** Any hypothesis, conjecture, or product plan node.

**System prompt framing:**
> You are a rigorous assumption checker. You have been given a research node. Your job is not to disprove it — it may be entirely correct. Your job is to identify every assumption embedded in the claim and ask: what would have to be true for this assumption to be wrong? For each assumption, determine whether it has been validated by the research or is simply asserted. Flag unvalidated assumptions as challenged. Produce a create_review call with review_type: assumption.

**What it catches:** Efficiency extrapolations, market size estimates stated as fact, analogies assumed to hold, absence-of-evidence treated as evidence-of-absence.

#### 2. Devil's Advocate (Counterpoint)

**Trigger:** Hypotheses and conjectures with confidence > 0.65.

**System prompt framing:**
> You are a devil's advocate. You have been given a hypothesis. Produce the strongest possible case against it — not a weak objection, but the most uncomfortable version of the counter-argument. You are not trying to disprove it. You are trying to force the researcher to confront the best case for being wrong. Produce a create_review call with review_type: counterpoint. If the counterpoint is strong enough to materially reduce confidence, set verdict: challenged. If you cannot construct a compelling counterpoint, set verdict: approved.

**What it catches:** Overconfident hypotheses, false analogies (PS3 OtherOS ≠ PS6 Open Tier), market assumptions that haven't survived scrutiny.

#### 3. Product Plan Adversary

**Trigger:** Any product_plan node.

**System prompt framing:**
> You are a product plan adversary. You have been given a product plan. Your job is to find the fastest path to failure. Specifically: (1) What does the customer say no to, and why? (2) What assumption in this plan, if wrong, kills the business? (3) What does the competitive response look like in 12 months? (4) What does this look like at 10x scale — does the model break? Produce a create_review call with review_type: failure_mode. This is not meant to stop the plan — it is meant to harden it.

**What it catches:** Unvalidated willingness-to-pay, operator monetisation models that assume operator cooperation, timing dependencies.

#### 4. Logic Checker

**Trigger:** Conjectures specifically (where inference chains are most explicit).

**System prompt framing:**
> You are a logic checker. You have been given a conjecture. Identify the explicit inference chain: what premises lead to the conclusion? Is the conclusion deductively valid from the premises, or is there a gap? Are there confounds — alternative explanations for the same evidence? Produce a create_review call with review_type: logic.

**What it catches:** Non-sequiturs, correlation-causation confusions, missing middle steps.

---

### Sequence

```
Primary agent research run
  → creates obs/hyp/con/product_plan nodes as today
  
After run completes:
  → /review <seed>            # reviews all new unreviewed nodes
  
  For each unreviewed hypothesis/conjecture:
    → assumption-checker fires
    → if confidence > 0.65: devil's advocate fires
    → primary agent reads reviews, writes rebuttals, adjusts confidence
    
  For each new product_plan:
    → product_plan-adversary fires
    → failure_mode analysis written to reviews/
    → primary agent writes rebuttal + optionally updates plan
    
  For each new conjecture:
    → logic-checker fires
    → primary agent responds
```

The review loop runs **after** the research run, not during. This keeps the research fast and the review disciplined.

---

### What Doesn't Change

- The file-based knowledge graph (seeds/{slug}/**/*.md) stays unchanged
- Existing node types (observation, hypothesis, conjecture, pain_point, existing_solution, product_plan, validation_strategy) are unchanged
- Tests in tests/ are unchanged
- The extension entry point loads the new tools alongside existing ones

---

### Cross-Seed Synthesis (Future)

A separate, lower-priority feature: a `/synthesise` command that reads across all seeds and surfaces cross-seed connections. Connections like "the frontier pricing revival conjecture in local-agentic-workflows directly informs the 2028 trajectory in autonomous-product-development" should be surfaced by the system, not only in human conversation.

Implementation: reads all _index.md files, asks the model to find non-obvious connections, writes cross-seed observation nodes with a `cross_seed: true` flag.

---

### BDD Success Criteria

**We will know this is working when:**
- A hypothesis that was wrong in the original research loop gets a `verdict: challenged` review within the same session
- Product plans have a corresponding failure_mode review node before they're considered final
- Confidence scores on reviewed hypotheses are meaningfully different from (lower than) self-assigned scores on unreviewed ones
- The assumption-checker catches at least one factual error per seed that the primary agent missed

**We will know it's not working when:**
- Reviews are consistently `verdict: approved` (rubber-stamping)
- Reviews are consistently `verdict: blocked` with no rebuttals (adversary is too aggressive)
- The review loop takes longer than the research loop (cost-benefit breaks)

---

### Implementation Order

1. Add `reviews/` directory to seed structure (trivial — just mkdir)
2. Add `createReview` function to src/tools/graph.ts
3. Add `queryReviews` function to src/tools/graph.ts
4. Register `create_review` and `query_reviews` tools in src/extension.ts
5. Add `/review` command to src/extension.ts
6. Write tests in tests/tools/graph.test.ts for createReview/queryReviews
7. Run BDD: npm test → red → implement → green
8. Test manually: `/review console-llm-scalping hyp-016` should produce a well-formed assumption check


---

## Feature: Additional Node Types

### Motivation

The current seven node types (observation, hypothesis, conjecture, pain_point, existing_solution, validation_strategy, product_plan) leave gaps that have caused research quality issues across multiple seeds. Four additional types would address the most important gaps.

---

### `assumption`

**What it is:** A premise that an hypothesis, conjecture, or product plan *depends on* being true, which has not itself been validated. Different from a hypothesis (a testable claim about the world) and a conjecture (a speculative idea). An assumption is something the plan silently requires.

**Why it matters:** The most common research failure mode in these runs was unvalidated assumptions being treated as facts — "historical pattern = future constraint," fabricated cost economics presented as conclusions, efficiency extrapolations stated without measurement. Making assumptions explicit and typed is the single highest-impact change for research rigor.

**Schema:**
```yaml
---
id: asm-001
type: assumption
seed: console-llm-scalping
created: 2026-03-22
confidence: 0.50          # confidence that the assumption is correct
risk: high                # high | medium | low — if wrong, what happens?
links:
  - underlies: "[[hyp-010]]"    # which node depends on this assumption
  - would_invalidate: "[[pp-sony-002]]"
---

Body: Sony's 30% software take rate is the primary barrier to platform openness. 
This assumes the take rate is structurally non-negotiable — that losing it would 
destroy SIE's business model. Not validated against alternative revenue scenarios.
```

**Connection to review loop:** The assumption checker in ROADMAP.md's review loop would produce `assumption` nodes, not `review` nodes. This makes assumptions first-class rather than buried in review comments.

---

### `persona`

**What it is:** A defined buyer or user segment with structured characteristics. Currently personas get distributed across pain_point nodes and product_plan prose, making them hard to reference, compare, or validate.

**Why it matters:** As seeds move to product planning, the buyer definition is load-bearing. A typed persona enables: "which seeds share the same ICP?", "what pain points does this persona have across seeds?", "has this persona been validated by real user research?"

**Schema:**
```yaml
---
id: persona-001
type: persona
seed: ai-subscription-audit
created: 2026-03-22
confidence: 0.80
links:
  - experiences: "[[pp-001]]"     # pain points this persona has
  - addressed_by: "[[plan-final]]"
---

## Individual Developer: Power AI Subscriber

**Job:** Software developer or technical knowledge worker
**Stack:** Claude Pro + Cursor Pro + ChatGPT Plus + Perplexity (~$90-109/month)
**Pain:** Paying for AI subscriptions that partially replace each other; unclear which to keep
**Motivation:** Reduce bill without losing capability; understands local AI but hasn't committed
**WTP:** Would pay $0 for a calculator; would pay $599-1,200 for hardware with 15-month payback
**Where they are:** r/LocalLLaMA, HN, r/ChatGPT
**Validated by:** obs-021, obs-022 (HN testimonials), obs-004 (658k r/LocalLLaMA members)
```

---

### `risk`

**What it is:** A specific thing that could go wrong, with assessed probability and severity. Currently risks live in product_plan prose and are invisible to the review loop.

**Why it matters:** Making risks typed nodes allows: querying "top risks across all seeds", targeting the product plan adversary review at specific risks, tracking whether risks have been mitigated over time.

**Schema:**
```yaml
---
id: risk-001
type: risk
seed: open-audio-platform
created: 2026-03-22
probability: 0.40         # 0-1
severity: high            # critical | high | medium | low
status: open              # open | mitigated | accepted | closed
links:
  - threatens: "[[pp-003]]"
  - mitigated_by: "[[val-001]]"
---

USB audio latency exceeds ≤2ms target at 64 samples @ 48kHz. USB protocol overhead 
(~1-2ms) makes this target unreachable without I2S carrier board. If USB-only MVP 
ships and latency is unacceptable to live performers, early reviews will damage 
platform credibility before the production I2S path is ready.

Mitigation: Prototype before campaign. jack_delay benchmark on N100 + USB interface 
for $200. If >4ms, ship with "studio/practice use" positioning only; delay live 
performance claims to I2S carrier production release.
```

---

### `market_signal`

**What it is:** A piece of evidence about market dynamics — leading indicators, community size, growth rates, competitor moves — that has a different epistemic character from a factual observation. Not confirmed facts about the product opportunity, but signals that the opportunity may be real.

**Why it matters:** Currently market signals get lumped into observations, diluting the confidence calibration. A QuitGPT signup count and a confirmed hardware spec are both obs nodes but should be treated very differently.

**Schema:**
```yaml
---
id: sig-001
type: market_signal
seed: ai-subscription-audit
created: 2026-03-22
confidence: 0.75          # confidence in the signal's validity
signal_type: community_growth | pricing_change | competitor_move | adoption_data
links:
  - supports: "[[hyp-011]]"
---

r/LocalLLaMA: 658,000 members as of March 2026, +330,000 in prior year (100% annual 
growth). Primary community for local LLM users. Direct audience for the calculator.
Source: reddit.com/r/LocalLLaMA, March 2026.
```

---

### Implementation Order

1. Add `assumption`, `persona`, `risk`, `market_signal` to `NODE_TYPES` array in `src/extension.ts`
2. Update `create_node` tool description to include the four new types with one-line descriptions
3. Update `/research` command prompt to include the four new types in the instructions
4. Write tests for the new types in `tests/tools/graph.test.ts` (BDD: red → green)
5. Run `npm test` — should pass for all new types with no production code changes (they're just string literals in the union)

The new types require no schema changes beyond the existing frontmatter — `confidence`, `links`, `source_url` all apply. The `risk` type benefits from two additional optional fields (`probability`, `severity`) and `market_signal` benefits from `signal_type`, but these are optional and can be added as free-form content initially.

**Priority:** `assumption` first (highest research quality impact, directly enables the review loop), then `persona` (enables better product plan cross-referencing), then `risk` and `market_signal` as time allows.
