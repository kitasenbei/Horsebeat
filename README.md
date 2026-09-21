# HorseBeat tempo fitting

Status: working, incomplete. Describes what the code in `src/fit/` does as of
this commit, and what is known not to work.

## 1. The problem

Given a decoded track, produce a list of timing sections — each an offset in
milliseconds, a tempo in beats per minute, and a meter — such that the grid
they describe lands on the music for the whole length of the track.

A chart is judged by whether its beats sit on the sound. The tool renders this
directly: the compiled view lays each bar out as a column of pixels and puts the
next bar beside it, so a grid on the music draws horizontal bands and a grid a
fraction out draws diagonals. Everything below is an attempt to make that
picture band.

## 2. What is read

Not the waveform. `computeEnvelope` gives a root-mean-square envelope, and
`riseOf` takes its positive first difference: how fast the sound is climbing,
not how high it stands. A loud master holds the envelope near its ceiling for
most of a song, so a beat and the gap after it barely differ in level while the
climb onto each beat stays sharp.

A frame of the envelope is a fixed length of time, not a fixed number of
samples. The browser decodes at whatever its audio clock runs at — usually 48
kHz, sometimes 44.1 — and a hop fixed in samples makes the same song a
different signal on each.

## 3. What a grid is worth

Four readings, in `src/fit/score.ts`. None of them settles what a beat is on its
own, and the rest of the system exists to arbitrate between them.

**`scoreFit`** — the comb. Walk the beats a grid predicts, take the sharpest
climb within a few milliseconds of each, and divide the average by the average
climb everywhere. One means the beats are no livelier than the gaps.

The beats are sampled a fixed lag *before* where the grid says they are. The
envelope averages a window either side of each sample, so it starts climbing
before the hit that causes it. Without this correction a correct grid scored
6.16 where the same tempo eleven milliseconds early scored 137.68, and no grid
the fitting produced could ever score well against its own reported offset.

**`patternScore`** — bar agreement. Fold the stretch into bars, average them
into one, and take the variance of that average over the total variance. It
reads every frame rather than the beats alone, so unlike the comb it cannot be
won by a slow grid that samples little and samples it well. It is unchanged by
where the bar starts, which frees it to answer about tempo alone.

**`bestPhase`** — the best a tempo can do at any phase.

**`flatnessOf`** — whether a grid holds its place. Each eight-bar stretch is
compared with the one before it, and the median distance between them is how
fast the grid is slipping. Comparing each stretch against the *average* of the
whole section does not work: a drifting section has no average worth the name,
its bars land all over each other and come out a smear, and a smear matches
every stretch equally at no offset at all — so the measurement reads a section
as perfectly straight at the moment it is least straight.

## 4. The algorithm

### 4.1 Count the track

Every tempo from 60 to 200 in half-beat steps is scored over each 60-second
window by `patternScore`. Each window's own best counts as one vote, so a loud
chorus and a quiet verse count the same. Votes accumulate across the track.

This is necessary because a per-window search does not work: a slow grid is
asked about fewer beats, and those are the ones certain to be played, so it
outscores the truth. On one test track the true 150 scored 2.8 per window while
a 61 bpm grid scored 7.47.

### 4.2 Decide which count is the beat

The vote finds the pulse. The beat is usually a division of it, and three
separate mechanisms are needed to get from one to the other.

**`beatWithin`** folds the averaged bar into equal parts and keeps the most
parts it still divides into cleanly. The list of divisors includes seven, and
the profile is 840 rows so that seven divides it: a bar of seven is rare, but a
phrase of seven beats is not, and a count the rows cannot divide by is a tempo
the fitting can never reach. One test track is a 7-beat phrase; dividing its
bar by seven keeps 0.991 of the shape, and every other division keeps under
0.13.

A denser count always reads a little worse than the pulse it divides. Reading
*far* worse means the bar was cut into a number of parts it is not made of, so
the fold must keep 60% of the pulse's own pattern score or it is rejected.

**`counted`** handles what the fold structurally cannot. Where the beat is twice
the pulse, the bar at the pulse is really two bars, and two bars are never alike
enough to divide into eight — the evidence is not in that measurement at all. So
the audio is asked directly: are the beats in between played? The comb at the
faster count is compared with the comb at the slower one.

That alone is not enough. A ride cymbal plays the beats in between all night
without the tempo being twice what it is. What separates the cases is pairing it
with how fast the count already is:

