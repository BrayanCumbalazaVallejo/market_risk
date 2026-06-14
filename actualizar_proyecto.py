import os
import sys
import subprocess

def find_working_python():
    verify_code = "import scipy, pandas, numpy, arch"
    
    # 1. Probar el python con el que se está ejecutando este script
    try:
        res = subprocess.run([sys.executable, "-c", verify_code], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode == 0:
            return sys.executable
    except Exception:
        pass

    # 2. Probar la ruta estándar de instalación local de Python 3.12 en tu máquina
    alt_paths = [
        r"C:\Users\BRAYAN\AppData\Local\Programs\Python\Python312\python.exe",
    ]
    
    # 3. Probar dinámicamente con las rutas devueltas por 'where python'
    try:
        output = subprocess.check_output(["where", "python"], text=True)
        for line in output.strip().split("\n"):
            p = line.strip()
            if p and p not in alt_paths:
                alt_paths.append(p)
    except Exception:
        pass

    # Buscar el primer intérprete que pase la verificación de importación
    for path in alt_paths:
        if os.path.exists(path):
            try:
                res = subprocess.run([path, "-c", verify_code], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if res.returncode == 0:
                    return path
            except Exception:
                continue

    return None

def main():
    print("=====================================================================")
    print("  ORQUESTADOR: ACTUALIZACIÓN DE PROYECTO RIESGO DE MERCADO")
    print("=====================================================================")
    
    # Obtener el directorio base y cambiar a él
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)
    
    # Encontrar un intérprete de Python con las dependencias
    python_exe = find_working_python()
    if not python_exe:
        print("\n[ERROR CRÍTICO] No se encontró ningún intérprete de Python con las dependencias necesarias ('scipy', 'pandas', 'numpy', 'arch').")
        print("Por favor, instala estas librerías en tu entorno de Python.")
        sys.exit(1)
        
    print(f"[INFO] Usando intérprete de Python: {python_exe}")
    
    # 1. Ejecutar exportación de datos
    print("\n[INFO] 1/2. Ejecutando exportación de datos (export_dashboard_data.py)...")
    script_path = os.path.join(base_dir, 'src', 'export_dashboard_data.py')
    try:
        subprocess.check_call([python_exe, script_path])
        print("[OK] Datos del Dashboard actualizados.")
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] La exportación de datos falló con código {e.returncode}")
        sys.exit(1)
        
    # 2. Compilar ejecutable
    print("\n[INFO] 2/2. Ejecutando compilación del portable (build.py)...")
    build_path = os.path.join(base_dir, 'build.py')
    try:
        subprocess.check_call([python_exe, build_path])
        print("[OK] Ejecutable Proyecto_Riesgo_Mercado.exe actualizado con éxito en dist/.")
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] La compilación falló con código {e.returncode}")
        sys.exit(1)

if __name__ == "__main__":
    main()
