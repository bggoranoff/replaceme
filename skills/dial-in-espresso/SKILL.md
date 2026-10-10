---
name: dial-in-espresso
description: Dose 18.0g of coffee into the portafilter and extract a 36.0g double shot in 27 to 30 seconds.
role: barista
level: 1
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "75.0%"
---

# The Golden Ratio

Level 1 of the barista practice environment.
Goal: Dose 18.0g of coffee into the portafilter and extract a 36.0g double shot in 27 to 30 seconds.

## Procedure

1. Weigh ground coffee dose to 18.0g using precision scale
2. Set grinder collar to optimal espresso range (2.2 - 2.5)
3. Engage WDT distribution and level tamp into 58mm basket
4. Flush grouphead, engage portafilter immediately, and stop shot at 36g

## Success checks

- Check that portafilter basket is dry and preheated
- Verify 9 bar pump gauge pressure during flow
- Confirm no spritzing from bottomless portafilter
- Check shot timer matches target recipe window

## Game actions

Tare scale and weigh dry coffee dose, Adjust grind fineness collar, Distribute grounds with WDT tool and tamp at 15kg pressure, Flush grouphead for 2 seconds, Lock portafilter and engage brew pump

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (75.0% pass rate).
To transfer to real-world deployment, map the game actions (Tare scale and weigh dry coffee dose, Adjust grind fineness collar, Distribute grounds with WDT tool and tamp at 15kg pressure, Flush grouphead for 2 seconds, Lock portafilter and engage brew pump) to physical appliance adapters or device APIs.
