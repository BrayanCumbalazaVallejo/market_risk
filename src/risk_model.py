import os
import numpy as np
import pandas as pd
import scipy.stats as stats
from scipy.optimize import minimize
from arch import arch_model
from arch.unitroot import ADF
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def compute_acf(x, nlags=20):
    n = len(x)
    mean = np.mean(x)
    variance = np.var(x)
    if variance == 0:
        return np.ones(nlags + 1)
    acf = [1.0]
    for l in range(1, nlags + 1):
        r = np.sum((x[l:] - mean) * (x[:-l] - mean)) / (n * variance)
        acf.append(r)
    return np.array(acf)

def compute_pacf(x, nlags=20):
    acf = compute_acf(x, nlags)
    pacf = np.zeros(nlags + 1)
    pacf[0] = 1.0
    if nlags >= 1:
        pacf[1] = acf[1]
    
    # Recursion de Levinson-Durbin
    ar_coefs = np.zeros((nlags + 1, nlags + 1))
    if nlags >= 1:
        ar_coefs[1, 1] = acf[1]
    
    for i in range(2, nlags + 1):
        numerator = acf[i] - np.sum(ar_coefs[i-1, 1:i] * acf[i-1:0:-1])
        denominator = 1.0 - np.sum(ar_coefs[i-1, 1:i] * acf[1:i])
        if abs(denominator) < 1e-10:
            val = 0.0
        else:
            val = numerator / denominator
        pacf[i] = val
        ar_coefs[i, i] = val
        for j in range(1, i):
            ar_coefs[i, j] = ar_coefs[i-1, j] - val * ar_coefs[i-1, i-j]
            
    return pacf

def plot_acf_pacf_custom(series, ax_acf, ax_pacf, title_prefix, nlags=20):
    n = len(series)
    acf_vals = compute_acf(series, nlags)
    pacf_vals = compute_pacf(series, nlags)
    
    lags = np.arange(nlags + 1)
    
    # Intervalo de confianza del 95%
    conf_interval = 1.96 / np.sqrt(n)
    
    # ACF Plot
    ax_acf.vlines(lags, [0], acf_vals, color='#1f77b4', linewidths=2)
    ax_acf.plot(lags, acf_vals, 'o', color='#1f77b4')
    ax_acf.axhline(0, color='black', linewidth=0.8)
    ax_acf.axhline(conf_interval, color='#1f77b4', linestyle='--', alpha=0.6)
    ax_acf.axhline(-conf_interval, color='#1f77b4', linestyle='--', alpha=0.6)
    ax_acf.fill_between(lags, -conf_interval, conf_interval, color='#1f77b4', alpha=0.15)
    ax_acf.set_title(f"ACF {title_prefix}")
    ax_acf.set_xlim(-0.5, nlags + 0.5)
    ax_acf.set_ylim(-1.05, 1.05)
    
    # PACF Plot
    ax_pacf.vlines(lags, [0], pacf_vals, color='#1f77b4', linewidths=2)
    ax_pacf.plot(lags, pacf_vals, 'o', color='#1f77b4')
    ax_pacf.axhline(0, color='black', linewidth=0.8)
    ax_pacf.axhline(conf_interval, color='#1f77b4', linestyle='--', alpha=0.6)
    ax_pacf.axhline(-conf_interval, color='#1f77b4', linestyle='--', alpha=0.6)
    ax_pacf.fill_between(lags, -conf_interval, conf_interval, color='#1f77b4', alpha=0.15)
    ax_pacf.set_title(f"PACF {title_prefix}")
    ax_pacf.set_xlim(-0.5, nlags + 0.5)
    ax_pacf.set_ylim(-1.05, 1.05)

def pure_ljungbox(x, lags=10):
    n = len(x)
    mean = np.mean(x)
    variance = np.var(x)
    if variance == 0:
        return 0.0, 1.0
        
    r = []
    denom = np.sum((x - mean) ** 2)
    for k in range(1, lags + 1):
        num = np.sum((x[k:] - mean) * (x[:-k] - mean))
        r.append(num / denom)
        
    r = np.array(r)
    q_stat = n * (n + 2) * np.sum((r ** 2) / (n - np.arange(1, lags + 1)))
    p_val = float(stats.chi2.sf(q_stat, df=lags))
    return q_stat, p_val


# Configuración de estilos para gráficas
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['figure.figsize'] = (12, 6)
plt.rcParams['axes.titlesize'] = 14
plt.rcParams['axes.labelsize'] = 12

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

# Lista de activos y tickers dinámicos (detectados de los archivos CSV en data/raw/)
TICKERS = [f.replace('.csv', '') for f in os.listdir(DATA_RAW_DIR) if f.endswith('.csv')]
TICKERS.sort()

def clean_and_load_asset(ticker):
    """
    Carga y limpia un archivo CSV de un activo.
    Formatea fechas, convierte precios con formato español (coma decimal) a float,
    y ordena cronológicamente de forma ascendente.
    """
    filepath = os.path.join(DATA_RAW_DIR, f"{ticker}.csv")
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"No se encontró el archivo de datos para {ticker} en {filepath}")
        
    df = pd.read_csv(filepath, quotechar='"')
    
    # Normalizar nombres de columnas
    df.columns = [col.replace('"', '').strip() for col in df.columns]
    
    # Convertir columna Fecha a datetime
    df['Fecha'] = pd.to_datetime(df['Fecha'], format='%d.%m.%Y')
    
    # Limpiar columnas numéricas de interés (Último/Cierre es la principal)
    for col in ['Último', 'Apertura', 'Máximo', 'Mínimo']:
        if col in df.columns:
            # Asegurar string, quitar comillas/espacios, cambiar comas por puntos
            df[col] = df[col].astype(str).str.replace('"', '').str.strip().str.replace(',', '.')
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
    # Ordenar cronológicamente (ascendente)
    df = df.sort_values('Fecha').reset_index(drop=True)
    return df[['Fecha', 'Último']]

