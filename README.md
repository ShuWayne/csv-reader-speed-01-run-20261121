# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ShuWayne/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ShuWayne/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: it reads broken CSV files
exactly as csv-reader does — BOM, CRLF/CR handling, quoted fields, quote junk,
unterminated quotes, short and long rows with their error records — but scans
with native `indexOf`/`slice`/`split` instead of walking the text one character
at a time. On the kit's practice set (6 cases, ~10.2M characters) it parses in
~140 ms against the reference's ~420 ms, about a 3x speedup, with byte-identical
answers on every practice case, 56 hand-written edge cases and 20,000 fuzzed
broken-CSV cases.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<output dir> node main.ts
```

`main.ts` is the house driver: it reads every case from `cases.json`, answers
each one alone with `run()` from `solve.js`, and writes `answers.json`. Node 22,
no dependencies, no install step.

## How it is fast

- **Line fast path:** a record line with no quote and no stray CR splits at once
  with `split(',')`. The next quote and CR positions are cached across lines,
  so the checks stay linear in total.
- **Unquoted fields:** one slice to the next comma or line break holds the whole
  field; stray CRs inside it are dropped in one `split('\r')`, each with its
  `stray_cr` error.
- **Quoted fields:** the closing quote is found with `indexOf`, doubled quotes
  are collapsed with `replaceAll('""', '"')`, and CRLF/lone CR inside quotes
  become LF, with the line count taken from the same slice.
- **No per-field objects:** field readers return the value string and report
  how the field ended through shared state, so parsing allocates only the
  answer itself.

---

<sub>Entered on [make.fun](https://make.fun/?ref=a4411dmy&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
