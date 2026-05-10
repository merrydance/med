# Docling PDF Evaluation - 2026-05-10

## Environment

- OS: Debian/Linux
- Docling: 2.93.0 installed in `/tmp/yunwu-docling-venv`
- Command used by app: `docling --pipeline standard --no-ocr --tables --table-mode accurate --to md --output <tmp> --document-timeout 120 <pdf>`
- Evaluation command: `PATH=/tmp/yunwu-docling-venv/bin:$PATH npm run eval:docs -- /tmp/yunwu-pdf-samples /tmp/yunwu-doc-eval`

## Samples

Open-access PDF samples were downloaded to `/tmp/yunwu-pdf-samples` and were not committed to the repository.

| File | Source | Pages | Result | Elapsed |
|---|---|---:|---|---:|
| `glioblastoma-growth-model.pdf` | arXiv PDF | 32 | Docling timed out, fell back to `pdf-parse` | 120.4s |
| `glioblastoma-hdac-temozolomide.pdf` | Springer/BMC open-access PDF | 17 | Docling timed out, fell back to `pdf-parse` | 120.2s |
| `glioblastoma-mri-survival.pdf` | arXiv PDF | 5 | Docling timed out, fell back to `pdf-parse` | 120.1s |

## Findings

- The fallback path works: all three PDFs returned usable text via `pdf-parse` instead of blocking or failing.
- Docling did not complete within 120 seconds for any sample in this environment.
- The current default wait is too long for an interactive upload flow; users would reasonably think the app is stuck.
- No Docling Markdown/table output was produced in this run, so the table-quality DoD remains unverified.

## Decision

Reduce the default Docling timeout from 120 seconds to 30 seconds and keep `pdf-parse` as the default recovery path. The timeout can be increased with `YUNWU_DOCLING_TIMEOUT_MS` for local validation or stronger machines.

## Next Validation

- Re-run with `YUNWU_DOCLING_TIMEOUT_MS=300000` on a stronger machine or after confirming model cache is warm.
- Compare Docling Markdown against `pdf-parse` on at least one table-heavy neurosurgery PDF.
- Only consider making Docling the visible default if real PDFs complete in an acceptable time window.