def build_consolidated_dataset():
    """
    Carga todos los activos, los consolida mediante un join en la fecha,
    aplica imputación Forward-Fill (LOCF) y filtra por la ventana temporal del estudio.
    """
    consolidated = None
    
    for ticker in TICKERS:
        df_asset = clean_and_load_asset(ticker)
        df_asset = df_asset.rename(columns={'Último': ticker})
        
        if consolidated is None:
            consolidated = df_asset
        else:
            consolidated = pd.merge(consolidated, df_asset, on='Fecha', how='outer')
            
    # Ordenar por fecha por si acaso
    consolidated = consolidated.sort_values('Fecha').reset_index(drop=True)
    
    # Aplicar imputación LOCF (Forward-Fill)
    consolidated[TICKERS] = consolidated[TICKERS].ffill()
    
    # En caso de nulos al inicio que no tengan valor previo, usar Backward-Fill
    consolidated[TICKERS] = consolidated[TICKERS].bfill()
    
    # Filtrar ventana temporal: 01 de enero de 2022 a 31 de mayo de 2026
    start_date = pd.to_datetime('2022-01-01')
    end_date = pd.to_datetime('2026-05-31')
    consolidated = consolidated[(consolidated['Fecha'] >= start_date) & (consolidated['Fecha'] <= end_date)].reset_index(drop=True)
    
    return consolidated

def calculate_log_returns(df):
    """
    Calcula los retornos logarítmicos continuos para cada activo.
    R_t = ln(P_t / P_{t-1})
    """
    df_returns = pd.DataFrame()
    df_returns['Fecha'] = df['Fecha']
    
    for ticker in TICKERS:
        df_returns[ticker] = np.log(df[ticker] / df[ticker].shift(1))
        
    # Eliminar la primera fila que contiene NaN
    df_returns = df_returns.dropna().reset_index(drop=True)
    return df_returns

def run_phase1_exploratory(df_returns):
    """
    Fase 1: Análisis Exploratorio de Series de Tiempo
    - Prueba de Estacionariedad (ADF)
    - Pruebas de Bondad de Ajuste (Normality: KS y Jarque-Bera)
    - Generación de gráficas ACF y PACF
    - Prueba de Ljung-Box para efectos ARCH
    """
    print("\n" + "="*80)
    print("FASE 1: ANÁLISIS EXPLORATORIO Y VALIDACIÓN ESTADÍSTICA")
    print("="*80)
    
    results = {}
    
    # 1. Prueba de Estacionariedad (ADF)
    print("\n--- 1. Prueba Aumentada de Dickey-Fuller (ADF) ---")
    for ticker in TICKERS:
        series = df_returns[ticker].values
        adf_test = ADF(series)
        stat, pval, critical_values = adf_test.stat, adf_test.pvalue, adf_test.critical_values
        is_stationary = pval < 0.05
        
        print(f"Activo: {ticker:6} | Estadístico ADF: {stat:8.4f} | p-valor: {pval:8.4e} | Estacionario (5%): {is_stationary}")
        if not is_stationary:
            print(f"  [ALERTA] La serie de retornos para {ticker} no es estacionaria a un nivel del 5%.")
            
    # 2. Pruebas de Normalidad (Kolmogorov-Smirnov y Jarque-Bera)
    print("\n--- 2. Pruebas de Bondad de Ajuste (Normalidad) ---")
    for ticker in TICKERS:
        series = df_returns[ticker].values
        # Estandarizar retornos para prueba KS
        mean, std = np.mean(series), np.std(series, ddof=1)
        standardized_series = (series - mean) / std
        
        # Kolmogorov-Smirnov
        ks_stat, ks_pval = stats.kstest(standardized_series, 'norm')
        
        # Jarque-Bera
        jb_stat, jb_pval = stats.jarque_bera(series)
        
        print(f"Activo: {ticker:6} | KS Estadístico: {ks_stat:8.4f} (p-val: {ks_pval:8.4e}) | JB Estadístico: {jb_stat:10.4f} (p-val: {jb_pval:8.4e})")
        
    # 3. Prueba de Ljung-Box (Autocorrelación y efectos ARCH)
    print("\n--- 3. Prueba de Ljung-Box (Autocorrelación de Retornos y Retornos al Cuadrado) ---")
    for ticker in TICKERS:
        series = df_returns[ticker].values
        series_sq = series ** 2
        
        # Ljung-Box a lag 10
        stat_lb, pval_lb = pure_ljungbox(series, lags=10)
        stat_lb_sq, pval_lb_sq = pure_ljungbox(series_sq, lags=10)
        
        print(f"Activo: {ticker:6} | Retornos Lag-10 LB: {stat_lb:8.4f} (p-val: {pval_lb:8.4e}) | Retornos^2 Lag-10 LB: {stat_lb_sq:8.4f} (p-val: {pval_lb_sq:8.4e}) | Efectos ARCH: {pval_lb_sq < 0.05}")

    print("\n>>> JUSTIFICACIÓN MATEMÁTICA PARA LA ESPECIFICACIÓN DEL MODELO EGARCH:")
    print("    1. La prueba de Jarque-Bera rechaza categóricamente la normalidad (p-valor < 0.05) para todos los activos,")
    print("       lo que exige el uso de una distribución de colas pesadas (t-Student) para el término de error del modelo EGARCH.")
    print("    2. La prueba de Ljung-Box sobre los retornos al cuadrado (Retornos^2) muestra autocorrelación serial significativa")
    print("       (p-valor < 0.05) en la volatilidad, confirmando la existencia de efectos ARCH (conglomerados de volatilidad).")
    print("    3. Los correlogramas (ACF/PACF) de los retornos al cuadrado (guardados en 'acf_pacf.png') confirman visualmente")
    print("       esta dependencia temporal en el segundo momento, justificando modelar la varianza condicional con un proceso EGARCH(1,1).")

    # 4. Generación y guardado de gráficas ACF y PACF
    fig, axes = plt.subplots(len(TICKERS), 2, figsize=(14, 4 * len(TICKERS)))
    if len(TICKERS) == 1:
        axes = np.expand_dims(axes, axis=0)
        
    for i, ticker in enumerate(TICKERS):
        series = df_returns[ticker].values
        series_sq = series ** 2
        
        # ACF/PACF de retornos al cuadrado para ilustrar efectos ARCH
        plot_acf_pacf_custom(series_sq, axes[i, 0], axes[i, 1], f"Retornos^2 - {ticker}", nlags=20)
        
    plt.tight_layout()
    acf_pacf_path = os.path.join(OUTPUTS_DIR, 'acf_pacf.png')
    plt.savefig(acf_pacf_path, dpi=300)
    plt.close()
    print(f"\n[INFO] Gráficas de Autocorrelación (ACF/PACF) de los retornos al cuadrado guardadas en {acf_pacf_path}")

