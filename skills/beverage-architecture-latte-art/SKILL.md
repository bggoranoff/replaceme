---
name: beverage-architecture-latte-art
description: A successful barista must match recipe standards (volume, milk-to-espresso ratio, foam thickness) while executing contrast-rich, symmetrical free-pour latte art without overflowing or underfilling the cup.
role: barista
level: 3
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "85.0%"
---

# Beverage Architecture: Free-Pour Latte Art

Level 3 of the barista practice environment.
Goal: Construct a 150ml Flat White with a distinct 5-tier tulip and a 200ml Cappuccino with a centered solid heart and 1.5cm silky foam depth.

## Procedure

1. Pull 36.0g double espresso into the 150ml flat white cup and another 36.0g double espresso into the 200ml cappuccino cup.
2. Steam 160ml milk for flat white with minimal stretch (target 5mm microfoam head).
3. Steam 180ml milk for cappuccino with extended stretch (target 15mm microfoam head).
4. Swirl the espresso in the flat white cup to break crema surface tension and blend oils.
5. For Flat White: Start pour from 8cm above cup to sink milk and integrate a brown canvas until cup is 50% full.
6. Drop pitcher spout close to surface (1cm); pour 4 consecutive gentle bursts pushing milk forward to create tulip stacks.
7. Lift pitcher to 8cm and pour a thin, straight line through center from bottom to top to complete the tulip.
8. For Cappuccino: Pour canvas base to 60% full, drop spout directly to center, increase flow rate to bloom a wide circular heart, lift and cut through.
9. Serve both drinks at rim level with clean handles pointing to 4 o'clock.

## Success checks

- Flat white fill line within 1-3mm from cup lip
- Flat white tulip shows 5 visible tiers with brown borders
- Cappuccino foam depth >= 12mm
- Cup exteriors and saucers free of milk drops or crema smears

## Game actions

extract_double_shot_flat_white, extract_double_shot_cappuccino, steam_milk_thin_foam, steam_milk_thick_foam, swirl_espresso_crema, pour_canvas_base, drop_spout_for_pattern, push_tulip_tiers, strike_through_center, pour_monks_head_heart, dust_cappuccino_border

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (85.0% pass rate).
To transfer to real-world deployment, map the game actions (extract_double_shot_flat_white, extract_double_shot_cappuccino, steam_milk_thin_foam, steam_milk_thick_foam, swirl_espresso_crema, pour_canvas_base, drop_spout_for_pattern, push_tulip_tiers, strike_through_center, pour_monks_head_heart, dust_cappuccino_border) to physical appliance adapters or device APIs.
