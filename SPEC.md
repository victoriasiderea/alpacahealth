# Alpaca Health take-home — working doc

## In one paragraph

The clinician's unit of work is an **authorization cycle**, and it isn't represented in the UI — it lives as a table at the bottom of a tab. Navigation is organized around documents (Treatment Plans) and a static checklist (Care Readiness) instead, so the product can't tell which plan is live, can't show a payer sending one back, and only discovers what's missing at the moment you submit. Making the cycle the page fixes those. The two tabs collapsing into one is a side effect, not the goal.

**Contents** — §1 what's wrong · §2 the fix and why · §3 model · §4 state machine · §5 screens · §6 build plan · §7 scope · §8 open questions · §9 rubric notes _(private)_

Terminology follows the existing product: Care Readiness, Treatment Plans, Create Request, Benefit Check, Prior Authorization Request, Assessment Authorization, First Treatment Authorization, Payor Approved, Care ready, Audited / warnings, Edit in generator, GENERATED IN ALPACA, UPLOADED.

---

## 1. What's actually wrong

The brief describes the symptom: a clinician works across two tabs. The cause is one level down.

**The authorization cycle is what a clinician is working on, and it has no home in the interface.**

It exists in the data. The Prior Authorizations Requests table carries Auth Type, Approved Start Date, Approved End Date, Requested Start and End Date, Status. That is the cycle, modelled correctly — and rendered as a table at the bottom of the second tab.

Meanwhile navigation is organized around two things that aren't the unit of work: **documents** (Treatment Plans) and a **static requirements list** (Care Readiness). Everything below follows from that one dislocation.

### Five symptoms, all evidenced in the current product

**Treatment Plans lists files, not plans.** Abigail Anderson's tab shows three cards. Two are `Jul_smi_Tx_Plan_Jul_2026.pdf`, uploaded at 1:35 PM and 1:37 PM the same day — one upload correcting another. All three carry a green _Care ready_ badge. There is no way to tell which plan is live, or which authorization any of them belongs to. Delete is disabled on all three, so the list only ever grows.

**The plan stepper is four booleans wearing a progress bar.** The third card reads Draft ✓, Checked ○, Finalized ✓, Ready ✓ — it skipped a stage and continued. A real state machine can't do that. It also can't run backward, which is why a payer-requested revision has no representation anywhere in the current UI.

**The Care Readiness rollup contradicts its own contents.** Assessment readiness shows a green _Ready_ badge above a red X on "Diagnosis not uploaded or verified." An _Auth Approved Override_ chip suggests this may be intended. Either way, a summary that disagrees with its detail forces the clinician to open the detail — which is the entire cost the summary existed to remove.

**Every plan card shows seven undifferentiated controls.** Edit in generator, View, Download, Replace, Unfinalize, Delete, Create request. Only one is the right action at any moment. Without cycle state the UI cannot know which, so it shows all seven, always, and the clinician re-reads them on every visit.

**Readiness is computed at submission time, not before.** Create Request opens, the clinician fills in Patient Plan, Request Type, Authorization Type and dates — and only then is told "Supervising clinician NPI is missing." The blocker existed the whole time and was invisible until the last step.

### Why the tabs feel disconnected

Create Request appears on every plan card _and_ on Care Readiness. It is authorization-scoped but rendered document-scoped, which makes it look as though each plan is separately submittable. It is the one control that bridges the two tabs, and its placement is what makes the bridge feel arbitrary.

---

## 2. The solution, and why this shape

**Promote the cycle to the organizing principle.** Once the cycle is a page, both tabs turn out to have been halves of it.

Four consequences, each answering one of the symptoms above:

**One page per cycle, not two tabs.** Treatment Plans was organized around documents; Care Readiness around a checklist. Neither is what the clinician is doing, which is getting one authorization approved. The plan becomes one row in the packet. The readiness list becomes the packet. Nothing is lost — see §5 for where every element lands.