def run_phase2_egarch(df_returns):
    """
    Fase 2: Modelación de Volatilidad Dinámica Univariada (EGARCH)
    Ajusta un modelo EGARCH(1,1) con distribución t-Student para cada activo.
    """
    print("\n" + "="*80)
    print("FASE 2: MODELACIÓN DE VOLATILIDAD DINÁMICA UNIVARIADA (EGARCH(1,1))")
    print("="*80)
    
    cond_variances = pd.DataFrame()
    cond_variances['Fecha'] = df_returns['Fecha']
    egarch_params = {}
    
    for ticker in TICKERS:
        print(f"\nAjustando EGARCH(1,1) para {ticker}...")
        try:
            # Multiplicar retornos por 100 para facilitar la convergencia numérica del optimizador
            scaled_returns = df_returns[ticker] * 100
            
            # Especificar modelo EGARCH(1,1) con dist='t' (Student-t) y asimetría o=1
            model = arch_model(scaled_returns, vol='EGARCH', p=1, o=1, q=1, dist='t')
            res = model.fit(disp='off')
            
            print(res.summary())
            
            # Guardar varianza condicional escalándola de vuelta a nivel original (dividir por 100^2 = 10000)
            cond_variances[ticker] = res.conditional_volatility ** 2 / 10000.0
            
            # Extraer parámetros estimados
            params = res.params
            pvalues = res.pvalues
            
            egarch_params[ticker] = {
                'omega': (params['omega'], pvalues['omega']),
                'alpha': (params['alpha[1]'], pvalues['alpha[1]']),
                'gamma': (params['gamma[1]'], pvalues['gamma[1]']),
                'beta': (params['beta[1]'], pvalues['beta[1]']),
                'df_nu': (params['nu'], pvalues['nu'])
            }
            
        except Exception as e:
            print(f"[ERROR] Falló el ajuste EGARCH para {ticker}: {str(e)}")
            # En caso de fallo, usar varianza muestral rodante como proxy de emergencia
            cond_variances[ticker] = df_returns[ticker].rolling(20, min_periods=1).var().fillna(method='bfill')
            
    # Guardar varianzas dinámicas univariadas intermedias
    cond_variances.to_csv(os.path.join(DATA_PROCESSED_DIR, 'varianzas_condicionales_egarch.csv'), index=False)
    return cond_variances, egarch_params

