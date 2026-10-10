---
name: pivot-point-greeting-and-order-taking
description: The foundation of all dining room service is establishing prompt rapport, documenting table orders without confusion, and capturing dietary needs early to prevent food safety incidents.
role: waitress
level: 1
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "90.0%"
---

# Station Setup, Greeting & Pivot Point Order Taking

Level 1 of the waitress practice environment.
Goal: Greet a 4-top within 90 seconds, establish seat-by-seat pivot points, systematically probe for dietary restrictions, and ring accurate tickets into the POS without auctioning items.

## Procedure

1. Approach table within 90 seconds with chilled water pitcher and clean menus.
2. Greet guests warmly, place menus face up, and pour iced water from the right side to 80% glass capacity without touching glass rims.
3. Designate Seat 1 directly to your left facing the table, numbering seats 2, 3, and 4 in a clockwise circle.
4. Inquire explicitly: 'Before we begin, are there any food allergies or dietary restrictions at the table today?'
5. Note the Celiac restriction for Seat 3 in order pad using a circled 'AL-GLUTEN' identifier.
6. Capture beverage and entree orders in exact clockwise order: Seat 1, Seat 2, Seat 3, Seat 4.
7. Enter orders into POS terminal within 120 seconds of leaving the table, appending the 'ALLERGY GLUTEN' modifier directly to Seat 3's entree ticket.

## Success checks

- Greeting timestamp <= 90 seconds from seating event.
- Seat numbers 1-4 accurately correspond to physical clockwise seating plan.
- Gluten alert sent to kitchen expeditor screen on POS submission.

## Game actions

greet_table_within_window, distribute_menus_and_fill_water, probe_dietary_restrictions, document_orders_clockwise, transmit_pos_ticket_with_mods

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (90.0% pass rate).
To transfer to real-world deployment, map the game actions (greet_table_within_window, distribute_menus_and_fill_water, probe_dietary_restrictions, document_orders_clockwise, transmit_pos_ticket_with_mods) to physical appliance adapters or device APIs.
