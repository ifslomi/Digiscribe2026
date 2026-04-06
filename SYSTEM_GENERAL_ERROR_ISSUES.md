# DigiScribe General Daily Error Issues (User + Admin)

This file lists common day-to-day errors in the system and how to fix them.
Language is simple on purpose.

## How to use this guide

1. Find the same error text you see on screen.
2. Check the "Why" section.
3. Follow the "Fix" steps.
4. If still failing, send exact error text + screenshot to admin/support.

---

## 1) Login and Session Issues

### 1.1 Invalid email or password
- What you see:
  - "Invalid email or password."
- Why:
  - Wrong email or wrong password.
  - Account may not exist.
- Fix:
  1. Re-type email and password carefully.
  2. Check caps lock.
  3. Ask admin to reset your password if needed.

### 1.2 Too many failed login attempts
- What you see:
  - "Too many failed attempts. Please try again later."
- Why:
  - Too many wrong login attempts in a short time.
- Fix:
  1. Wait a few minutes.
  2. Try again with correct password.
  3. If still blocked, ask admin to reset password.

### 1.3 No authentication token provided
- What you see:
  - "No authentication token provided."
- Why:
  - Your session token is missing.
  - Usually after long idle time, browser clear, or direct API call.
- Fix:
  1. Log out.
  2. Log in again.
  3. Retry your action.

### 1.4 Invalid or expired token
- What you see:
  - "Invalid or expired token."
- Why:
  - Session is expired.
- Fix:
  1. Refresh page.
  2. Log out and log in again.

### 1.5 Admin access required / Access denied
- What you see:
  - "Admin access required."
  - "Access denied."
- Why:
  - You are using an admin-only action while logged in as normal user.
- Fix:
  1. Use user dashboard actions only.
  2. Ask admin to grant admin role if needed.
  3. After role change, log out and log in again.

### 1.6 Login stuck on loading or route redirects unexpectedly
- What you see:
  - Page keeps redirecting to login or dashboard.
- Why:
  - Auth state is still loading or role does not match route.
- Fix:
  1. Wait a few seconds.
  2. Refresh browser.
  3. Confirm you are opening the correct route for your role.

---

## 2) Account and User Management Issues (Admin)

### 2.1 Email and password are required
- What you see:
  - "Email and password are required."
- Why:
  - Admin tried to create user with missing fields.
- Fix:
  1. Enter valid email.
  2. Enter password with at least 6 characters.

### 2.2 Invalid role
- What you see:
  - "Invalid role. Must be one of: user, admin"
- Why:
  - Role value is not supported.
- Fix:
  1. Use only `user` or `admin`.

### 2.3 Password must be at least 6 characters
- What you see:
  - "Password must be at least 6 characters."
- Why:
  - New password is too short.
- Fix:
  1. Use 6+ characters.
  2. Save again.

### 2.4 Protected admin account cannot be deleted
- What you see:
  - "This admin account is protected and cannot be deleted."
- Why:
  - Target account is protected root admin.
- Fix:
  1. Use root admin account if deletion is really needed.
  2. Otherwise keep account and disable use by changing password.

### 2.5 You cannot delete your own account
- What you see:
  - "You cannot delete your own account."
- Why:
  - System blocks self-delete for safety.
- Fix:
  1. Use another admin account to delete this account.

---

## 3) Upload Issues (Files)

### 3.1 Unsupported file type
- What you see:
  - UI error like "is not a supported file type"
  - API error: "File type not allowed..."
- Why:
  - File MIME/type is not allowed for your role.
  - User role: image/audio/video only.
  - Admin role: image/audio/video + PDF/TXT/DOC/DOCX.
- Fix:
  1. Upload allowed type only.
  2. For docs, use admin account.

### 3.2 Too many files selected
- What you see:
  - "You can upload a maximum of 10 files..."
- Why:
  - Limit is 10 files per batch.
- Fix:
  1. Upload in smaller batches.

### 3.3 No chunk received / Missing required fields
- What you see:
  - "No chunk received."
  - "Missing uploadId, chunkIndex, or chunkStart."
- Why:
  - Broken upload request or interrupted transfer.
- Fix:
  1. Refresh page.
  2. Re-upload file.
  3. Check network stability.

### 3.4 Chunk out of order
- What you see:
  - "Chunk out of order. Expected offset X, received Y."
- Why:
  - Chunks arrived in wrong sequence (retry/network issue).
- Fix:
  1. Cancel current upload.
  2. Start upload again from step 1.
  3. Avoid uploading same file from multiple tabs.

### 3.5 Missing chunk during finalize
- What you see:
  - "Missing chunk N."
- Why:
  - One or more chunks failed before completion.
- Fix:
  1. Retry upload.
  2. Keep browser tab active until done.

### 3.6 Finalize/assembly failed
- What you see:
  - "Finalize failed for ..."
  - "Assembly failed."
- Why:
  - Backend could not finish file assembly or FTP move.
- Fix:
  1. Retry upload once.
  2. If repeated, admin checks FTP connection and backend logs.

### 3.7 Authentication required during upload
- What you see:
  - "Authentication required. Please log in again."
