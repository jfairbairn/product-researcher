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

