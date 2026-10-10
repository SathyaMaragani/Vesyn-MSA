---
title: Deviation DEV-2026-031 - Low yield in gefitinib coupling
type: deviation
service: gefitinib
date: 2026-03-05
owner: process-chemistry
---
# Deviation DEV-2026-031: Low yield in gefitinib coupling

> SYNTHETIC DEMO DATA. Invented for a demonstration. Not real laboratory results.

## What happened

Batch GEF-0142 gave 31% isolated yield in the Step 2 coupling, with a bis-arylated impurity as the main by-product.

## Root cause

The root cause is known issue KI-07: the coupling on the unprotected quinazolinone over-arylates when the aniline is in excess during a slow heat-up. The slow heat-up at 120 g kept the mixture in that condition for over an hour.

## Actions

- CA-1: Dose the aniline over two hours instead of charging it at the start. Owner: process-chemistry. Status: open.
- CA-2: Run a repeat batch at 120 g to verify the change. Owner: kilo-lab. Status: open.
- CA-3: Update the route proposal, which still says the step scales without change. Owner: process-chemistry. Status: open.
