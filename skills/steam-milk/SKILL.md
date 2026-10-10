---
name: steam-milk
description: Master aeration, whirlpool vortex texturing, and precise thermal cutoff to create silky microfoam without large bubbles.
role: barista
level: 1
training_evidence:
  episodes_evaluated: 10
  simulation_win_rate: "90.0%"
---

# Milk Steaming & Microfoam Texturing

Level 1 of the barista practice environment.
Goal: Steam whole milk to 60–65°C with glossy microfoam suitable for latte art

## Procedure

1. Purge steam wand for 1 second over drip tray to clear condensation
2. Submerge wand tip 1cm below surface and tilt pitcher 15 degrees to establish whirlpool
3. Open steam valve fully; introduce air gently until pitcher reaches body temp (37°C)
4. Submerge wand slightly deeper to incorporate microfoam in a silent rolling vortex
5. Shut off steam valve as thermometer passes 60°C so thermal momentum settles at 62-65°C
6. Wipe wand thoroughly with damp cloth and purge steam immediately

## Success checks

- Final temperature between 60°C and 65°C
- Glossy microfoam with micro-bubbles < 0.5mm
- Steam wand clean and purged

## Game actions

purgeWand, insertWandTip, tiltPitcher15deg, openSteamValve, rollVortex, stopAt65C, wipeAndPurge

## Transfer

Trained and verified across 10 stochastic simulation episodes in ReplaceMe (90.0% pass rate).
To transfer to real-world deployment, map the game actions (purgeWand, insertWandTip, tiltPitcher15deg, openSteamValve, rollVortex, stopAt65C, wipeAndPurge) to physical appliance adapters or device APIs.
