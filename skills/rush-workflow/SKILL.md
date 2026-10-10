---
name: rush-workflow
description: Interleave grinding, milk steaming, and espresso extraction so that milk and espresso finish simultaneously for each cup.
role: barista
level: 4
training_evidence:
  episodes_evaluated: 10
  simulation_win_rate: "100.0%"
---

# Multi-Order Barista Rush Prioritization

Level 4 of the barista practice environment.
Goal: Queue and prepare 3 concurrent espresso drinks in under 120 seconds while maintaining standards

## Procedure

1. Review ticket sequence: Americano (hot water first), then Cortado, then Latte
2. Dose and lock espresso for drink 1; while shot extracts, steam milk for drink 2
3. Pour drink 1, rinse pitcher immediately, and stage cup 2
4. Grind dose 2, start extraction, and steam milk for drink 3
5. Serve all completed drinks and wipe steam wand and prep counter

## Success checks

- Total time under 120 seconds
- Clean workstation between drinks
- All drinks served hot and fresh

## Game actions

grindNextDose, steamMilk, pourSimultaneously, rinsePitcher, cleanPortafilter, handOffDrink

## Transfer

Trained and verified across 10 stochastic simulation episodes in ReplaceMe (100.0% pass rate).
To transfer to real-world deployment, map the game actions (grindNextDose, steamMilk, pourSimultaneously, rinsePitcher, cleanPortafilter, handOffDrink) to physical appliance adapters or device APIs.
