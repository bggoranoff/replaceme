---
name: deliver-entrees
description: Pick up plated dinners from the Kitchen Pass and deliver them to Table 1 without spills or auctioning food.
role: waitress
level: 2
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "80.0%"
---

# Tray Balancing & Pivot Delivery

Level 2 of the waitress practice environment.
Goal: Pick up plated dinners from the Kitchen Pass and deliver them to Table 1 without spills or auctioning food.

## Procedure

1. Lift the heavy oval banquet tray with both hot plates.
2. Raise tray balance stability slider above 85%.
3. Approach Seat 1 from the guest's left side without reaching over diner space.
4. Ensure food is not auctioned off by keeping silent pivot memory.
5. Confirm delivery of both plates.

## Success checks

- tray_stability_pct >= 85
- service_side == "Guest's Left"
- auction_food_query == false
- confirm_plates_placed == true

## Game actions

Adjust Tray Balance, Approach Table 1, Position Service Stance, Place Seat 1 Dish

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (80.0% pass rate).
To transfer to real-world deployment, map the game actions (Adjust Tray Balance, Approach Table 1, Position Service Stance, Place Seat 1 Dish) to physical appliance adapters or device APIs.
