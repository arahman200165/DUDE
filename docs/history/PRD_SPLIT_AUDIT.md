# PRD Split — Content Preservation Audit

Audited against the original 8,109-line `DUDE_PRD.md` in commit `b51fd71b785aea04774ab5d6decffc1bbf366c9a`. The comparison reads the original directly from Git, independently of the extraction script and its prior coverage claims. It compares that source with the ten split specifications in the working tree.

**Result after corrections: no original prose, list item, table content, code example or phase completion detail remains missing.** The first split was not fully lossless: twelve opening entries were condensed, and one subsection-specific reference was broadened. Both findings are corrected below.

## Findings and Corrections

1. **Original opening block omitted as a complete record.** The first check started at the numbered sections and missed original lines 5–18. Ten metadata entries, the resources entry and the consolidation note had been summarized or dispersed. Their full wording is now restored **verbatim**, including audience, platform targets, Phase 100 horizon, priorities, status convention and source resources, in [Original Consolidated PRD Header](DECISION_LOG.md#original-consolidated-prd-header). The restored block is checked as an exact substring of the original, including its Markdown formatting.
2. **Appendix subsection pointer broadened.** Original line 649 referred specifically to Appendix D §D.1. The split linked to its parent Commercialization Context heading. [The historical amendment](DELIVERY_HISTORY.md#historical-amendments-preserved) now links directly to [Non-authoritative monetization sketch](DECISION_LOG.md#non-authoritative-monetization-sketch), retaining the original specificity. The underlying sentence was already present.

My earlier preservation check covered extracted heading/body units and code examples; it did not independently account for the original opening block. This audit closes that gap.

## Complete Comparison Results

| Check | Original material checked | Result |
|---|---:|---|
| Prose, list items and table rows | 4,410 content records | 0 missing |
| Exact textual matches | 4,231 records | Same text after trimming surrounding whitespace |
| Cross-reference-only changes | 179 records | Other words, punctuation, values, list numbers and checkbox states unchanged |
| Rewritten reference destinations | 179 changed records | Original section, phase or appendix-subsection identities retained |
| Original numbered-section/subsection and appendix headings | 493 | Mapped to retained titles, declared structural renames or retained anchors |
| List hierarchy | 2,935 list items | Leading indentation unchanged |
| Complete original tables | 27 | Headers, column separators, row order and cell values preserved; only reference syntax normalized |
| Original code/example blocks | 60 | Language labels and content identical after LF/CRLF normalization |
| Code and table placement | 87 blocks | Remain under the corresponding original subject, accounting for heading renames |
| Completed Phase 0–31 heading annotations | 32 | Complete original wording retained in the corresponding phase's Status line |
| Subsection continuity | 466 prose/list/table bodies | Retained together in the corresponding current heading body |
| Intentionally split subsection | 1: Accessibility | All 23 original content records accounted for across UX and release gates |

The 493 heading units include 26 units with no ordinary prose/list/table records; any fenced examples beneath those headings are covered by the separate code checks. The document title, master-document subtitle, old Contents list, blank lines, horizontal separators and explicit navigation anchors are structural material, not counted as content records.

## Method and Limits

- The content comparison preserves duplicate occurrences. Finding one instance of a repeated sentence does not satisfy every original occurrence.
- Navigation normalization only recognizes original section references, their replacement document links, phase references and appendix references. It does not discard ordinary numbers, dates, milestone IDs, measurements, tool names, qualifiers, list labels or requirement text.
- Reference destinations are checked separately, so changing a pointer cannot pass merely because its syntax is normalized.
- Whole tables are compared in order, not just as individual rows. Code/example blocks are hashed with their language labels, and their heading context is checked separately.
- The original heading bodies are checked as contiguous content within current heading bodies. Accessibility is reviewed explicitly as two retained fragments: 16 UX records and 7 acceptance records.
- This is a document-preservation audit. Historical implementation claims and test results remain historical; this audit does not assert a new runtime verification of DUDE.

The exact LF-normalized source SHA-256 is `53c6ebee60c181feb908346f235b62d18a48afb07bf5b07f4f4ffc7c9300858d`.

## Changes That Were Reorganization or Additions

The split was not a byte-for-byte file move. Global section numbers were removed from prose headings, headings were retitled or moved, completed phase annotations moved into Status lines, and the old Contents list was replaced by per-document navigation. Phase and milestone identifiers remain intact.

The master overview, authority order, document ownership descriptions, completed-phase roadmap summaries, decision index, functional overviews and domain/category map also include new connective summaries. They were additions, not replacements for the full original requirements or delivered inventories. This audit does not present those additions as verbatim source material.

The complete Phase 0–31 narratives remain in [Delivery History](DELIVERY_HISTORY.md); all planned Phase 31A–31J and Phase 32–100 detail remains in [Roadmap](../delivery/ROADMAP.md). All five original appendices remain in [Decision Log](DECISION_LOG.md).

## Section-by-Section Accounting

“Records” means original nonblank prose lines, list items and table rows outside fenced code. Table rule lines and headings are checked separately. “Reference changes” means that only cross-reference syntax differs. Counts do not include the new overview/navigation material.

| Original section | Records | Text unchanged | Reference changes | Missing | Current destination(s) |
|---|---:|---:|---:|---:|---|
| Front matter | 12 | 12 | 0 | 0 | [DECISION_LOG.md](DECISION_LOG.md) |
| 1. Executive Summary | 76 | 72 | 4 | 0 | [DUDE_PRD.md](../DUDE_PRD.md), [DELIVERY_HISTORY.md](DELIVERY_HISTORY.md) |
| 2. Core Product Goal | 22 | 22 | 0 | 0 | [DUDE_PRD.md](../DUDE_PRD.md) |
| 3. Historical V1 Success Criteria and Continuing Principles | 47 | 46 | 1 | 0 | [DELIVERY_HISTORY.md](DELIVERY_HISTORY.md) |
| 4. Product Principles | 113 | 108 | 5 | 0 | [DUDE_PRD.md](../DUDE_PRD.md) |
| 5. Product Scope Boundaries | 115 | 92 | 23 | 0 | [DELIVERY_HISTORY.md](DELIVERY_HISTORY.md), [DUDE_PRD.md](../DUDE_PRD.md), [SECURITY_ARCHITECTURE.md](../architecture/SECURITY_ARCHITECTURE.md), [PRODUCT_SPEC.md](../product/PRODUCT_SPEC.md) |
| 6. Target User | 85 | 85 | 0 | 0 | [DUDE_PRD.md](../DUDE_PRD.md), [PRODUCT_SPEC.md](../product/PRODUCT_SPEC.md) |
| 7. Supported Platform | 43 | 42 | 1 | 0 | [PRODUCT_SPEC.md](../product/PRODUCT_SPEC.md), [UX_SPEC.md](../product/UX_SPEC.md) |
| 8. Visual Direction | 71 | 61 | 10 | 0 | [UX_SPEC.md](../product/UX_SPEC.md) |
| 9. Navigation and Information Architecture | 39 | 36 | 3 | 0 | [UX_SPEC.md](../product/UX_SPEC.md) |
| 10. Web Delivery and Routing — Standalone Companion and Hub Web | 36 | 36 | 0 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md), [PRODUCT_SPEC.md](../product/PRODUCT_SPEC.md) |
| 11. PWA, Local Execution and Distributed Offline Behavior | 64 | 64 | 0 | 0 | [PRODUCT_SPEC.md](../product/PRODUCT_SPEC.md), [SECURITY_ARCHITECTURE.md](../architecture/SECURITY_ARCHITECTURE.md) |
| 12. Tool Architecture | 36 | 34 | 2 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) |
| 13. Shared Tool Shell | 17 | 17 | 0 | 0 | [UX_SPEC.md](../product/UX_SPEC.md) |
| 14. State and Persistence Model | 184 | 184 | 0 | 0 | [DATA_SYNC_ARCHITECTURE.md](../architecture/DATA_SYNC_ARCHITECTURE.md) |
| 15. Worker Execution Layer | 21 | 20 | 1 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) |
| 16. Error and Failure Isolation | 17 | 17 | 0 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) |
| 17. Dependency Philosophy | 20 | 20 | 0 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) |
| 18. Testing Strategy | 42 | 41 | 1 | 0 | [QUALITY_AND_RELEASE.md](../delivery/QUALITY_AND_RELEASE.md) |
| 19. Accessibility Baseline | 23 | 22 | 1 | 0 | [UX_SPEC.md](../product/UX_SPEC.md), [QUALITY_AND_RELEASE.md](../delivery/QUALITY_AND_RELEASE.md) |
| 20. Initial Showcase Tool Set | 14 | 10 | 4 | 0 | [DELIVERY_HISTORY.md](DELIVERY_HISTORY.md) |
| 21. Roadmap | 2565 | 2503 | 62 | 0 | [ROADMAP.md](../delivery/ROADMAP.md), [DELIVERY_HISTORY.md](DELIVERY_HISTORY.md) |
| 22. API Integration Architecture | 29 | 29 | 0 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md), [SECURITY_ARCHITECTURE.md](../architecture/SECURITY_ARCHITECTURE.md) |
| 23. Repository, Hub and Device Architecture | 90 | 89 | 1 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) |
| 24. Suggested Tool Definition Pattern | 14 | 14 | 0 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) |
| 25. Shared Services | 75 | 74 | 1 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md), [SECURITY_ARCHITECTURE.md](../architecture/SECURITY_ARCHITECTURE.md) |
| 26. Command Palette Requirements | 14 | 13 | 1 | 0 | [UX_SPEC.md](../product/UX_SPEC.md) |
| 27. Deck Requirements | 12 | 11 | 1 | 0 | [UX_SPEC.md](../product/UX_SPEC.md) |
| 28. Tool UX Conventions | 10 | 10 | 0 | 0 | [UX_SPEC.md](../product/UX_SPEC.md) |
| 29. Large Inputs | 10 | 10 | 0 | 0 | [PRODUCT_SPEC.md](../product/PRODUCT_SPEC.md) |
| 30. Sensitive Inputs | 19 | 19 | 0 | 0 | [SECURITY_ARCHITECTURE.md](../architecture/SECURITY_ARCHITECTURE.md) |
| 31. Security Boundaries | 46 | 46 | 0 | 0 | [SECURITY_ARCHITECTURE.md](../architecture/SECURITY_ARCHITECTURE.md) |
| 32. Performance Strategy | 23 | 23 | 0 | 0 | [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md), [QUALITY_AND_RELEASE.md](../delivery/QUALITY_AND_RELEASE.md) |
| 33. Build and Deployment | 126 | 125 | 1 | 0 | [QUALITY_AND_RELEASE.md](../delivery/QUALITY_AND_RELEASE.md), [SECURITY_ARCHITECTURE.md](../architecture/SECURITY_ARCHITECTURE.md) |
| 34. Documentation Deliverables | 33 | 33 | 0 | 0 | [QUALITY_AND_RELEASE.md](../delivery/QUALITY_AND_RELEASE.md) |
| 35. Definition of Done | 66 | 62 | 4 | 0 | [DELIVERY_HISTORY.md](DELIVERY_HISTORY.md), [QUALITY_AND_RELEASE.md](../delivery/QUALITY_AND_RELEASE.md) |
| 36. Deferred Definition | 20 | 19 | 1 | 0 | [PRODUCT_SPEC.md](../product/PRODUCT_SPEC.md) |
| Appendix A — Interview Questions and Answers | 23 | 20 | 3 | 0 | [DECISION_LOG.md](DECISION_LOG.md) |
| Appendix B — V1 Scope in One Sentence (Delivered) | 2 | 1 | 1 | 0 | [DECISION_LOG.md](DECISION_LOG.md) |
| Appendix C — Scope Evolution Record | 63 | 58 | 5 | 0 | [DECISION_LOG.md](DECISION_LOG.md) |
| Appendix D — Commercialization Context | 9 | 8 | 1 | 0 | [DECISION_LOG.md](DECISION_LOG.md) |
| Appendix E — Reconciliation Decisions and Requirement Traceability | 64 | 23 | 41 | 0 | [DECISION_LOG.md](DECISION_LOG.md) |

## Accessibility Split

[UX Specification → Accessibility](../product/UX_SPEC.md#accessibility) retains keyboard reachability, visible focus, semantic controls, labels, keyboard dismissal, understandable navigation, non-color cues, high contrast, forced colors, reduced motion, color-blind-safe choices and the certification scope limit.

[Quality and Release → Accessibility Gates](../delivery/QUALITY_AND_RELEASE.md#accessibility-gates) retains all five numeric contrast/separation requirements and the complete Playwright acceptance paragraph: 864 appearance combinations, the 108-combination layout matrix and all three tested viewport sizes. Nothing in the original accessibility requirements was dropped.

## Local Audit Evidence

The full original-line → destination-file/line trace, code hashes, whole-table matches, heading checks, reference checks and per-phase status checks are in `tmp/prd-audit/results.json`. The repeatable checker is `tmp/prd-audit/audit.mjs` and pins the original commit above. These are local, Git-ignored audit artifacts; this report is the retained repository record.
