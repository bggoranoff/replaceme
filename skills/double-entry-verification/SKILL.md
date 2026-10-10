---
name: double-entry-verification
description: Financial and medical databases require blind secondary entry where the operator re-keys critical fields without seeing the primary operator's values. Any mismatch triggers an immediate collision review.
role: data_entry_specialist
level: 3
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "85.0%"
---

# Blind Double-Entry Verification & Collision Resolution

Level 3 of the data_entry_specialist practice environment.
Goal: Execute blind re-keying on high-consequence transaction fields and resolve discrepancy collisions under strict SLA timers.

## Procedure

1. Open blind record buffer; primary values remain masked in the database backend
2. Key in secondary alphanumeric identifier and monetary value using 10-key numeric pad
3. Press Tab to advance and trigger backend checksum differential comparison
4. If collision warning sounds, review source scan proof at 200% magnification to confirm truth
5. Select definitive character value, input reason code 'SRC_VERIFIED', and stamp record

## Success checks

- Backend discrepancy collision rate resolves to 0 unresolved items
- Audit trail contains operator signature and timestamp on every corrected entry
- Gross entry speed meets or exceeds 10,000 KPH

## Game actions

fetch_blind_record, rekey_critical_fields, trigger_collision_check, inspect_original_source, adjudicate_discrepancy

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (85.0% pass rate).
To transfer to real-world deployment, map the game actions (fetch_blind_record, rekey_critical_fields, trigger_collision_check, inspect_original_source, adjudicate_discrepancy) to physical appliance adapters or device APIs.
