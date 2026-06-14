@echo off
echo =====================================================================
echo   CLEAN ROOM BUILD: PORTABLE COMPILATION VIA VENV
echo =====================================================================

:: 0. Detener ejecutable previo para liberar archivo
echo [INFO] Cerrando instancias previas de Proyecto_Riesgo_Mercado.exe...
taskkill /f /im Proyecto_Riesgo_Mercado.exe 2>nul

:: 1. Limpieza de carpetas previas y spec viejo
echo [INFO] 1/5. Purgando carpetas previas y archivos temporales...
if exist build rd /s /q build
if exist dist rd /s /q dist
if exist launcher.spec del /f /q launcher.spec
if exist Proyecto_Riesgo_Mercado.spec del /f /q Proyecto_Riesgo_Mercado.spec

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

:: 4. Compilar usando PyInstaller con exclusiones agresivas y data estatica
echo [INFO] 4/5. Empaquetando aplicacion limpia...
pyinstaller --noconfirm --onefile --windowed --name=Proyecto_Riesgo_Mercado --clean --upx-dir=. --add-data "index.html;." --add-data "styles.css;." --add-data "app.js;." --add-data "data/processed/dashboard_data.json;data/processed" --add-data "data/raw;data/raw" --hidden-import=server --hidden-import=src.export_dashboard_data --hidden-import=src.risk_model --hidden-import=scipy.optimize._highspy --exclude=tkinter --exclude=seaborn --exclude=PyQt5 --exclude=PyQt6 --exclude=PySide2 --exclude=PySide6 --exclude=wx --exclude=matplotlib.backends.backend_qt5agg --exclude=matplotlib.backends.backend_qt6agg --exclude=matplotlib.backends.backend_wxagg --exclude=matplotlib.backends.backend_gtk3agg --exclude=matplotlib.backends.backend_gtk4agg --exclude=matplotlib.backends.backend_tkagg --exclude=matplotlib.backends.backend_pdf --exclude=matplotlib.backends.backend_svg --exclude=matplotlib.backends.backend_ps --exclude=matplotlib.backends.backend_pgf --exclude=numpy.tests --exclude=scipy.tests --exclude=pandas.tests --exclude=matplotlib.tests --exclude=PIL._avif --exclude=PIL._webp --exclude=PIL._imagingcms --exclude=sqlite3 --exclude=_sqlite3 --exclude=pydoc_data --exclude=statsmodels --exclude=patsy launcher.py
if %errorlevel% neq 0 (
    echo [ERROR] Fallo el empaquetamiento con PyInstaller.
    exit /b 1
)

:: 5. Copiar ejecutable a la raíz y al Escritorio (directorio padre)
echo [INFO] Copiando ejecutable a la raíz del proyecto...
copy /y dist\Proyecto_Riesgo_Mercado.exe .
echo [INFO] Copiando ejecutable al Escritorio...
copy /y dist\Proyecto_Riesgo_Mercado.exe ..

echo [INFO] 5/5. Compilacion finalizada.
echo =====================================================================
echo [EXITO] Ejecutable portable creado en:
echo   - dist\Proyecto_Riesgo_Mercado.exe
echo   - Proyecto_Riesgo_Mercado.exe (raiz)
echo   - ..\Proyecto_Riesgo_Mercado.exe (Escritorio)
echo =====================================================================
