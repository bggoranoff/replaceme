---
name: clear-and-bus
description: Clear finished plates and used silverware from Table 1, then scrape and sort ware into the Side Service Station bus tub.
role: waitress
level: 3
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "95.0%"
---

# Pre-Bussing & Table Maintenance

Level 3 of the waitress practice environment.
Goal: Clear finished plates and used silverware from Table 1, then scrape and sort ware into the Side Service Station bus tub.

## Procedure

1. Clear empty dishware using the three-plate clearing technique.
2. Carry between 2 and 4 plates safely to the Side Service Station.
3. Scrape remaining food debris before nesting plates.
4. Separate knives and forks into dedicated soak cups.
5. Mark the table as crumbed and ready for dessert or billing.

## Success checks

- stacked_plate_count >= 2
- stacked_plate_count <= 4
- scrape_food_remnants == true
- separate_flatware == true
- crumb_table_cleared == true

## Game actions

Stack Cleared Plates, Scrape Food Scraps, Separate Cutlery, Offer Dessert & Coffee

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (95.0% pass rate).
To transfer to real-world deployment, map the game actions (Stack Cleared Plates, Scrape Food Scraps, Separate Cutlery, Offer Dessert & Coffee) to physical appliance adapters or device APIs.
