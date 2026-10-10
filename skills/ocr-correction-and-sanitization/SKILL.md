---
name: ocr-correction-and-sanitization
description: Scanned documents often yield OCR errors where '0' becomes 'O', '1' becomes 'l', or random keystrokes appear. Operators must normalize strings into standard formatting.
role: data_entry_specialist
level: 2
training_evidence:
  episodes_evaluated: 20
  simulation_win_rate: "90.0%"
---

# OCR Exception Handling & String Normalization

Level 2 of the data_entry_specialist practice environment.
Goal: Reconcile degraded optical character recognition (OCR) output against source scans, correcting character confusion errors within 45 seconds per record.

## Procedure

1. Split terminal view: digital scan on left display, OCR buffer on right display
2. Scan string for common substitution pitfalls (0 vs O, 1 vs I/l, 5 vs S, 8 vs B)
3. Replace corrupted characters with validated glyphs from source scan
4. Execute automated regex check (Format: ^[A-Z]{3}-[0-9]{5}-[A-Z0-9]$) via Ctrl+Enter
5. Commit record and move immediately to next manifest in queue

## Success checks

- Regex compliance score equals 100%
- Total cycle time for 20 manifests <= 15 minutes
- Zero rejected records upon database ingest

## Game actions

load_manifest_scan, compare_ocr_against_scan, correct_substitution_error, apply_trim_and_casing, validate_against_regex

## Transfer

Trained and verified across 20 stochastic simulation episodes in ReplaceMe (90.0% pass rate).
To transfer to real-world deployment, map the game actions (load_manifest_scan, compare_ocr_against_scan, correct_substitution_error, apply_trim_and_casing, validate_against_regex) to physical appliance adapters or device APIs.