**Readiness belongs to a cycle, not a client.** "Is Marcus ready?" is unanswerable for a client who is authorized under one cycle and mid-reauth on the next. "Is this cycle ready to submit?" is always answerable. This is also what makes the cross-client queue coherent: rows are cycles, so a client with an approved cycle and a pending one appears once, for the cycle with work.

**Packet items are typed by who is blocking.** Not a flat checklist:

| kind      | Meaning                  | Blocked by     | Affordance                   |
| --------- | ------------------------ | -------------- | ---------------------------- |
| `produce` | The clinician makes it   | Their own time | Generate, edit, finalize     |
| `await`   | Someone else acts        | Parent, payor  | Resend, call, + elapsed time |
| `gather`  | Exists somewhere already | Filing         | Attach, verify               |

A stalled signature and a missing NPI are identical in a checklist and nothing alike in reality — one needs a phone call, the other needs a form field. Two lines in the model produce visibly different interfaces. The same typing lifts one level up to group the queue.

**The signature is pinned to a plan version, not to the plan.** This is the single most load-bearing modelling decision. A signature is consent to a specific document. When a payer-requested revision produces v2, the v1 signature no longer points at the current version, so staleness is _derived_ rather than tracked by a boolean someone must remember to flip. It is what makes the Marcus case work.

**One action per row; everything else one level down.** The row shows the action its state calls for — Generate draft, Finalize, Request signature, Edit goals. The other six controls live in the plan drill-in, next to the document they act on. Unfinalize and Delete sit in an overflow because one is a state change and the other is destructive; Delete stays disabled on finalized plans, as today.

**Blockers surface on the page, not in the submit modal.** The NPI becomes a packet row, visible from the moment the page opens. The submit button carries the count. By the time a clinician presses submit, the answer is already known.

---

## 3. Domain model

```
Client
  id, name, dateOfBirth

InsuranceCard
  id, clientId → Client
  payerName, memberId, isPrimary, networkStatus, planType, planStartDate

AuthorizationCycle                      ← the state machine lives here
  id
  clientId             → Client
  insuranceCardId      → InsuranceCard
  authType             assessment_authorization | first_treatment_authorization
  status               discriminated union, see §4 — carries submittedAt on
                       AWAITING_PAYOR, and decidedAt + the approved date window
                       on APPROVED, so an un-submitted cycle cannot hold them
  requestedStartDate, requestedEndDate
  expectedStartOfTreatment
  createdAt
  file                 what is on file, resolves the `gather` items:
                       supervisingClinicianNpi, referralLetterDate,
                       benefitCheckStatus, diagnosisVerified

TreatmentPlan
  id, cycleId → AuthorizationCycle, currentVersionId → PlanVersion

PlanVersion                             ← revisions and re-uploads live here
  id, planId → TreatmentPlan
  versionNumber        (null for a superseded upload)
  origin               generated_in_alpaca | uploaded | revision
  createdAt, supersededAt
  auditWarningCount    their "Audited · N warnings to review"

SignatureRequest
  id, planVersionId → PlanVersion        ← version, not plan
  requestedAt, remindedAt, signedAt
  status               pending | signed | voided

PacketItem                             ← derived on read, never stored
  id (<cycleId>::<key>), cycleId, key
  label                "Treatment plan", "Parent signature", "Referral letter",
                       "Supervising clinician NPI", "Benefit Check", "Diagnosis"
  kind                 produce | await | gather
  status               missing | in_progress | complete

CycleEvent
  id, cycleId, at, kind, note            ← activity log; also derives elapsed time
```

Transitions operate on a `CycleAggregate` — the cycle plus its plan, versions, signatures and events — so `applyEvent(aggregate, event) → aggregate` is pure and self-contained.

`PacketItem` is keyed to the cycle, not the client, because requirements reset per cycle and vary by payer and auth type. The product already proves this: Assessment readiness and Treatment readiness carry different requirement lists, and the NPI and Referral Letter Date requirements come from the payer. `PacketItem`s are never stored on the aggregate — `buildPacket` regenerates them from the `(authType, payer) → template` lookup on every read, with stable ids `<cycleId>::<key>` and status resolved against `cycle.file` and the plan/signature state. The prototype ships one real template per auth type behind that lookup, with a `:default` fallback.

