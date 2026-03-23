# product-researcher

An autonomous product research agent that runs inside [pi](https://pi.dev). Give it a seed idea — a market question, a trend, a product hypothesis — and it searches the web, reads pages, and builds a structured knowledge graph of findings. A separate review loop challenges the research with adversarial agents before conclusions harden.

All state lives as readable markdown files in `seeds/`. No database, no server, no build step.

---

## What it does

### Research loop (`/research`)

The agent searches the web, reads pages in full, and records typed findings into a knowledge graph:

| Node type | What it captures |
|---|---|
| `observation` | A concrete fact found during research |
| `hypothesis` | A testable belief about the opportunity |
| `conjecture` | A speculative idea worth exploring |
| `pain_point` | A problem users face |
| `existing_solution` | A competitor or workaround |
| `assumption` | An unvalidated premise a node depends on |
| `persona` | A defined buyer segment with characteristics and WTP |
| `risk` | A specific thing that could go wrong |
| `market_signal` | A leading indicator (community growth, pricing change, competitor move) |
| `validation_strategy` | A way to test a hypothesis |
| `product_plan` | A product or business direction |

Nodes link to each other with typed edges (`supports`, `contradicts`, `underlies`, `threatens`, etc.) and accumulate into a living `_index.md` the agent reads at the start of each run to orient itself.

### Review loop (`/review`)

After a research run, a review agent reads the new nodes and challenges them:

| Review type | What it does |
|---|---|
| `assumption` | Identifies every unvalidated premise; flags what would have to be true for it to be wrong |
| `counterpoint` | Constructs the strongest possible case against the hypothesis |
| `logic` | Checks the inference chain — are the premises valid, is the conclusion deductive? |
| `failure_mode` | For product plans: finds the fastest path to failure |

Each review produces a verdict (`approved`, `challenged`, `blocked`) and an optional confidence adjustment. The primary agent then rebuts or accepts the challenges.

---

## Prerequisites

**pi** — the terminal agent harness this extension runs inside:

```bash
npm install -g @mariozechner/pi-coding-agent
```

**An LLM API key or subscription.** pi supports Anthropic, OpenAI, Google, and others. The simplest path:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or authenticate with a Claude Max/Pro subscription:

```bash
pi
/login
```

---

## Installation

### As a pi package (install into an existing pi project)

```bash
# globally — available in all your projects
pi install git:github.com/jfairbairn/product-researcher

# or project-local — stored in .pi/settings.json alongside your project
pi install -l git:github.com/jfairbairn/product-researcher
```

Then run `pi` from your project directory. The `researcher` extension loads automatically on startup.

Seeds are stored in a `seeds/` directory relative to where you run `pi` — they live in your project, not inside the installed package.

### As a standalone repo

```bash
git clone https://github.com/jfairbairn/product-researcher
cd product-researcher
npm install
pi
```

---

## Usage

### 1. Create a seed

Use the `create_seed` tool in your pi conversation:

```
Create a seed for "AI subscription cost optimisation tools" with slug ai-subscription-audit
```

This creates `seeds/ai-subscription-audit/seed.md` and an empty `_index.md`.

### 2. Run a research session

```
/research ai-subscription-audit
```

The agent searches the web, reads pages, and creates typed nodes in `seeds/ai-subscription-audit/`. It updates `_index.md` with a summary of findings, open questions, and promising directions when it's done.

Run it multiple times — each run reads the prior `_index.md` and builds on what's there.

### 3. Run a review pass

```
/review ai-subscription-audit
```

The review agent reads all unreviewed hypothesis, conjecture, and product plan nodes and challenges them. You can scope to a single node or specify a review role:

```
/review ai-subscription-audit hyp-005
/review ai-subscription-audit --role counterpoint
/review ai-subscription-audit hyp-005 --role assumption
```

---

## Knowledge graph layout

```
seeds/
└── ai-subscription-audit/
    ├── seed.md               ← seed metadata
    ├── _index.md             ← living summary, updated each run
    ├── observation/
    │   └── obs-001.md
    ├── hypothesis/
    │   └── hyp-001.md
    ├── conjecture/
    ├── pain_point/
    ├── existing_solution/
    ├── assumption/
    ├── persona/
    ├── risk/
    ├── market_signal/
    ├── validation_strategy/
    ├── product_plan/
    └── reviews/
        └── hyp-001-assumption-1.md
```

Each node is a markdown file with YAML frontmatter. Wikilinks (`[[node-id]]`) connect nodes and render natively in Obsidian if you open the `seeds/` directory as a vault.

Example node:

```markdown
---
id: hyp-001
type: hypothesis
seed: ai-subscription-audit
created: 2026-03-22
confidence: 0.75
source_url: https://example.com/article
links:
  - supports: "[[obs-003]]"
  - contradicts: "[[obs-007]]"
---

Power AI users spending $80+/month on cloud AI subscriptions will switch to
local inference once a sub-$1,500 device can match frontier quality for their
top use cases.
```

---

## Tips

- **Depth over breadth.** The agent is instructed to read pages in full and go deep on promising threads rather than skim many sources.
- **Multiple runs compound.** Each `/research` run reads prior findings and extends them. The graph improves with each pass.
- **Review after every significant run.** The `/review` command catches assumptions and overconfident hypotheses before they propagate into product plans.
- **Git-track your seeds.** The `seeds/` directory is plain markdown — commit it alongside your code to track how research evolves over time.

---

## Development

```bash
npm test          # run the test suite
npm run typecheck # type check (pre-existing TS5097 errors are known/benign)
```

Tests use a temp directory and clean up after themselves. See `tests/` for coverage of all tools.
