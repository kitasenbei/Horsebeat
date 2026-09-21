# Tempo fitting

Status: working, incomplete. Specifies the code in this folder as of this
commit, and states what is known not to work.

Given decoded audio, produce timing sections — offset, tempo, meter — whose grid
lands on the music for the whole track.

## 1. Conventions

**Time** is milliseconds from the start of the track, as a float. Never frames,
never samples: an envelope frame is a different length of time depending on what
the browser decoded to, and every constant in this folder that is a duration is
written in milliseconds for that reason.

**A `Fit`** is `{ bpm: number, offsetMs: number }` — one uniform grid. Beat `k`
falls at `offsetMs + k × 60000 / bpm`.

**`meter`** is beats per bar. A bar is `meter × 60000 / bpm` milliseconds.

**A stretch** is a half-open interval `[fromMs, toMs)`. Every measurement takes
one, so nothing implicitly reads the whole track.

**`sampleRate`** is passed to anything that converts time to frames, because the
envelope's hop is derived from it (`envelopeHop`, in `../audio.ts`) so that a
frame is ~1.451 ms at any rate.

## 2. Signal layer — `signal.ts`

Turns the envelope into shapes. Knows nothing about tempo.

### `riseOf(envelope) → Float32Array`

- **in** `Float32Array` — the RMS envelope, one value per frame, unclamped
- **out** same length; `rise[i] = max(0, e[i] − e[i−1]) + RISE_SPREAD × (neighbours)`
- **cached** by a `WeakMap` on the input array
- **why** a loud master holds the envelope near its ceiling, so a beat and the
  gap after it barely differ in level while the climb onto each beat stays
  sharp. `RISE_SPREAD = 0.25` spreads each climb onto its neighbours because a
  hit rises over two or three frames and a raw difference splits it between
  them.

### `barProfile(envelope, sampleRate, fromMs, toMs, barMs, rows) → Float64Array | null`

- **in** a stretch, a bar length in ms, and how many rows to read a bar at
- **out** `rows` values — every bar of the stretch stacked and summed, sampled by
  linear interpolation between frames; `null` if the stretch holds fewer than
  `MIN_BARS = 4` bars
- **cost** `O(bars × rows)`
- **this is the projection** the compiled view draws down its right-hand panel.
  Three of the four measurements below are questions asked of its output.

### `shiftRows(one, other, beats) → number`

- **in** two profiles of equal length, and how many beats a profile covers
- **out** the circular shift in rows, in `[−rows/(2×beats), +rows/(2×beats)]`,
  that best aligns them by dot product
- **why bounded** the search stops at half a beat: columns look alike at beat
  level, and a wider search answers with a whole beat of slide that never
  happened

### `centred(rows) → Float64Array`, `runningTotal(envelope) → Float64Array`

Mean removal, and a prefix-sum (cached) so a stretch's mean is `O(1)`. The
prefix sum is not an optimisation only: a running window sum accumulates
rounding across a long track until a quiet stretch takes it below zero, and the
square root of that is `NaN`.

## 3. Measurement layer — `score.ts`

Four readings of one grid over one stretch. None settles what a beat is alone.

### `scoreFit(envelope, sampleRate, fromMs, toMs, fit) → number`

- **in** a `Fit`
- **out** mean climb at the predicted beats ÷ mean climb over the stretch; `1`
  means the beats are no livelier than the gaps; unbounded above
- **method** for each beat, take the peak of `riseOf(envelope)` within
  `BEAT_REACH_MS = 4.4` of `offset + k × beatMs − ENVELOPE_LAG_MS`
- **the lag is load-bearing.** The envelope averages a window either side of each
  sample, so it climbs before the hit that causes it. Measured: a correct grid
  scores **6.16** without the correction and **137.68** with it. Without it no
  grid the fitting reports can score well against its own offset.
- **bias** favours sparse grids — a slow grid is asked about fewer beats and
  those are the ones certain to be played. Never compare two different tempos by
  this number alone.

### `patternScore(envelope, sampleRate, fromMs, toMs, bpm, meter) → number`