Elapsed time anchors to **when the current state began**, derived from `CycleEvent` — not to the last action taken, which may be unrelated to what's blocking.

---

## 4. Cycle state machine

```
        NOT_STARTED
             │  Create New Report / Upload plan
             ▼
         DRAFTING ◄─────────────────┐
             │  finalize            │
             ▼                      │
         FINALIZED                  │
             │  request signature   │
             ▼                      │
    AWAITING_SIGNATURE              │  payor requests revisions
             │  parent signs        │
             ▼                      │
      READY_TO_SUBMIT               │
             │  Create Request      │
             ▼                      │
      AWAITING_PAYOR ───────────────┘
             │  Payor Approved
             ▼
         APPROVED
```

Not built: `DENIED`, `EXPIRED`.

In code the phases are lowercase (`not_started` … `approved`); the events are `start_draft`, `finalize`, `request_signature`, `parent_signs`, `submit_request`, `payer_requests_revisions`, `payer_approves`, plus the non-transition `send_reminder` and `record_document`. `payer_requests_revisions` also creates the `revision` `PlanVersion`, supersedes the current one, and leaves the signatures untouched — staleness is derived from the version pointer. The progress bar renders a five-stage projection of this (drafted → signed → submitted → revising → approved), not the seven phases one-to-one.

The re-entry edge is the point of the exercise. It lands _above_ the signature step, so a revision necessarily reopens the signature question — see §8.

---

## 5. Screens

A thin shell was added: a centered Alpaca Health topbar on every route. The Authorization page carries its own breadcrumb (`Home / Client List / {Client} / Authorization`).

**`Home`** — cross-client authorization queue. Rows are cycles, grouped by what's blocking: needs you / waiting on others / expiring soon, with a count of clients with nothing pending. That closing count is load-bearing: without it an incomplete list is untrustworthy and the clinician checks the roster anyway. Each row shows one representative item — the first blocker by `produce` > `gather` > `await`, or a synthetic _Create request_ (`ready_to_submit`) / _Payer decision_ (`awaiting_payor`) row when nothing blocks but a move is still owed. `approved` cycles fall out into the closing count. The queue reads the same in-memory store as the Authorization page (§6), so a change made on one shows on the other.

**`Home > Client List`** — unchanged roster, gains a status column. Not built; the breadcrumb's Home and Client List links both point at the queue.

**`Home > Client List > {Client} > Authorization`** — new tab, replaces Treatment Plans and Care Readiness. Title is the cycle state, not a fixed label:

- header — state title, auth type · payer, elapsed badge (when > 0 days)
- progress — the state machine, stepping backward into "Revising"
- submit — a `SUBMISSION` block (payer · auth type, a `Create Request` button — no payer name on the button itself — the blocking count, expected start date), placed directly under the progress bar so the reason a submit is blocked reads before any packet detail
- payer note — verbatim, when revisions were requested
- packet — one row per `PacketItem`, each with one action; the treatment-plan row opens the plan drill-in, the others act inline
- activity — `CycleEvent` for this cycle only, newest first

**`… > Authorization > Treatment plan`** — drill-in. Edit in generator, the payer note, and the document toolbar: View, Download, Replace, run the audit checker, Finalize. Unfinalize and Delete in overflow (Delete disabled). Version list shows v2, v1, and the superseded 1:35 PM upload as an unnumbered greyed entry — retained for audit, not competing for attention. Every toolbar button logs to the console; Finalize also runs the real transition so the flow stays clickable. Opened from the plan row's Edit goals / View action or a click on the row body.

**Draft generator** — a stubbed modal (not the 8-step wizard): ~2s fake latency writing six named sections (Clinical Profile, General Info, Priorities, Behavior Planning, Goals, Recommendations), then a **Review and finalize** button that closes it and dispatches `start_draft`.

### Where every element of the two removed tabs goes

