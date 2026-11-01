Taraz Blu Bank update - fixed Windows installer

This is an update package for your existing Taraz Pinar V5 project. It does not include or replace your finance database, local fonts, or existing project configuration.

FIXED WINDOWS INSTALLATION
1. Extract this ZIP completely into a new folder.
2. Double-click APPLY-BLU-UPDATE.bat.
3. A Windows folder picker opens. Select the existing Taraz V5 project folder, the folder containing index.html, app.js, and style.css.
4. The script makes a backup of changed files and applies the Blu bank update.
5. Read BLU-SMS-SETUP-FA.txt for database, Edge Function, and iPhone Shortcuts setup.

Important: Do not select the newly extracted update folder. Select your existing Taraz V5 project folder.

Manual fallback
If Windows blocks the BAT file, open PowerShell in this extracted folder and run:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\APPLY-BLU-UPDATE.ps1
The same folder picker will open.

No database records are deleted by the updater. It backs up any project files it edits in a timestamped .taraz-backup-* folder.
