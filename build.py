import os
import subprocess
import sys

def main():
    print("=====================================================================")
    print("  COMPILACIÓN DEL PROYECTO FINAL - GESTIÓN DEL RIESGO DE MERCADO")
    print("=====================================================================")
    
    # 0. Cerrar instancias previas para evitar bloqueos de archivo
    print("[INFO] Cerrando instancias previas de Proyecto_Riesgo_Mercado.exe...")
    try:
        subprocess.run(["taskkill", "/f", "/im", "Proyecto_Riesgo_Mercado.exe"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
        
    # 1. Verificar/Instalar dependencias necesarias para compilar
    dependencies = [("PyInstaller", "pyinstaller"), ("webview", "pywebview")]
    for import_name, dep in dependencies:
        try:
            __import__(import_name)
            print(f"[OK] Dependencia '{dep}' ya está instalada.")
        except ImportError:
            print(f"[INFO] Instalando dependencia faltante '{dep}'...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", dep])
                print(f"[OK] '{dep}' se instaló correctamente.")
            except Exception as e:
                print(f"[ERROR] No se pudo instalar '{dep}'. Detalle: {e}")
                sys.exit(1)
                
    # 2. Validar que los archivos requeridos existan en el espacio de trabajo
    required_files = [
        "launcher.py", 
        "Proyecto_Riesgo_Mercado.spec", 
        "index.html", 
        "styles.css", 
        "app.js", 
        "data/processed/dashboard_data.json"
    ]
    
    missing_files = []
    for f in required_files:
        if not os.path.exists(f):
            missing_files.append(f)
            
    if missing_files:
        print("[ERROR] Faltan archivos críticos para empaquetar el proyecto:")
        for mf in missing_files:
            print(f"  - {mf}")
        print("\nPor favor, asegúrate de generar primero los datos procesados ejecutando:")
        print("  python src/export_dashboard_data.py")
        sys.exit(1)
        
    # 3. Compilar usando PyInstaller
    print("\n[INFO] Ejecutando PyInstaller para compilar el ejecutable portátil...")
    try:
        # Detectar e intentar usar el Python del entorno virtual si existe
        py_exe = sys.executable
        venv_py = os.path.join("venv_build", "Scripts", "python.exe")
        if not os.path.exists(venv_py):
            venv_py = os.path.join("venv_build", "bin", "python")
        if os.path.exists(venv_py):
            py_exe = venv_py
            print(f"[INFO] Entorno virtual detectado. Usando: {py_exe}")
        else:
            print(f"[INFO] Usando intérprete actual: {py_exe}")
            
        print(f"[INFO] Ejecutando PyInstaller a través de: {py_exe} -m PyInstaller")
        cmd = [py_exe, "-m", "PyInstaller", "--clean", "--noconfirm", "--upx-dir=.", "Proyecto_Riesgo_Mercado.spec"]
        print(f"Ejecutando: {' '.join(cmd)}")
        subprocess.check_call(cmd)
        
        print("\n=====================================================================")
        print("[ÉXITO] ¡Compilación finalizada exitosamente!")
        print("=====================================================================")
        print("El archivo ejecutable portátil se encuentra en:")
        print("  --> dist/Proyecto_Riesgo_Mercado.exe")
        print("\nEste archivo empaqueta todo el frontend y backend en un único archivo")
        print("portable que iniciará un servidor web silencioso y abrirá el dashboard.")
        
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] Falló la ejecución de PyInstaller. Código de salida: {e.returncode}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Ocurrió un error inesperado durante la compilación: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
