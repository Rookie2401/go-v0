@echo off
rem Stops the local service and the two static servers started by start.cmd (by port).
for %%p in (8790 5198 5199) do (
  for /f "tokens=5" %%i in ('netstat -ano ^| findstr /r /c:":%%p .*LISTENING"') do (
    echo stopping port %%p (pid %%i)
    taskkill /PID %%i /T /F >nul 2>&1
  )
)
echo done
