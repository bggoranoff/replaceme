---
name: three-plate-carry-and-service-delivery
description: Physical balancing skills prevent accidents and maintain dining room elegance. Delivering without asking 'who got the salmon?' preserves professional immersion, and timely check-backs catch errors before plates are finished.
role: waitress
level: 2
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "90.0%"
---

# Three-Plate Carry & Two-Bite Check-Back

Level 2 of the waitress practice environment.
Goal: Transport three hot 28cm entree plates simultaneously using the three-plate carry technique, deliver each plate to the correct guest from the left without auctioning, and execute a two-minute check-back.

## Procedure

1. Inspect plates at expo line: verify clean rims, correct garnishes, and confirm table/seat ticket assignment.
2. Pick up Plate 1 with non-dominant (left) hand: grip under-rim with thumb and index finger.
3. Slide Plate 2 onto the shelf created by your wrist, forearm, and remaining three fingers extended flat.
4. Pick up Plate 3 with your dominant (right) hand.
5. Walk smoothly to table, maintaining upright posture without looking down at the plates.
6. Approach Seat 1 from their left side; set down Plate 3 using your right hand with protein rotated to 6 o'clock position.
7. Transfer Plate 2 to your right hand and set down from the left of Seat 2.
8. Set down Plate 1 from the left of Seat 3.
9. Step away, begin internal 120-second timer.
10. Return at 120 seconds once two bites are consumed; ask specific inquiry: 'How is the temperature on your ribeye this evening?'

## Success checks

- Plate rim cleanliness: no fingerprints within 2.5cm of food surface.
- Protein orientation: aligned between 5 o'clock and 7 o'clock relative to guest.
- Check-back executed at timestamp between 120s and 180s post-delivery.

## Game actions

inspect_plates_at_expo, lock_three_plate_carry, deliver_plates_from_left, timer_two_minute_check, assess_guest_satisfaction

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (90.0% pass rate).
To transfer to real-world deployment, map the game actions (inspect_plates_at_expo, lock_three_plate_carry, deliver_plates_from_left, timer_two_minute_check, assess_guest_satisfaction) to physical appliance adapters or device APIs.
