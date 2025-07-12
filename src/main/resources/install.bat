@echo off

:: Initialize
set "CUDA_VERSION="

:: Parse arguments (handle key=value or key value)
:parse_args
if "%~1"=="" goto setup

:: Handle split format: cuda 12.8
if /i "%~1"=="cuda" (
    if not "%~2"=="" (
        set "CUDA_VERSION=%~2"
        shift
    )
)

shift
goto parse_args

:setup
echo Detected CUDA version: [%CUDA_VERSION%]
echo Upgrading pip...
"..\python\python.exe" -m pip install --upgrade pip --no-warn-script-location

:: Create requirements.txt
if exist "requirements.txt.template" (
    if "%CUDA_VERSION%"=="11.8" (
        echo --extra-index-url https://download.pytorch.org/whl/cu118 > requirements.txt
        echo. >> requirements.txt
        type requirements.txt.template >> requirements.txt
    ) else if "%CUDA_VERSION%"=="12.6" (
        echo --extra-index-url https://download.pytorch.org/whl/cu126 > requirements.txt
        echo. >> requirements.txt
        type requirements.txt.template >> requirements.txt
    ) else if "%CUDA_VERSION%"=="12.8" (
        echo --extra-index-url https://download.pytorch.org/whl/cu128 > requirements.txt
        echo. >> requirements.txt
        type requirements.txt.template >> requirements.txt
    ) else (
        copy requirements.txt.template requirements.txt
    )
    echo requirements.txt created successfully.
) else (
    echo requirements.txt.template not found!
    exit /b 1
)

echo Installing requirements...
"..\python\python.exe" -m pip install -r requirements.txt --no-warn-script-location
if %errorlevel% neq 0 (
    echo Failed to install requirements!
    exit /b 1
)

echo.
echo Setup completed successfully!
if not "%CUDA_VERSION%"=="" (
    echo CUDA version %CUDA_VERSION% used.
)