- **out** `[0, 1]` — variance of the bar-average over total variance
- **method** `barProfile` at `BAR_ROWS = 840`, then between-row variance ÷ total
- **properties** reads every frame, not only the beats, so it has none of the
  comb's sparse bias; and it is invariant to where the bar starts, which frees it
  to answer about tempo alone. It cannot say anything about phase.

### `bestPhase(envelope, sampleRate, fromMs, toMs, bpm) → { fit, score }`

- **out** the best `scoreFit` over `COARSE_PHASES = 64` phases of one beat, and
  the `Fit` that achieved it
- **cost** `O(64 × beats)`

### `flatnessOf(envelope, sampleRate, fromMs, toMs, fit, meter) → number`

- **out** milliseconds — the median slide between consecutive `SETTLE_BARS = 8`
  bar stretches, measured by `shiftRows`
- **`0` means the grid holds its place.** `FLAT_OK_MS = 8` is the threshold the
  split uses.
- **each stretch is compared with the one before it, not with the section
  average.** A drifting section has no average worth the name: its bars land all
  over each other and come out a smear, and a smear matches every stretch equally
  at no offset at all, so the measurement reads a section as perfectly straight
  at the moment it is least straight.
- **median, not mean** — one fill throws a single stretch a whole beat out.

## 4. Stage 1 — counting the track

### `newVote(meter) → Vote`, `voteStep(envelope, sampleRate, durationMs, vote) → Vote`

`Vote` is `{ fromMs, totals: Float64Array, done, meter, pattern }`. Driven one
call per animation frame until `done`.

- **each step** takes the window `[fromMs, fromMs + VOTE_WINDOW_MS)` where
  `VOTE_WINDOW_MS = 60000`, scores every tempo from `MIN_BPM_SEARCH = 60` to
  `MAX_BPM_SEARCH = 200` in `COARSE_BPM_STEP = 0.5` increments, divides each by
  that window's own best, and adds the result into `totals`
- **normalising per window is the point.** A loud chorus and a quiet verse then
  count the same, and no stretch decides the track by being louder.
- **why not just search each window** a slow grid outscores the truth locally. On
  one track the true 150 scored **2.8** per window against a 61 bpm grid's
  **7.47**. The vote is what survives that.
- **cost** `O(windows × 281 × bars × BAR_ROWS)`, ~1.4 s for a 169-second track

### `bestTempo(envelope, sampleRate, durationMs, vote) → number | null`

- **out** one tempo for the whole track, or `null` if nothing polled
- **method** take the vote's winner and `beatWithin` it; separately sweep
  `patternScore` over the whole track and `beatWithin` that; if the swept answer
  is not merely another count of the voted one and reads `OVERRULES = 1.2` times
  better, take it
- **why both** the vote follows a song that changes tempo but is misled on a
  short track with few windows to ask; the whole-track read cannot follow a
  change but is far more certain when there is one tempo.

## 5. Stage 2 — which count is the beat

The vote finds the **pulse**. The beat is usually a division of it. Three
mechanisms, because no one of them covers the cases.

### `beatWithin(envelope, sampleRate, fromMs, toMs, bpm, meter) → number`

- **in** a pulse
- **out** the beat: the most parts the averaged bar still divides into cleanly
- **method** `barProfile` at `BAR_ROWS = 840`; for each divisor in
  `BAR_PARTS = [1,2,3,4,5,6,7,8,10,12,14,16]` whose resulting tempo lies in
  `[60, MAX_BPM_COUNT = 300]`, fold the profile into that many parts and measure
  the share of variance kept; take the largest divisor keeping
  `DENSER_KEEPS = 0.78` of the best
- **840 rows so that seven divides it.** A bar of seven is rare; a phrase of
  seven beats is not, and a count the rows cannot divide by is a tempo the
  fitting can never reach. Measured on a 7-beat track: dividing by seven keeps
  **0.991**, every other division under **0.13**.
- **then a check.** A denser count always reads a little worse than the pulse it
  divides. Reading *far* worse means the bar was cut into a number of parts it is
  not made of, so the result must keep `FOLD_KEEPS = 0.6` of the pulse's own
  `patternScore` or it is discarded.