- Why:
  - Token expired while uploading.
- Fix:
  1. Log in again.
  2. Re-submit upload.

### 3.8 Upload canceled by user/browser
- What you see:
  - Progress resets, no success result.
- Why:
  - Upload aborted manually or browser navigation happened.
- Fix:
  1. Start upload again.
  2. Do not close tab during upload.

### 3.9 Large video playback problem
- What you see:
  - Large video may not stream in browser (notice shown).
- Why:
  - Browser/stream limits for very large videos.
- Fix:
  1. Download file first.
  2. Play locally.

---

## 4) Upload by URL Issues

### 4.1 URL is required
- What you see:
  - "URL is required."
- Why:
  - URL input is empty.
- Fix:
  1. Add valid URL.

### 4.2 Invalid URL or unsupported protocol
- What you see:
  - "Please enter a valid URL starting with http:// or https://"
  - "Only HTTP(S) URLs are allowed."
  - "Invalid URL format."
- Why:
  - URL is malformed or not http/https.
- Fix:
  1. Use full URL with http:// or https://.
  2. Remove spaces.

### 4.3 Duplicate URL
- What you see:
  - "This URL has already been added."
- Why:
  - Same URL already in list.
- Fix:
  1. Remove duplicate entry.

### 4.4 URL too long
- What you see:
  - "URL is too long."
- Why:
  - URL exceeds backend limit.
- Fix:
  1. Use shorter direct URL.

### 4.5 All URL uploads failed / partial failures
- What you see:
  - "All URL uploads failed..."
  - "X processed successfully, Y failed."
- Why:
  - Source URL blocked, unreachable, or invalid response.
- Fix:
  1. Open URL in browser first.
  2. Confirm link is public.
  3. Retry failed URLs only.

### 4.6 Too many URL upload requests
- What you see:
  - "Too many URL upload requests. Please try again later."
- Why:
  - Rate limit reached.
- Fix:
  1. Wait around 15 minutes.
  2. Try again in smaller batches.

---

## 5) File and Folder Management Issues

### 5.1 Folder name is required
- What you see:
  - "Folder name is required."
- Why:
  - Empty folder name.
- Fix:
  1. Enter folder name.

### 5.2 Parent folder not found / folder not found
- What you see:
  - "Parent folder not found."
  - "Folder not found."
- Why:
  - Folder was deleted or ID is invalid.
- Fix:
  1. Refresh page.
  2. Pick an existing folder.

### 5.3 Access denied to folder/file operations
- What you see:
  - "Access denied."
  - "Access denied to parent folder."
  - "You can only rename/delete your own files."
- Why:
  - User is trying to edit another user's data.
- Fix:
  1. Use your own files/folders.
  2. Ask admin for help if ownership changed by mistake.

### 5.4 Cannot move folder into itself/descendant
- What you see:
  - "Cannot move a folder into itself."
  - "Cannot move a folder into its own descendant."
- Why:
  - Circular folder move blocked by system.
- Fix:
  1. Move to a different folder path.

### 5.5 Name is required (file rename)
- What you see:
  - "Name is required."
- Why:
  - Empty new file name.
- Fix:
  1. Enter non-empty file name.

### 5.6 Bulk operation input missing
- What you see:
  - "fileIds array is required."
- Why:
  - No files selected.
- Fix:
  1. Select at least 1 file.
  2. Retry action.

### 5.7 No files found / no files in folder
- What you see:
  - "No files found."
  - "No files in this folder."
- Why:
  - Nothing matched your selected IDs/folder.
- Fix:
  1. Refresh list.
  2. Clear filters.

### 5.8 Download failed
- What you see:
  - "Download failed."
  - ZIP not generated.
- Why:
  - Missing file on FTP or temp ZIP issue.
- Fix:
  1. Retry download.
  2. If still failing, admin checks FTP file existence.

### 5.9 Failed to copy URL
- What you see:
  - "Failed to copy URL."
- Why:
  - Browser clipboard permission issue.
- Fix:
  1. Allow clipboard permission.
  2. Copy manually if needed.

---

## 6) Transcription Issues

### 6.1 Failed to load transcription
- What you see:
  - "Failed to load transcription."
  - "Error loading transcription: ..."
- Why:
  - Transcription missing, permission denied, or API error.
- Fix:
  1. Click Try Again / Refresh.
  2. Confirm you have access to that file.

### 6.2 Transcription not found / file not found
- What you see:
  - "Transcription not found."
  - "File not found."
- Why:
  - Record deleted or wrong ID link.
- Fix:
  1. Return to list and reopen from valid record.

### 6.3 Admin access required for transcription actions
- What you see:
  - "Admin access required."
- Why:
  - Create/update/delete transcription is admin-only.
- Fix:
  1. Use admin account.

### 6.4 No transcription file provided
- What you see:
  - "No transcription file provided."
- Why:
  - Upload button used without selecting file.
- Fix:
  1. Pick a file first.

### 6.5 Unsupported transcription format
- What you see:
  - "Unsupported transcription format..."
- Why:
  - File extension/type not in allowed list.
