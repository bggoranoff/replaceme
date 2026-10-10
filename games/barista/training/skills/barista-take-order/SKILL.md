---
name: "Take an order"
description: "This skill ensures accurate beverage order intake, upselling, and strict allergen cross-contact prevention when serving guests. By clarifying item specifications, explicitly flagging allergens with clean equipment protocols, suggesting complementary pairings, confirming the complete order, and providing personalized handoffs with clear wait times, baristas deliver exceptional hospitality and ensure customer safety."
status: "learned"
level_id: "barista-take-order"
mechanic: "converse"
trained_attempts: 10
best_score: 100.0
updated_at: "2026-10-10T16:32:15.863Z"
---

# Take an order

This skill ensures accurate beverage order intake, upselling, and strict allergen cross-contact prevention when serving guests. By clarifying item specifications, explicitly flagging allergens with clean equipment protocols, suggesting complementary pairings, confirming the complete order, and providing personalized handoffs with clear wait times, baristas deliver exceptional hospitality and ensure customer safety.

Job: barista · Level 3 (converse) · 10 attempts · best 100.0 · final 100.0 · pass at 75.0 · passed

## Learned parameters

- **A big latte, not normal milk, plus something for my kid?** (`greet`): Sure! Which milk: oat, soy or almond? And what for your kid?
  - Why: Selecting 'Sure! Which milk: oat, soy or almond? And what for your kid?' achieved 100/100 across attempts #1, #2, #3, #6, #7, #8, #9, and #10. In contrast, assuming the milk with 'One large oat latte, coming right up!' scored 30/100 (attempt #4) and deflecting to the kiosk with 'You can order on the screen over there.' scored 0/100 (attempt #5). Measured: Tried: 'Sure! Which milk: oat, soy or almond? And what for your kid?' (100/100), 'One large oat latte, coming right up!' (30/100), 'You can order on the screen over there.' (0/100).
  - Evidence: #1: Sure! Which milk: oat, soy or almond? And what for your kid? -> 50.0, #2: Sure! Which milk: oat, soy or almond? And what for your kid? -> 64.0, #3: Sure! Which milk: oat, soy or almond? And what for your kid? -> 100.0, #4: One large oat latte, coming right up! -> 86.0, #5: You can order on the screen over there. -> 80.0, #6: Sure! Which milk: oat, soy or almond? And what for your kid? -> 50.0, #7: Sure! Which milk: oat, soy or almond? And what for your kid? -> 88.0, #8: Sure! Which milk: oat, soy or almond? And what for your kid? -> 86.0, #9: Sure! Which milk: oat, soy or almond? And what for your kid? -> 100.0, #10: Sure! Which milk: oat, soy or almond? And what for your kid? -> 100.0
- **Almond for me, and hot chocolate for her, she's allergic to nuts.** (`allergy`): Got it: nut allergy flagged, clean jug and clean wand for hers.
  - Why: Selecting 'Got it: nut allergy flagged, clean jug and clean wand for hers.' achieved 100/100 in attempts #2, #3, #4, #5, #7, #8, #9, and #10. Sharing a jug ('No problem, I'll steam both in one jug to save time.') immediately ended the order with 0/100 in attempt #1, and falsely assuring nut-free status without verification scored 0/100 and ended the order in attempt #6. Measured: Tried: "No problem, I'll steam both in one jug to save time." (0/100), 'Got it: nut allergy flagged, clean jug and clean wand for hers.' (100/100), "Don't worry, our hot chocolate is nut-free." (0/100). Ends the level immediately: "No problem, I'll steam both in one jug to save time.", "Don't worry, our hot chocolate is nut-free.".
  - Evidence: #1: No problem, I'll steam both in one jug to save time. -> 50.0, #2: Got it: nut allergy flagged, clean jug and clean wand for hers. -> 64.0, #3: Got it: nut allergy flagged, clean jug and clean wand for hers. -> 100.0, #4: Got it: nut allergy flagged, clean jug and clean wand for hers. -> 86.0, #5: Got it: nut allergy flagged, clean jug and clean wand for hers. -> 80.0, #6: Don't worry, our hot chocolate is nut-free. -> 50.0, #7: Got it: nut allergy flagged, clean jug and clean wand for hers. -> 88.0, #8: Got it: nut allergy flagged, clean jug and clean wand for hers. -> 86.0, #9: Got it: nut allergy flagged, clean jug and clean wand for hers. -> 100.0, #10: Got it: nut allergy flagged, clean jug and clean wand for hers. -> 100.0
