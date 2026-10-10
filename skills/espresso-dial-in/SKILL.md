---
name: espresso-dial-in
description: Espresso is the foundation of almost every specialty drink. Dialing in involves balancing grind size, distribution, and tamp pressure to achieve sweet, balanced solubles without bitter over-extraction or sour under-extraction.
role: barista
level: 1
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "65.0%"
---

# Dialing In: The Precision Espresso Extraction

Level 1 of the barista practice environment.
Goal: Calibrate the grinder to pull a double espresso yielding 36.0g from an 18.0g dry dose in 27 to 30 seconds at 9 bar pressure with zero channeling.

## Procedure

1. Wipe portafilter basket clean and bone dry with dedicated dry cloth.
2. Grind coffee into dosing cup; trim or top up to exactly 18.0g on the 0.1g scale.
3. Transfer coffee into portafilter basket using a dosing funnel.
4. Declump grounds using needle WDT tool down to basket base, then level the surface.
5. Apply even, horizontal tamp with 58.5mm tamper until mechanical resistance is felt; confirm level bed.
6. Flush group head for 2 seconds to clear residual grounds and stabilize group water temperature.
7. Gently lock portafilter into group head without knocking or dislodging the compacted puck.
8. Tare cup on digital scale under spouts and immediately start the shot and timer simultaneously.
9. Stop pump precisely when liquid scale reads 35.0g (accounting for 1.0g post-shutoff drip to land on 36.0g).
10. Record time: if under 27s, adjust grinder finer; if over 30s, adjust grinder coarser; repeat until dialed in.

## Success checks

- Dry dose mass between 17.8g and 18.2g
- Liquid yield between 35.0g and 37.0g
- Shot time between 27.0s and 30.0s
- Group head flushed prior to portafilter engagement

## Game actions

purge_grinder_chamber, adjust_grind_collar, tare_dosing_cup, grind_coffee_dose, inspect_and_adjust_dry_weight, wipe_basket_dry, transfer_grounds_to_portafilter, apply_wdt_distribution, tamp_level_and_firm, flush_group_head, lock_portafilter, place_cup_and_scale, start_brew_timer, cut_extraction_at_target_yield, inspect_puck_surface

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (65.0% pass rate).
To transfer to real-world deployment, map the game actions (purge_grinder_chamber, adjust_grind_collar, tare_dosing_cup, grind_coffee_dose, inspect_and_adjust_dry_weight, wipe_basket_dry, transfer_grounds_to_portafilter, apply_wdt_distribution, tamp_level_and_firm, flush_group_head, lock_portafilter, place_cup_and_scale, start_brew_timer, cut_extraction_at_target_yield, inspect_puck_surface) to physical appliance adapters or device APIs.
