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

## Baseline

`modules/analysis/adapters/local.ts` adalah baseline leksikon non-LLM. Gunakan
sebagai pembanding saat melaporkan angka LLM.