- **Thank you so much, I think that's everything.** (`suggest`): Vanilla is lovely with almond milk. Add a pump to yours?
  - Why: Recommending 'Vanilla is lovely with almond milk. Add a pump to yours?' scored 100/100 in attempts #3, #4, #5, #8, #9, and #10. Bombarding the customer with multiple add-ons scored 20/100 in attempt #2, while offering no suggestion scored 40/100 in attempt #7. Measured: Tried: 'Muffin? Cookie? Extra shot? Syrup? Bigger size?' (20/100), 'Vanilla is lovely with almond milk. Add a pump to yours?' (100/100), "Okay, that's everything then." (40/100).
  - Evidence: #2: Muffin? Cookie? Extra shot? Syrup? Bigger size? -> 64.0, #3: Vanilla is lovely with almond milk. Add a pump to yours? -> 100.0, #4: Vanilla is lovely with almond milk. Add a pump to yours? -> 86.0, #5: Vanilla is lovely with almond milk. Add a pump to yours? -> 80.0, #7: Okay, that's everything then. -> 88.0, #8: Vanilla is lovely with almond milk. Add a pump to yours? -> 86.0, #9: Vanilla is lovely with almond milk. Add a pump to yours? -> 100.0, #10: Vanilla is lovely with almond milk. Add a pump to yours? -> 100.0
- **Ooh, yes please, one pump, that's it!** (`readback`): So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right?
  - Why: Executing the complete confirmation 'So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right?' scored 100/100 in attempts #2, #3, #4, #5, #7, #9, and #10. Skipping the read-back and jumping straight to payment dropped Reply 4 score to 30/100 in attempt #8. Measured: Tried: "So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right?" (100/100), "Great, that's nine forty. Tap when you're ready." (30/100).
  - Evidence: #2: So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right? -> 64.0, #3: So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right? -> 100.0, #4: So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right? -> 86.0, #5: So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right? -> 80.0, #7: So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right? -> 88.0, #8: Great, that's nine forty. Tap when you're ready. -> 86.0, #9: So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right? -> 100.0, #10: So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right? -> 100.0
- **Yes, perfect, how long will it be?** (`close`): About five minutes. Your name? I'll bring hers over myself.
  - Why: Providing 'About five minutes. Your name? I'll bring hers over myself.' scored 100/100 in attempts #3, #4, #5, #7, #8, #9, and #10. Offering no ETA or name intake with 'No idea, it's busy. Next!' scored 0/100 in attempt #2. Measured: Tried: "No idea, it's busy. Next!" (0/100), "About five minutes. Your name? I'll bring hers over myself." (100/100).
  - Evidence: #2: No idea, it's busy. Next! -> 64.0, #3: About five minutes. Your name? I'll bring hers over myself. -> 100.0, #4: About five minutes. Your name? I'll bring hers over myself. -> 86.0, #5: About five minutes. Your name? I'll bring hers over myself. -> 80.0, #7: About five minutes. Your name? I'll bring hers over myself. -> 88.0, #8: About five minutes. Your name? I'll bring hers over myself. -> 86.0, #9: About five minutes. Your name? I'll bring hers over myself. -> 100.0, #10: About five minutes. Your name? I'll bring hers over myself. -> 100.0

## Control effects

