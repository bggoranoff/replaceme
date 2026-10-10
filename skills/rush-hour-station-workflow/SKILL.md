---
name: rush-hour-station-workflow
description: During morning peak hours, orders stack quickly. Baristas must stagger workflows: grinding and tamping shot #2 while shot #1 is brewing, steaming milk simultaneously, and keeping the bar sanitised without burning out or cross-contaminating dairy and plant milks.
role: barista
level: 4
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "80.0%"
---

# Peak Rush: High-Volume Queue Sequencing

Level 4 of the barista practice environment.
Goal: Complete a sequence of 3 complex multi-drink tickets (total 6 drinks) in under 5 minutes while maintaining extraction windows, milk temperatures, and order modifications.

## Procedure

1. Read tickets; prep cold cup with 2 pumps (20ml) sugar-free vanilla, 150g ice, and 180ml oat milk first.
2. Dose 18g espresso into Group 1 for iced latte; dose 18g into Group 2 for the single double espresso.
3. Start both shots concurrently; drop demitasse under Group 2 and shot glass under Group 1.
4. While shots extract, pour shot #1 over cold cup; seal and stage Ticket 1 Double Espresso and Iced Latte.
5. Empty and wipe Group 1 & 2 portafilters; dose two fresh 18g shots for Ticket 2 Flat Whites.
6. Start extraction for both Flat Whites into 150ml ceramic cups; pour 320ml whole milk into 600ml pitcher.
7. Steam whole milk pitcher to 62°C, purge and wipe wand, split milk into two 350ml pitchers and pour both tulips simultaneously.
8. Stage Ticket 2; flush groups; dose Group 1 for Long Black (fill cup with 120ml hot water from boiler, pull shot on top).
9. Dose Group 2 for Almond Cappuccino; steam 160ml almond milk in dedicated pitcher to 65°C, purge/wipe with plant cloth.
10. Pour almond cappuccino, wipe group handles and bar surface clean, dock empty portafilters, ring tickets complete.

## Success checks

- Total queue elapsed time <= 300s
- No almond or oat residue found on dairy pitchers/cloths
- Long Black crema intact (water poured before espresso)
- Station completely reset: portafilters locked hot, knockbox emptied, wands wiped

## Game actions

review_ticket_queue, batch_ice_and_syrup, parallel_dose_and_extract, steam_staggered_pitchers, sequence_milk_split, pour_iced_beverage, wipe_and_purge_cycle, knock_out_pucks, stage_finished_drinks, sanitize_station

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (80.0% pass rate).
To transfer to real-world deployment, map the game actions (review_ticket_queue, batch_ice_and_syrup, parallel_dose_and_extract, steam_staggered_pitchers, sequence_milk_split, pour_iced_beverage, wipe_and_purge_cycle, knock_out_pucks, stage_finished_drinks, sanitize_station) to physical appliance adapters or device APIs.
