# TYB Mess Manager (flat layout)
All files are in the root. Only `.github/workflows/android.yml` is in a folder (GitHub requires that).

1. Supabase SQL editor: run `schema.sql`, then `writer_lock.sql`, then `username_login.sql`.
2. Supabase -> Authentication -> Sign In / Providers -> Email: turn OFF "Confirm email".
3. Web: put your Project URL and key in `config.js`, host the root files. APK: add secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, run "Build Android APK".
4. Open the app: the first screen creates the admin (username + password of 8+ characters). Then in Settings add employees (username + 4-digit PIN). Employees are view-only.
Use branch `main` only.
