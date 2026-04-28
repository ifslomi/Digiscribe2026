# DigiScribe 2026 Role-Based System Limitations

Last updated: 2026-04-28

This document lists limitations and constraints that are enforced by the current codebase.
It separates end-user limitations from admin limitations and includes shared system constraints.

---

## 1) Shared/System-Wide Limitations (All Roles)

### Upload mechanics
- Uploads are chunked at 4 MB per chunk.
- Chunk uploads are retried up to 2 times per chunk on failure.
- Finalization (assembly) retries up to 4 times.
- Large uploads can take a long time; the browser tab must stay open and active.
- Upload completion can fail if any chunk is missing or out of order.

### File status model
- File status values are limited to: pending, in-progress, transcribed.
- Statuses outside this set are rejected by the backend.

### Storage behavior
- Binary files are stored on FTP/FTPS, not in Firebase Storage.
- Files are accessed through the API proxy; direct FTP access is not exposed in the UI.
- Range streaming is supported, but the backend may stream to the end of file even if an explicit end range is requested.

### URL uploads
- Only HTTP/HTTPS URLs are accepted.
- URLs longer than 2048 characters are rejected.
- If a URL points to unsupported content or cannot be fetched, the request fails.
- For some media platforms, the system may create a metadata-only entry when download extraction fails.

### Pagination and batch limits
- User dashboard paging is fixed to 12 items per page.
- Admin dashboard paging is fixed to 15 items per page.
- Bulk operations require selecting at least one file.

### Session and authentication
- Actions require a valid Firebase ID token.
- Tokens can expire during long-running actions; re-authentication may be required.

### Deployment/runtime limits (production)
- Vercel serverless runtime has a 300 second function timeout and 1024 MB memory limit.
- Temporary files in Vercel mode are stored under /tmp and are ephemeral.

### Non-goals (not implemented)
- No built-in billing or payments.
- No internal transcription automation engine in this repository.
- No API versioning scheme (e.g., /v1).
- No built-in background job queue or worker service.
- No automated test suite in the repository.

---

## 2) User Limitations (Non-Admin Accounts)

### Access and permissions
- Users can only access their own files, folders, and transcriptions.
- Users cannot create, update, or delete other users.
- Users cannot change file statuses or perform admin-only bulk actions.

### Upload file types
- Users can upload images, audio, and video only.
- Document uploads (PDF, TXT, DOC, DOCX, and similar) are not allowed for standard users.

### Upload workflow limits
- Maximum files per upload batch is 10.
- Uploads must be completed in a single active session; switching accounts or logging out cancels the session.

### Folder and file operations
- Users can only rename, move, or delete files they own.
- Users cannot move a folder into itself or a descendant folder.
- Users can only download files they own.

### Transcription access
- Users can only view transcriptions that belong to their own files.
- Users cannot create or edit transcription records.

---

## 3) Admin Limitations

### Role scope
- Admin actions are limited to the admin role only; there is no higher role in the UI.
- Protected admin accounts cannot be deleted.
- Admins cannot delete their own account.

### Upload file types
- Admins can upload media plus specific document types:
  - PDF, TXT, DOC, DOCX.
- Other document types may exist in backend MIME mapping but are not accepted by the frontend upload validation.

### Operational constraints
- Admin-only actions still require a valid session token and may fail if the token expires.
- Admin bulk operations require explicit file selections.

### Transcription delivery
- Admins can create and upload transcription deliveries, but only for existing file records.
- Delivery uploads accept only media files for delivery uploads; unsupported types are rejected.

---

## 4) Known Mismatches and Caveats

- Backend MIME mapping includes additional document types (PPT/PPTX/XLS/XLSX), but the frontend upload UI does not allow those types. This means admins cannot upload those document types through the current UI without code changes.
- README environment variable guidance may mention older upload-related variables that are no longer used by the current upload implementation.

---

## 5) Support and Troubleshooting Notes

- If you see "Invalid or expired token" during long uploads, re-login and retry.
- If chunk errors occur (missing/out of order), restart the upload from the beginning.
- For repeated assembly/FTP failures, an admin should check backend logs and FTP connectivity.