### `counted(envelope, sampleRate, fromMs, toMs, bpm) → number` (internal)

Handles what the fold structurally cannot. Where the beat is twice the pulse,
the bar at the pulse is really *two* bars, and two bars are never alike enough to
divide into eight — the evidence is not in that measurement at all.

- **method** ask the audio directly, by `bestPhase`: are the beats in between
  played? Up to `COUNT_ROUNDS = 3` promotions, each opening the next.
- **×2** when the count is below `DOUBLE_BELOW = 130` *and* the faster grid keeps
  `DOUBLE_KEEPS = 0.9`
- **×1.5** when the faster grid keeps `DOTTED_KEEPS = 0.95` — the dotted reading,
  where a bar divides evenly into a tempo that is not the beat (a bar of four at
  150 is also six beats of 225). Stricter, because a count two thirds of the beat
  lands on every other one of its beats and so keeps more than half a tempo
  would.

Both halves of the ×2 rule are needed. Measured:

| pulse → double | comb kept | correct? |
| --- | --- | --- |
| 112 → 224 | 0.952 | double |
| 75 → 150 | 0.918 | double |
| 148 → 296 (live jazz) | 0.922 | **do not** |
| 150 → 300 | 0.849 | do not |
| 180 → 360 | 0.840 | do not |

Ratio alone cannot separate these — 0.922 sits between the two that should
double. Speed alone cannot either. Together they do.

### `runsAlready(bpm, against)`, `readsAsDotted(bpm, against)` (internal)

Predicates: is this tempo the one already running, counted some other way?
`runsAlready` covers equality within `SAME_TEMPO = 0.01` and integer counts up to
four within `COUNTED_BAND = 0.04`. `readsAsDotted` covers two thirds within
`DOTTED_BAND = 0.015` — narrow, because a real tempo change can land near two
thirds and mean it (140 → 96 is 0.686; two thirds is 0.667).

## 6. Stage 3 — splitting

### `newSplit(durationMs, bpm, vote) → Split`, `splitStep(envelope, sampleRate, split) → Split`

`Split` is `{ parts, pending, working, meter, done, track }`. Driven one call per
animation frame until `done`. `parts` is the answer so far and can be rendered
at any point; `working` is the span currently being fitted, so the grid is seen
moving onto the music rather than appearing on it.

Each call does **one** of:

1. **take a pending span** → `newTurn`, which resolves the span's tempo
   (`tempoOf`) and its starting phase (`bestPhase`)
2. **turn the knobs once** → `turnStep`: one rung of the `SCALES` ladder
   (±bpm, ±offset, nine rungs from ±1/±40 ms down to ±0.002/±0.1 ms), or one
   round of `polishFit` once the ladder is spent
3. **finish the span** → `turnDone` (anchor, downbeat) then decide:

   - keep it if it runs straight (`flat ≤ FLAT_OK_MS`) **and** both halves read
     as its tempo
   - otherwise push two halves onto `pending`

   Straightness alone is not enough to stop: a half playing a different tempo is
   not drifting, it is somewhere else, and its own picture can be as straight as
   any other.

- **no improvement test.** One cut into a still-drifting half measures *worse*
  than the whole; requiring the cut to improve things immediately leaves the
  whole thing uncut. The recursion fixes the half on the next pass.
- **bounds** `MIN_SPAN_MS = 8000`, `MAX_DEPTH = 6`. Neither is usually what
  stops it — straightness is judged over eight bars and needs two of them, so
  nothing under roughly half a minute can be assessed at all. Shortening that
  window does not help: at four bars a live recording goes from 12.1 ms to 17.8,
  at two bars to 60.1.

### `tempoOf(envelope, sampleRate, fromMs, toMs, given, meter, track) → number` (internal)

- **in** the tempo a span inherited from its parent
- **out** that tempo, or one the span earns
- a span may differ from its parent only if the candidate is not merely another
  count of it, polled at least `POLLED_ENOUGH = 0.4` of the top on the
  whole-track vote, sits within `NEAREST = 0.65` either way, and reads
  `TAKES_OVER = 1.15` times better

