# Plataforma de Modelación Econométrica y Gestión del Riesgo de Mercado

[![Python Version](https://img.shields.io/badge/python-3.9%20%7C%203.10%20%7C%203.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![GitHub Repository](https://img.shields.io/badge/github-market__risk-indigo.svg)](https://github.com/BrayanCumbalazaVallejo/market_risk)

Esta plataforma es una solución interactiva de grado profesional para la modelación de volatilidad condicional univariada, análisis de contagio sistémico mediante covarianza dinámica y medición del riesgo de cola (Valor en Riesgo - VaR, y Valor en Riesgo Condicional - CVaR) sobre portafolios financieros del NASDAQ y NYSE.

Combina un motor de cálculo cuantitativo en Python (`scipy`, `statsmodels`, `arch`) con una interfaz gráfica interactiva nativa (basada en HTML5, Vanilla CSS, JS y WebView2/pywebview).

---

## 🚀 Repositorio GitHub
El código fuente de este proyecto y su desarrollo colaborativo están alojados oficialmente en:
👉 **[https://github.com/BrayanCumbalazaVallejo/market_risk](https://github.com/BrayanCumbalazaVallejo/market_risk)**

---

## 📊 Arquitectura de la Metodología Cuantitativa
El software ejecuta automáticamente un flujo econométrico riguroso estructurado en **5 fases secuenciales**:

### 1. Ingesta de Datos e Imputación LOCF
- Carga de series históricas de precios de cierre.
- Alineación estricta con el calendario bursátil del NASDAQ.
- Imputación de días festivos e ilíquidos mediante el método **LOCF** (*Last Observation Carried Forward*) para eliminar sesgos de anticipación (*look-ahead bias*).

### 2. Estacionariedad y Diagnóstico Estadístico
- Cálculo de retornos logarítmicos continuos: $R_t = \ln(P_t / P_{t-1})$.
- Contraste de raíz unitaria mediante el test **ADF** (*Dickey-Fuller Aumentada*) para asegurar estacionariedad $I(0)$.
- Diagnóstico de no-normalidad extrema con la prueba de **Jarque-Bera**.
- Contraste de autocorrelación y efectos ARCH en varianza residual mediante el test de **Ljung-Box**.

### 3. Modelación de Volatilidad Dinámica (EGARCH)
- Ajuste univariado de un modelo **EGARCH(1,1)** para capturar asimetrías y efectos de apalancamiento:
  $$\ln(\sigma_t^2) = \omega + \alpha \left( \left| \frac{\epsilon_{t-1}}{\sigma_{t-1}} \right| - \mathbb{E}\left[ \left| z_t \right| \right] \right) + \gamma \frac{\epsilon_{t-1}}{\sigma_{t-1}} + \beta \ln(\sigma_{t-2}^2)$$
- Optimización bajo distribución **t-Student** para parametrizar las colas pesadas de los residuos financieros.

### 4. Contagio Sistémico y EWMA Multivariado
- Modelación de interdependencias mediante matrices de covarianza condicional dinámica **EWMA**:
  $$\Sigma_t = \lambda \Sigma_{t-1} + (1 - \lambda) \mathbf{R}_{t-1} \mathbf{R}_{t-1}^T$$
- Calibración óptima del factor de decaimiento $\lambda$ mediante optimización numérica para minimizar el error cuadrático medio (RMSE) de la varianza del portafolio.

### 5. Medida de Riesgo de Cola y Backtesting
- Estimación diaria del Valor en Riesgo (**VaR**) y Valor en Riesgo Condicional (**CVaR** o *Expected Shortfall*) a niveles de confianza del 95% y 99%.
- Validación de cobertura y calibración del modelo mediante:
  1. **Test POF de Kupiec** (cobertura incondicional de frecuencia).
  2. **Test de Independencia de Christoffersen** (ausencia de agrupamiento temporal de fallas o rachas).
  3. **Score de López** (magnitud de las pérdidas que exceden el umbral estimado).

---

## 🛠️ Estructura del Repositorio
El proyecto sigue la estructura recomendada para repositorios de ciencia de datos:

```text
├── data/
│   ├── raw/                 # Archivos CSV crudos descargados de Investing.com (estilo AMD.csv)
│   └── processed/           # Datos procesados y dashboard_data.json unificado para el dashboard
├── src/
│   ├── risk_model.py        # Core de modelación estadística, análisis quant y generación de reportes
│   └── export_dashboard_data.py # Procesador que estimula los parámetros y los exporta en JSON
├── outputs/                 # Gráficos PNG y reportes ejecutivos consolidados (.txt)
├── app.js                   # Lógica frontend interactiva (Chart.js, simulaciones de contagio)
├── index.html               # Estructura del dashboard web premium
├── styles.css               # Estilos avanzados con soporte Glassmorphism y tooltips interactivos
├── launcher.py              # Script lanzador que levanta el servidor web local con GUI nativa
├── server.py                # Servidor HTTP en Python que expone el API de carga y eliminación
├── actualizar_proyecto.py   # Orquestador del proyecto (procesa datos y compila el binario)
├── build.py                 # Script de asistencia para PyInstaller en venv
├── compilar_limpio.bat      # Script batch de compilación aislada en Windows
├── README.md                # Presentación del repositorio
└── bitacora.md              # Bitácora detallada de la modelación y resultados empíricos
```

---

## 💻 Guía de Instalación y Desarrollo

### Requisitos Previos
- Python 3.9 o superior instalado.

### 1. Configurar Entorno Aislado e Instalar Dependencias
Clone el repositorio en su máquina local, acceda al directorio y cree un entorno virtual para instalar los paquetes necesarios:

```bash
# Crear entorno virtual
python -m venv venv_build

# Activar entorno virtual (Windows)
call venv_build\Scripts\activate

# Actualizar pip e instalar dependencias
python -m pip install --upgrade pip
pip install pyinstaller pywebview pandas scipy statsmodels arch matplotlib seaborn
```

### 2. Ejecutar y Modificar la Aplicación (Modo Desarrollador)
Para iniciar el dashboard interactivo de forma local directamente desde los archivos fuente:

```bash
python launcher.py
```
Esto levantará el servidor web local en un puerto aleatorio libre, iniciará la interfaz gráfica WebView2 y te permitirá interactuar con el gestor de activos.

### 3. Cargar, Actualizar y Eliminar Activos
- **Carga de Datos Crudos:** Descargue el histórico de cualquier activo desde [Investing.com](https://es.investing.com/). Súbalo arrastrándolo a la zona designada en el **Gestor de Portafolio**.
- **Preprocesamiento Automático:** El sistema leerá el archivo, removerá caracteres BOM, imputará nulos, aplicará el test de estacionariedad ADF en el backend y lo integrará automáticamente.
- **Actualización:** Si carga un ticker ya existente en la plataforma, los datos previos se sobreescribirán y recalcularán de inmediato.
- **Eliminación:** Haga clic en el ícono de papelera al lado de cualquier activo para sacarlo del portafolio. El backend recalculará en tiempo real todos los modelos univariados, la matriz EWMA, las correlaciones cruzadas móviles y reescribirá los gráficos en `outputs/`.

---

## 📦 Compilación y Distribución
Para crear un archivo ejecutable portátil (`Proyecto_Riesgo_Mercado.exe`) que empaqueta todo el frontend, el backend y el entorno de Python sin dependencias externas:

```bash
# Ejecutar el orquestador de compilación en el entorno virtual
venv_build\Scripts\python.exe actualizar_proyecto.py
```

El script orquestará la exportación limpia de los datos y compilará la aplicación utilizando PyInstaller. Encontrará el ejecutable final listo en:
1. La raíz del proyecto (`Proyecto_Riesgo_Mercado.exe`).
2. El Escritorio de Windows de su máquina (`../Proyecto_Riesgo_Mercado.exe`).

---

## 🛠️ Guía de Arquitectura, Modificación y Depuración (Para Desarrolladores)

Esta sección proporciona la información técnica necesaria para diagnosticar problemas y extender las capacidades de la plataforma.

### 1. Arquitectura de Comunicación Frontend-Backend
La aplicación funciona mediante una arquitectura desacoplada de cliente-servidor ejecutada localmente:

```mermaid
graph LR
    subgraph Frontend (HTML5 / CSS / JS)
        UI[index.html / app.js]
        Charts[Chart.js Plots]
    end
    subgraph Backend (Python Server)
        API[server.py]
        Model[src/risk_model.py]
        Export[src/export_dashboard_data.py]
    end
    
    UI -->|1. fetch POST /api/upload| API
    API -->|2. Procesa y Valida| Model
    Model -->|3. Regenera JSON| Export
    Export -->|4. Escribe JSON| UI
```

* **Frontend (`app.js`)**: Realiza peticiones asíncronas (`fetch`) al servidor para cargar datos estáticos, subir nuevos archivos CSV (`/api/upload`) o eliminar activos existentes (`/api/delete`).
* **Backend (`server.py`)**: Levanta un servidor basado en `HTTPServer` (puerto `8000`) con un manejador personalizado `CustomHTTPRequestHandler`. Procesa las peticiones `POST` e invoca los scripts del modelo econométrico de Python. Responde siempre con payloads JSON estructurados:
  - *Éxito*: `{"success": true, "message": "Detalles..."}`
  - *Error*: `{"success": false, "error": "Detalles del fallo..."}`

---

### 2. Guía de Depuración: Resolviendo el error `Unexpected token '<'`
Este es el error de conexión más común reportado en el frontend. Ocurre cuando el JavaScript intenta parsear como JSON una respuesta que en realidad es una página HTML.

#### ¿Por qué ocurre y cómo solucionarlo?
1. **El Servidor Python no está corriendo**: 
   * *Síntoma*: Si abres `index.html` a través de un servidor web estático local (como *Live Server* de VS Code en el puerto `5500`) pero no inicias `server.py`, las llamadas a `/api/...` se redirigirán al puerto de Live Server. Al no encontrar ese endpoint, Live Server devuelve su página 404 HTML o la raíz `index.html` (cuyo primer carácter es `<` de `<!DOCTYPE html>`).
   * *Solución*: Inicia el servidor ejecutando `python server.py` en tu terminal o abriendo la aplicación mediante `python launcher.py`.
2. **Error Interno de Python (500)**:
   * *Síntoma*: Ocurre una excepción no capturada en el código de Python durante el procesamiento del CSV. La librería estándar de Python responde con una página HTML que detalla el Traceback del error.
   * *Solución*: Abre la terminal de comandos donde ejecutaste el servidor Python y revisa el log de la consola para ver qué excepción (por ejemplo, `ModuleNotFoundError` o `KeyError`) provocó la caída.
3. **Inspección con F12 en el Navegador**:
   * Para ver exactamente qué HTML está devolviendo el servidor:
     1. Abre las **Herramientas de Desarrollador** de tu navegador presionando **F12** (o Clic derecho -> Inspeccionar).
     2. Ve a la pestaña **Network** (Red).
     3. Realiza la acción que genera el error.
     4. Selecciona la petición fallida (marcada en rojo, ej: `/api/upload?...`).
     5. Haz clic en la sub-pestaña **Response** (Respuesta) o **Preview** (Vista previa). Ahí verás el error real formateado en HTML.

---

### 3. Flujo de Modificación del Código
Si deseas alterar las fórmulas cuantitativas, modificar los gráficos generados en PDF/PNG o agregar modelos estadísticos adicionales (como GARCH multivariados):

1. **Modelación y Cálculos de Riesgo**:
   * Edita el código cuantitativo en [src/risk_model.py](file:///c:/Users/BRAYAN/Desktop/Risk/src/risk_model.py). Aquí se ejecutan los cálculos de volatilidad condicional EGARCH, Dickey-Fuller, Backtesting (Kupiec, Christoffersen, López) y se exportan los reportes ejecutivos a la carpeta `outputs/`.
2. **Generación del Payload para el Dashboard**:
   * Si añades variables al dashboard, asegúrate de incluirlas en el diccionario JSON final dentro de [src/export_dashboard_data.py](file:///c:/Users/BRAYAN/Desktop/Risk/src/export_dashboard_data.py). Este script compila todos los resultados y crea el archivo `data/processed/dashboard_data.json` que lee el JS.
3. **Actualización de la Interfaz Web**:
   * Modifica [index.html](file:///c:/Users/BRAYAN/Desktop/Risk/index.html) para cambiar la estructura visual, [styles.css](file:///c:/Users/BRAYAN/Desktop/Risk/styles.css) para el diseño estético, o [app.js](file:///c:/Users/BRAYAN/Desktop/Risk/app.js) para alterar la interactividad (Chart.js, cálculos dinámicos del slider, stress testing).
4. **Sincronización y Compilación de Cambios**:
   * Cada vez que modifiques el código fuente de Python, ejecuta:
     ```bash
     python actualizar_proyecto.py
     ```
     Este script ejecutará el pipeline de datos para regenerar el JSON procesado y posteriormente recompilará el ejecutable portable `.exe` en la carpeta `dist/` integrando tus cambios de manera transparente.