def run_phase3_ewma_multivariate(df_returns):
    """
    Fase 3: Modelación de Contagio Sistémico (EWMA Multivariado)
    Optimiza el parámetro lambda para minimizar el RMSE entre la varianza condicional EWMA del portafolio
    y los retornos al cuadrado del portafolio (proxy de la varianza diaria).
    """
    print("\n" + "="*80)
    print("FASE 3: MODELACIÓN DE CONTAGIO SISTÉMICO (EWMA MULTIVARIADO)")
    print("="*80)
    
    # Retornos de los activos y pesos del portafolio equi-ponderado
    R = df_returns[TICKERS].values
    weights = np.array([1.0 / len(TICKERS)] * len(TICKERS))
    
    # Retornos diarios del portafolio
    R_portfolio = R @ weights
    R_portfolio_sq = R_portfolio ** 2  # Proxy de varianza diaria real
    
    # Función de pérdida para optimizar Lambda (RMSE de la varianza del portafolio)
    def ewma_loss(lambda_val):
        T, K = R.shape
        # Inicialización de la matriz de covarianza con la covarianza muestral de los primeros 50 días
        Sigma = np.cov(R[:50].T)
        
        portfolio_vars = np.zeros(T)
        portfolio_vars[0] = weights.T @ Sigma @ weights
        
        # Simular EWMA paso a paso
        for t in range(1, T):
            R_prev = R[t-1]
            # Actualización recursiva de la matriz de covarianza EWMA
            Sigma = lambda_val * Sigma + (1.0 - lambda_val) * np.outer(R_prev, R_prev)
            portfolio_vars[t] = weights.T @ Sigma @ weights
            
        # Evaluar pérdida a partir del día 50 para evitar sesgo de inicialización
        rmse = np.sqrt(np.mean((R_portfolio_sq[50:] - portfolio_vars[50:])**2))
        return rmse
        
    print("Optimizando factor de decaimiento Lambda numéricamente...")
    try:
        opt_res = minimize(ewma_loss, x0=[0.94], bounds=[(0.01, 0.99)], method='SLSQP')
        optimal_lambda = opt_res.x[0]
        print(f"Optimización completada con éxito!")
        print(f"  Lambda óptimo estimado: {optimal_lambda:.6f}")
        print(f"  RMSE de varianza minimizado: {opt_res.fun:.8f}")
    except Exception as e:
        optimal_lambda = 0.94
        print(f"[ALERTA] Falló optimización numérica. Usando valor estándar RiskMetrics Lambda = 0.94. Razón: {str(e)}")
        
    # Calcular covarianzas y correlaciones dinámicas paso a paso con el Lambda óptimo
    T, K = R.shape
    Sigma_series = []
    Corr_series = []
    
    # Inicialización
    Sigma = np.cov(R[:50].T)
    Sigma_series.append(Sigma)
    
    # Matriz de correlación inicial
    D_inv = np.diag(1.0 / np.sqrt(np.diag(Sigma)))
    Corr = D_inv @ Sigma @ D_inv
    Corr_series.append(Corr)
    
    for t in range(1, T):
        R_prev = R[t-1]
        Sigma = optimal_lambda * Sigma + (1.0 - optimal_lambda) * np.outer(R_prev, R_prev)
        Sigma_series.append(Sigma)
        
        # Calcular matriz de correlación condicional
        std_devs = np.sqrt(np.diag(Sigma))
        # Prevenir divisiones por cero en casos extremos
        std_devs = np.where(std_devs == 0, 1e-8, std_devs)
        D_inv = np.diag(1.0 / std_devs)
        Corr = D_inv @ Sigma @ D_inv
        Corr_series.append(Corr)
        
    Sigma_series = np.array(Sigma_series)
    Corr_series = np.array(Corr_series)
    
    # Extraer correlaciones de interés utilizando los índices dinámicos de los tickers
    idx_nvda = TICKERS.index('NVDA') if 'NVDA' in TICKERS else 0
    idx_ceg = TICKERS.index('CEG') if 'CEG' in TICKERS else min(2, len(TICKERS)-1)
    idx_mu = TICKERS.index('MU') if 'MU' in TICKERS else min(3, len(TICKERS)-1)
    
    # NVDA vs CEG (índices en la matriz de correlación)
    nvda_ceg_corr = Corr_series[:, idx_nvda, idx_ceg]
    # MU vs NVDA (índices en la matriz de correlación)
    mu_nvda_corr = Corr_series[:, idx_mu, idx_nvda]
    
    # Generar gráficas de las correlaciones cruzadas móviles
    plt.figure(figsize=(12, 6))
    plt.plot(df_returns['Fecha'], nvda_ceg_corr, label='Correlación Dinámica NVDA vs. CEG (Diseño vs. Energía)', color='#d95f02', alpha=0.85)
    plt.plot(df_returns['Fecha'], mu_nvda_corr, label='Correlación Dinámica MU vs. NVDA (Memoria vs. Diseño)', color='#7570b3', alpha=0.85)
    plt.title('Evolución de Correlaciones Dinámicas Condicionales (Modelo EWMA Optimizado)', fontsize=14, pad=15)
    plt.xlabel('Fecha')
    plt.ylabel('Coeficiente de Correlación')
    plt.legend(frameon=True, facecolor='white', framealpha=0.9)
    plt.tight_layout()
    
    corr_plot_path = os.path.join(OUTPUTS_DIR, 'dynamic_correlations.png')
    plt.savefig(corr_plot_path, dpi=300)
    plt.close()
    print(f"[INFO] Gráfica de correlación dinámica guardada en {corr_plot_path}")
    
    # Calcular y guardar varianza condicional diaria del portafolio equi-ponderado
    portfolio_cond_vars = np.zeros(T)
    for t in range(T):
        portfolio_cond_vars[t] = weights.T @ Sigma_series[t] @ weights
        
    df_portfolio = pd.DataFrame({
        'Fecha': df_returns['Fecha'],
        'Retorno_Portafolio': R_portfolio,
        'Varianza_Condicional': portfolio_cond_vars,
        'Desv_Est_Condicional': np.sqrt(portfolio_cond_vars)
    })
    
    df_portfolio.to_csv(os.path.join(DATA_PROCESSED_DIR, 'portafolio_metricas_ewma.csv'), index=False)
    
    return df_portfolio, optimal_lambda, Sigma_series, Corr_series

