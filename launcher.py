import os
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer

try:
    from server import CustomHTTPRequestHandler
except Exception as e:
    import traceback
    with open("import_error.log", "w") as f:
        traceback.print_exc(file=f)
    print(f"Error importing CustomHTTPRequestHandler at top level: {e}")
    CustomHTTPRequestHandler = None

def get_base_path():
    # Detecta si se está ejecutando desde el ejecutable compilado de PyInstaller
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

class SafeTCPServer(TCPServer):
    allow_reuse_address = True

def run_fallback_server(base_dir, port):
    os.chdir(base_dir)
    try:
        from server import CustomHTTPRequestHandler
        handler = CustomHTTPRequestHandler
        if handler is None:
            raise ImportError("CustomHTTPRequestHandler is None")
    except Exception as e:
        import traceback
        with open("import_error_fallback.log", "w") as f:
            traceback.print_exc(file=f)
        print(f"Error importing CustomHTTPRequestHandler in fallback server: {e}")
        handler = SimpleHTTPRequestHandler
    try:
        with SafeTCPServer(("", port), handler) as httpd:
            httpd.serve_forever()
    except Exception as e:
        print(f"Error en el servidor local: {e}")

def start_fallback(base_dir):
    # Buscar un puerto libre dinámicamente
    port = int(os.environ.get('PORT', 0))
    if port == 0:
        import socket
        s = socket.socket()
        s.bind(('', 0))
        port = s.getsockname()[1]
        s.close()
    
    # Iniciar el servidor local en un hilo secundario
    t = threading.Thread(target=run_fallback_server, args=(base_dir, port), daemon=True)
    t.start()
    
    # Esperar a que el servidor esté activo
    time.sleep(0.5)
    
    # Abrir el dashboard en el navegador predeterminado de la máquina
    webbrowser.open(f"http://localhost:{port}/index.html")
    
    # Mostrar un cuadro de diálogo simple para mantener el proceso vivo
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw() # Ocultar la ventana principal de tkinter
        messagebox.showinfo(
            "Gestión del Riesgo de Mercado - Servidor Local",
            f"El dashboard interactivo se ha abierto en su navegador web predeterminado en la dirección:\n\nhttp://localhost:{port}/index.html\n\nHaga clic en Aceptar cuando desee cerrar la aplicación y detener el servidor."
        )
    except Exception:
        # Fallback de consola si no estuviera disponible tkinter
        print(f"Servidor local corriendo en http://localhost:{port}/index.html")
        print("Presione ENTER para salir y detener el servidor...")
        input()

def main():
    base_dir = get_base_path()
    html_file = os.path.join(base_dir, 'index.html')
    
    # Validar existencia de archivos críticos en el directorio temporal
    if not os.path.exists(html_file):
        # Si no se encuentra en sys._MEIPASS, usar la ruta del script actual
        base_dir = os.path.dirname(os.path.abspath(__file__))
        html_file = os.path.join(base_dir, 'index.html')
        
    if not os.path.exists(html_file):
        try:
            import tkinter as tk
            from tkinter import messagebox
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror("Error de Inicio", "No se encontraron los archivos estáticos del dashboard (index.html).")
        except Exception:
            print("Error: index.html no encontrado.")
        sys.exit(1)
        
    try:
        # Intentar cargar la interfaz con ventana nativa (Edge WebView2 / Chromium)
        import webview
        import socket
        
        # Buscar un puerto libre dinámicamente
        port = int(os.environ.get('PORT', 0))
        if port == 0:
            s = socket.socket()
            s.bind(('', 0))
            port = s.getsockname()[1]
            s.close()
        
        # Iniciar nuestro propio servidor con API en un hilo secundario
        t = threading.Thread(target=run_fallback_server, args=(base_dir, port), daemon=True)
        t.start()
        time.sleep(0.5)
        
        webview.create_window(
            title='Proyecto Final - Gestión del Riesgo de Mercado',
            url=f"http://localhost:{port}/index.html",
            width=1350,
            height=850,
            resizable=True,
            min_size=(1024, 700)
        )
        webview.start()
    except Exception as e:
        # Si falla por falta de WebView2, dotnet u otra incompatibilidad, usar el navegador predeterminado
        print(f"Advertencia: No se pudo iniciar la interfaz nativa ({e}). Iniciando modo compatible con navegador...")
        start_fallback(base_dir)

if __name__ == '__main__':
    main()
