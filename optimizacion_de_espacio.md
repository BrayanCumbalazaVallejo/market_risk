1. Compresión UPX Activa (LZMA)
PyInstaller detectó y utilizó la herramienta upx.exe que se encuentra en la raíz del proyecto. Al empaquetar, se aplicó el algoritmo de compresión LZMA sobre todas las bibliotecas dinámicas comprimibles (.dll y .pyd de Python, NumPy, SciPy, etc.). Esto reduce el tamaño de almacenamiento del binario compilado de manera muy notable, bajando de unos ~172 MB a solo ~61.3 MB sin perder ninguna funcionalidad.

2. Exclusiones Agresivas de Librerías No Usadas
Se configuró el archivo de compilación 

Proyecto_Riesgo_Mercado.spec
 para ignorar paquetes gigantescos que vienen instalados por defecto en el entorno virtual o global pero que el proyecto no utiliza:

Entornos de escritorio pesados: Se excluyeron por completo PyQt5, PyQt6, PySide2, PySide6 y wx.
Soportes de matplotlib innecesarios: Se omitieron backends para exportar a PDF, SVG, PS, WX, QT y GTK (ya que los gráficos dinámicos del Dashboard se renderizan en el cliente en HTML5/JS).
Suites de pruebas: Se quitaron las carpetas de pruebas internas de numpy.tests, scipy.tests, pandas.tests y matplotlib.tests.
Bases de datos y librerías científicas pesadas: Se omitió sqlite3, torch, tensorflow, astropy y sympy.
3. Solución al Error Recurrente Unexpected token '<'
El error "Error de conexión con el backend: Unexpected token '<'" ocurría porque en compilaciones previas se habían excluido las librerías statsmodels y patsy para intentar ahorrar espacio.

Sin embargo, la biblioteca de análisis econométrico arch (usada para calcular el test de Dickey-Fuller en el backend) requiere internamente de statsmodels y patsy. Al no estar presentes en el .exe:

El backend fallaba al importar CustomHTTPRequestHandler debido a la falta de dependencias de arch.
El lanzador del ejecutable (launcher.py) caía automáticamente en un servidor HTTP básico de fallback (SimpleHTTPRequestHandler), el cual no soporta peticiones de tipo POST (como la carga /api/upload o eliminación /api/delete de activos).
Ante un POST, el servidor básico respondía con una página de error en código HTML (que inicia con el tag <html> o <!DOCTYPE...), el cual JavaScript intentaba interpretar como un JSON, fallando inmediatamente con el error del caracter inesperado <.
Al re-incluir estas dos librerías pero manteniendo el resto de las exclusiones y la compresión UPX activa, hemos solucionado el error recurrente manteniendo el ejecutable al mínimo tamaño posible (61.3 MB).

Verificación Exitosa:
He corrido las pruebas de API sobre el ejecutable recién compilado en 

dist/Proyecto_Riesgo_Mercado.exe
 y los endpoints funcionan correctamente:

Prueba de Carga (POST /api/upload?ticker=AMD): Response: 200 OK - {"success": true, "ticker": "AMD", "p_value": 0.0, "message": "El activo AMD ha sido validado..."}
Prueba de Eliminación (POST /api/delete?ticker=AMD): Response: 200 OK - {"success": true, "ticker": "AMD", "message": "El activo AMD ha sido eliminado..."}
¡Ya puedes realizar tus pruebas en el ejecutable final en la carpeta dist/!