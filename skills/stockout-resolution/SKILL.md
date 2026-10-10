---
name: stockout-resolution
description: Check inventory, communicate shortage courteously, present delicious alternatives (almond/soy/dairy), and confirm choice before preparing.
role: barista
level: 3
training_evidence:
  episodes_evaluated: 10
  simulation_win_rate: "90.0%"
---

# Handle Milk Stockout & Order Substitution

Level 3 of the barista practice environment.
Goal: Politely resolve an oat milk latte order when oat milk is out of stock without delaying queue

## Procedure

1. Check milk fridge and verify oat milk supply is at 0 cartons
2. Politely notify customer: 'I apologize, we are out of oat milk this morning'
3. Offer immediate alternatives: 'We have fresh almond milk or organic soy which pair great with this roast'
4. Wait for customer agreement before steaming
5. Prepare selected alternative and serve with a warm smile and discount token

## Success checks

- Shortage detected before pulling shot
- Customer consent explicitly received
- No negative inventory allowed

## Game actions

checkStock, explainShortage, offerAlmondOrSoy, confirmChoice, prepareDrink, serveWithApology

## Transfer

Trained and verified across 10 stochastic simulation episodes in ReplaceMe (90.0% pass rate).
To transfer to real-world deployment, map the game actions (checkStock, explainShortage, offerAlmondOrSoy, confirmChoice, prepareDrink, serveWithApology) to physical appliance adapters or device APIs.