| Today                                 | New home                                         |
| ------------------------------------- | ------------------------------------------------ |
| Treatment / assessment readiness gate | The Authorization page — it _is_ the gate        |
| Requirements lists                    | Packet rows                                      |
| Treatment plans list                  | One packet row + version history in its drill-in |
| Seven per-plan controls               | One row action; the rest in the plan drill-in    |
| Create Request                        | The Authorization page's submit action           |
| Expected start of treatment           | Field on the cycle, shown near submit            |
| Benefit Checks Requests table         | Insurance tab — historical record, unchanged     |
| Prior Authorizations Requests table   | Insurance tab — historical record, unchanged     |
| Per-card breakdown                    | Cycle switcher — not built, see §7               |

The two tables are history across all cycles; the Authorization page is the current state of one cycle. Different questions, different audiences — a BCBA getting a client authorized versus someone reconciling a denial. Putting both on one tab is part of why the current design reads as a workflow stapled to a ledger.

---

## 6. Build plan

### Must ship — all shipped

- [x] `Home` queue — seed clients as cycle rows, grouped by blocker, elapsed time
- [x] Authorization page driven by cycle state, replacing both tabs
- [x] Draft generator, stubbed — `NOT_STARTED → DRAFTING`
- [x] Finalize → `FINALIZED`
- [x] Request signature → `AWAITING_SIGNATURE` with elapsed days
- [x] Simulate parent signing → `READY_TO_SUBMIT`
- [x] Create Request → `AWAITING_PAYOR`
- [x] Simulate payor requesting revisions → `DRAFTING`, creates v2, marks the v1 signature stale
- [x] Typed packet rows driving the blocking count
- [x] Plan drill-in: version list including the superseded upload, payer note, toolbar
- [x] Cycle activity log
- [x] State derived from one model — no per-screen booleans

Prototype controls for the three simulated events — parent signs, payer requests revisions, payer approves — sit in a visibly artificial dev strip. Being obvious about the fake beats hiding it.

### Seed data

| Client    | Cycle status               | Detail                                                        |
| --------- | -------------------------- | ------------------------------------------------------------- |
| Jordan M. | `NOT_STARTED`              | Intake and assessment complete. The "where do I start?" case. |
| Priya R.  | `AWAITING_SIGNATURE`       | Requested 9 days ago, unsigned, one reminder sent.            |
| Marcus T. | `DRAFTING` after revisions | Payor returned the goals section. v1 signed, v2 in progress.  |
| Dana K.   | `READY_TO_SUBMIT`          | Draft finalized and signed, every packet item satisfied — zero blockers. Added beyond the brief's three (which the brief allows) to exercise the clean submit → approve path and the "just press Create Request" state. |

Priya, Marcus and Dana are built by replaying real events through the state machine (Jordan is the fresh cycle), so a fixture cannot contradict the transition rules.

### Deliberately faked

- No backend, persistence, or auth. State lives in an in-memory session store (`src/lib/cycleStore.ts`) shared by the queue and the Authorization page; a full page reload resets it to seed.
- Draft generation is a canned section list with fake latency.
- Parent signing and payor response are dev-strip buttons.
- The plan editor is not rebuilt; "Edit goals" opens the drill-in and "Edit in generator" logs to the console.
- One real packet template per auth type, behind a `(authType, payer) → template` lookup with a `:default` fallback.

### Built for real

- The cycle state machine, including the backward edge.
- Signature-to-version pinning, so staleness is derived.
- Packet item typing, so the queue grouping and row affordances come from one source.
- `scripts/walkthrough.ts` replays Marcus draft → approved as a runnable check of the domain layer; `/scratch/rows` is a dev harness rendering every packet-row, header and progress-bar state.

---

## 7. Scope decisions

Beyond what the brief already excludes:

**Single insurance card per client.** The product supports several — _Care Readiness by Insurance Card_, a PRIMARY badge, a per-card breakdown. One clinical treatment plan serves all payers; each payer needs its own cycle and packet, so it's one plan and N cycles, never N plans. Modelled as `cycleId → insuranceCardId`; one card built. Multi-card needs a cycle switcher on the page and a payer column in the queue.

