# Research notes

Catatan eksperimen untuk paper. Setiap eksperimen prompt atau model dicatat di
sini dengan format:

- **Tanggal & versi prompt** (mis. `sentiment.v1`) — harus cocok dengan
  `prompt_version` yang tersimpan di tabel `analysis_results`.
- **Dataset** — ukuran, sumber, dan apakah sudah dianonimkan.
- **Metrik** — akurasi/F1 terhadap label manusia, biaya per aspirasi, latensi.
- **Kesimpulan** — apakah versi ini dipromosikan ke default.

Reproducibility: prompt tidak pernah ditimpa. Perubahan berarti file `.vN` baru
di `modules/analysis/prompts/` plus entry baru di registry, sehingga hasil lama
tetap bisa ditelusuri ke prompt yang tepat.

## Catatan yang sudah ada

| Dokumen                                              | Isi                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`prompt-v1-eval.md`](prompt-v1-eval.md)             | Evaluasi `analysis.v1` terhadap 20 kalimat uji                                  |
| [`phase-7-findings.md`](phase-7-findings.md)         | Biaya dan latensi ringkasan `summary.v2`, ukuran export                         |
| [`phase-9-findings.md`](phase-9-findings.md)         | Bundle, Lighthouse, dan tiga kegagalan yang hanya terlihat di browser           |
| [`pilot-01-findings.md`](pilot-01-findings.md)       | Temuan pilot 01 dan keputusan desain yang lahir darinya                         |
| [`prompt-comparison-01.md`](prompt-comparison-01.md) | `analysis.v1`, `v2`, `v3` pada dataset pilot 01: stabilitas label, topik, biaya |
| [`topic-merge-01.md`](topic-merge-01.md)             | `merge.v1` pada label topik pilot 01: apa yang digabung, apa yang tidak         |

## Baseline

`modules/analysis/adapters/local.ts` adalah baseline leksikon non-LLM. Gunakan
sebagai pembanding saat melaporkan angka LLM.
