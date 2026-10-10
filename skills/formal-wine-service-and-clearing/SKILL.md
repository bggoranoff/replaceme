---
name: formal-wine-service-and-clearing
description: Beverage service requires dexterity, etiquette, and composure. Mastering the waiter's corkscrew and knowing proper pouring order elevates guest perception and bill averages while crumbing prepares the table for dessert.
role: waitress
level: 3
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "90.0%"
---

# Bottle Wine Presentation, Service & Table Crumbing

Level 3 of the waitress practice environment.
Goal: Present, open, and pour a bottle of red wine to the host and guests following Court of Master Sommeliers protocol, followed by clearing dinner plates from the right and crumbing the table.

## Procedure

1. Present unopened bottle resting in folded linen to the host (Seat 2), showing the label upright while stating: '2019 Jordan Cabernet Sauvignon from Alexander Valley.'
2. Cut the capsule cleanly beneath the lower lip using the serrated foil cutter blade; stow foil in apron pocket.
3. Insert worm into center of cork; turn 5.5 revolutions without piercing the bottom of the cork.
4. Engage first lever boot on lip, then second lever; ease cork out gently with hand, muffling any popping sound.
5. Remove cork from worm and place on small underliner to the right of the host's glass.
6. Wipe bottle lip with clean service linen.
7. Pour a 30ml (1 oz) sample into the host's glass from their right side; step back and await nod of approval.
8. Upon approval, proceed clockwise pouring 150ml (5 oz) pours: Seat 1 first, then Seat 3, then Seat 4, returning to Seat 2 (host) last.
9. Once dinner is concluded, clear plates from the right using the two-plate scraping and stacking technique.
10. Run the metal crumber across the white tablecloth from left to right onto a service tray to capture stray bread crumbs.

## Success checks

- No foil fragments or cork sediment in any wine glass.
- Zero wine drips landed on tablecloth (quarter-turn wrist roll verified).
- Pour sequence adhered to standard protocol (ladies first, host last).
- Table cleared and crumbed before dessert menu presentation.

## Game actions

present_wine_label, cut_foil_lower_lip, extract_cork_quietly, pour_host_taste, serve_guests_order, clear_dishes_from_right, crumb_tablecloth

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (90.0% pass rate).
To transfer to real-world deployment, map the game actions (present_wine_label, cut_foil_lower_lip, extract_cork_quietly, pour_host_taste, serve_guests_order, clear_dishes_from_right, crumb_tablecloth) to physical appliance adapters or device APIs.
