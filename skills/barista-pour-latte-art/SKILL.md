---
name: "Pour latte art"
description: "A step-by-step rosetta pour that a robot barista arm or a trainee can follow: stop steaming at 65 °C (window 57-65 °C), pour the base from 9 cm so the milk dives under the crema, drop the spout close to the surface at 50.3% full, wiggle while backing up, then lift and pull through at about three-quarters full."
status: "learned"
level_id: "barista-pour-latte-art"
mechanic: "timing"
trained_attempts: 10
best_score: 100.0
updated_at: "2026-10-10T16:32:26.235Z"
---

# Pour latte art

A step-by-step rosetta pour that a robot barista arm or a trainee can follow: stop steaming at 65 °C (window 57-65 °C), pour the base from 9 cm so the milk dives under the crema, drop the spout close to the surface at 50.3% full, wiggle while backing up, then lift and pull through at about three-quarters full.

Job: barista · Level 2 (timing) · 10 attempts · best 100.0 · final 100.0 · pass at 70.0 · passed

## Learned parameters

- **Heat the milk** (`milk_temp_c`): 65 °C
  - Why: Target 65 °C yields a perfect 100/100 sub-score (as demonstrated in Attempt #2: 65 °C -> 100, Attempt #4: 65 °C -> 100, Attempt #6: 58.4 °C -> 100, Attempt #9: 65 °C -> 100, and Attempt #10: 65 °C -> 100). Lower temperatures like 50 °C produced flat, lukewarm milk with poor foam (Attempt #1: 50 °C -> sub-score 38). Overheating to 74 °C resulted in scalded milk and stiff foam (Attempt #5: 74 °C -> sub-score 20). Supported by Verve Coffee guidelines recommending steaming milk between 135-150 °F (57-65 °C). Measured: Best sub-score 100/100 at 65 °C. Tried 50 °C (sub-score 38) to 74 °C (sub-score 20). Sub-score stayed at or above 80 between 58.4 °C and 65 °C. Too high (74 °C): "Scalded milk: cooked taste, sweetness gone, foam dry and stiff."
  - Evidence: #1: 50 °C -> 46.9, #2: 65 °C -> 96.5, #3: 65 °C -> 78.3, #4: 65 °C -> 100.0, #5: 74 °C -> 67.9, #6: 58.4 °C -> 100.0, #7: 65 °C -> 93.5, #8: 65 °C -> 93.5, #9: 65 °C -> 100.0, #10: 65 °C -> 100.0
- **Pour height** (`pour_height_cm`): 9 cm
  - Why: Target 9 cm achieves a perfect 100/100 sub-score (Attempt #4: 9 cm -> 100, Attempt #6: 9 cm -> 100, Attempt #9: 9 cm -> 100, Attempt #10: 9 cm -> 100). Pouring too low at 4.8 cm or 6.6 cm spreads foam over the crema prematurely (Attempt #3: 4.8 cm -> sub-score 28; Attempt #8: 6.6 cm -> sub-score 78). Pouring too high at 11.4 cm or 12 cm splashes and breaks the crema (Attempt #1: 12 cm -> sub-score 61; Attempt #7: 11.4 cm -> sub-score 78). Attempt #2 at 7 cm scored 88. Measured: Best sub-score 100/100 at 9 cm. Tried 4.8 cm (sub-score 28) to 12 cm (sub-score 61). Sub-score stayed at or above 80 between 7 cm and 9 cm. Too high (11.4 cm): "Poured from too high: the stream splashed and broke up the crema." Too low (6.6 cm): "Poured too close too early: white foam spread over the crema, no canvas left."
  - Evidence: #1: 12 cm -> 46.9, #2: 7 cm -> 96.5, #3: 4.8 cm -> 78.3, #4: 9 cm -> 100.0, #5: 9 cm -> 67.9, #6: 9 cm -> 100.0, #7: 11.4 cm -> 93.5, #8: 6.6 cm -> 93.5, #9: 9 cm -> 100.0, #10: 9 cm -> 100.0
- **When to drop in** (`design_fill_pct`): 50.3 % full
  - Why: Target 50.3% fill yields a perfect 100/100 sub-score across all attempts tested (Attempts #2, #3, #4, #5, #6, #7, #8, #9, #10: 50.3% -> sub-score 100). In contrast, waiting until 65% fill leaves insufficient room for the leaves to develop (Attempt #1: 65% -> sub-score 46, feedback 'Dropped in too late'). Measured: Best sub-score 100/100 at 50.3 % full. Tried 50.3 % full (sub-score 100) to 65 % full (sub-score 46). Sub-score stayed at or above 80 between 50.3 % full and 50.3 % full.
  - Evidence: #1: 65 % full -> 46.9, #2: 50.3 % full -> 96.5, #3: 50.3 % full -> 78.3, #4: 50.3 % full -> 100.0, #5: 50.3 % full -> 67.9, #6: 50.3 % full -> 100.0, #7: 50.3 % full -> 93.5, #8: 50.3 % full -> 93.5, #9: 50.3 % full -> 100.0, #10: 50.3 % full -> 100.0

## Control effects

- `milk_temp_c`: Controls milk sweetness and foam texture. Scored 100 at 65 °C (Attempts #2, #4, #7-#10) and 58.4 °C (Attempt #6). Scored 38 at 50 °C due to lukewarm flat foam (Attempt #1), and plummeted to 20 at 74 °C due to scalded, cooked taste and dry foam (Attempt #5). Measured: Best sub-score 100/100 at 65 °C. Tried 50 °C (sub-score 38) to 74 °C (sub-score 20). Sub-score stayed at or above 80 between 58.4 °C and 65 °C. Too high (74 °C): "Scalded milk: cooked taste, sweetness gone, foam dry and stiff."
- `pour_height_cm`: Governs whether milk sinks beneath crema or washes it out. Peaked at 100 at 9 cm (Attempts #4, #6, #9, #10). Sub-scores degraded symmetrically when departing from 9 cm: 7.0 cm scored 88 (Attempt #2), 6.6 cm and 11.4 cm both scored 78 (Attempts #8, #7), 12.0 cm scored 61 (Attempt #1), and 4.8 cm scored 28 (Attempt #3). Measured: Best sub-score 100/100 at 9 cm. Tried 4.8 cm (sub-score 28) to 12 cm (sub-score 61). Sub-score stayed at or above 80 between 7 cm and 9 cm. Too high (11.4 cm): "Poured from too high: the stream splashed and broke up the crema." Too low (6.6 cm): "Poured too close too early: white foam spread over the crema, no canvas left."
- `design_fill_pct`: Determines the available canvas for latte art. Scored 100 at 50.3% (Attempts #2-#10). Dropped to 46 at 65% with feedback warning that drop-in was too late and cramped the rosetta (Attempt #1). Measured: Best sub-score 100/100 at 50.3 % full. Tried 50.3 % full (sub-score 100) to 65 % full (sub-score 46). Sub-score stayed at or above 80 between 50.3 % full and 50.3 % full.

## Steps

1. Tools: steam wand + milk probe (stop at 57-65 °C), pitcher on a robot arm or in hand, cup fill sensor (load cell or camera) to trigger the drop-in at about 50% and the pull-through at about 75%.
2. Steam the milk to a target temperature of 65 °C (or within the acceptable sweet spot of 58.4 °C to 65 °C) to ensure a sweet, glossy microfoam without scalding.
3. Begin integrating the milk into the espresso base from an initial pour height of 9 cm to dive under the crema without splashing or washing it out.
4. When the cup reaches 50.3% fill, lower the pitcher tip close to the surface ('drop in') and initiate the side-to-side wiggle to draw the rosetta leaf pattern before finishing with a pull-through.

## Caveats

- Qualitative feedback takes priority: if the stream splashes crema or foam prematurely covers the surface, height and timing must be adjusted rather than relying on unguided sweeps.
- Do not drop in too late; waiting past the halfway mark (e.g., at 65% fill) cramps the design and leaves no canvas.
- Steaming past 70 °C risks ruining milk sweetness and texture; keep temperature well under 74 °C.
- Maintain steady pitcher control; both dropping too low too early (<7 cm) and pouring too high (>11 cm) significantly drop the pour height sub-score.
- Systematic search suggestion advised probing higher on height and fill percentage, but qualitative feedback explicitly says poured too high and dropped in too late; feedback must take precedence.
- Keep milk_temp_c at 65.0 °C and design_fill_pct at 50.3% since both already achieved 100/100.
- Ensure all values align strictly with control steps (step 0.2 for height).
- A perfect score of 100.0 has already been reached; continue exploiting the winning configuration.
- If you see "Scalded milk: cooked taste, sweetness gone, foam dry and stiff.", lower Heat the milk.
- A perfect score of 100.0 has already been achieved at (65.0, 9.0, 50.3). Revert to this optimal set to guarantee maximum performance.
- A 100.0 score is fully established at milk_temp_c = 65.0, pour_height_cm = 9.0, design_fill_pct = 50.3.
- Probing 11.4 cm is unnecessary and likely suboptimal given 12.0 cm was already confirmed too high.
- If you see "Poured from too high: the stream splashed and broke up the crema.", lower Pour height.
- Exploit the proven 100.0 configuration rather than unnecessary perimeter probing.
- If you see "Poured too close too early: white foam spread over the crema, no canvas left.", raise Pour height.
- Exploration is complete; stick to the verified 100.0 point at (65.0, 9.0, 50.3).
- Final attempt: lock in the proven perfect 100.0 score configuration.

## Problems

- Attempt 1: Lukewarm milk: flat, barely sweet, and the foam never turned glossy. Fix: Increase milk steaming temperature to 65 °C (hold steaming longer until reaching 58.4 °C–65 °C).
- Attempt 1: Dropped in too late: no room left, the rosetta came out cramped and tiny. Fix: Drop the pitcher close to the surface earlier, right when the cup reaches approximately 50.3% capacity.
- Attempt 1: Poured from too high: the stream splashed and broke up the crema. Fix: Lower the initial pour height to 9 cm to prevent the stream from disrupting the espresso crema.
- Attempt 1: Milk steamed too cold (50 °C). Fix: Apply the learned values.
- Attempt 1: Pour height too high (12 cm). Fix: Apply the learned values.
- Attempt 1: Drop-in happened too late (65 %). Fix: Apply the learned values.
- Attempt 2: Pour height at 7.0 cm was still slightly off optimal (scored 88/100). Fix: Apply the learned values.
- Attempt 3: Poured too close too early: white foam spread over the crema, no canvas left. Fix: Raise the initial pour height to 9 cm and maintain it during the mixing phase so the milk dives under the crema.
- Attempt 3: (attempt 3) Poured too close too early at 4.8 cm (sub-score 28). Fix: Apply the learned values.
- Attempt 5: Scalded milk: cooked taste, sweetness gone, foam dry and stiff. Fix: Lower steaming temperature to 65 °C; release the steam lever sooner to avoid exceeding 70 °C.
- Attempt 5: Heat the milk too high (74.0): "Scalded milk: cooked taste, sweetness gone, foam dry and stiff." Fix: Lower steaming temperature to 65 °C; release the steam lever sooner to avoid exceeding 70 °C.
- Attempt 5: Milk temperature at 74.0 °C scalds the milk (sub-score 20). Fix: Apply the learned values.
- Attempt 7: Pour height at 11.4 cm is too high: 'Poured from too high: the stream splashed and broke up the crema.' Fix: Lower the initial pour height to 9 cm to prevent the stream from disrupting the espresso crema.

## Score history

| Attempt | Score | Passed |
| --- | --- | --- |
| 1 | 46.9 | no |
| 2 | 96.5 | yes |
| 3 | 78.3 | yes |
| 4 | 100.0 | yes |
| 5 | 67.9 | no |
| 6 | 100.0 | yes |
| 7 | 93.5 | yes |
| 8 | 93.5 | yes |
| 9 | 100.0 | yes |
| 10 | 100.0 | yes |

## Attempts

- #1 `barista-1792005199211-l2-a01` inputs {"values": {"milk_temp_c": 50, "pour_height_cm": 12, "design_fill_pct": 65}} -> 46.9. Feedback: Lukewarm milk: flat, barely sweet, and the foam never turned glossy. | Dropped in too late: no room left, the rosetta came out cramped and tiny. | Poured from too high: the stream splashed and broke up the crema.. Changed: Initial attempt baseline setting milk_temp_c to 50.0°C.
- #2 `barista-1792005199211-l2-a02` inputs {"values": {"milk_temp_c": 65, "pour_height_cm": 7, "design_fill_pct": 50.3}} -> 96.5 (passed). Feedback: Pretty leaves, that one goes on our wall!. Changed: Increased milk_temp_c from 50 to 65.0 °C; decreased pour_height_cm from 12 to 7.0 cm; decreased design_fill_pct from 65 to 50.3 %.
- #3 `barista-1792005199211-l2-a03` inputs {"values": {"milk_temp_c": 65, "pour_height_cm": 4.8, "design_fill_pct": 50.3}} -> 78.3 (passed). Feedback: Poured too close too early: white foam spread over the crema, no canvas left.. Changed: Changed pour_height_cm from 7.0 to 4.8 cm, leaving milk_temp_c at 65.0 and design_fill_pct at 50.3.
- #4 `barista-1792005199211-l2-a04` inputs {"values": {"milk_temp_c": 65, "pour_height_cm": 9, "design_fill_pct": 50.3}} -> 100.0 (passed). Feedback: Pretty leaves, that one goes on our wall!. Changed: Increased pour_height_cm from 4.8 cm to 9.0 cm while holding milk_temp_c at 65.0 °C and design_fill_pct at 50.3%.
- #5 `barista-1792005199211-l2-a05` inputs {"values": {"milk_temp_c": 74, "pour_height_cm": 9, "design_fill_pct": 50.3}} -> 67.9. Feedback: Scalded milk: cooked taste, sweetness gone, foam dry and stiff.. Changed: Heat the milk: 65 -> 74.0
- #6 `barista-1792005199211-l2-a06` inputs {"values": {"milk_temp_c": 58.4, "pour_height_cm": 9, "design_fill_pct": 50.3}} -> 100.0 (passed). Feedback: Pretty leaves, that one goes on our wall!. Changed: Heat the milk: 74 -> 58.4
- #7 `barista-1792005199211-l2-a07` inputs {"values": {"milk_temp_c": 65, "pour_height_cm": 11.4, "design_fill_pct": 50.3}} -> 93.5 (passed). Feedback: Poured from too high: the stream splashed and broke up the crema.. Changed: Heat the milk: 58.4 -> 65.0; Pour height: 9 -> 11.4
- #8 `barista-1792005199211-l2-a08` inputs {"values": {"milk_temp_c": 65, "pour_height_cm": 6.6, "design_fill_pct": 50.3}} -> 93.5 (passed). Feedback: Poured too close too early: white foam spread over the crema, no canvas left.. Changed: Pour height: 11.4 -> 6.6
- #9 `barista-1792005199211-l2-a09` inputs {"values": {"milk_temp_c": 65, "pour_height_cm": 9, "design_fill_pct": 50.3}} -> 100.0 (passed). Feedback: Pretty leaves, that one goes on our wall!. Changed: Resetting pour_height_cm back from 6.6 cm to the known optimum of 9.0 cm.
- #10 `barista-1792005199211-l2-a10` inputs {"values": {"milk_temp_c": 65, "pour_height_cm": 9, "design_fill_pct": 50.3}} -> 100.0 (passed). Feedback: Pretty leaves, that one goes on our wall!. Changed: No change: replay the same plan.

## Sources

- [Verve Coffee - How to steam milk (135-150 F)](https://vervecoffee.com/blogs/the-verve-blog/how-to-steam-milk)
- [Verve Coffee - How to pour rosetta latte art](https://www.vervecoffee.com/blogs/the-verve-blog/how-to-pour-rosetta-latte-art)
- [Complete Home Barista - How to pour a rosetta latte art pattern](https://completehomebarista.com/faqs/milk-latte-art/how-to-make-rosetta-latte-art/)
- [Yanko Design - Artly robots learn latte art from barista demonstrations (CES 2026)](https://www.yankodesign.com/2026/01/07/artly-robots-master-latte-art-and-drinks-for-ces-2026-debut/)

## User context

- None yet.

## Tool mappings

- `milk_thermometer_or_probe`: {"action": "stop steaming", "params": {"stop_at_c": "65", "window_c": [57, 65]}}
- `robot_arm.pour_base`: {"action": "pour from height", "params": {"spout_height_cm": "9", "flow": "steady"}}
- `cup_fill_sensor`: {"action": "trigger the drop-in", "params": {"fill_pct": "50.3", "source": "load cell or vision"}}
- `robot_arm.design`: {"action": "drop spout to 1-2 cm, wiggle side to side while backing up", "params": {"wiggle": "small and slow", "keep_flow": true}}
- `robot_arm.pull_through`: {"action": "lift slightly and pull through the centre", "params": {"at_fill_pct": 75}}

## Transfer

Maps to waypoints and triggers for a robotic arm (milk probe temperature, spout height, cup fill from a load cell or camera) or to a one-page training card.
