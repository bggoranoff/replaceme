---
name: "Brew coffee"
description: "A dialed-in house pour-over recipe that a grinder + scale + kettle, or a programmable brewer, can run tomorrow: 18 g of coffee to 300 ml of 93 °C water (1:16.7), about 190 s total brew time (window 3:00-3:30), with a taste-to-fix map: sour = too fast, bitter = too slow, weak or heavy = fix the water per gram."
status: "learned"
level_id: "barista-brew-coffee"
mechanic: "mix"
trained_attempts: 10
best_score: 100.0
updated_at: "2026-10-10T16:32:16.605Z"
---

# Brew coffee

A dialed-in house pour-over recipe that a grinder + scale + kettle, or a programmable brewer, can run tomorrow: 18 g of coffee to 300 ml of 93 °C water (1:16.7), about 190 s total brew time (window 3:00-3:30), with a taste-to-fix map: sour = too fast, bitter = too slow, weak or heavy = fix the water per gram.

Job: barista · Level 1 (mix) · 10 attempts · best 100.0 · final 100.0 · pass at 75.0 · passed

## Learned parameters

- **Coffee** (`dose_g`): 18 g
  - Why: An 18 g dose achieves a perfect 100 sub-score (Attempt #3: 18 g -> score 100.0; Attempt #9 & #10: 18 g -> score 100.0). Deviating to 17 g caused thin and sour flow (Attempt #5: 17 g -> score 91.6, dose sub-score 71), while 19 g produced a bed packed too deep resulting in heavy bitterness (Attempt #4: 19 g -> score 91.3, dose sub-score 71). A 15.5 g dose severely underperformed (Attempt #1: 15.5 g -> score 38.1, dose sub-score 11). This aligns with SCA Golden Cup standards for a single 300 ml house mug. Measured: Best sub-score 100/100 at 18 g. Tried 15.5 g (sub-score 11) to 19 g (sub-score 71). Sub-score stayed at or above 80 between 18 g and 18 g. Too high (19 g): "Heavy and bitter: the bed is packed too deep and the cup is too strong." Too low (17 g): "Thin and sour: the shallow coffee bed let the water rush straight through."
  - Evidence: #1: 15.5 g -> 38.1, #2: 18 g -> 78.7, #3: 18 g -> 100.0, #4: 19 g -> 91.3, #5: 17 g -> 91.6, #6: 18 g -> 93.7, #7: 18 g -> 88.7, #8: 18 g -> 98.5, #9: 18 g -> 100.0, #10: 18 g -> 100.0
- **Water** (`water_ml`): 300 ml
  - Why: A water volume of 300 ml provides an exact house serving and hits 100 on both water volume and brew ratio sub-scores (Attempt #3, #9, #10 -> score 100.0). Raising water to 330 ml or 350 ml causes cup overflow and weak taste (Attempt #6: 330 ml -> score 93.7, water sub-score 61; Attempt #2: 350 ml -> score 78.7, water sub-score 25). Dropping to 270 ml leaves the mug short of a full serving (Attempt #7: 270 ml -> score 88.7, water sub-score 61). Measured: Best sub-score 100/100 at 300 ml. Tried 270 ml (sub-score 61) to 350 ml (sub-score 25). Sub-score stayed at or above 80 between 300 ml and 320 ml. Too high (330 ml): "Brew spills past the mug: more than a house serving." Too low (270 ml): "The mug comes out short: not a full house serving."
  - Evidence: #1: 320 ml -> 38.1, #2: 350 ml -> 78.7, #3: 300 ml -> 100.0, #4: 300 ml -> 91.3, #5: 300 ml -> 91.6, #6: 330 ml -> 93.7, #7: 270 ml -> 88.7, #8: 300 ml -> 98.5, #9: 300 ml -> 100.0, #10: 300 ml -> 100.0
- **Brew time** (`contact_s`): 190 s
  - Why: A contact time of 190 s yields a perfect 100 brew time sub-score (Attempt #3, #9, #10 -> score 100.0). Cutting contact time to 150 s caused severe under-extraction with sour and salty notes (Attempt #1: 150 s -> score 38.1, brew time sub-score 61). Extending time to 220 s caused minor over-extraction (Attempt #8: 220 s -> score 98.5, brew time sub-score 95). 190 s falls neatly in the standard ~3 minute extraction window for pour-over methods. Measured: Best sub-score 100/100 at 190 s. Tried 150 s (sub-score 61) to 220 s (sub-score 95). Sub-score stayed at or above 80 between 190 s and 220 s.
  - Evidence: #1: 150 s -> 38.1, #2: 190 s -> 78.7, #3: 190 s -> 100.0, #4: 190 s -> 91.3, #5: 190 s -> 91.6, #6: 190 s -> 93.7, #7: 190 s -> 88.7, #8: 220 s -> 98.5, #9: 190 s -> 100.0, #10: 190 s -> 100.0

## Control effects

- `dose_g`: Controls coffee bed depth and cup strength. 18 g yields 100 sub-score (Attempts #3, #9, #10). 15.5 g yielded thin/sour under-extraction (Attempt #1 score 38.1), 17 g yielded bed too shallow (Attempt #5 score 91.6, sub-score 71), and 19 g yielded heavy/bitter over-strength (Attempt #4 score 91.3, sub-score 71). Measured: Best sub-score 100/100 at 18 g. Tried 15.5 g (sub-score 11) to 19 g (sub-score 71). Sub-score stayed at or above 80 between 18 g and 18 g. Too high (19 g): "Heavy and bitter: the bed is packed too deep and the cup is too strong." Too low (17 g): "Thin and sour: the shallow coffee bed let the water rush straight through."
- `water_ml`: Controls final beverage yield and overall dilution. 300 ml achieves a full mug with sub-score 100 (Attempts #3, #9, #10). Values above 300 ml cause overflow and watery cups (Attempt #2 at 350 ml gave score 78.7; Attempt #6 at 330 ml gave score 93.7). Values below 300 ml produce a short pour (Attempt #7 at 270 ml gave score 88.7). Measured: Best sub-score 100/100 at 300 ml. Tried 270 ml (sub-score 61) to 350 ml (sub-score 25). Sub-score stayed at or above 80 between 300 ml and 320 ml. Too high (330 ml): "Brew spills past the mug: more than a house serving." Too low (270 ml): "The mug comes out short: not a full house serving."
- `contact_s`: Controls extraction level. 190 s maximizes sweetness and balance with 100 sub-score (Attempts #3, #9, #10). 150 s leaves the coffee under-extracted, sour, and salty (Attempt #1 score 38.1), while 220 s slightly over-extracts, dropping sub-score to 95 (Attempt #8 score 98.5). Measured: Best sub-score 100/100 at 190 s. Tried 150 s (sub-score 61) to 220 s (sub-score 95). Sub-score stayed at or above 80 between 190 s and 220 s.
- `brew_ratio`: Evaluated as 'Water per gram'. Pairing 300 ml water with 18 g coffee establishes a ~16.67:1 ratio, scoring 100 (Attempts #3, #8, #9, #10). Skewed ratios drop this term sharply (Attempt #1 at 320 ml / 15.5 g scored 21; Attempt #2 at 350 ml / 18 g scored 63; Attempt #7 at 270 ml / 18 g scored 80). Measured: Relation 'Water per gram' depends on several controls together; best sub-score 100/100.

## Steps

1. Tools: scale (dose 18 g, tare), grinder (house medium-fine), kettle (93 °C), brewer or smart brewer profile (300 ml, 1:16.7, finish 3:00-3:30).
2. Weigh out precisely 18 g of ground coffee (dose_g) into the brew basket to ensure the proper bed depth.
3. Measure and heat 300 ml of water (water_ml) to fill a standard house serving mug without overflowing or coming up short.
4. Initiate brewing and maintain water contact with the coffee grounds for exactly 190 s (contact_s) to extract sweetness and body without bitterness or astringency.

## Caveats

- The 'Water per gram' sub-score is an interdependent relationship between water volume (water_ml) and coffee dose (dose_g); altering one without adjusting the other upsets the brew ratio.
- A dose variation of even 1 g (17 g or 19 g) drops coffee bed sub-scores from 100 down to 71.
- Increasing water beyond 300 ml causes the cup to spill past the mug and dilutes the cup, while dropping below 300 ml results in an incomplete house serving.
- Contact times longer than 190 s begin over-extracting, while times near 150 s lead to sour, salty under-extraction.
- 'Water per gram' depends on several controls together, not one alone.
- Water per gram depends on both water_ml and dose_g together.
- Increasing dose will simultaneously improve coffee bed depth and reduce the water-to-coffee ratio.
- Keep dose_g at 18.0 and contact_s at 190.0 as they are already perfected at 100.
- The recipe is fully solved and optimal; do not alter any parameters.
- If you see "Heavy and bitter: the bed is packed too deep and the cup is too strong.", lower Coffee.
- Dose at 18.0 g, water at 300.0 ml, and contact time at 190.0 s produces the perfect 100.0 house cup.
- Do not deviate from 18.0 g dose as both lower (<18 g) and higher (>18 g) reduce cup quality.
- If you see "Thin and sour: the shallow coffee bed let the water rush straight through.", raise Coffee.
- Dose of 18.0 g, water volume of 300.0 ml, and contact time of 190.0 s achieve 100.0 across all sub-scores.
- If you see "Brew spills past the mug: more than a house serving.", lower Water.
- The 100% optimal recipe is dose_g: 18.0, water_ml: 300, contact_s: 190.
- Deviations above 300 ml for water lead to overflow feedback and lower water sub-scores.
- If you see "The mug comes out short: not a full house serving.", raise Water.
- A water volume of 300 ml is strictly required for the house serving size.
- Probing contact time above 190 s will clarify how forgiving the upper extraction threshold is.
- All three parameters (18.0 g dose, 300 ml water, 190 s brew time) are precisely calibrated and mutually satisfy all sub-scores at 100.
- Final attempt: lock in the proven perfect settings (dose_g: 18.0, water_ml: 300, contact_s: 190).

## Problems

- Attempt 1: Thin and sour: the shallow coffee bed let the water rush straight through. Fix: Increase coffee dose up to 18 g to provide sufficient bed depth and resistance.
- Attempt 1: Too weak: watery and hollow, too much water for the coffee. Fix: Rebalance brew ratio by keeping water at 300 ml and dose at 18 g (1:16.7 ratio).
- Attempt 1: Sour and salty: under-extracted, the water left the grounds too soon. Fix: Increase contact time to 190 s so water has adequate time to extract solubles from grounds.
- Attempt 1: Coffee bed too shallow (dose too low) Fix: Apply the learned values.
- Attempt 1: Contact time too short (under-extracted) Fix: Apply the learned values.
- Attempt 1: Ratio too weak / watery (too much water per gram) Fix: Apply the learned values.
- Attempt 2: Brew spills past the mug: more than a house serving. Fix: Reduce brew water volume down to 300 ml to match the house mug capacity.
- Attempt 2: Water volume at 350 ml is too large for a standard mug and dilutes the brew. Fix: Apply the learned values.
- Attempt 4: Heavy and bitter: the bed is packed too deep and the cup is too strong. Fix: Decrease coffee dose down to 18 g to prevent over-packing the brew bed.
- Attempt 4: Dose of 19.0 g resulted in an over-packed coffee bed and a heavy/bitter brew. Fix: Apply the learned values.
- Attempt 5: Dose 17.0 g is too low, yielding thin and sour coffee. Fix: Apply the learned values.
- Attempt 6: Water volume at 330 ml exceeds house serving mug capacity and dilutes the cup slightly. Fix: Apply the learned values.
- Attempt 7: The mug comes out short: not a full house serving. Fix: Increase brew water volume up to 300 ml to fill the house serving properly.
- Attempt 7: Water volume at 270 ml comes out short of a full house serving. Fix: Increase brew water volume up to 300 ml to fill the house serving properly.
- Attempt 8: Contact time of 220 s is slightly too long, causing minor over-extraction compared to 190 s. Fix: Apply the learned values.

## Score history

| Attempt | Score | Passed |
| --- | --- | --- |
| 1 | 38.1 | no |
| 2 | 78.7 | yes |
| 3 | 100.0 | yes |
| 4 | 91.3 | yes |
| 5 | 91.6 | yes |
| 6 | 93.7 | yes |
| 7 | 88.7 | yes |
| 8 | 98.5 | yes |
| 9 | 100.0 | yes |
| 10 | 100.0 | yes |

## Attempts

- #1 `barista-1791649791121-l1-a01` inputs {"values": {"dose_g": 15.5, "water_ml": 320, "contact_s": 150}} -> 38.1. Feedback: Thin and sour: the shallow coffee bed let the water rush straight through. | Too weak: watery and hollow, too much water for the coffee. | Sour and salty: under-extracted, the water left the grounds too soon.. Changed: Initial attempt using standard baseline values: dose 15.5 g, water 320 ml, brew time 150 s.
- #2 `barista-1791649791121-l1-a02` inputs {"values": {"dose_g": 18, "water_ml": 350, "contact_s": 190}} -> 78.7 (passed). Feedback: Brew spills past the mug: more than a house serving. | Too weak: watery and hollow, too much water for the coffee.. Changed: Increased dose_g from 15.5 to 18.0, water_ml from 320 to 350, and contact_s from 150 to 190 per the systematic search suggestion and feedback requirements.
- #3 `barista-1791649791121-l1-a03` inputs {"values": {"dose_g": 18, "water_ml": 300, "contact_s": 190}} -> 100.0 (passed). Feedback: Sweet and smooth, that's our house cup!. Changed: Set water_ml to 300 (down from 350) while maintaining dose_g at 18 and contact_s at 190.
- #4 `barista-1791649791121-l1-a04` inputs {"values": {"dose_g": 19, "water_ml": 300, "contact_s": 190}} -> 91.3 (passed). Feedback: Heavy and bitter: the bed is packed too deep and the cup is too strong.. Changed: Coffee: 18 -> 19.0
- #5 `barista-1791649791121-l1-a05` inputs {"values": {"dose_g": 17, "water_ml": 300, "contact_s": 190}} -> 91.6 (passed). Feedback: Thin and sour: the shallow coffee bed let the water rush straight through.. Changed: Coffee: 19 -> 17.0
- #6 `barista-1791649791121-l1-a06` inputs {"values": {"dose_g": 18, "water_ml": 330, "contact_s": 190}} -> 93.7 (passed). Feedback: Brew spills past the mug: more than a house serving.. Changed: Coffee: 17 -> 18.0; Water: 300 -> 330
- #7 `barista-1791649791121-l1-a07` inputs {"values": {"dose_g": 18, "water_ml": 270, "contact_s": 190}} -> 88.7 (passed). Feedback: The mug comes out short: not a full house serving.. Changed: Decreased water_ml from 330 ml to 270 ml to bracket the lower boundary of water volume as suggested.
- #8 `barista-1791649791121-l1-a08` inputs {"values": {"dose_g": 18, "water_ml": 300, "contact_s": 220}} -> 98.5 (passed). Feedback: Sweet and smooth, that's our house cup!. Changed: Increased contact_s from 190 s to 220 s while holding dose_g at 18.0 g and water_ml at 300 ml to probe the brew time upper window as recommended by the search suggestion.
- #9 `barista-1791649791121-l1-a09` inputs {"values": {"dose_g": 18, "water_ml": 300, "contact_s": 190}} -> 100.0 (passed). Feedback: Sweet and smooth, that's our house cup!. Changed: Brew time: 220 -> 190
- #10 `barista-1791649791121-l1-a10` inputs {"values": {"dose_g": 18, "water_ml": 300, "contact_s": 190}} -> 100.0 (passed). Feedback: Sweet and smooth, that's our house cup!. Changed: No change: replay the same plan.

## Sources

- [Coava Coffee - V60 brew method (20 g : 320 g, 3:00-3:30)](https://coavacoffee.com/brew-methods/v60)
- [Gusto's Coffee - SCA Golden Cup standards (55 g/L +/-10%, 93 °C +/-3, contact times)](https://www.gustoscoffeeco.com/how-to-make-better-coffee-sca-golden-cup-standards/)
- [Counter Culture Coffee - Coffee Basics: What is TDS?](https://counterculturecoffee.com/blogs/counter-culture-coffee/coffee-basics)
- [SCAE Coffee Basics brochure - the brewing control chart (via Bunn)](https://resource.bunn.com/library/eZine/coffee_basics_brochure_scae_english/files/basic-html/page4.html)
- [Moccamaster - Certified by the SCA: the Golden Cup standard (92-96 °C)](https://us.moccamaster.com/blogs/blog/certified-by-the-sca-moccamaster-and-the-golden-cup-standard)
- [SCA - Fellow Aiden Precision Coffee Maker (programmable brew profiles)](https://new.sca.coffee/entries/fellow-aiden-precision-coffee-maker)

## User context

- None yet.

## Tool mappings

- `scale`: {"action": "tare, then dose coffee", "params": {"coffee_g": "18", "tolerance_g": 0.2}}
- `grinder`: {"action": "grind at the house medium-fine setting", "params": {"setting": "medium-fine", "adjust_if": "brew time outside 180-210 s"}}
- `kettle`: {"action": "heat brew water", "params": {"temperature_c": 93}}
- `brewer_profile`: {"action": "save as a programmable brewer profile (e.g. Fellow Aiden app)", "params": {"ratio": "1:16.7", "water_ml": "300", "temperature_c": 93, "bloom_s": 30, "target_time_s": "190"}}
- `feedback_loop`: {"action": "taste and correct", "params": {"sour_or_thin": "grind finer / longer contact", "bitter_or_dry": "grind coarser / shorter contact", "weak": "less water per gram", "heavy": "more water per gram"}}

## Transfer

Runs unchanged on a smart brewer profile (ratio, temperature, bloom) or as a barista routine; re-dial the grind, never the dose, when the brew time drifts.