- `greet`: Tried: 'Sure! Which milk: oat, soy or almond? And what for your kid?' (100/100). Measured: Tried: 'Sure! Which milk: oat, soy or almond? And what for your kid?' (100/100), 'One large oat latte, coming right up!' (30/100), 'You can order on the screen over there.' (0/100).
- `allergy`: Tried: "No problem, I'll steam both in one jug to save time." (0/100). Ends the level immediately: "No problem, I'll steam both in one jug to save time.". Measured: Tried: "No problem, I'll steam both in one jug to save time." (0/100), 'Got it: nut allergy flagged, clean jug and clean wand for hers.' (100/100), "Don't worry, our hot chocolate is nut-free." (0/100). Ends the level immediately: "No problem, I'll steam both in one jug to save time.", "Don't worry, our hot chocolate is nut-free.".
- `suggest`: Tried: 'Muffin? Cookie? Extra shot? Syrup? Bigger size?' (20/100). Measured: Tried: 'Muffin? Cookie? Extra shot? Syrup? Bigger size?' (20/100), 'Vanilla is lovely with almond milk. Add a pump to yours?' (100/100), "Okay, that's everything then." (40/100).
- `readback`: Tried: "So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right?" (100/100). Measured: Tried: "So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right?" (100/100), "Great, that's nine forty. Tap when you're ready." (30/100).
- `close`: Tried: "No idea, it's busy. Next!" (0/100). Measured: Tried: "No idea, it's busy. Next!" (0/100), "About five minutes. Your name? I'll bring hers over myself." (100/100).

## Steps

1. Greet the customer and ask clarifying questions for ambiguous requests instead of assuming: inquire specifically about the preferred milk option ('Which milk: oat, soy or almond?') and what beverage they would like for the accompanying guest/child.
2. When a nut allergy is identified, immediately confirm and state the safety protocol out loud: 'Got it: nut allergy flagged, clean jug and clean wand for hers.' Never share steaming jugs or steam wands across nut and non-nut drinks.
3. Offer a tasteful, relevant upsell suggestion rather than a generic barrage or remaining silent: suggest 'Vanilla is lovely with almond milk. Add a pump to yours?'.
4. Conduct a full read-back of all ordered items, modifications, and allergy flags before taking payment: 'So: large almond latte, one vanilla, kids' hot chocolate, nut allergy. Right?'.
5. Close the interaction by providing a clear time estimate, requesting the customer's name, and offering dedicated service: 'About five minutes. Your name? I'll bring hers over myself.'.

## Caveats

- Never steam regular/dairy or non-dairy milks in the same jug as almond milk when an allergy is present; cross-contact can trigger severe allergic reactions.
- Never make unverified safety promises such as claiming hot chocolate is inherently nut-free without inspecting ingredients and shared preparation surfaces.
- Never redirect an in-person, speaking customer to an order kiosk or screen.
- Avoid overwhelming customers with long lists of upsell options (syrups, pastries, sizes all at once).
- Do not skip the order read-back or omit allergy confirmations to save time.
- Never conclude an order without providing an estimated wait time, collecting the customer's name, and ensuring safe drink handoff.
- Never answer "No problem, I'll steam both in one jug to save time.".
- Never cross-contaminate nut milk and an allergy order; always flag allergy and use clean equipment.
- Always pair allergy safety with courteous service and order confirmation.
- Do not list a barrage of upsells; suggest a specific, complementary pairing.
- Take customer name and provide ETA so allergy orders are brought safely to the right person.
- Exploit the optimal solution now that all turns have achieved 100/100 sub-scores.
- Do not switch back to assuming milk types or omitting handoff details.
- Never assume drinks or milk types; always clarify both drinks.
- Stick strictly to the 100% verified sequence across all turns.
- Never assume drinks or send customers away to screens; always clarify choices politely.
- Always clean equipment and explicitly flag nut allergies to avoid cross-contact.
- Recommend thoughtful single pairings rather than broad upsell lists.
- Read back all items and allergies accurately.
- Always provide wait time, request the name, and commit to personal handoff for allergy orders.
- Do not deviate from the proven 100/100 solution; exploit the fully solved conversation path.
- Never answer "Don't worry, our hot chocolate is nut-free.".
- Never make unsupported safety claims like 'Don't worry, our hot chocolate is nut-free.' Always follow standard allergy cleaning procedures.
- Ensure all turns maintain safety while evaluating alternative communication options.
- Always offer a helpful, relevant recommendation rather than nothing or a pushy barrage.
- Always maintain full allergy protocol: flag allergy, clean jug/wand, read back allergy, and deliver personally.
- Always perform a full read-back including allergy and customizations to ensure accuracy and guest safety.
- Exploit the proven 100/100 sequence across all turns.
- Final attempt: lock in the proven perfect 100.0 plan without deviation.

## Problems

