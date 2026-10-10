---
name: settle-check
description: Split Table 1's final tab evenly between 2 cards, apply the requested 20% gratuity, and print customer merchant copies.
role: waitress
level: 4
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "95.0%"
---

# Check Splitting & Payment Settlement

Level 4 of the waitress practice environment.
Goal: Split Table 1's final tab evenly between 2 cards, apply the requested 20% gratuity, and print customer merchant copies.

## Procedure

1. Open Table 1 ticket on the POS screen.
2. Divide total balance evenly across 2 diners.
3. Select Split Credit Card processing.
4. Enter exactly 20% gratuity.
5. Print customer receipts and close the table session.

## Success checks

- split_covers == 2
- payment_type == 'Split Credit Card'
- gratuity_pct == 20
- print_receipts_and_close == true

## Game actions

Split Tab by Seat, Select Payment Method, Apply Gratuity Percentage, Finalize POS Closeout

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (95.0% pass rate).
To transfer to real-world deployment, map the game actions (Split Tab by Seat, Select Payment Method, Apply Gratuity Percentage, Finalize POS Closeout) to physical appliance adapters or device APIs.
