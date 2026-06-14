import os
import sys
import json
import io
import pandas as pd
import numpy as np
from http.server import SimpleHTTPRequestHandler, HTTPServer
from arch.unitroot import ADF

# Definición de rutas del proyecto
def get_paths():
    import os, sys, shutil
    
    if getattr(sys, 'frozen', False):
        # En modo congelado (ejecutable portable), persistir contiguo al ejecutable (.exe)
        exe_dir = os.path.dirname(sys.executable)
        persist_data_dir = os.path.join(exe_dir, 'data')
        persist_outputs_dir = os.path.join(exe_dir, 'outputs')
        
        # Copiar datos iniciales desde el bundle temporal (sys._MEIPASS) si no existen
        bundle_dir = sys._MEIPASS
        
        # Copiar datos iniciales si no existen
        if not os.path.exists(os.path.join(persist_data_dir, 'raw')):
            os.makedirs(persist_data_dir, exist_ok=True)
            bundle_data = os.path.join(bundle_dir, 'data')
            if os.path.exists(bundle_data):
                shutil.copytree(bundle_data, persist_data_dir, dirs_exist_ok=True)
                
        if not os.path.exists(persist_outputs_dir):
            bundle_outputs = os.path.join(bundle_dir, 'outputs')
            if os.path.exists(bundle_outputs):
                shutil.copytree(bundle_outputs, persist_outputs_dir, dirs_exist_ok=True)
            else:
                os.makedirs(persist_outputs_dir, exist_ok=True)
                
        return persist_data_dir, persist_outputs_dir
    else:
        # En modo desarrollo, usar el directorio del propio workspace (donde está launcher.py)
        current_dir = os.path.dirname(os.path.abspath(__file__))
        while current_dir and not os.path.exists(os.path.join(current_dir, 'launcher.py')):
            parent = os.path.dirname(current_dir)
            if parent == current_dir:
                break
            current_dir = parent
            
        persist_data_dir = os.path.join(current_dir, 'data')
        persist_outputs_dir = os.path.join(current_dir, 'outputs')
        
        os.makedirs(os.path.join(persist_data_dir, 'raw'), exist_ok=True)
        os.makedirs(persist_outputs_dir, exist_ok=True)
        
        return persist_data_dir, persist_outputs_dir

DATA_DIR, OUTPUTS_DIR = get_paths()
DATA_RAW_DIR = os.path.join(DATA_DIR, 'raw')
DATA_PROCESSED_DIR = os.path.join(DATA_DIR, 'processed')

