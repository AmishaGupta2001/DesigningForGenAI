# HEIC/HEIF repair runbook

`scripts/repair-heic-images.mjs` is a one-time, dry-run-by-default repair for
legacy HEIC/HEIF objects referenced by `public.images.image_url`.

## Safety properties

- It requires `SUPABASE_URL` and a server-only `SUPABASE_SERVICE_ROLE_KEY`.
  It refuses a key that looks publishable or anonymous. Do not put this key in
  `.env.local`, commit it, or expose it to the browser.
- It reads every `public.images` row, then examines the Supabase Storage object
  metadata, public-response MIME type, and the ISO-BMFF `ftyp` brands in the
  object bytes. An HEIC/HEIF suffix by itself is listed as a manual-review skip,
  not converted.
- The default run makes no Storage or database writes. `--apply` additionally
  needs the exact confirmation token.
- An applied conversion downloads from the existing public URL, uses macOS
  `/usr/bin/sips` to make a JPEG, stores it at a new unique
  `generation-images/repairs/heic/<image-id>/<uuid>.jpg` path, and never
  overwrites or deletes the original.
- The script reads the uploaded public object back and checks both MIME type and
  JPEG magic bytes before it changes a row. Its sole database mutation is a
  compare-and-set update of the matching image ID and original `image_url`.
  Therefore its title, tags, owner, generations, captions, votes, and remix
  relationships remain intact.

## Prerequisites

- Run from macOS with `/usr/bin/sips` available (it is present on this project
  workstation). No npm package is added.
- Obtain a temporary, authorized Supabase service-role key through the project
  owner/admin. This maintenance use is permitted to bypass RLS; the public anon
  key is insufficient and must not be used for writes.
- Set credentials only in the terminal session. For example, paste values into
  your shell's secure environment manager rather than a tracked file.

## Dry run

The following creates no production mutations and prints the full candidate,
skip, and failure report as JSON:

```sh
SUPABASE_URL='https://<project-ref>.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='<server-only-service-role-key>' \
node scripts/repair-heic-images.mjs
```

Save that JSON outside the repository as the pre-change backup. Review every
`candidates` item and confirm its `source_url`, `source_path`, object metadata,
MIME type, and HEIF brand before proceeding.

## Apply (only after review)

```sh
SUPABASE_URL='https://<project-ref>.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='<server-only-service-role-key>' \
node scripts/repair-heic-images.mjs --apply --confirm=REPAIR_HEIC_IMAGES
```

Keep the resulting JSON report. `successful` records contain source and new
URLs; `failed` records explain any conversion, upload, verification, or update
failure. A failed post-upload database update can leave a new, unreferenced JPEG
at the reported destination path; it is intentionally not automatically deleted.

## Backup and rollback

Before applying, retain the dry-run JSON and, if policy requires it, export the
matching rows with an authorized database backup. The JSON contains every
original `image_id` and `source_url`, which is enough to restore URLs without
recreating posts:

```sql
-- Run only in an authorized Supabase SQL session; substitute reviewed values.
update public.images
set image_url = '<original source_url>'
where id = '<image_id>'
  and image_url = '<new destination_url>';
```

This rollback only restores `image_url`; it leaves image IDs, metadata,
generations, captions, votes, and remix relations unchanged. Keep converted
JPEGs until rollback is no longer needed. If cleanup is later approved, remove
only the exact unreferenced `destination_path` values in the successful report.
