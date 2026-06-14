import os
import json
import numpy as np
import pandas as pd
import scipy.stats as stats
import scipy.integrate as integrate
from scipy.optimize import minimize
from arch import arch_model

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

# Activos
TICKERS = [f.replace('.csv', '') for f in os.listdir(DATA_RAW_DIR) if f.endswith('.csv')]
TICKERS.sort()


def clean_and_load_asset(ticker):
    filepath = os.path.join(DATA_RAW_DIR, f"{ticker}.csv")
    df = pd.read_csv(filepath, quotechar='"')
    df.columns = [col.replace('"', '').strip() for col in df.columns]
    df['Fecha'] = pd.to_datetime(df['Fecha'], format='%d.%m.%Y')
    for col in ['Último', 'Apertura', 'Máximo', 'Mínimo']:
        if col in df.columns:
            df[col] = df[col].astype(str).str.replace('"', '').str.strip().str.replace(',', '.')
            df[col] = pd.to_numeric(df[col], errors='coerce')
    df = df.sort_values('Fecha').reset_index(drop=True)
    return df[['Fecha', 'Último']]

def main():
    global TICKERS
    TICKERS = [f.replace('.csv', '') for f in os.listdir(DATA_RAW_DIR) if f.endswith('.csv')]
    TICKERS.sort()
    print("Iniciando exportación de datos para el Dashboard Interactivo...")
    
    if len(TICKERS) < 2:
        print(f"Advertencia: Portafolio con menos de 2 activos ({len(TICKERS)}). Generando JSON de estado vacío.")
        dashboard_payload = {
            'status': 'empty',
            'message': 'Añade al menos 2 activos en el Gestor para habilitar el análisis de correlación y riesgo',
            'tickers': TICKERS,
            'dates': [],
            'assets': {},
            'portfolio': {
                'returns_pct': [],
                'vols_cond_pct': [],
                'var_95_pct': [],
                'cvar_95_pct': [],
                'var_99_pct': [],
                'cvar_99_pct': [],
                'nu': 4.0,
                'mean_mu_pct': 0.0,
                'scale_pct': 0.0,
                'projection': {
                    'dates': [],
                    'medium': [],
                    'high': [],
                    'low': []
                }
            },
            'ewma_optimal_lambda': 0.94,
            'backtesting': {
                't_eval': 250,
                'results': {},
                'exceptions': []
            }
        }
        output_path = os.path.join(DATA_PROCESSED_DIR, 'dashboard_data.json')
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(dashboard_payload, f, indent=2)
        print(f"Exportación de estado vacío exitosa. JSON guardado en: {output_path}")
        return
    
    # 1. Cargar y consolidar datos crudos
    consolidated = None
    for ticker in TICKERS:
        df_asset = clean_and_load_asset(ticker)
        df_asset = df_asset.rename(columns={'Último': ticker})
        if consolidated is None:
            consolidated = df_asset
        else:
            consolidated = pd.merge(consolidated, df_asset, on='Fecha', how='outer')
            
    consolidated = consolidated.sort_values('Fecha').reset_index(drop=True)
    consolidated[TICKERS] = consolidated[TICKERS].ffill().bfill()
    
    # Filtrar ventana temporal
    start_date = pd.to_datetime('2022-01-01')
    end_date = pd.to_datetime('2026-05-31')
    consolidated = consolidated[(consolidated['Fecha'] >= start_date) & (consolidated['Fecha'] <= end_date)].reset_index(drop=True)
    
    dates_str = consolidated['Fecha'].dt.strftime('%Y-%m-%d').tolist()
    
    # 2. Calcular retornos logarítmicos
    df_returns = pd.DataFrame()
    df_returns['Fecha'] = consolidated['Fecha']
    for ticker in TICKERS:
        df_returns[ticker] = np.log(consolidated[ticker] / consolidated[ticker].shift(1))
    
    # Rellenar primera fila con 0 para mantener coincidencia de índices temporales con precios
    df_returns = df_returns.fillna(0.0)
    
    # 3. Modelación EGARCH(1,1)-t univariada y almacenamiento de parámetros
    egarch_params = {}
    for ticker in TICKERS:
        print(f"  Estimando EGARCH(1,1)-t para {ticker}...")
        scaled_returns = df_returns[ticker] * 100
        model = arch_model(scaled_returns, vol='EGARCH', p=1, o=1, q=1, dist='t')
        res = model.fit(disp='off')
        last_vol_scaled = float(res.conditional_volatility.values[-1])
        mu_r = float(df_returns[ticker].mean())
        
        egarch_params[ticker] = {
            'omega': res.params['omega'],
            'omega_p': res.pvalues['omega'],
            'alpha': res.params['alpha[1]'],
            'alpha_p': res.pvalues['alpha[1]'],
            'gamma': res.params['gamma[1]'],
            'gamma_p': res.pvalues['gamma[1]'],
            'beta': res.params['beta[1]'],
            'beta_p': res.pvalues['beta[1]'],
            'nu': res.params['nu'],
            'nu_p': res.pvalues['nu'],
            'last_vol_scaled': last_vol_scaled,
            'mu_r': mu_r
        }
        
    # 4. Modelación EWMA Multivariada Optimización
    R = df_returns[TICKERS].values
    weights = np.array([1.0 / len(TICKERS)] * len(TICKERS))
    R_portfolio = R @ weights
    R_portfolio_sq = R_portfolio ** 2
    
    def ewma_loss(lambda_val):
        T, K = R.shape
        Sigma = np.cov(R[:50].T)
        portfolio_vars = np.zeros(T)
        portfolio_vars[0] = weights.T @ Sigma @ weights
        for t in range(1, T):
            R_prev = R[t-1]
            Sigma = lambda_val * Sigma + (1.0 - lambda_val) * np.outer(R_prev, R_prev)
            portfolio_vars[t] = weights.T @ Sigma @ weights
        return np.sqrt(np.mean((R_portfolio_sq[50:] - portfolio_vars[50:])**2))
        
    print("  Optimizando parámetro EWMA Lambda...")
    opt_res = minimize(ewma_loss, x0=[0.94], bounds=[(0.01, 0.99)], method='SLSQP')
    optimal_lambda = opt_res.x[0]
    
    # Calcular covarianzas y correlaciones dinámicas con Lambda óptimo
    T, K = R.shape
    Sigma_series = []
    Corr_series = []
    Sigma = np.cov(R[:50].T)
    Sigma_series.append(Sigma)
    
    D_inv = np.diag(1.0 / np.sqrt(np.diag(Sigma)))
    Corr_series.append(D_inv @ Sigma @ D_inv)
    
    for t in range(1, T):
        R_prev = R[t-1]
        Sigma = optimal_lambda * Sigma + (1.0 - optimal_lambda) * np.outer(R_prev, R_prev)
        Sigma_series.append(Sigma)
        std_devs = np.sqrt(np.diag(Sigma))
        std_devs = np.where(std_devs == 0, 1e-8, std_devs)
        D_inv = np.diag(1.0 / std_devs)
        Corr_series.append(D_inv @ Sigma @ D_inv)
        
    Sigma_series = np.array(Sigma_series)
    Corr_series = np.array(Corr_series)
    
    # Volatilidad condicional diaria de cada activo y del portafolio
    vols_cond = {ticker: np.sqrt(Sigma_series[:, i, i]).tolist() for i, ticker in enumerate(TICKERS)}
    portfolio_vols = np.sqrt([weights.T @ S @ weights for S in Sigma_series]).tolist()
    
    # 5. Cálculo de VaR y CVaR Paramétrico t-Student para el portafolio
    nu, loc, scale = stats.t.fit(R_portfolio)
    if nu <= 2:
        nu = 4.0
    
    std_factor = np.sqrt((nu - 2.0) / nu)
    
    var_95 = []
    cvar_95 = []
    var_99 = []
    cvar_99 = []
    
    # Precalcular factores constantes
    t_q_95 = stats.t.ppf(0.05, df=nu) * std_factor
    t_q_99 = stats.t.ppf(0.01, df=nu) * std_factor
    
    cvar_f_95 = -np.mean(stats.t.ppf(np.linspace(1e-6, 0.05, 1000), df=nu) * std_factor)
    cvar_f_99 = -np.mean(stats.t.ppf(np.linspace(1e-6, 0.01, 1000), df=nu) * std_factor)
    
    for t in range(T):
        sig = portfolio_vols[t]
        # VaR = - (loc + sig * std_quantile)
        v95 = - (loc + sig * t_q_95)
        v99 = - (loc + sig * t_q_99)
        # CVaR = - loc + sig * cvar_factor
        c95 = - loc + sig * cvar_f_95
        c99 = - loc + sig * cvar_f_99
        
        var_95.append(v95)
        var_99.append(v99)
        cvar_95.append(c95)
        cvar_99.append(c99)
        
    # 6. Backtesting de Kupiec (Últimos 250 días)
    T_eval = 250
    eval_indices = range(T - T_eval, T)
    real_loss = - R_portfolio
    
    backtest_data = {}
    exceptions_log = []
    
    for conf, p, var_arr, cvar_arr in [(0.95, 0.05, var_95, cvar_95), (0.99, 0.01, var_99, cvar_99)]:
        failures = []
        for idx in eval_indices:
            loss = real_loss[idx]
            var_thresh = var_arr[idx]
            if loss > var_thresh:
                failures.append(idx)
                
        N = len(failures)
        p_hat = N / T_eval
        p_hat_safe = max(1e-10, min(1.0 - 1e-10, p_hat))
        
        # Kupiec POF
        term_num = ((1.0 - p) ** (T_eval - N)) * (p ** N)
        term_den = ((1.0 - p_hat_safe) ** (T_eval - N)) * (p_hat_safe ** N)
        lr = -2.0 * np.log(term_num / term_den)
        p_val = stats.chi2.sf(lr, df=1)
        is_valid = lr <= 3.8415
        
        # Christoffersen Independence
        failures_binary = np.zeros(T_eval)
        for i, idx in enumerate(eval_indices):
            if idx in failures:
                failures_binary[i] = 1
                
        n00, n01, n10, n11 = 0, 0, 0, 0
        for i in range(1, T_eval):
            if failures_binary[i-1] == 0:
                if failures_binary[i] == 0:
                    n00 += 1
                else:
                    n01 += 1
            else:
                if failures_binary[i] == 0:
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
        
        # Christoffersen Conditional Coverage
        lr_cc = lr + lr_ind
        p_val_cc = stats.chi2.sf(lr_cc, df=2)
        is_valid_cc = lr_cc <= 5.9915
        
        # Test de López (cuadrático por exceso)
        real_loss_pct = real_loss[eval_indices] * 100
        var_arr_pct = np.array(var_arr)[eval_indices] * 100
        scale_pct = np.array(portfolio_vols)[eval_indices] * 100 * std_factor
        
        C_obs = np.zeros(T_eval)
        for t in range(T_eval):
            if real_loss_pct[t] > var_arr_pct[t]:
                C_obs[t] = 1.0 + (real_loss_pct[t] - var_arr_pct[t])**2
        C_total_obs = np.sum(C_obs)
        
        t_q = stats.t.ppf(p, df=nu)
        nu_calc = max(nu, 4.5)
        A_1, _ = integrate.quad(lambda z: (t_q - z)**2 * stats.t.pdf(z, df=nu_calc), -100.0, t_q)
        A_2, _ = integrate.quad(lambda z: (t_q - z)**4 * stats.t.pdf(z, df=nu_calc), -100.0, t_q)
        
        E_C = np.zeros(T_eval)
        Var_C = np.zeros(T_eval)
        for t in range(T_eval):
            s_t = scale_pct[t]
            E_C[t] = p + (s_t**2) * A_1
            E_C2_t = p + 2 * (s_t**2) * A_1 + (s_t**4) * A_2
            Var_C[t] = E_C2_t - (E_C[t]**2)
            
        E_total = np.sum(E_C)
        Var_total = np.sum(Var_C)
        z_lopez = (C_total_obs - E_total) / np.sqrt(Var_total) if Var_total > 0 else 0.0
        p_val_lopez = 2.0 * (1.0 - stats.norm.cdf(np.abs(z_lopez)))
        is_valid_lopez = np.abs(z_lopez) <= 1.96
        
        backtest_data[str(int(conf*100))] = {
            'expected_failures': T_eval * p,
            'real_failures': N,
            'failure_rate': p_hat,
            'lr_stat': lr,
            'p_value': p_val,
            'is_valid': bool(is_valid),
            'christoffersen_ind_lr': lr_ind,
            'christoffersen_ind_p_value': p_val_ind,
            'christoffersen_ind_is_valid': bool(is_valid_ind),
            'christoffersen_cc_lr': lr_cc,
            'christoffersen_cc_p_value': p_val_cc,
            'christoffersen_cc_is_valid': bool(is_valid_cc),
            'lopez_score_obs': C_total_obs,
            'lopez_score_exp': E_total,
            'lopez_z': z_lopez,
            'lopez_p_value': p_val_lopez,
            'lopez_is_valid': bool(is_valid_lopez)
        }
        
        # Guardar en log de excepciones
        for idx in failures:
            date_str = dates_str[idx]
            loss_pct = real_loss[idx] * 100
            var_pct = var_arr[idx] * 100
            cvar_pct = cvar_arr[idx] * 100
            
            # Contribuciones individuales de retornos ese día
            asset_ret_pct = {ticker: R[idx, i] * 100 for i, ticker in enumerate(TICKERS)}
            
            exceptions_log.append({
                'conf': int(conf*100),
                'date': date_str,
                'portfolio_loss_pct': loss_pct,
                'var_threshold_pct': var_pct,
                'cvar_pct': cvar_pct,
                'asset_returns_pct': asset_ret_pct
            })
            
    # Ordenar excepciones por fecha
    exceptions_log = sorted(exceptions_log, key=lambda x: x['date'])
    
    # 7. Generar proyecciones de precio y volatilidad a 30 días hábiles
    proj_dates = pd.bdate_range(start='2026-06-01', periods=30)
    proj_dates_str = proj_dates.strftime('%Y-%m-%d').tolist()
    
    asset_projections = {}
    for ticker in TICKERS:
        df_asset = clean_and_load_asset(ticker)
        P0 = float(df_asset['Último'].values[-1])
        
        # Obtener última volatilidad condicional escalada y parámetros
        scaled_returns = df_returns[ticker] * 100
        model = arch_model(scaled_returns, vol='EGARCH', p=1, o=1, q=1, dist='t')
        res = model.fit(disp='off')
        last_vol_scaled = float(res.conditional_volatility.values[-1])
        
        omega = egarch_params[ticker]['omega']
        beta = egarch_params[ticker]['beta']
        mu_r = float(df_returns[ticker].mean())
        
        # Proyectar varianza scaled
        h_t = last_vol_scaled ** 2
        sig_sq_forecasts = []
        for step in range(30):
            if step == 0:
                h_next = h_t
            else:
                h_next = np.exp(omega + beta * np.log(h_next))
            sig_sq_forecasts.append(h_next / 10000.0)
            
        # Calcular límites
        cum_vars = np.cumsum(sig_sq_forecasts)
        cum_stds = np.sqrt(cum_vars)
        
        price_medium = []
        price_high = []
        price_low = []
        for h in range(30):
            price_medium.append(P0 * np.exp((h + 1) * mu_r))
            price_high.append(P0 * np.exp((h + 1) * mu_r + 1.96 * cum_stds[h]))
            price_low.append(P0 * np.exp((h + 1) * mu_r - 1.96 * cum_stds[h]))
            
        asset_projections[ticker] = {
            'dates': proj_dates_str,
            'medium': price_medium,
            'high': price_high,
            'low': price_low
        }
        
    # Proyecciones del Portafolio (Indexado a 100)
    portfolio_vols_arr = np.array(portfolio_vols)
    last_port_vol = portfolio_vols_arr[-1]
    mu_port = float(R_portfolio.mean())
    
    port_index_medium = []
    port_index_high = []
    port_index_low = []
    for h in range(30):
        port_cum_std = np.sqrt(h + 1) * last_port_vol
        port_index_medium.append(100.0 * np.exp((h + 1) * mu_port))
        port_index_high.append(100.0 * np.exp((h + 1) * mu_port + 1.96 * port_cum_std))
        port_index_low.append(100.0 * np.exp((h + 1) * mu_port - 1.96 * port_cum_std))
        
    portfolio_projection = {
        'dates': proj_dates_str,
        'medium': port_index_medium,
        'high': port_index_high,
        'low': port_index_low
    }
    
    # 8. Estructurar el objeto JSON completo
    dashboard_payload = {
        'tickers': TICKERS,
        'dates': dates_str,
        'assets': {
            ticker: {
                'prices': consolidated[ticker].tolist(),
                'returns_pct': (df_returns[ticker] * 100).tolist(),
                'vols_cond_pct': (np.array(vols_cond[ticker]) * 100).tolist(),
                'egarch': egarch_params[ticker],
                'projection': asset_projections[ticker]
            } for ticker in TICKERS
        },
        'portfolio': {
            'returns_pct': (R_portfolio * 100).tolist(),
            'vols_cond_pct': (np.array(portfolio_vols) * 100).tolist(),
            'var_95_pct': (np.array(var_95) * 100).tolist(),
            'cvar_95_pct': (np.array(cvar_95) * 100).tolist(),
            'var_99_pct': (np.array(var_99) * 100).tolist(),
            'cvar_99_pct': (np.array(cvar_99) * 100).tolist(),
            'nu': nu,
            'mean_mu_pct': loc * 100,
            'scale_pct': scale * 100,
            'projection': portfolio_projection
        },
        'ewma_optimal_lambda': optimal_lambda,
        'backtesting': {
            't_eval': T_eval,
            'results': backtest_data,
            'exceptions': exceptions_log
        }
    }
    
    # Escribir a data/processed/dashboard_data.json
    output_path = os.path.join(DATA_PROCESSED_DIR, 'dashboard_data.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(dashboard_payload, f, indent=2)
        
    print(f"Exportación exitosa. JSON guardado en: {output_path}")

if __name__ == '__main__':
    main()
