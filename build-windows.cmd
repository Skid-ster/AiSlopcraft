@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem Build from a source checkout; the prebuilt CI artifact has no source files.
rem Use the installed MSVC compiler, not a hard-coded Visual Studio year.
pushd "%~dp0"
if errorlevel 1 (
    1>&2 echo ERROR: Cannot enter the source directory.
    exit /b 1
)
if not exist "CMakeLists.txt" (
    1>&2 echo ERROR: CMakeLists.txt is missing. Clone the source repository first.
    goto :failed
)

rem vswhere is installed with Visual Studio and also finds Build Tools editions.
rem A Developer Command Prompt already on PATH also works if vswhere is absent.
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" set "PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer;%PATH%"
if exist "%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe" set "PATH=%ProgramFiles%\Microsoft Visual Studio\Installer;%PATH%"
set "VS_DIR="
where vswhere >nul 2>&1
if errorlevel 1 goto :toolchain_ready
for /f "delims=" %%I in ('vswhere -latest -prerelease -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath') do set "VS_DIR=%%I"
if not defined VS_DIR goto :toolchain_ready
if not exist "%VS_DIR%\Common7\Tools\VsDevCmd.bat" goto :toolchain_ready
echo Using MSVC from "%VS_DIR%".
call "%VS_DIR%\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
if errorlevel 1 goto :failed

:toolchain_ready
where cl >nul 2>&1
if errorlevel 1 (
    1>&2 echo ERROR: No MSVC C++ compiler found. Install the Desktop development with C++ workload in your Visual Studio version, including a Windows SDK, or run from an x64 Developer Command Prompt.
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

rem Ninja and NMake both work with an initialized MSVC/Windows SDK shell.
rem Keep the output at build\Release\aislopcraft.exe for existing CMD commands.
rem This separate CMake tree ignores an older failed configure in build\.
set "GENERATOR=Ninja"
set "BUILD_JOBS=--parallel 4"
where ninja >nul 2>&1
if not errorlevel 1 goto :configure
where nmake >nul 2>&1
if errorlevel 1 (
    1>&2 echo ERROR: Neither Ninja nor NMake was found with the MSVC compiler.
    goto :failed
)
set "GENERATOR=NMake Makefiles"
set "BUILD_JOBS="

:configure
set "CC=cl"
set "CXX=cl"
echo [1/4] Configure x64 Release with %GENERATOR% and installed MSVC...
cmake -S . -B "build\Release" -G "%GENERATOR%" -DCMAKE_BUILD_TYPE=Release -DVOXCRAFT_BUILD_APP=ON -DVOXCRAFT_BUILD_TESTS=ON -DVOXCRAFT_FETCH_SDL3=ON
if errorlevel 1 goto :failed

echo [2/4] Compile Release executable and tests...
cmake --build "build\Release" %BUILD_JOBS%
if errorlevel 1 goto :failed

echo [3/4] Run CTest...
ctest --test-dir "build\Release" -C Release --output-on-failure
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
1>&2 echo Build or tests failed; see the error above. No source files or existing saves were deleted.
popd
exit /b 1