**One cycle in flight per client.** The model is cycle-scoped so this generalizes. A completed cycle renders as a collapsed satisfied band; two _active_ cycles need the same switcher.

**Assessment Authorization not built.** Every client has two authorizations — assessment first, then treatment. All seed clients are past the assessment auth, so the treatment cycle is what's built. Same state machine, different packet template — which is the reason packet items are generated rather than hardcoded. The `assessment_authorization` template sits in the lookup; no seed exercises it.

**No reauthorization queue.** This is where the product earns its keep: several clients expiring in one month at different stages. More than the time box allows, and it deserves building properly.

**No denials, appeals, or mid-cycle amendments.**

The distinction worth holding: _modelled but not built_ (cycles, versions, payer templates, auth types) versus _not modelled_ (multi-card). The first is scoping. The second is a boundary.

---

## 8. Open questions

**Does a guardian signature survive a payor-requested revision?** The highest-stakes assumption here. Signatures are pinned to a `PlanVersion`, so a revision invalidates consent and Marcus re-enters above the signature step. If minor revisions can carry the original signature forward, the state machine needs a branch and the UI needs a clinician judgment call rather than a system rule. Wrong one way adds days to every revision; wrong the other submits a packet with invalid consent.

**What should happen when a signature stalls past two weeks?** Priya at 9 days is offered Resend, which is roughly what exists today. Real clinics presumably escalate at some threshold — a call, an admin handoff, an alternative consent path. I don't know what, and the threshold is likely per-blocker: 9 days on a signature is bad, 3 days on a payor decision is nothing.

**Is there a targeted edit path into the generator?** "Edit goals" implies landing at the Goals step. If the 8-step wizard is the only door, fixing one section means walking through eight. In the prototype "Edit goals" opens the plan drill-in, not the generator, and the wizard isn't built — so this is deferred, not answered.

**Is the green-badge-over-red-X in Care Readiness intentional?** The _Auth Approved Override_ chip suggests an override path. If so, overrides should be visible in the rollup rather than implied.

**Who maintains payer requirement templates?** Alpaca staff, the clinic, or inferred from denial patterns? An ops question underneath the UI one, and it decides whether typed packet items scale past a handful of payers.

**Who owns which step?** If a BCBA owns clinical content and an admin owns packet assembly, the same cycle belongs in two queues for different reasons, and the queue should filter by blocker rather than by client ownership.

---

## 9. Rubric notes — private, do not submit

_Working notes for structuring the walkthrough. A section that scores itself against the evaluation criteria reads as marking your own homework — this is here to check coverage and to script the Loom, not to hand in._

**Product thinking.** The core problem is the missing cycle, not the tab split — the tabs are a symptom of organizing navigation around documents and checklists when the unit of work is an authorization. Evidence is drawn from the existing product rather than asserted: the duplicate upload, the skipped stepper node, the contradictory rollup, the late NPI validation. Prioritization favours the states that carry compliance and cash-flow risk — a stalled signature and a returned packet — over breadth.

**Interaction & UX craft.** One page, one component, three states; nothing appears or disappears between them, only icons, sublines, actions and counts. The hard states are the design: a stepper that runs backward, a signature that goes stale when the document it consented to changes, an empty state that shows one action rather than five greyed-out future ones. Blockers move from the submit modal to the page. Seven always-on controls become one contextual action plus a drill-in.

**Build craft.** Readiness is derived from a cycle state machine, not a set of booleans — the count on the submit button, the queue grouping, and every row's affordance all read from the same model. Signature staleness falls out of a foreign key rather than a flag. What's faked is faked visibly: canned generation, buttons for the parent and the payor. Component structure is one packet row rendered at two densities (queue and page), so the status vocabulary can't fork.

**Communication of rationale.** Every scope cut is a decision with a reason, and the doc separates what's modelled-but-not-built from what's genuinely out of the model. The open questions in §8 are real uncertainties with stated consequences, not hedges — particularly the signature-survives-revision question, which is where I'd want a clinician's answer before building for production.