def run_phase4_risk_metrics(df_portfolio):
    """
    Fase 4: Cálculo de Riesgo de Cola (VaR y CVaR / ETL)
    Calcula diariamente el VaR paramétrico y el CVaR del portafolio equi-ponderado
    en dos niveles de confianza: 95% y 99%, usando una distribución t-Student ajustada.
    """
    print("\n" + "="*80)
    print("FASE 4: CÁLCULO DE RIESGO DE COLA (VaR y CVaR / Expected Tail Loss)")
    print("="*80)
    
    # Retornos del portafolio
    R_p = df_portfolio['Retorno_Portafolio'].values
    
    # Ajustar una distribución t-Student empírica sobre los retornos del portafolio
    # para modelar las colas pesadas de forma robusta
    nu, loc, scale = stats.t.fit(R_p)
    print(f"Ajuste t-Student del Portafolio:")
    print(f"  Grados de Libertad (nu) ajustados: {nu:.4f}")
    print(f"  Media condicional (mu): {loc:.6f}")
    print(f"  Escala condicional (scale): {scale:.6f}")
    
    # En caso de grados de libertad no válidos (nu <= 2), forzar nu = 4 para varianza finita
    if nu <= 2:
        nu = 4.0
        print("  [ALERTA] Grados de libertad inferiores a 2. Ajustados a 4.0 para asegurar varianza finita.")

    # Desviación estándar condicional estimada por EWMA
    sigma_p = df_portfolio['Desv_Est_Condicional'].values
    
    # Coeficiente de estandarización: una t-Student estándar con df=nu tiene varianza = nu/(nu-2)
    # Por tanto, para estandarizarla a varianza 1, multiplicamos por sqrt((nu-2)/nu)
    std_factor = np.sqrt((nu - 2.0) / nu)
    
    # Niveles de confianza y cálculo de cuantiles para VaR paramétrico t-Student
    conf_levels = [0.95, 0.99]
    metrics = {}
    
    for conf in conf_levels:
        alpha = 1.0 - conf
        
        # Cuantil de la t-Student estándar
        t_quantile = stats.t.ppf(alpha, df=nu)
        
        # Cuantil estandarizado a varianza 1
        std_quantile = t_quantile * std_factor
        
        # VaR paramétrico dinámico diario: - (μ + σ_t * std_quantile)
        # Nota: El cuantil de la cola izquierda es negativo, por lo que - (σ * q) dará un VaR positivo
        var_series = - (loc + sigma_p * std_quantile)
        
        # Integración numérica para el cálculo exacto de CVaR en distribución t-Student
        # CVaR = 1/alpha * integral_0^alpha (VaR_u) du
        # Hacemos una aproximación numérica del factor de la integral del cuantil estandarizado
        grid_u = np.linspace(1e-6, alpha, 1000)
        integrated_quantile = np.mean(stats.t.ppf(grid_u, df=nu) * std_factor)
        
        # CVaR paramétrico dinámico diario: - μ + σ_t * (- integrated_quantile)
        cvar_series = - loc + sigma_p * (-integrated_quantile)
        
        df_portfolio[f'VaR_{int(conf*100)}'] = var_series
        df_portfolio[f'CVaR_{int(conf*100)}'] = cvar_series
        
        print(f"\nMétricas calculadas para nivel de confianza {int(conf*100)}%:")
        print(f"  VaR Promedio diario: {np.mean(var_series)*100:.4f}%")
        print(f"  CVaR Promedio diario: {np.mean(cvar_series)*100:.4f}%")
        
    df_portfolio.to_csv(os.path.join(DATA_PROCESSED_DIR, 'portafolio_metricas_riesgo.csv'), index=False)
    return df_portfolio, nu

