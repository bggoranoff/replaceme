---
name: rush-order-multi-drink
description: Coordinate grinder, steam wand, and espresso station to craft an Oat Cortado and an Iced Americano within 90 seconds.
role: barista
level: 4
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "65.0%"
---

# Morning Rush Hour

Level 4 of the barista practice environment.
Goal: Coordinate grinder, steam wand, and espresso station to craft an Oat Cortado and an Iced Americano within 90 seconds.

## Procedure

1. Prepare cold cup with ice and cold water at service counter
2. Dose and lock first basket, start extraction directly over cold water base
3. Dose second basket immediately, extract double shot into cortado glass
4. Steam cold oat milk to 58°C, texturing gently for low volume pitcher
5. Pour cortado to rim, cap Americano, clear portafilters, and ring ticket

## Success checks

- Confirm Iced Americano crema crown is preserved over cold water
- Confirm oat milk is smooth without curdling or phase separation
- Verify all portafilters rinsed and re-locked into heated groups
- Confirm ticket served within 90 seconds

## Game actions

Read ticket sequence and queue drink prep order, Fill cold cup with 180g ice and 150ml filtered cold water, Grind and pull shot 1 over ice for Iced Americano, Grind and pull shot 2 into cortado glass, Steam 120ml oat milk to 58°C and pour 1:1 ratio cortado, Place both finished drinks on service counter ticket trays

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (65.0% pass rate).
To transfer to real-world deployment, map the game actions (Read ticket sequence and queue drink prep order, Fill cold cup with 180g ice and 150ml filtered cold water, Grind and pull shot 1 over ice for Iced Americano, Grind and pull shot 2 into cortado glass, Steam 120ml oat milk to 58°C and pour 1:1 ratio cortado, Place both finished drinks on service counter ticket trays) to physical appliance adapters or device APIs.