| track | pulse → double | comb kept | double? |
| --- | --- | --- | --- |
| A | 112 → 224 | 0.952 | yes |
| B | 75 → 150 | 0.918 | yes |
| C (live jazz) | 148 → 296 | 0.922 | no |
| B | 150 → 300 | 0.849 | no |
| D | 180 → 360 | 0.840 | no |

Ratio alone cannot separate them — 0.922 sits between the two yeses. Speed alone
cannot either. Together they do: double when the count is under 130 and the
faster grid keeps 90%.

The same test extended to three-against-two catches the dotted reading, where a
bar divides evenly into a tempo that is not the beat. A bar of four at 150 is
also six beats of 225. Held to a stricter 95%, because a count two thirds of the
beat lands on every other one of its beats and so keeps more of the reading than
half a tempo would.

Promotions chain: a pulse of 75 doubles to 150, and 150 is then itself a count
of 225 that nothing would otherwise ask about.

### 4.3 Split where one grid cannot hold

Start with one section over the whole track. For any section: settle its tempo,
then ask whether it runs straight and whether both its halves still read as its
tempo. If both hold, keep it. Otherwise halve it and ask the same of each half.

Straightness alone is not enough to stop. A half playing a different tempo is
not drifting, it is somewhere else, and its own picture can be as straight as
any other.

The split does not require an immediate improvement. One cut into a still-
drifting half measures worse than the whole, and demanding that it measure
better leaves the whole thing uncut — the recursion fixes the half on the next
pass.

Splitting downwards rather than sweeping forwards means every answer is read off
as much audio as it can be, and a section appears only where the song stops
agreeing with the one before it.

A child may take a tempo different from its parent only if it draws a decidedly
better picture, is not merely another way of counting the parent's tempo, polled
somewhere on the whole-track vote, and sits within two thirds to three halves of
it.

### 4.4 Place the offset

The tempo says how far apart the beats are. `anchorBeat` says where they sit:
every beat of the section is averaged into one, and the offset is placed partway
up the climb onto that averaged beat — not at its loudest point. A piano or an
upright bass reaches its peak well after the note began, and a grid placed there
sits behind the music.

Against a charted live recording this took the median distance from the
charter's beats from 50.6 ms to 16.9 ms, and the systematic bias from 24.7 ms
late to 1.9 ms early. Where on the climb was measured, not guessed: the top of
the climb gives 26.1 ms, a fifth of the way up gives 51.7, and the half-to-60%
point gives 16.8.

## 5. Where it stands

Measured against charts made by hand.

| material | result |
| --- | --- |
| produced music | one section, exact tempo |
| live recording, 222 timing points | 18 sections, 12.1 ms median, 43% of beats within 10 ms |

Known to be wrong:

- **Intros that differ from the body.** One track opens with an accelerando from
  187 to 200 before settling at 224. The fit reports 224 from the start. The
  audio backs the chart decisively — over the first 29 seconds 187 scores 0.1631
  against 224's 0.0088 — but a tempo that appears in a tenth of the song polls
  like a tenth of the song, and the guard that keeps junk sections out also
  keeps this out.
- **Boundary placement.** On a synthetic track with tempo changes at 40.7 s and
  81 s, the tempos come back exact and the cuts land at 58 s and 88 s.
- **Free time.** Passages with no tempo produce arbitrary sections.
- **Absolute offset on live material.** 43% of beats within 10 ms is usable for
  charting, not good enough to trust blindly.

## 6. Notes for whoever changes this

The fitting is sensitive to changes far below what anyone can hear. Rewriting a
landmark as `round((t − 11.6ms) × perMs)` instead of `round(t × perMs) − 8`
— arithmetically a fraction of a frame — moved a live recording from 13 sections
to 7 and doubled its error. Two configurations measuring 15.5 and 16.9 are not
reliably distinguishable, and a good share of the tuned constants in this code
were chosen against differences that size.

There are 36 of them. Each was picked by sweeping against a handful of tracks.

Ablate before adding. A tempo-settling pass lived here for two commits, was the
most sophisticated thing in the file, and removing it changed no result on any
test — while the ordinary polish it duplicated had been doing the work.

The panels beside the compiled view show what the algorithm cannot. They project
each block onto its rows: the sum on the right, how alike the bars are at each
row on the left, and the two multiplied over the sum. Counting the humps
distinguishes four beats from eight, which no single number in the fitting can.
Two attempts to turn that measurement into a score both failed — averaged over
rows it separates the same pair by 0.5% where the pattern score separates it
twentyfold.
