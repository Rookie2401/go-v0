@echo off
rem Starts everything needed to test the Go ecosystem on this PC:
rem   - the Go Repository service on http://127.0.0.1:8790 (SQLite file under data\local-repository)
rem   - GoPractice on http://localhost:5199
rem   - the GoLearn setup page (hosted copy, with the share screen) on http://localhost:5198
rem Each runs in its own window; close the windows (or run scripts\local\stop.cmd) to stop.
setlocal
cd /d "%~dp0..\.."
if not exist packages\gopractice\dist\index.html (
  echo The apps are not built yet. Run:  npm run local:build
  exit /b 1
)
if not exist data\local-repository mkdir data\local-repository
start "Go Repository service (8790)" cmd /k "npx vite-node packages\repository-service\src\main.ts --port 8790 --data data\local-repository --host 127.0.0.1"
start "GoPractice (5199)" cmd /k "node scripts\local\static-server.cjs packages\gopractice\dist 5199"
start "GoLearn setup page (5198)" cmd /k "node scripts\local\static-server.cjs packages\golearn-extension\dist-web 5198"
echo.
echo  Repository service   http://127.0.0.1:8790/health
echo  GoPractice           http://localhost:5199/
echo  GoLearn setup page   http://localhost:5198/
echo  Extension to load    %cd%\packages\golearn-extension\dist
echo.
echo  See docs\TEST-ON-THIS-PC.md for the Brave steps.
endlocal
