@echo off
echo =====================================================================
echo   CLEAN ROOM BUILD: PORTABLE COMPILATION VIA VENV
echo =====================================================================

:: 0. Detener ejecutable previo para liberar archivo
echo [INFO] Cerrando instancias previas de Proyecto_Riesgo_Mercado.exe...
taskkill /f /im Proyecto_Riesgo_Mercado.exe 2>nul

:: 1. Limpieza de carpetas previas
echo [INFO] 1/5. Purgando carpetas previas y archivos temporales...
if exist build rd /s /q build
if exist dist rd /s /q dist
if exist launcher.spec del /f /q launcher.spec

:: 2. Crear entorno virtual
echo [INFO] 2/5. Creando entorno virtual aislado (venv_build)...
python -m venv venv_build
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo crear el entorno virtual. Verifique su instalacion de Python.
    exit /b 1
)

:: 3. Activar venv e instalar dependencias minimas
echo [INFO] 3/5. Activando entorno virtual e instalando dependencias puras...
call venv_build\Scripts\activate
python -m pip install --upgrade pip
pip install pyinstaller pywebview pandas scipy arch matplotlib
if %errorlevel% neq 0 (
    echo [ERROR] Fallo la instalacion de dependencias.
    exit /b 1
)

:: 4. Compilar usando PyInstaller con la configuracion del archivo spec optimizado
echo [INFO] 4/5. Empaquetando aplicacion limpia usando el archivo .spec...
pyinstaller --clean --noconfirm --upx-dir=. Proyecto_Riesgo_Mercado.spec
if %errorlevel% neq 0 (
    echo [ERROR] Fallo el empaquetamiento con PyInstaller.
    exit /b 1
)

echo [INFO] 5/5. Compilacion finalizada.
echo =====================================================================
echo [EXITO] Ejecutable portable creado en:
echo   - dist\Proyecto_Riesgo_Mercado.exe
echo =====================================================================
