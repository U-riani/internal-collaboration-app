# File uploads (web)

The Messages composer, Task editor and comments, Approval request form, and
Drive folder view use a shared multiple-file drag-and-drop picker. Each file is
uploaded independently through the authenticated file API; attachment IDs are
passed to the existing permission-checked message/task/approval endpoints.
Drive files are linked to the selected folder only after the upload succeeds.

## Large files

The web client uses the existing `POST /api/v1/files` endpoint for files of
16 MiB or less, preserving compatibility with older clients. For larger files,
it transparently uses:

1. `POST /api/v1/files/uploads` with `{ name, sizeBytes, mimeType }`
2. `POST /api/v1/files/uploads/:uploadId/chunks/:index` in order, one 8 MiB
   multipart chunk per request.
3. `POST /api/v1/files/uploads/:uploadId/complete` to verify the byte count,
   calculate SHA-256, enforce quota and create the existing FileObject.
4. `DELETE /api/v1/files/uploads/:uploadId` to cancel/clean up if a request fails.

Sessions are authenticated and scoped to their initiating user. The server
streams each chunk to temporary disk, never buffering the complete file in RAM.
Sessions expire after 30 minutes without activity and are lost if the API
process restarts. When a chunk fails, the temporary upload is removed; clients
can reselect and retry the file.

## Remaining safety and infrastructure limits

- The database currently stores `FileObject.sizeBytes` as a signed 32-bit
  `Int`. Until a separate migration is planned, a single file cannot exceed
  2,147,483,647 bytes. `MAX_UPLOAD_SIZE_MB` defaults to **2047** and is
  bounded by the schema; this is not an unlimited-size implementation.
- `STORAGE_QUOTA_MB` still applies per uploader (default **10,240 MB**).
- Files with blocked executable extensions remain rejected.
- The Messages and Approvals APIs accept up to **50** attachments per item.
  Task attachment arrays have no stricter per-item cap; the shared UI selects
  up to 50 files at a time.
- Cloudflare proxied requests may have a 100 MB request-body limit on Free/Pro.
  The 8 MiB chunk requests are designed to fit below it. The finalization
  request may still encounter proxy timeout issues if the backend/storage is
  very slow; validate using your actual production network.
- Multipart uploads use **ephemeral temporary disk space**. Ensure the API
  container has room for files being uploaded in addition to permanent storage.
  Sessions are scoped to a single API process (not suitable for load-balanced
  replicas without shared session storage).

## Verify before merging to `prod`

1. Run `npm --prefix apps/api run check` and
   `npm --prefix apps/web run build`.
2. Run `npm --prefix apps/web test`.
3. Run `npm --prefix apps/api test` with a **test PostgreSQL database**;
   tests create and drop their own temporary PostgreSQL schemas.
4. In a staging deployment, upload a small file and a file larger than 100 MB
   through the Cloudflare hostname. Confirm downloaded checksums match.
5. Upload 2+ files in Messages, Tasks, Task Comments, and Approvals, and check
   permissions and downloads for each; test Drive drag-and-drop into a nested
   shared folder using an editor role.
6. Exercise a failed chunk, cancelled upload, quota exceeded, and role without
   upload permissions. Confirm no link is created on failure.
7. Check disk consumption and container logs during large uploads.

No existing database migration is needed for this change.
