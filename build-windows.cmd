@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem Build from the source checkout, not from a prebuilt CI artifact folder.
rem pushd makes this work even when called from another directory or drive.
pushd "%~dp0"
if errorlevel 1 (
    1>&2 echo ERROR: Cannot enter the source directory.
    exit /b 1
)

if not exist "CMakeLists.txt" (
    1>&2 echo ERROR: CMakeLists.txt is missing. Clone the source repository first.
    goto :failed
)
where cmake >nul 2>&1
if errorlevel 1 (
    1>&2 echo ERROR: CMake 3.20 or newer must be installed and on PATH.
    goto :failed
)
where ctest >nul 2>&1
if errorlevel 1 (
    1>&2 echo ERROR: CTest must be installed and on PATH with CMake.
    goto :failed
)

echo [1/4] Configure Visual Studio 2022 x64 ^(pinned SDL3 download enabled^)...
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DVOXCRAFT_BUILD_APP=ON -DVOXCRAFT_BUILD_TESTS=ON -DVOXCRAFT_FETCH_SDL3=ON
if errorlevel 1 goto :failed

echo [2/4] Compile Release executable and tests...
cmake --build build --config Release --parallel 4
if errorlevel 1 goto :failed

echo [3/4] Run CTest...
ctest --test-dir build -C Release --output-on-failure
if errorlevel 1 goto :failed

echo [4/4] Run headless startup self-test...
"build\Release\aislopcraft.exe" --selftest
if errorlevel 1 goto :failed

echo.
echo Build and headless tests passed. This does not verify a graphical Windows launch.
echo Executable: "%CD%\build\Release\aislopcraft.exe"
echo To play from the source checkout:
echo   cd /d "%CD%"
echo   build\Release\aislopcraft.exe
popd
exit /b 0

:failed
1>&2 echo Build or tests failed. Check the error above and confirm that Visual Studio 2022 with the C++ workload and Windows SDK, CMake 3.20+, and internet access are available.
popd
exit /b 1
