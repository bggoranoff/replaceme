---
name: take-order
description: Record Table 1's entree selections with the requested gluten allergy modifier and transmit the order at the POS Terminal.
role: waitress
level: 1
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "100.0%"
---

# Pivot Order & Allergy Tagging

Level 1 of the waitress practice environment.
Goal: Record Table 1's entree selections with the requested gluten allergy modifier and transmit the order at the POS Terminal.

## Procedure

1. Review diner order specifications for Table 1.
2. Select the correct entrees matching seat pivot points.
3. Toggle the gluten-free warning to avoid kitchen cross-contamination.
4. Set Ribeye doneness to Medium-Rare.
5. Send the order ticket to the kitchen pass.

## Success checks

- seat_1_entree == 'Pan-Seared Salmon'
- allergy_gluten_free == true
- seat_2_entree == 'Ribeye Steak'
- steak_doneness == 'Medium-Rare'
- send_to_kitchen == true

## Game actions

Select Seat 1 Entree, Tag Allergy Alert, Select Seat 2 Entree and Temp, Send Ticket to Kitchen

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (100.0% pass rate).
To transfer to real-world deployment, map the game actions (Select Seat 1 Entree, Tag Allergy Alert, Select Seat 2 Entree and Temp, Send Ticket to Kitchen) to physical appliance adapters or device APIs.