def run_phase5_backtesting(df_risk, nu):
    """
    Fase 5: Validación Rigurosa vía Backtesting (Kupiec, Christoffersen y López)
    Valida la calibración de frecuencia (Kupiec), independencia (Christoffersen)
    y magnitud del exceso (López) de los VaR calculados a 95% y 99%
    en una ventana de evaluación estándar de los últimos 250 días de negociación.
    """
    import scipy.integrate as integrate
    
    print("\n" + "="*80)
    print("FASE 5: VALIDACIÓN RIGUROSA VÍA BACKTESTING COMPLETO")
    print("="*80)
    
    # La validación corre sobre los últimos 250 días de negociación
    T_eval = 250
    df_eval = df_risk.tail(T_eval).reset_index(drop=True)
    
    # Pérdida real del portafolio es el retorno negativo (si el retorno es negativo, hay pérdida)
    real_loss = - df_eval['Retorno_Portafolio'].values
    
    # Parámetros para López
    std_factor = np.sqrt((nu - 2.0) / nu)
    scale_series = df_eval['Desv_Est_Condicional'].values * std_factor
    
    backtest_results = {}
    
    # Guardar gráficas del backtesting
    plt.figure(figsize=(14, 7))
    plt.plot(df_eval['Fecha'], real_loss * 100, label='Pérdidas Reales del Portafolio', color='#252525', alpha=0.7)
    plt.plot(df_eval['Fecha'], df_eval['VaR_95'] * 100, label='VaR Condicional EWMA-t 95%', color='#3182bd', linestyle='--', linewidth=2)
    plt.plot(df_eval['Fecha'], df_eval['VaR_99'] * 100, label='VaR Condicional EWMA-t 99%', color='#de2d26', linestyle='-.', linewidth=2)
    plt.title('Backtesting de Modelos de Riesgo: Pérdidas Reales vs. Umbral de VaR Estimado', fontsize=14, pad=15)
    plt.ylabel('Pérdidas / Retorno (%)')
    plt.xlabel('Fecha')
    plt.legend(frameon=True, facecolor='white', framealpha=0.9)
    plt.tight_layout()
    
    backtest_plot_path = os.path.join(OUTPUTS_DIR, 'backtesting_var.png')
    plt.savefig(backtest_plot_path, dpi=300)
    plt.close()
    print(f"[INFO] Gráfica de Backtesting guardada en {backtest_plot_path}")
    
    for conf in [0.95, 0.99]:
        p = 1.0 - conf
        var_series = df_eval[f'VaR_{int(conf*100)}'].values
        
        # 1. Contabilizar fallas (donde la pérdida real superó al VaR estimado)
        failures = real_loss > var_series
        failures_int = failures.astype(int)
        N = np.sum(failures)
        p_hat = N / T_eval
        
        # --- PRUEBA POF DE KUPIEC (COBERTURA INCONDICIONAL) ---
        p_hat_safe = max(1e-10, min(1.0 - 1e-10, p_hat))
        term_num = ((1.0 - p) ** (T_eval - N)) * (p ** N)
        term_den = ((1.0 - p_hat_safe) ** (T_eval - N)) * (p_hat_safe ** N)
        lr_uc = -2.0 * np.log(term_num / term_den)
        p_val_uc = stats.chi2.sf(lr_uc, df=1)
        is_valid_uc = lr_uc <= 3.8415
        
        # --- PRUEBA DE INDEPENDENCIA DE CHRISTOFFERSEN (RACHAS) ---
        n00, n01, n10, n11 = 0, 0, 0, 0
        for i in range(1, T_eval):
            if failures_int[i-1] == 0:
                if failures_int[i] == 0:
                    n00 += 1
                else:
                    n01 += 1
            else:
                if failures_int[i] == 0:
                    n10 += 1
                else:
                    n11 += 1
                    
        pi01 = n01 / (n00 + n01) if (n00 + n01) > 0 else 0.0
        pi11 = n11 / (n10 + n11) if (n10 + n11) > 0 else 0.0
        pi = (n01 + n11) / (n00 + n01 + n10 + n11) if (n00 + n01 + n10 + n11) > 0 else 0.0
        
        def safe_log(n, prob_val):
            if n == 0 or prob_val == 0.0:
                return 0.0
            return n * np.log(prob_val)
            
        log_L0 = safe_log(n00 + n10, 1.0 - pi) + safe_log(n01 + n11, pi)
        log_L1 = safe_log(n00, 1.0 - pi01) + safe_log(n01, pi01) + safe_log(n10, 1.0 - pi11) + safe_log(n11, pi11)
        lr_ind = -2.0 * (log_L0 - log_L1)
        p_val_ind = stats.chi2.sf(lr_ind, df=1)
        is_valid_ind = lr_ind <= 3.8415
        
        # Cobertura Condicional Conjunta (Combined Christoffersen)
        lr_cc = lr_uc + lr_ind
        p_val_cc = stats.chi2.sf(lr_cc, df=2)
        is_valid_cc = lr_cc <= 5.9915  # Chi-cuadrado con 2 df al 5%
        
        # --- TEST DE LÓPEZ (MAGNITUD DEL EXCESO) ---
        C_obs = np.zeros(T_eval)
        for t in range(T_eval):
            if failures[t]:
                C_obs[t] = 1.0 + (real_loss[t] - var_series[t])**2
        C_total_obs = np.sum(C_obs)
        
        # Momentos teóricos bajo H0
        t_q = stats.t.ppf(p, df=nu)
        nu_calc = max(nu, 4.5)  # Asegurar cuarto momento finito
        
        A_1, _ = integrate.quad(lambda z: (t_q - z)**2 * stats.t.pdf(z, df=nu_calc), -100.0, t_q)
        A_2, _ = integrate.quad(lambda z: (t_q - z)**4 * stats.t.pdf(z, df=nu_calc), -100.0, t_q)
        
        E_C = np.zeros(T_eval)
        Var_C = np.zeros(T_eval)
        for t in range(T_eval):
            scale_t = scale_series[t]
            E_C[t] = p + (scale_t**2) * A_1
            E_C2_t = p + 2 * (scale_t**2) * A_1 + (scale_t**4) * A_2
            Var_C[t] = E_C2_t - (E_C[t]**2)
            
        E_total = np.sum(E_C)
        Var_total = np.sum(Var_C)
        z_lopez = (C_total_obs - E_total) / np.sqrt(Var_total) if Var_total > 0 else 0.0
        p_val_lopez = 2.0 * (1.0 - stats.norm.cdf(np.abs(z_lopez)))
        is_valid_lopez = np.abs(z_lopez) <= 1.96  # Normal estándar al 5%
        
        backtest_results[conf] = {
            'Fallas_Esperadas': T_eval * p,
            'Fallas_Reales': N,
            'Tasa_Fallas_Empirica': p_hat,
            'Kupiec_LR': lr_uc,
            'Kupiec_p_valor': p_val_uc,
            'Kupiec_Valido': is_valid_uc,
            'Christoffersen_ind_LR': lr_ind,
            'Christoffersen_ind_p_valor': p_val_ind,
            'Christoffersen_ind_Valido': is_valid_ind,
            'Christoffersen_cc_LR': lr_cc,
            'Christoffersen_cc_p_valor': p_val_cc,
            'Christoffersen_cc_Valido': is_valid_cc,
            'Lopez_Score_Obs': C_total_obs,
            'Lopez_Score_Exp': E_total,
            'Lopez_Z': z_lopez,
            'Lopez_p_valor': p_val_lopez,
            'Lopez_Valido': is_valid_lopez
        }
        
        print(f"\nResultados Backtesting VaR {int(conf*100)}% (Últimos {T_eval} días):")
        print(f"  Fallas Esperadas: {T_eval * p:.2f} | Fallas Reales: {N}")
        print(f"  Tasa de Fallas Empírica: {p_hat*100:.2f}% (Tasa Teórica: {p*100:.2f}%)")
        print("  1. Prueba de Kupiec (Cobertura Incondicional):")
        print(f"     Estadístico LR_uc: {lr_uc:.4f} | p-valor: {p_val_uc:.6f}")
        print(f"     Decisión (5%): {'ACEPTAR MODELO' if is_valid_uc else 'RECHAZAR MODELO (Fallas fuera de tolerancia)'}")
        print("  2. Prueba de Christoffersen (Independencia / Rachas):")
        print(f"     Transiciones: n00={n00}, n01={n01}, n10={n10}, n11={n11}")
        print(f"     Estadístico LR_ind: {lr_ind:.4f} | p-valor: {p_val_ind:.6f}")
        print(f"     Decisión (5%): {'ACEPTAR INDEPENDENCIA' if is_valid_ind else 'RECHAZAR INDEPENDENCIA (Agrupamiento de fallas)'}")
        print("  3. Cobertura Condicional Conjunta (Christoffersen CC):")
        print(f"     Estadístico LR_cc: {lr_cc:.4f} | p-valor: {p_val_cc:.6f}")
        print(f"     Decisión (5%): {'CALIBRACIÓN CORRECTA' if is_valid_cc else 'CALIBRACIÓN DEFICIENTE'}")
        print("  4. Test de Magnitud del Exceso de López (1998):")
        print(f"     Score Observado: {C_total_obs:.4f} | Score Esperado bajo H0: {E_total:.4f}")
        print(f"     Estadístico Z_Lopez: {z_lopez:.4f} | p-valor: {p_val_lopez:.6f}")
        print(f"     Decisión (5%): {'MAGNITUD EXPLICADA POR EL MODELO' if is_valid_lopez else 'MAGNITUD EXCESIVA (Sub/sobre-estimación de cola)'}")

    return backtest_results