## 7. Stage 4 — placing the offset

### `anchorBeat(envelope, sampleRate, fromMs, toMs, fit) → Fit` (internal)

- **out** the same tempo with the offset moved by less than half a beat
- **method** average every beat of the section into one at `BEAT_ROWS = 512`,
  find the strongest climb, walk back to `CLIMB_SHARE = 0.55` of its height, and
  put the offset there
- **not the peak.** A piano or an upright bass reaches its loudest well after the
  note began, and a grid placed there sits behind the music. Measured against a
  charted live recording: median distance from the charter's beats **50.6 ms →
  16.9 ms**, systematic bias **24.7 ms late → 1.9 ms early**. Where on the climb
  was measured, not guessed — top of the climb gives 26.1 ms, a fifth of the way
  up gives 51.7, the half-to-60% point gives 16.8.

### `alignDownbeat(...) → Fit` (internal)

Chooses which beat of the bar carries the weight, so a section starts a bar
rather than an arbitrary beat.

## 8. Driving it

```
vote = newVote(meter)
while (!vote.done) vote = voteStep(envelope, rate, durationMs, vote)

tempo = bestTempo(envelope, rate, durationMs, vote)
split = newSplit(durationMs, tempo, vote)
while (!split.done) split = splitStep(envelope, rate, split)

sections = split.parts.map(part => part.fit)
```

Both loops are step functions over immutable state so the caller can run one
step per animation frame and render `split.parts` (plus `split.working`) as they
go. `App.tsx` does exactly this.

## 9. Measured behaviour

| material | result |
| --- | --- |
| produced music | one section, exact tempo (150.00, 180.24, 103.00, 224) |
| live recording, 222 hand-made timing points | 18 sections, 12.1 ms median error, 43% of beats within 10 ms, 71% within 25 ms |
| synthetic, three tempos | all three exact; boundaries land late (58 s and 88 s for changes at 40.7 s and 81 s) |

Against the same live recording, this grid scores **4.715** on rise energy where
the hand-made chart scores **4.665** — level with the human by the audio's own
evidence, using an eighth as many sections.

## 10. Known wrong

- **Intros that differ from the body.** One track opens at 187 accelerating to
  200 before settling at 224; the fit reports 224 throughout. The audio backs
  the chart decisively — over the first 29 seconds 187 scores **0.1631** against
  224's **0.0088** — but a tempo occupying a tenth of the song polls like a tenth
  of the song, and `POLLED_ENOUGH` keeps it out. Relaxing that guard reintroduces
  junk sections elsewhere.
- **Boundary placement** lags a real tempo change by 10–20 seconds.
- **Free time** produces arbitrary sections.
- **Absolute offset on live material** — 43% within 10 ms is usable for charting,
  not good enough to trust unchecked.

## 11. Notes for whoever changes this

**The fitting is sensitive below the threshold of hearing.** Rewriting a landmark
as `round((t − 11.6ms) × perMs)` instead of `round(t × perMs) − 8` —
arithmetically a fraction of a frame — moved a live recording from 13 sections to
7 and doubled its error. Two configurations measuring 15.5 ms and 16.9 ms are not
reliably distinguishable.

**There are 36 tuned constants**, each chosen by sweeping against a handful of
tracks. Treat any of them as provisional.

**Ablate before adding.** A tempo-settling pass lived here for two commits, was
the most sophisticated code in the folder, and removing it changed no result on
any test — the ordinary polish it duplicated had been doing the work. Every
component in this folder has been measured with it removed: the split is worth
134.2 ms → 12.1 ms, the windowed vote 50.9 → 12.1, `anchorBeat` 3% → 43% of beats
within 10 ms, the tempo guards the difference between finding three tempos and
two.

**The panels beside the compiled view see what the algorithm cannot.** They
project each block onto its rows — the sum on the right, how alike the bars are
at each row on the left, the two multiplied over the sum. Counting the humps
distinguishes four beats from eight, which no single number here can. Two
attempts to turn that into a score both failed: averaged over rows it separates
the same pair by 0.5% where `patternScore` separates it twentyfold.