- Attempt 1: One jug for almond milk and her drink is nut cross-contact. Never. Fix: Apply the learned values.
- Attempt 1: Answering "No problem, I'll steam both in one jug to save time." ended the conversation at once. Fix: Pick another answer for that line.
- Attempt 1: Steaming both drinks in one jug causes cross-contact when one drink has almond milk and the customer has a nut allergy. Fix: Never use the same jug or wand for almond milk and allergy-flagged drinks; explicitly state that a clean jug and clean wand will be used for the allergy item.
- Attempt 2: No wait time and no name: the order can get lost. Fix: Apply the learned values.
- Attempt 2: A barrage of add-ons feels pushy and slows the queue. Fix: Apply the learned values.
- Attempt 2: Turn 2 'upsell-barrage' is overly pushy and slows down service. Fix: Apply the learned values.
- Attempt 2: Turn 4 'no-eta' provided neither wait time nor customer name. Fix: Apply the learned values.
- Attempt 4: You guessed her milk and dropped half the order. Ask, don't assume. Fix: Apply the learned values.
- Attempt 4: Assuming the customer's choice ('assume-oat') ignores the child's item and guesses milk incorrectly. Fix: Apply the learned values.
- Attempt 5: Sending a speaking customer to a screen loses the order. Fix: Apply the learned values.
- Attempt 5: Telling a speaking customer to order via the kiosk screen scores 0 and loses the order. Fix: Apply the learned values.
- Attempt 6: Never promise nut-free without checking ingredients and shared equipment. Fix: Apply the learned values.
- Attempt 6: Answering "Don't worry, our hot chocolate is nut-free." ended the conversation at once. Fix: Pick another answer for that line.
- Attempt 6: Promising that an item is nut-free without actively checking ingredients and preventing cross-contact violates food allergy safety protocols and fails the order. Fix: Apply the learned values.
- Attempt 7: Polite, but you missed one easy, helpful suggestion. Fix: Apply the learned values.
- Attempt 7: turn 2 'no-suggestion' misses the opportunity for a tasteful pairing recommendation (Reply 3 = 40). Fix: Apply the learned values.
- Attempt 8: Skipping the read-back is how wrong drinks and allergy slips happen. Fix: Apply the learned values.
- Attempt 8: Skipping the read-back fails to confirm order details and allergy precautions, lowering score to 86 (Reply 4 = 30). Fix: Apply the learned values.

## Score history

| Attempt | Score | Passed |
| --- | --- | --- |
| 1 | 50.0 | no |
| 2 | 64.0 | no |
| 3 | 100.0 | yes |
| 4 | 86.0 | yes |
| 5 | 80.0 | yes |
| 6 | 50.0 | no |
| 7 | 88.0 | yes |
| 8 | 86.0 | yes |
| 9 | 100.0 | yes |
| 10 | 100.0 | yes |

## Attempts

