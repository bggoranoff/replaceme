---
name: milk-steaming-microfoam
description: Proper texturing requires two phases: aeration (introducing fine air bubbles before the milk reaches body temperature) and rolling (creating a vortex to homogenize bubbles into microfoam). Overheating denatures whey proteins in cow milk and breaks down oat milk emulsions.
role: barista
level: 2
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "90.0%"
---

# Microfoam Dynamics: Steaming Dairy & Oat Milk

Level 2 of the barista practice environment.
Goal: Steam 200ml whole milk to 60-65°C and 200ml barista oat milk to 55-60°C, producing dense, glossy microfoam with bubbles under 0.5mm and zero scorching.

## Procedure

1. Purge steam wand for 1 second over drip tray to clear water condensation.
2. Pour 180ml of cold (4°C) milk into clean 350ml pitcher (just below internal spout base).
3. Submerge steam wand tip 5mm below milk surface, angled off-center to encourage clockwise rotation.
4. Open steam valve fully; introduce slight paper-ripping hiss sounds to inject micro-air bubbles.
5. Continue aerating only until pitcher feels blood temperature (~37°C / 100°F).
6. Slightly lift pitcher so wand tip is submerged 1.5cm deeper, stopping air entry and maintaining a rapid vortex.
7. Shut off steam valve when thermometer reads 57°C for whole milk (coasts to 62°C) or 52°C for oat milk (coasts to 57°C).
8. Set pitcher down, immediately wipe steam wand with color-coded damp cloth, and purge valve for 1 second.
9. Tap pitcher firmly once on counter to collapse rogue bubbles, then swirl continuously until pouring.

## Success checks

- Whole milk temp between 60.0°C and 65.0°C
- Oat milk temp between 55.0°C and 60.0°C
- Steam wand purge latency under 3.0s
- Texture shows glossy reflective surface with no froth layer separation

## Game actions

purge_wand_condensation, fill_pitcher_to_spout_notch, position_wand_tip_surface, open_steam_valve_100_percent, aerate_until_37c, submerge_wand_tip_half_inch, tilt_pitcher_for_vortex, shut_valve_at_target_cutoff, purge_wand_milk_purge, wipe_wand_immediately, tap_pitcher_and_swirl

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (90.0% pass rate).
To transfer to real-world deployment, map the game actions (purge_wand_condensation, fill_pitcher_to_spout_notch, position_wand_tip_surface, open_steam_valve_100_percent, aerate_until_37c, submerge_wand_tip_half_inch, tilt_pitcher_for_vortex, shut_valve_at_target_cutoff, purge_wand_milk_purge, wipe_wand_immediately, tap_pitcher_and_swirl) to physical appliance adapters or device APIs.
