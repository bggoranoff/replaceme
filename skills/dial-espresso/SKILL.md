---
name: dial-espresso
description: Adjust grind setting and distribution to eliminate channeling, achieving balanced sweetness and acidity.
role: barista
level: 2
training_evidence:
  episodes_evaluated: 10
  simulation_win_rate: "80.0%"
---

# Dial in Espresso Extraction

Level 2 of the barista practice environment.
Goal: Extract a 1:2 ratio espresso (18g in, 36g out) in 27–30 seconds with rich crema

## Procedure

1. Dose exactly 18.0g of coffee beans and grind into dry portafilter basket
2. Use WDT needle tool or tap to distribute grounds evenly without clumps
3. Tamp firmly and level with 15kg pressure
4. Flush group head for 2 seconds to stabilize brew temperature at 93°C
5. Insert and lock portafilter; immediately tare cup and scale under spouts
6. Engage 9-bar brew pump and stop shot at 36g yield (target: 28 seconds)

## Success checks

- Dose 18g, yield 36g (1:2 ratio)
- Shot run time 27-30 seconds
- Balanced TDS and rich crema

## Game actions

weighDose18g, distributeGrounds, tampLevel15kg, flushGroupHead, lockPortafilter, startShot, stopAt36g

## Transfer

Trained and verified across 10 stochastic simulation episodes in ReplaceMe (80.0% pass rate).
To transfer to real-world deployment, map the game actions (weighDose18g, distributeGrounds, tampLevel15kg, flushGroupHead, lockPortafilter, startShot, stopAt36g) to physical appliance adapters or device APIs.