- #1 `barista-1791649791121-l3-a01` inputs {"choices": {"0": "ask-milk-and-kid", "1": "one-jug"}} -> 50.0. Feedback: One jug for almond milk and her drink is nut cross-contact. Never.. Changed: Selecting 'ask-milk-and-kid' instead of assuming oat or pointing to the screen.
- #2 `barista-1791649791121-l3-a02` inputs {"choices": {"0": "ask-milk-and-kid", "1": "flag-allergy-clean-jug", "2": "upsell-barrage", "3": "full-readback", "4": "no-eta"}} -> 64.0. Feedback: No wait time and no name: the order can get lost. | A barrage of add-ons feels pushy and slows the queue.. Changed: Changed key 1 from 'one-jug' to 'flag-allergy-clean-jug' to avoid allergen cross-contact.
- #3 `barista-1791649791121-l3-a03` inputs {"choices": {"0": "ask-milk-and-kid", "1": "flag-allergy-clean-jug", "2": "vanilla-pairing", "3": "full-readback", "4": "eta-name-handoff"}} -> 100.0 (passed). Feedback: Right order, safe allergy, happy Maya!. Changed: Changed turn 2 from 'upsell-barrage' to 'vanilla-pairing', and turn 4 from 'no-eta' to 'eta-name-handoff'.
- #4 `barista-1791649791121-l3-a04` inputs {"choices": {"0": "assume-oat", "1": "flag-allergy-clean-jug", "2": "vanilla-pairing", "3": "full-readback", "4": "eta-name-handoff"}} -> 86.0 (passed). Feedback: You guessed her milk and dropped half the order. Ask, don't assume.. Changed: A big latte, not normal milk, plus something for my kid?: ask-milk-and-kid -> assume-oat
- #5 `barista-1791649791121-l3-a05` inputs {"choices": {"0": "point-to-screen", "1": "flag-allergy-clean-jug", "2": "vanilla-pairing", "3": "full-readback", "4": "eta-name-handoff"}} -> 80.0 (passed). Feedback: Sending a speaking customer to a screen loses the order.. Changed: A big latte, not normal milk, plus something for my kid?: assume-oat -> point-to-screen
- #6 `barista-1791649791121-l3-a06` inputs {"choices": {"0": "ask-milk-and-kid", "1": "promise-nut-free"}} -> 50.0. Feedback: Never promise nut-free without checking ingredients and shared equipment.. Changed: A big latte, not normal milk, plus something for my kid?: point-to-screen -> ask-milk-and-kid; Almond for me, and hot chocolate for her, she's allergic to nuts.: flag-allergy-clean-jug -> promise-nut-free
- #7 `barista-1791649791121-l3-a07` inputs {"choices": {"0": "ask-milk-and-kid", "1": "flag-allergy-clean-jug", "2": "no-suggestion", "3": "full-readback", "4": "eta-name-handoff"}} -> 88.0 (passed). Feedback: Polite, but you missed one easy, helpful suggestion.. Changed: Testing 'no-suggestion' on turn 2 instead of 'vanilla-pairing', while keeping optimal choices for all other turns.
- #8 `barista-1791649791121-l3-a08` inputs {"choices": {"0": "ask-milk-and-kid", "1": "flag-allergy-clean-jug", "2": "vanilla-pairing", "3": "skip-readback", "4": "eta-name-handoff"}} -> 86.0 (passed). Feedback: Skipping the read-back is how wrong drinks and allergy slips happen.. Changed: Changed turn 3 from 'full-readback' to 'skip-readback' to evaluate the impact of skipping the confirmation step.
- #9 `barista-1791649791121-l3-a09` inputs {"choices": {"0": "ask-milk-and-kid", "1": "flag-allergy-clean-jug", "2": "vanilla-pairing", "3": "full-readback", "4": "eta-name-handoff"}} -> 100.0 (passed). Feedback: Right order, safe allergy, happy Maya!. Changed: Ooh, yes please, one pump, that's it!: skip-readback -> full-readback
- #10 `barista-1791649791121-l3-a10` inputs {"choices": {"0": "ask-milk-and-kid", "1": "flag-allergy-clean-jug", "2": "vanilla-pairing", "3": "full-readback", "4": "eta-name-handoff"}} -> 100.0 (passed). Feedback: Right order, safe allergy, happy Maya!. Changed: No change: replay the same plan.

## Sources

- [GOV.UK / Food Standards Agency - Allergen guidance for food businesses](https://www.gov.uk/government/publications/allergen-guidance-for-food-businesses/allergen-guidance-for-food-businesses)
- [Allergy & Asthma Network - Coffee, cross contact and food allergies](https://allergyasthmanetwork.org/news/coffee-cross-contact-and-food-allergies/)
- [Lynn (Cornell, 2011) - Mega Tips 2: twenty tested techniques (repeat the order back)](https://ecommons.cornell.edu/entities/publication/aaa79631-eff5-43eb-96ac-473e4ffea561)
- [Sauce - Suggestive selling techniques for restaurants](https://www.getsauce.com/post/communicating-with-customers-suggestive-selling-techniques-to-raise-restaurant-revenue)
- [Gradium API - Speech-to-text (POST /api/post/speech/asr)](https://docs.gradium.ai/api-reference/endpoint/stt-post)
- [Gradium API - Text-to-speech (POST /api/post/speech/tts)](https://docs.gradium.ai/api-reference/endpoint/tts-post)
- [Square Orders API - CreateOrder (POST /v2/orders)](https://developer.squareup.com/reference/square/orders-api/create-order)

## User context

- None yet.