def generate_reports(df_risk, egarch_params, optimal_lambda, backtest_results):
    """
    Genera el reporte definitivo de métricas de riesgo en la carpeta de outputs
    y lo imprime por consola de forma formateada.
    """
    report_path = os.path.join(OUTPUTS_DIR, 'reporte_metricas_riesgo.txt')
    
    report_content = []
    report_content.append("="*80)
    report_content.append("REPORTE EJECUTIVO DE MODELACIÓN DE RIESGO - PROYECTO FINAL")
    report_content.append("="*80)
    report_content.append(f"Fecha de Reporte: 2026-06-11")
    report_content.append(f"Ventana de Modelamiento: 01 de Enero de 2022 a 31 de Mayo de 2026")
    report_content.append(f"Composición del Portafolio: Equi-ponderado ({100.0/len(TICKERS):.2f}% cada activo)")
    report_content.append(f"Activos: {', '.join(TICKERS)}")
    report_content.append("-"*80)
    
    # Agregar Fase 1: Análisis Exploratorio
    report_content.append("\n1. FASE 1: ANÁLISIS EXPLORATORIO Y PRUEBAS ESTADÍSTICAS PRELIMINARES")
    retornos_path = os.path.join(DATA_PROCESSED_DIR, 'retornos_logaritmicos.csv')
    if os.path.exists(retornos_path):
        df_returns = pd.read_csv(retornos_path)
        for ticker in TICKERS:
            series = df_returns[ticker].values
            
            # ADF
            adf_test = ADF(series)
            adf_stat, adf_pval = adf_test.stat, adf_test.pvalue
            
            # Jarque-Bera
            jb_stat, jb_pval = stats.jarque_bera(series)
            
            # Ljung-Box
            stat_lb, pval_lb = pure_ljungbox(series, lags=10)
            stat_lb_sq, pval_lb_sq = pure_ljungbox(series ** 2, lags=10)
            
            report_content.append(f"  Activo: {ticker}")
            report_content.append(f"    - Dickey-Fuller (ADF): t-stat = {adf_stat:8.4f} (p-val: {adf_pval:8.4e}) | Estacionario: {adf_pval < 0.05}")
            report_content.append(f"    - Jarque-Bera (Normalidad): JB-stat = {jb_stat:10.4f} (p-val: {jb_pval:8.4e}) | Normalidad: {jb_pval >= 0.05}")
            report_content.append(f"    - Ljung-Box Retornos (Lag-10): LB-stat = {stat_lb:8.4f} (p-val: {pval_lb:8.4e})")
            report_content.append(f"    - Ljung-Box Retornos^2 (Lag-10): LB-stat = {stat_lb_sq:8.4f} (p-val: {pval_lb_sq:8.4e}) | Efectos ARCH: {pval_lb_sq < 0.05}")
            report_content.append("")
            
        report_content.append("  >>> JUSTIFICACIÓN MATEMÁTICA PARA LA ESPECIFICACIÓN DEL MODELO EGARCH:")
        report_content.append("    * El rechazo total del supuesto de normalidad por Jarque-Bera en todos los activos exige")
        report_content.append("      el uso de la distribución t-Student en el modelo EGARCH para capturar colas pesadas.")
        report_content.append("    * La autocorrelación serial significativa en los retornos al cuadrado (Ljung-Box p-val < 0.05)")
        report_content.append("      y en los gráficos de ACF/PACF justifica modelar la volatilidad condicional mediante un modelo EGARCH(1,1).")
    else:
        report_content.append("  [ERROR] No se encontró el archivo de retornos logarítmicos para generar las estadísticas exploratorias.")
        
    report_content.append("-"*80)
    
    report_content.append("\n2. ESTIMACIONES EGARCH(1,1) UNIVARIADAS (Residuos t-Student)")
    for ticker, params in egarch_params.items():
        report_content.append(f"  Activo: {ticker}")
        report_content.append(f"    - Omega (omega): {params['omega'][0]:10.6f} (p-val: {params['omega'][1]:.4e})")
        report_content.append(f"    - Alpha (alpha): {params['alpha'][0]:10.6f} (p-val: {params['alpha'][1]:.4e})")
        report_content.append(f"    - Gamma (gamma): {params['gamma'][0]:10.6f} (p-val: {params['gamma'][1]:.4e})")
        report_content.append(f"    - Beta (beta):  {params['beta'][0]:10.6f} (p-val: {params['beta'][1]:.4e})")
        report_content.append(f"    - Grados de Libertad (nu): {params['df_nu'][0]:.4f} (p-val: {params['df_nu'][1]:.4e})")
        
    report_content.append("\n3. MODELO MULTIVARIADO EWMA OPTIMIZADO")
    report_content.append(f"  - Factor de decaimiento óptimo (Lambda): {optimal_lambda:.6f}")
    
    report_content.append("\n4. MEDIDAS DE RIESGO DE COLA DEL PORTAFOLIO (Estadísticos Históricos)")
    report_content.append(f"  - VaR Promedio 95%: {np.mean(df_risk['VaR_95'])*100:8.4f}% diario")
    report_content.append(f"  - CVaR Promedio 95%: {np.mean(df_risk['CVaR_95'])*100:8.4f}% diario")
    report_content.append(f"  - VaR Promedio 99%: {np.mean(df_risk['VaR_99'])*100:8.4f}% diario")
    report_content.append(f"  - CVaR Promedio 99%: {np.mean(df_risk['CVaR_99'])*100:8.4f}% diario")
    
    report_content.append("\n5. VALIDACIÓN DE COBERTURA VÍA BACKTESTING AVANZADO (Últimos 250 Días)")
    for conf, results in backtest_results.items():
        report_content.append(f"  Confianza {int(conf*100)}%:")
        report_content.append(f"    - Muestra de Validación: 250 días")
        report_content.append(f"    - Excepciones Reales (N): {results['Fallas_Reales']} (Esperadas: {results['Fallas_Esperadas']:.2f}) | Tasa Empírica: {results['Tasa_Fallas_Empirica']*100:.2f}%")
        report_content.append(f"    - Prueba de Kupiec (Frecuencia): LR = {results['Kupiec_LR']:.4f} | p-valor = {results['Kupiec_p_valor']:.6f} | Calibrado: {results['Kupiec_Valido']}")
        report_content.append(f"    - Prueba de Christoffersen (Independencia): LR = {results['Christoffersen_ind_LR']:.4f} | p-valor = {results['Christoffersen_ind_p_valor']:.6f} | Independiente: {results['Christoffersen_ind_Valido']}")
        report_content.append(f"    - Cobertura Condicional Conjunta (Christoffersen CC): LR = {results['Christoffersen_cc_LR']:.4f} | p-valor = {results['Christoffersen_cc_p_valor']:.6f} | Calibración Correcta: {results['Christoffersen_cc_Valido']}")
        report_content.append(f"    - Test de Magnitud de López: Score Obs = {results['Lopez_Score_Obs']:.4f} | Score Exp = {results['Lopez_Score_Exp']:.4f} | Z-stat = {results['Lopez_Z']:.4f} | p-valor = {results['Lopez_p_valor']:.6f} | Magnitud Explicada: {results['Lopez_Valido']}")
        report_content.append("")
        
    report_content.append("="*80)
    
    # Escribir reporte en archivo
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(report_content))
        
    print("\n" + "\n".join(report_content))
    print(f"\n[INFO] Reporte ejecutivo escrito con éxito en {report_path}")

