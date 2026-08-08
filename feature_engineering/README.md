# OIPulse feature engineering

Python workspace for turning Trending OI snapshots into LLM-ready features.

## Setup

```bash
cd feature_engineering
source .venv/bin/activate   # already created via uv
# or recreate: uv sync
uv run jupyter lab
```

## Key files

| Path | Purpose |
| --- | --- |
| `feature_engineering_plan.md` | Feature roadmap (start here) |
| `notebooks/01_explore_and_tier_a.ipynb` | Exploration + Tier A scaffold |
| `src/` | Promote stable feature code here next |

Snapshots live in `../data/snapshots/`.