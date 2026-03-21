# Product

## Purpose

Product Researcher is an agentic system that continuously performs web research to surface product opportunities. Starting from seed ideas — an initial product hypothesis, a trend observation, a market question — it builds and maintains a structured knowledge graph of observations, hypotheses, pain points, existing solutions, and product plans. Outputs are intended to feed a downstream agentic coding system that turns validated product plans into running software and observes real-world responses.

The system models: reported and inferred user needs, pain points, existing solutions and their strengths/weaknesses, business models and commercial prospects of competitors, market size, segmentation, and positioning.

---

## Success Conditions

### Seed research cycle

**We will know this is working when:**
- A seed idea submitted by the user results in at least 10 research nodes being created within one agent run
- The knowledge graph contains at least one node of each type: `observation`, `hypothesis`, `pain_point`, `existing_solution`
- Agent runs complete without error for ≥ 95% of submissions

**Telemetry spec:**

| Event | Trigger | Required properties |
|-------|---------|-------------------|
| `research.run.started` | Agent run begins | `seed_id`, `model`, `run_id` |
| `research.run.completed` | Agent run finishes | `seed_id`, `run_id`, `node_count`, `duration_ms` |
| `research.run.failed` | Agent run errors | `seed_id`, `run_id`, `error_type` |
| `research.node.created` | A node is added to the graph | `seed_id`, `run_id`, `node_type` |

**Success condition queries (HogQL):**

```sql
-- Node creation rate per run
SELECT avg(properties.node_count) AS avg_nodes_per_run
FROM events
WHERE event = 'research.run.completed'
  AND timestamp >= now() - interval 30 day
-- target: 10
```

```sql
-- Agent run success rate
SELECT countIf(event = 'research.run.completed') /
       countIf(event = 'research.run.started') AS success_rate
FROM events
WHERE timestamp >= now() - interval 30 day
-- target: 0.95
```

**Validation status:** not yet deployed

---

### Knowledge graph quality

**We will know this is working when:**
- ≥ 80% of completed runs produce nodes of at least 3 distinct types
- Users rate research outputs ≥ 4/5 on relevance (once rating UI exists)

**Telemetry spec:**

| Event | Trigger | Required properties |
|-------|---------|-------------------|
| `research.graph.reviewed` | User views a seed's graph | `seed_id`, `node_count`, `edge_count` |

**Validation status:** not yet deployed

---

## Notes

- The downstream coding agent that consumes product plans is out of scope for this product's success conditions — we measure what this system produces, not what consumers do with it.
- LLM provider is configurable per run; success conditions are provider-agnostic.
- Gate 5 of release readiness (measurement readiness) cannot pass without these success conditions being emitted and queryable.