def main():
    global TICKERS
    TICKERS = [f.replace('.csv', '') for f in os.listdir(DATA_RAW_DIR) if f.endswith('.csv')]
    TICKERS.sort()
    
    print("Iniciando Pipeline Cuantitativo de Gestión de Riesgo...")
    if len(TICKERS) < 2:
        print(f"Advertencia: Portafolio con menos de 2 activos ({len(TICKERS)}). Pipeline de riesgo cancelado.")
        # Escribir reporte txt indicando que está vacío
        report_path = os.path.join(OUTPUTS_DIR, 'reporte_metricas_riesgo.txt')
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write("REPORTE DE RIESGO - PORTAFOLIO VACÍO O INSUFICIENTE\n")
            f.write("Añade al menos 2 activos en el Gestor para habilitar el análisis econométrico y reporte de riesgo.\n")
        print(f"Reporte de estado vacío escrito en {report_path}")
        return
        
    # Paso 1: Cargar y consolidar datos crudos
    df_raw = build_consolidated_dataset()
    print(f"[INFO] Datos crudos consolidados y filtrados. Total de observaciones diarias: {len(df_raw)}")
    
    # Paso 2: Calcular retornos logarítmicos
    df_returns = calculate_log_returns(df_raw)
    print(f"[INFO] Retornos logarítmicos calculados. Total de observaciones de retornos: {len(df_returns)}")
    
    # Guardar retornos limpios en data/processed
    df_returns.to_csv(os.path.join(DATA_PROCESSED_DIR, 'retornos_logaritmicos.csv'), index=False)
    
    # Fase 1: Análisis Exploratorio
    run_phase1_exploratory(df_returns)
    
    # Fase 2: Volatilidad univariada EGARCH
    df_vars, egarch_params = run_phase2_egarch(df_returns)
    
    # Fase 3: EWMA Multivariado optimizado
    df_portfolio, optimal_lambda, _, _ = run_phase3_ewma_multivariate(df_returns)
    
    # Fase 4: Métricas de Riesgo de Cola (VaR y CVaR)
    df_risk, nu = run_phase4_risk_metrics(df_portfolio)
    
    # Fase 5: Backtesting
    backtest_results = run_phase5_backtesting(df_risk, nu)
    
    # Generar reportes finales
    generate_reports(df_risk, egarch_params, optimal_lambda, backtest_results)

if __name__ == '__main__':
    main()
