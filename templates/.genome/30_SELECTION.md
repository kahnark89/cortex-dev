# 30_SELECTION — [Project Name]

> **Protected file.** Do not modify without architect sign-off.
> This file carries the architect's decision heuristics and the Cortex autonomous action policy.
> AI sessions use this to make judgment calls when the phenotype doesn't give explicit direction.

---

## §1 Architect Decision Heuristics

*How the architect chooses between alternatives. State these as rules of thumb, not rigid laws.*

1.
2.
3.
4.
5.

---

## §2 Cortex Autonomous Action Policy

*Governs what the AI is trusted to do without human review. Compiled into `.cortex/policy.yml`.*
*Adjust thresholds to match your team's risk tolerance.*

```
GENOTYPE concepts:  block if confidence < 0.60; never auto-merge without human sign-off
SELECTION concepts: require review if confidence < 0.50
SHADOW concepts:    block always; architect override required
Neutral concepts:   auto-merge if confidence > 0.75 and tests pass
```

*Machine-readable form — `cortex check` and `cortex record` parse this block (delete a key to keep its default):*

```cortex-policy
{ "auto_merge": 0.70, "review": 0.40, "critical_block": 0.60, "gain": 0.25, "fail_decay": 0.6 }
```

---

## §3 Review Triggers

*Conditions that always require a human to look, regardless of confidence score.*

- Any change to authentication or authorization logic
- Any change to data retention or deletion behavior
- Any dependency upgrade in security-relevant packages
- Any change that modifies the CI/CD pipeline
