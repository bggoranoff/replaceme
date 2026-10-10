---
name: rush-hour-triage-split-billing
description: High-volume restaurant service forces servers to prioritize conflicting demands: kitchen delays, mid-meal requests, urgent safety checks, and complex payment processing while keeping customers calm.
role: waitress
level: 4
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "75.0%"
---

# Rush Hour Station Juggling, Allergy Incident & Bill Splitting

Level 4 of the waitress practice environment.
Goal: Triage 4 active tables during peak 8 PM dinner rush, resolve an urgent kitchen allergy miscommunication, and accurately split a 5-item bill across 3 credit cards with zero balance variance.

## Procedure

1. Triage sequence: Recognize physical life safety (allergy) > guest greeting > maintenance > payment settlement.
2. Intercept food runner carrying Table 23's entree before it reaches the dining room; confirm peanut oil/garnish presence; halt service of that plate immediately.
3. Hand plate back to kitchen expeditor; state clearly: 'Re-fire Table 23 Seat 1, strict peanut anaphylaxis, clean pans and sterile utensils only.'
4. Pivot directly to Table 22: provide waters, offer menus, and state: 'Good evening, welcome! I'll be right with you with our specials in just two minutes.'
5. Pass Table 24 on return path: top off waters from pitcher, deliver warm bread basket.
6. Access POS terminal to split Table 21 check: total bill $246.75 split equally by 3 ($82.25 per card).
7. Print 3 individual merchant and customer charge slips; verify sum equals $246.75.
8. Return to Table 23 expo window: verify fresh re-fire plate has allergen marker toothpick and was inspected by chef.
9. Deliver safe entree to Table 23 Seat 1 with personal reassurance.
10. Present three-way split check portfolio to Table 21 with three pens.

## Success checks

- Allergen contamination zero-exposure verified.
- Table 22 wait time logged < 120 seconds.
- Financial balance discrepancy equals exactly $0.00 across split payments.

## Game actions

intercept_allergy_plate, notify_kitchen_replate, greet_table_22_express, refill_table_24, split_pos_bill_three_ways, process_card_receipts

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (75.0% pass rate).
To transfer to real-world deployment, map the game actions (intercept_allergy_plate, notify_kitchen_replate, greet_table_22_express, refill_table_24, split_pos_bill_three_ways, process_card_receipts) to physical appliance adapters or device APIs.