class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Obtener el path relativo del request original (por ejemplo, /data/processed/dashboard_data.json)
        from urllib.parse import unquote
        import posixpath
        
        # Desglosar el path de la URL
        path = path.split('?', 1)[0]
        path = path.split('#', 1)[0]
        path = posixpath.normpath(unquote(path))
        words = path.split('/')
        words = filter(None, words)
        
        words_list = list(words)
        if words_list and words_list[0] in ('data', 'outputs'):
            # Servir desde el directorio persistente
            base = DATA_DIR if words_list[0] == 'data' else OUTPUTS_DIR
            local_path = os.path.join(os.path.dirname(base), *words_list)
            return local_path
            
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        # Manejar peticiones Preflight CORS
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path.startswith('/api/upload'):
            # Parsear parámetros de la URL para obtener el ticker
            from urllib.parse import urlparse, parse_qs
            parsed_url = urlparse(self.path)
            query_params = parse_qs(parsed_url.query)
            
            ticker = query_params.get('ticker', [''])[0].upper().strip()
            # Limpiar ticker: sólo alfanuméricos y máximo 5 letras
            ticker = ''.join(c for c in ticker if c.isalnum())[:5]
            
            if not ticker:
                self.send_error_response("Ticker no especificado o inválido.")
                return
                
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error_response("El cuerpo del archivo CSV está vacío.")
                return
                
            post_data = self.rfile.read(content_length)
            
            try:
                csv_text = post_data.decode('utf-8')
            except Exception as e:
                self.send_error_response(f"Error decodificando el archivo CSV: {str(e)}")
                return
                
            # Validar y procesar el CSV
            try:
                result = self.process_csv(csv_text, ticker)
                if result['success']:
                    self.send_success_response(result)
                else:
                    self.send_error_response(result['error'], p_value=result.get('p_value'))
            except Exception as e:
                self.send_error_response(f"Error interno procesando CSV: {str(e)}")
        elif self.path.startswith('/api/delete'):
            # Parsear parámetros de la URL para obtener el ticker
            from urllib.parse import urlparse, parse_qs
            parsed_url = urlparse(self.path)
            query_params = parse_qs(parsed_url.query)
            
            ticker = query_params.get('ticker', [''])[0].upper().strip()
            ticker = ''.join(c for c in ticker if c.isalnum())[:5]
            
            if not ticker:
                self.send_error_response("Ticker no especificado o inválido.")
                return
                
            try:
                result = self.delete_asset(ticker)
                if result['success']:
                    self.send_success_response(result)
                else:
                    self.send_error_response(result['error'])
            except Exception as e:
                self.send_error_response(f"Error interno eliminando activo: {str(e)}")
        else:
            # Fallback para otros POSTs
            super().do_POST()
            
    def send_success_response(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
        
    def send_error_response(self, message, p_value=None):
        self.send_response(400)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        response = {"success": False, "error": message}
        if p_value is not None:
            response["p_value"] = p_value
        self.wfile.write(json.dumps(response).encode('utf-8'))
        
    def delete_asset(self, ticker):
        # Permitir eliminar todos los activos, por lo que no forzamos mínimo de 2 aquí
        csv_files = [f for f in os.listdir(DATA_RAW_DIR) if f.endswith('.csv')]
            
        filepath = os.path.join(DATA_RAW_DIR, f"{ticker}.csv")
        if not os.path.exists(filepath):
            return {"success": False, "error": f"El activo {ticker} no se encuentra en el portafolio."}
            
        # Eliminar el archivo
        try:
            os.remove(filepath)
            print(f"Activo {ticker} eliminado de: {filepath}")
        except Exception as e:
            return {"success": False, "error": f"No se pudo eliminar el archivo en el disco: {str(e)}"}
            
        # Ejecutar export_dashboard_data.py y risk_model.py para actualizar
        try:
            from src.export_dashboard_data import main as export_main
            export_main()
            print("Dashboard JSON regenerado tras eliminar activo.")
            
            try:
                from src.risk_model import main as risk_main
                risk_main()
                print("Reportes de risk_model actualizados tras eliminar activo.")
            except Exception as e_risk:
                print(f"Advertencia: No se pudo ejecutar el pipeline del modelo de riesgo: {str(e_risk)}")
        except Exception as e:
            return {
                "success": False,
                "error": f"Activo eliminado, pero falló la regeneración del dashboard: {str(e)}"
            }
            
        return {
            "success": True,
            "ticker": ticker,
            "message": f"El activo {ticker} ha sido eliminado e integrado la actualización del portafolio con éxito."
        }
        
    def process_csv(self, csv_text, ticker):
        # 1. Leer el CSV a un DataFrame
        try:
            # Soportar diferentes separadores tratando de leer primero con ',' y si falla o da 1 columna con ';'
            df = pd.read_csv(io.StringIO(csv_text), sep=None, engine='python')
        except Exception as e:
            return {"success": False, "error": f"Formato CSV no válido: {str(e)}"}
            
        # Limpiar comillas y BOM en los nombres de columnas
        df.columns = [col.lstrip('\ufeff').replace('"', '').strip() for col in df.columns]
        
        # Validar columnas de forma estricta (Investing.com)
        required_cols = ['Fecha', 'Último', 'Apertura', 'Máximo', 'Mínimo', 'Vol.', '% var.']
        if not all(col in df.columns for col in required_cols):
            return {
                "success": False,
                "error": "Error: Estructura de columnas inválida. Asegúrese de descargar el histórico diario directamente desde Investing.com."
            }
            
        # 2. Parsear fechas y limpiar columna 'Último'
        # Limpiar espacios y comillas en los datos
        for col in df.columns:
            if df[col].dtype == object:
                df[col] = df[col].astype(str).str.replace('"', '').str.strip()
                
        # Intentar diferentes formatos de fecha: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
        df['Fecha_parsed'] = pd.to_datetime(df['Fecha'], format='%d.%m.%Y', errors='coerce')
        if df['Fecha_parsed'].isna().all():
            df['Fecha_parsed'] = pd.to_datetime(df['Fecha'], format='%d/%m/%Y', errors='coerce')
        if df['Fecha_parsed'].isna().all():
            df['Fecha_parsed'] = pd.to_datetime(df['Fecha'], errors='coerce')
            
        if df['Fecha_parsed'].isna().all():
            return {
                "success": False,
                "error": "No se pudo interpretar el formato de las fechas en la columna 'Fecha'. Use DD.MM.AAAA, DD/MM/AAAA o AAAA-MM-DD."
            }
            
        df['Fecha'] = df['Fecha_parsed']
        df = df.drop(columns=['Fecha_parsed'])
        
        # Limpiar precios de la columna Último (cambiar comas por puntos, remover comillas/miles)
        df['Último'] = df['Último'].astype(str).str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
        df['Último'] = pd.to_numeric(df['Último'], errors='coerce')
        
        # Eliminar filas nulas en Fecha o Último
        df = df.dropna(subset=['Fecha', 'Último']).sort_values('Fecha').reset_index(drop=True)
        
        if len(df) < 50:
            return {"success": False, "error": "El archivo tiene muy pocos datos. Se requieren al menos 50 días de cotización."}
            
        # 3. Cruzar con el calendario de NASDAQ (representado por NVDA.csv o cualquier otro activo existente)
        csv_files = [f for f in os.listdir(DATA_RAW_DIR) if f.endswith('.csv') and f != f"{ticker}.csv"]
        if csv_files:
            # Si hay otros archivos, usar el primero de la lista (ej. NVDA.csv o cualquiera) como referencia de calendario
            if 'NVDA.csv' in csv_files:
                ref_path = os.path.join(DATA_RAW_DIR, 'NVDA.csv')
            else:
                ref_path = os.path.join(DATA_RAW_DIR, csv_files[0])
                
            ref_df = pd.read_csv(ref_path, quotechar='"')
            ref_df.columns = [col.replace('"', '').strip() for col in ref_df.columns]
            ref_df['Fecha'] = pd.to_datetime(ref_df['Fecha'], format='%d.%m.%Y', errors='coerce')
            if ref_df['Fecha'].isna().all():
                ref_df['Fecha'] = pd.to_datetime(ref_df['Fecha'], format='%d/%m/%Y', errors='coerce')
            if ref_df['Fecha'].isna().all():
                ref_df['Fecha'] = pd.to_datetime(ref_df['Fecha'], errors='coerce')
            ref_df = ref_df.dropna(subset=['Fecha']).sort_values('Fecha').reset_index(drop=True)
            
            # Unir para alinear con el calendario NASDAQ exacto
            df_merged = pd.merge(ref_df[['Fecha']], df[['Fecha', 'Último']], on='Fecha', how='left')
            
            # Imputación LOCF (Forward-Fill y luego Backward-Fill para iniciales si los hay)
            df_merged['Último'] = df_merged['Último'].ffill().bfill()
        else:
            # Si es el primer activo y no hay otros, usar sus propios datos sin alinear
            df_merged = df.copy()
        
        # 4. Calcular retornos logarítmicos
        df_merged['returns'] = np.log(df_merged['Último'] / df_merged['Último'].shift(1))
        df_merged['returns'] = df_merged['returns'].fillna(0.0)
        
        # 5. Diagnóstico de Estacionariedad mediante Dickey-Fuller Aumentada (ADF)
        returns_array = df_merged['returns'].values
        try:
            adf_test = ADF(returns_array)
            p_value = float(adf_test.pvalue)
            is_stationary = p_value < 0.05
        except Exception as e:
            return {"success": False, "error": f"Error calculando Dickey-Fuller en el backend: {str(e)}"}
            
        if not is_stationary:
            return {
                "success": False,
                "error": f"La serie de retornos no es estacionaria (p-valor ADF: {p_value:.6f} > 0.05). No se puede integrar.",
                "p_value": p_value
            }
            
        # 6. Si es estacionaria, guardar el archivo formateado en data/raw/
        out_df = pd.DataFrame({
            'Fecha': df_merged['Fecha'].dt.strftime('%d.%m.%Y'),
            'Último': df_merged['Último']
        })
        
        out_filepath = os.path.join(DATA_RAW_DIR, f"{ticker}.csv")
        out_df.to_csv(out_filepath, index=False)
        print(f"Nuevo activo guardado en: {out_filepath}")
        
        # 7. Ejecutar export_dashboard_data.py para regenerar el JSON y risk_model.py para el reporte
        try:
            from src.export_dashboard_data import main as export_main
            export_main()
            print("Dashboard JSON regenerado exitosamente.")
            
            try:
                from src.risk_model import main as risk_main
                risk_main()
                print("Reportes y gráficas de risk_model actualizados exitosamente.")
            except Exception as e_risk:
                print(f"Advertencia: No se pudo ejecutar el pipeline del modelo de riesgo: {str(e_risk)}")
        except Exception as e:
            return {
                "success": False,
                "error": f"Activo guardado y validado, pero falló la regeneración del dashboard: {str(e)}",
                "p_value": p_value
            }
            
        return {
            "success": True,
            "ticker": ticker,
            "p_value": p_value,
            "message": f"El activo {ticker} ha sido validado (estacionario, p-valor: {p_value:.6f}) e integrado al portafolio exitosamente."
        }

def run(port=8000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, CustomHTTPRequestHandler)
    print(f"Servidor web local con API corriendo en http://localhost:{port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        sys.exit(0)

if __name__ == '__main__':
    # Si se pasa un puerto como argumento
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run(port)
