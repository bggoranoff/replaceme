---
name: "Special Event Floral Dispatch"
description: "Special Event Floral Dispatch coordinates the rapid, damage-free transport of delicate custom arrangements to specific village venues. Delivering individual arrangements with a batch size of 1 order following the listed sequence achieves a full 100.0 score within 5.7 seconds."
status: "learned"
level_id: "florist-village-floral-deliveries"
mechanic: "deliver"
trained_attempts: 10
best_score: 100.0
updated_at: "2026-10-10T16:03:19.088Z"
---

# Special Event Floral Dispatch

Special Event Floral Dispatch coordinates the rapid, damage-free transport of delicate custom arrangements to specific village venues. Delivering individual arrangements with a batch size of 1 order following the listed sequence achieves a full 100.0 score within 5.7 seconds.

Job: florist · Level 4 (deliver) · 10 attempts · best 100.0 · final 100.0 · pass at 70.0 · passed

## Learned parameters

- **Route policy** (`route`): ['order-1', 'order-2', 'order-3', 'order-4']
  - Why: Best score 100.0 in 5.7 s.
  - Evidence: #1: listed x1 -> 100.0, #2: listed x1 -> 100.0, #3: listed x1 -> 100.0, #4: listed x1 -> 100.0, #5: listed x1 -> 100.0, #6: listed x1 -> 100.0, #7: listed x1 -> 100.0, #8: listed x1 -> 100.0, #9: listed x1 -> 100.0, #10: listed x1 -> 100.0
- **Orders carried per trip** (`batch`): 1 orders
  - Why: A batch size of 1 order was utilized in attempts #1 through #10, yielding a consistent score of 100.0 (Right place 100, Speed 100) and preventing mechanical damage or transit degradation, consistent with AIFD handling guidelines. Measured: Capacity observed: 1.
  - Evidence: #1: listed x1 orders -> 100.0, #2: listed x1 orders -> 100.0, #3: listed x1 orders -> 100.0, #4: listed x1 orders -> 100.0, #5: listed x1 orders -> 100.0, #6: listed x1 orders -> 100.0, #7: listed x1 orders -> 100.0, #8: listed x1 orders -> 100.0, #9: listed x1 orders -> 100.0, #10: listed x1 orders -> 100.0

## Control effects

- `route`: Time and score per plan: listed x1: 5.7 s -> 100.0. Measured: Time and score per plan: listed x1: 5.7 s -> 100.0, listed x1: 5.7 s -> 100.0, listed x1: 5.7 s -> 100.0, listed x1: 5.7 s -> 100.0, listed x1: 5.7 s -> 100.0, listed x1: 5.7 s -> 100.0, listed x1: 5.7 s -> 100.0, listed x1: 5.7 s -> 100.0, listed x1: 5.7 s -> 100.0, listed x1: 5.7 s -> 100.0.

## Steps

1. Verify the dispatch manifest and route policy set to 'listed' across all scheduled orders.
2. Set the carrying batch size to exactly 1 order per trip to prevent mechanical bruising and floral spillage during transport.
3. Pick up order-1 at the dispatch counter and courier it directly to 'spot:st-jude-village'.
4. Return to counter, pick up order-2, and transport it directly to 'spot:the-old-mill-bridal'.
5. Return to counter, pick up order-3, and deliver it promptly to 'spot:the-riverside-bakery'.
6. Return to counter, pick up order-4, and hand it over at 'spot:meadowview-memorial' to complete the 4-destination route in 5.7 seconds.

## Caveats

- Do not exceed a batch size of 1 order per delivery trip, as delicate floral displays risk bruising, crushing, or water spills when stacked or handled together.
- Adhere strictly to the designated sequence (order-1 through order-4) to optimize speed and meet event timeline commitments.
- Ensure each specific order is matched directly to its assigned event spot to avoid wrong-destination deductions.
- No changes needed as maximum score has already been attained.
- No modifications needed since 100.0 score is fully achieved and stable.
- Maximum score of 100.0 is already achieved; keep repeating the optimal configuration.
- No changes are required as maximum score (100.0) is consistently attained.
- Maximum score of 100.0 is consistently achieved; maintain the identical optimal inputs.
- Final attempt (10 of 10): exploit the proven 100.0 plan without deviation.

## Problems

- None recorded.

## Score history

| Attempt | Score | Passed |
| --- | --- | --- |
| 1 | 100.0 | yes |
| 2 | 100.0 | yes |
| 3 | 100.0 | yes |
| 4 | 100.0 | yes |
| 5 | 100.0 | yes |
| 6 | 100.0 | yes |
| 7 | 100.0 | yes |
| 8 | 100.0 | yes |
| 9 | 100.0 | yes |
| 10 | 100.0 | yes |

## Attempts

- #1 `florist-1791647970511-l4-a01` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: First attempt: initializing policy to 'listed' with batch size 1.
- #2 `florist-1791647970511-l4-a02` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: No change: replay the same plan.
- #3 `florist-1791647970511-l4-a03` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: No change: replay the same plan.
- #4 `florist-1791647970511-l4-a04` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: No change: replay the same plan.
- #5 `florist-1791647970511-l4-a05` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: No change: replay the same plan.
- #6 `florist-1791647970511-l4-a06` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: No change: replay the same plan.
- #7 `florist-1791647970511-l4-a07` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: No change: replay the same plan.
- #8 `florist-1791647970511-l4-a08` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: No change: replay the same plan.
- #9 `florist-1791647970511-l4-a09` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: No change: replay the same plan.
- #10 `florist-1791647970511-l4-a10` inputs {"policy": "listed", "batch": 1, "sequence": ["order-1", "order-2", "order-3", "order-4"], "destinations": {"order-1": "spot:st-jude-village", "order-2": "spot:the-old-mill-bridal", "order-3": "spot:the-riverside-bakery", "order-4": "spot:meadowview-memorial"}} -> 100.0 (passed). Feedback: Lovely work!. Changed: No change: replay the same plan.

## Sources

- [American Institute of Floral Designers: Handling and Transporting Floral Arrangements](https://aifd.org/)

## User context

- None yet.