- Allowed list:
  - PDF, TXT/CSV, DOC/DOCX, XLS/XLSX, PPT/PPTX, RTF, ODT
- Fix:
  1. Convert file to supported format.
  2. Upload again.

---

## 7) Quote / Contact Form Issues

### 7.1 Email and message are required
- What you see:
  - "Email and message are required."
- Why:
  - Required fields are empty.
- Fix:
  1. Fill both fields.

### 7.2 Invalid email or message length
- What you see:
  - "A valid email address is required."
  - "Message must be between 1 and 5000 characters."
- Why:
  - Invalid email format or message too short/too long.
- Fix:
  1. Use valid email.
  2. Keep message length in range.

### 7.3 Email service not configured
- What you see:
  - "Email service is not configured. Please try again later."
  - "Notification email is not configured."
- Why:
  - SMTP or quote notification settings are missing.
- Fix (admin):
  1. Set SMTP env values.
  2. Set quote notification email in admin settings.

### 7.4 Frontend EmailJS config issue
- What you see:
  - "Quote form is not configured. Missing: ..."
  - "EmailJS template mismatch..."
- Why:
  - Missing or wrong EmailJS environment values.
- Fix (admin/dev):
  1. Check VITE_EMAILJS_SERVICE_ID.
  2. Check VITE_EMAILJS_TEMPLATE_ID.
  3. Check VITE_EMAILJS_PUBLIC_KEY.
  4. Restart frontend after updating env.

### 7.5 Too many quote requests
- What you see:
  - "Too many quote requests. Please try again later."
- Why:
  - Rate limit reached.
- Fix:
  1. Wait around 15 minutes.

---

## 8) File Viewing / Streaming Issues

### 8.1 Authentication required when opening file
- What you see:
  - "Authentication required."
- Why:
  - File endpoint requires a valid logged-in token.
- Fix:
  1. Log in again.
  2. Open file from dashboard.

### 8.2 Access denied when opening file
- What you see:
  - "Access denied."
- Why:
  - User is not owner and not admin.
- Fix:
  1. Ask admin to verify ownership.

### 8.3 File not found on FTP
- What you see:
  - "File not found on FTP."
- Why:
  - File removed/moved or metadata path is stale.
- Fix (admin):
  1. Verify file path in metadata.
  2. Check FTP storage for file.
  3. Run FTP sync if needed.

### 8.4 Failed to stream file
- What you see:
  - "Failed to stream file."
- Why:
  - FTP stream failed or network issue.
- Fix:
  1. Retry open/download.
  2. If repeat, admin checks FTP service health.

---

## 9) Pipeline/Webhook Issues (Admin/Automation)

### 9.1 Authentication required (pipeline)
- What you see:
  - "Authentication required."
- Why:
  - Missing valid pipeline key and missing admin token.
- Fix:
  1. Send valid `x-pipeline-key`.
  2. Or use admin bearer token.

### 9.2 Invalid status / fileIds required
- What you see:
  - "Invalid status."
  - "fileIds array is required."
  - "fileId and status are required."
- Why:
  - Payload format is wrong.
- Fix:
  1. Use supported status: pending, in-progress, transcribed.
  2. Provide required file IDs.

### 9.3 Too many pipeline requests
- What you see:
  - "Too many pipeline requests. Please try again later."
- Why:
  - Pipeline endpoint rate limit hit.
- Fix:
  1. Retry after cooldown.
  2. Reduce webhook burst rate.

---

## 10) Setup / Runtime Issues (Admin/Dev)

### 10.1 Firebase Admin SDK not initialized
- What you see:
  - "Firebase Admin SDK not initialized."
  - Admin routes may fail with 503.
- Why:
  - Missing FIREBASE service account env values.
- Fix:
  1. Set FIREBASE_PRIVATE_KEY.
  2. Set FIREBASE_CLIENT_EMAIL.
  3. Set FIREBASE_PROJECT_ID.
  4. Restart backend.

### 10.2 CORS blocked request
- What you see:
  - Browser CORS error / backend says "Not allowed by CORS"
- Why:
  - Frontend origin is not in allowed list.
- Fix (admin/dev):
  1. Add frontend URL to FRONTEND_URL allowlist.
  2. Restart backend.

### 10.3 FTP operation warnings (move/rename/delete)
- What you see:
  - Action partly works but file/folder path looks wrong.
- Why:
  - FTP action failed while DB update still happened.
- Fix (admin):
  1. Verify file/folder path in FTP.
  2. Run manual FTP sync endpoint.
  3. Retry move/rename.

### 10.4 Vercel large upload timeout risk
- What you see:
  - Upload complete step times out for large jobs.
- Why:
  - Serverless runtime limits.
- Fix (admin/dev):
  1. Keep chunk workflow active.
  2. Retry failed upload from start if needed.
  3. Avoid very large concurrent uploads in one session.

---

## Quick Escalation Checklist

When reporting an issue, include:
1. Exact error text.
2. User role (user/admin).
3. Action being done (login, upload, move, etc.).
4. Time of issue.
5. Screenshot.

This helps support fix faster.
