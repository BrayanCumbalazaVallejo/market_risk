// Referencias del Estado Global
let dataset = null;
let activeTab = 'inicio';
let activeTicker = 'NVDA';
let portfolioRange = 'all';
let assetRange = 'all';
let assetResolution = 'daily';
let currentPortfolioReturnsPct = [];
let currentPortfolioVolsCondPct = [];
let currentPortfolioVar95 = [];
let currentPortfolioCvar95 = [];
let currentPortfolioVar99 = [];
let currentPortfolioCvar99 = [];
let currentExceptions = [];
let portfolioWeights = [25, 25, 25, 25];
let precomputedReturns = null;
let currentPortfolioNu = 5.8145;


// Instancias de Gráficos de Chart.js
let chartPortfolioHistory = null;
let chartPortfolioWeights = null;
let chartAssetDynamics = null;
let chartEwmaCorrelations = null;
let chartBacktesting = null;
let chartAnalystConsensus = null;
let chartPriceProjection = null;
let chartPortfolioDistribution = null;
let chartAssetDistribution = null;
let chartPortfolioRisk = null;


// Carga Inicial del Dashboard
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadDashboardData();
  setupEventListeners();
});

// Inicializar Navegación de Pestañas
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      // Desactivar botones y paneles previos
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      
      // Activar pestaña seleccionada
      btn.classList.add('active');
      const activePanel = document.getElementById(tabId);
      if (activePanel) {
        activePanel.classList.add('active');
      }
      
      activeTab = tabId;
      // Forzar redibujado de gráficos al cambiar de pestaña para evitar desfases de tamaño
      resizeCharts();
    });
  });
}

// Carga de Datos desde JSON Procesado
async function loadDashboardData() {
  let response = null;
  let errorMsg = "";
  const maxRetries = 3;
  const retryDelay = 250;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `data/processed/dashboard_data.json?t=${Date.now()}`;
      response = await fetch(url);
      if (response.ok) {
        break;
      }
      errorMsg = `HTTP status ${response.status}`;
    } catch (err) {
      errorMsg = err.message || err;
    }
    
    if (attempt < maxRetries) {
      console.warn(`Intento ${attempt} fallido al cargar base de datos. Reintentando en ${retryDelay}ms... (Error: ${errorMsg})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  try {
    if (!response || !response.ok) {
      throw new Error(errorMsg || "Sin respuesta del servidor");
    }
    dataset = await response.json();
    console.log("Datos del Dashboard cargados exitosamente:", dataset);
    
    // Interceptar estado vacío o con activos insuficientes (< 2)
    if (dataset.status === "empty" || !dataset.tickers || dataset.tickers.length < 2) {
      console.warn("Estado de portafolio vacío o con activos insuficientes (< 2). Habilitando UI amigable.");
      dataset.tickers = dataset.tickers || [];
      dataset.dates = dataset.dates || [];
      
      // Inicializar selectores dinámicos y widgets básicos para interacción
      populateDynamicSelectors();
      setupCSVUploader();
      renderPortfolioAssetsDeleteList();
      
      // Mostrar mensaje amistoso
      displayEmptyStateMessage();
      return;
    }
    
    // Precomputar la matriz de retornos en decimales para evitar reservas repetidas en loops y slider drag
    const K = dataset.tickers.length;
    const T = dataset.dates.length;
    precomputedReturns = new Array(T);
    for (let t = 0; t < T; t++) {
      const row = new Float64Array(K);
      for (let k = 0; k < K; k++) {
        row[k] = dataset.assets[dataset.tickers[k]].returns_pct[t] / 100.0;
      }
      precomputedReturns[t] = row;
    }
    
    // Inicializar pesos equitativos por defecto según el número de activos
    portfolioWeights = new Array(K).fill(100.0 / K);
    
    // Inicializar variables de portafolio dinámicas
    currentPortfolioReturnsPct = [...dataset.portfolio.returns_pct];
    currentPortfolioVolsCondPct = [...dataset.portfolio.vols_cond_pct];
    currentPortfolioVar95 = [...dataset.portfolio.var_95_pct];
    currentPortfolioCvar95 = [...dataset.portfolio.cvar_95_pct];
    currentPortfolioVar99 = [...dataset.portfolio.var_99_pct];
    currentPortfolioCvar99 = [...dataset.portfolio.cvar_99_pct];
    currentExceptions = [...dataset.backtesting.exceptions];
    currentPortfolioNu = dataset.portfolio.nu;

    
    // Inicializar selectores dinámicos y widgets avanzados
    populateDynamicSelectors();
    setupCSVUploader();
    renderPortfolioAssetsDeleteList();
    setupStressTesting();
    
    // Inicializar secciones
    renderOverviewPanel();
    renderEGARCHPanel();
    renderEWMAPanel();
    renderBacktestPanel();
    
    // Gráficos de Distribución Empírica
    renderPortfolioDistribution();
    renderAssetDistribution(activeTicker);
    
  } catch (error) {
    console.error("Fallo al cargar datos del dashboard:", error);
    alert("No se pudo cargar la base de datos del dashboard. Asegúrate de haber ejecutado export_dashboard_data.py y que el archivo JSON esté en data/processed/");
  }
}

// Configurar Eventos del Dashboard
function setupEventListeners() {
  // Selector de activos en EGARCH
  const assetSelector = document.getElementById('asset-selector');
  if (assetSelector) {
    assetSelector.addEventListener('change', (e) => {
      updateEGARCHAsset(e.target.value);
    });
  }
  
  // Botones de Rango de Portafolio
  const portfolioRangeButtons = document.querySelectorAll('.time-range-btn[data-chart="portfolio"]');
  portfolioRangeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      portfolioRangeButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      portfolioRange = e.target.getAttribute('data-range');
      updatePortfolioHistoryChart();
    });
  });

  // Botones de Rango de Activo
  const assetRangeButtons = document.querySelectorAll('.time-range-btn[data-chart="asset"]');
  assetRangeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      assetRangeButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      assetRange = e.target.getAttribute('data-range');
      renderAssetDynamicsChart();
    });
  });

  // Botones de Resolución de Activo
  const assetResButtons = document.querySelectorAll('.res-btn[data-chart="asset"]');
  assetResButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      assetResButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      assetResolution = e.target.getAttribute('data-res');
      renderAssetDynamicsChart();
    });
  });
  
  // Selector de Horizonte de Simulación
  const simHorizon = document.getElementById('simulation-horizon');
  if (simHorizon) {
    simHorizon.addEventListener('change', () => {
      renderPriceProjection(activeTicker);
      updateAnalystConsensus(activeTicker);
    });
  }
  
  // Slider interactivo de Lambda
  const lambdaSlider = document.getElementById('lambda-slider');
  const lambdaValue = document.getElementById('lambda-value');
  
  if (lambdaSlider && lambdaValue) {
    lambdaSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      lambdaValue.textContent = val.toFixed(3);
      // Simular EWMA con el nuevo Lambda
      simulateEWMA(val);
    });
  }
  
  // Botón resetear Lambda
  const btnResetLambda = document.getElementById('btn-reset-lambda');
  if (btnResetLambda && lambdaSlider) {
    btnResetLambda.addEventListener('click', () => {
      const optLambda = dataset.ewma_optimal_lambda;
      lambdaSlider.value = optLambda;
      lambdaValue.textContent = optLambda.toFixed(3);
      simulateEWMA(optLambda);
    });
  }
  
  // Cerrar Modal
  const btnCloseModal = document.getElementById('btn-close-modal');
  const modalOverlay = document.getElementById('exception-modal');
  
  if (btnCloseModal && modalOverlay) {
    btnCloseModal.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
    });
    
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.classList.remove('active');
      }
    });
  }
  
  // Selectores de EWMA
  const ewmaAssetA = document.getElementById('ewma-asset-a');
  const ewmaAssetB = document.getElementById('ewma-asset-b');
  if (ewmaAssetA && ewmaAssetB) {
    ewmaAssetA.addEventListener('change', () => {
      const lambda = parseFloat(document.getElementById('lambda-slider').value);
      simulateEWMA(lambda);
    });
    ewmaAssetB.addEventListener('change', () => {
      const lambda = parseFloat(document.getElementById('lambda-slider').value);
      simulateEWMA(lambda);
    });
  }

  // Direcciones de navegación
  const dirCards = document.querySelectorAll('.directory-card');
  dirCards.forEach(card => {
    card.addEventListener('click', () => {
      const tabId = card.getAttribute('data-tab');
      const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
      if (tabBtn) {
        tabBtn.click();
      }
    });
  });

  // Modal Matemático
  const btnOpenMath = document.getElementById('btn-open-math');
  const btnCloseMath = document.getElementById('btn-close-math-modal');
  const mathModal = document.getElementById('math-modal');
  
  if (btnOpenMath && mathModal && btnCloseMath) {
    btnOpenMath.addEventListener('click', () => {
      mathModal.classList.add('active');
      if (window.MathJax) {
        window.MathJax.typesetPromise();
      }
    });
    btnCloseMath.addEventListener('click', () => {
      mathModal.classList.remove('active');
    });
    mathModal.addEventListener('click', (e) => {
      if (e.target === mathModal) {
        mathModal.classList.remove('active');
      }
    });
  }

  // Modales de Distribución (Activo y Portafolio)
  const btnOpenDist = document.getElementById('btn-open-dist-info');
  const btnCloseDist = document.getElementById('btn-close-dist-info-modal');
  const distModal = document.getElementById('dist-info-modal');
  
  if (btnOpenDist && distModal && btnCloseDist) {
    btnOpenDist.addEventListener('click', () => {
      distModal.classList.add('active');
    });
    btnCloseDist.addEventListener('click', () => {
      distModal.classList.remove('active');
    });
    distModal.addEventListener('click', (e) => {
      if (e.target === distModal) {
        distModal.classList.remove('active');
      }
    });
  }

  const btnOpenPortDist = document.getElementById('btn-open-port-dist-info');
  const btnClosePortDist = document.getElementById('btn-close-port-dist-info-modal');
  const portDistModal = document.getElementById('port-dist-info-modal');
  
  if (btnOpenPortDist && portDistModal && btnClosePortDist) {
    btnOpenPortDist.addEventListener('click', () => {
      portDistModal.classList.add('active');
    });
    btnClosePortDist.addEventListener('click', () => {
      portDistModal.classList.remove('active');
    });
    portDistModal.addEventListener('click', (e) => {
      if (e.target === portDistModal) {
        portDistModal.classList.remove('active');
      }
    });
  }
}

// Redibujar gráficos para corregir problemas de layout al cambiar de tabs
function resizeCharts() {
  if (activeTab === 'overview') {
    if (chartPortfolioHistory) chartPortfolioHistory.resize();
    if (chartPortfolioWeights) chartPortfolioWeights.resize();
    if (chartPortfolioDistribution) chartPortfolioDistribution.resize();
  } else if (activeTab === 'egarch') {
    if (chartAssetDynamics) chartAssetDynamics.resize();
    if (chartAnalystConsensus) chartAnalystConsensus.resize();
    if (chartPriceProjection) chartPriceProjection.resize();
    if (chartAssetDistribution) chartAssetDistribution.resize();
  } else if (activeTab === 'ewma') {
    if (chartEwmaCorrelations) chartEwmaCorrelations.resize();
  } else if (activeTab === 'backtest') {
    if (chartBacktesting) chartBacktesting.resize();
  }
}

// Helpers Matemáticos para Simulación EWMA en Javascript
function calculateSampleCovariance(matrix, firstNDays) {
  const T = firstNDays;
  const K = matrix[0].length; // número de activos (4)
  
  // Calcular medias
  const means = new Array(K).fill(0);
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < K; k++) {
      means[k] += matrix[t][k];
    }
  }
  for (let k = 0; k < K; k++) {
    means[k] /= T;
  }
  
  // Inicializar matriz de covarianza K x K
  const cov = Array.from({ length: K }, () => new Array(K).fill(0));
  
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      let sum = 0;
      for (let t = 0; t < T; t++) {
        sum += (matrix[t][i] - means[i]) * (matrix[t][j] - means[j]);
      }
      cov[i][j] = sum / (T - 1);
    }
  }
  return cov;
}

// Agrupar datos diarios por resolución: Día, Semana, Mes
function aggregateData(dates, priceData, volData, resolution) {
  if (resolution === 'daily' || !resolution) {
    return { dates, prices: priceData, vols: volData };
  }
  
  const aggregatedDates = [];
  const aggregatedPrices = [];
  const aggregatedVols = [];
  const groups = {};
  
  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) continue;
    
    let key;
    if (resolution === 'weekly') {
      const year = dateObj.getFullYear();
      const oneJan = new Date(year, 0, 1);
      const numberOfDays = Math.floor((dateObj - oneJan) / (24 * 60 * 60 * 1000));
      const week = Math.ceil((dateObj.getDay() + 1 + numberOfDays) / 7);
      key = `${year}-W${week}`;
    } else if (resolution === 'monthly') {
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth();
      key = `${year}-M${month}`;
    } else if (resolution === 'quarterly') {
      const year = dateObj.getFullYear();
      const quarter = Math.floor(dateObj.getMonth() / 3) + 1;
      key = `${year}-Q${quarter}`;
    }
    
    groups[key] = {
      date: dateStr,
      price: priceData[i],
      vol: volData[i]
    };
  }
  
  const sortedKeys = Object.keys(groups).sort();
  for (const key of sortedKeys) {
    aggregatedDates.push(groups[key].date);
    aggregatedPrices.push(groups[key].price);
    aggregatedVols.push(groups[key].vol);
  }
  
  return { dates: aggregatedDates, prices: aggregatedPrices, vols: aggregatedVols };
}

// Filtrar datos por rango: 1M, 3M, 6M, 1A, MAX
function filterDataByRange(dates, prices, vols, range) {
  if (range === 'all' || !range) {
    return { dates, prices, vols };
  }
  
  const lastDateStr = dates[dates.length - 1];
  const lastDate = new Date(lastDateStr);
  let cutoffDate = new Date(lastDate);
  
  if (range === '1m') {
    cutoffDate.setMonth(cutoffDate.getMonth() - 1);
  } else if (range === '3m') {
    cutoffDate.setMonth(cutoffDate.getMonth() - 3);
  } else if (range === '6m') {
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  } else if (range === '1y') {
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  }
  
  const filteredDates = [];
  const filteredPrices = [];
  const filteredVols = [];
  
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i]);
    if (d >= cutoffDate) {
      filteredDates.push(dates[i]);
      filteredPrices.push(prices[i]);
      filteredVols.push(vols[i]);
    }
  }
  
  return { dates: filteredDates, prices: filteredPrices, vols: filteredVols };
}

// Filtrar datos de portafolio por rango
function filterPortfolioDataByRange(dates, returns, vols, range) {
  if (range === 'all' || !range) {
    return { dates, returns, vols };
  }
  
  const lastDateStr = dates[dates.length - 1];
  const lastDate = new Date(lastDateStr);
  let cutoffDate = new Date(lastDate);
  
  if (range === '1m') {
    cutoffDate.setMonth(cutoffDate.getMonth() - 1);
  } else if (range === '3m') {
    cutoffDate.setMonth(cutoffDate.getMonth() - 3);
  } else if (range === '6m') {
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  } else if (range === '1y') {
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  }
  
  const filteredDates = [];
  const filteredReturns = [];
  const filteredVols = [];
  
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i]);
    if (d >= cutoffDate) {
      filteredDates.push(dates[i]);
      filteredReturns.push(returns[i]);
      filteredVols.push(vols[i]);
    }
  }
  
  return { dates: filteredDates, returns: filteredReturns, vols: filteredVols };
}

// Actualizar gráfico histórico de portafolio dinámicamente
function updatePortfolioHistoryChart() {
  if (!chartPortfolioHistory || !dataset) return;
  const pData = dataset.portfolio;
  const filtered = filterPortfolioDataByRange(dataset.dates, pData.returns_pct, pData.vols_cond_pct, portfolioRange);
  
  chartPortfolioHistory.data.labels = filtered.dates;
  chartPortfolioHistory.data.datasets[0].data = filtered.returns;
  chartPortfolioHistory.data.datasets[1].data = filtered.vols;
  chartPortfolioHistory.update();
}

// Renderizar gráfico dinámico del activo (EGARCH)
function renderAssetDynamicsChart() {
  if (!dataset) return;
  const asset = dataset.assets[activeTicker];
  
  // 1. Agrupar por resolución
  const aggregated = aggregateData(dataset.dates, asset.prices, asset.vols_cond_pct, assetResolution);
  
  // 2. Filtrar por rango temporal
  const filtered = filterDataByRange(aggregated.dates, aggregated.prices, aggregated.vols, assetRange);
  
  const ctxAsset = document.getElementById('chart-asset-dynamics').getContext('2d');
  
  if (chartAssetDynamics) {
    chartAssetDynamics.destroy();
  }
  
  chartAssetDynamics = new Chart(ctxAsset, {
    type: 'line',
    data: {
      labels: filtered.dates,
      datasets: [
        {
          label: 'Precio de Cierre (USD)',
          data: filtered.prices,
          borderColor: '#10b981',
          borderWidth: 2,
          pointRadius: filtered.dates.length > 150 ? 0 : 2,
          fill: false,
          yAxisID: 'yPrice'
        },
        {
          label: 'Volatilidad Condicional EGARCH (%)',
          data: filtered.vols,
          borderColor: '#8b5cf6',
          borderWidth: 1.5,
          pointRadius: filtered.dates.length > 150 ? 0 : 2,
          fill: false,
          yAxisID: 'yVol'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#f3f4f6' }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          afterBuildTicks: customBuildTicks,
          ticks: {
            color: '#9ca3af',
            maxRotation: 45,
            minRotation: 45,
            callback: function(val, index) {
              const label = this.getLabelForValue(val);
              return formatDateToMmmYy(label);
            }
          }
        },
        yPrice: {
          title: { display: true, text: 'Precio (USD)', color: '#10b981' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#9ca3af' }
        },
        yVol: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Volatilidad Condicional EGARCH (%)', color: '#8b5cf6' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#9ca3af' }
        }
      }
    }
  });
}

// Actualizar Consenso de Analistas
function updateAnalystConsensus(ticker) {
  const asset = dataset.assets[ticker];
  
  // Obtener el horizonte seleccionado
  const horizonSelector = document.getElementById('simulation-horizon');
  const horizon = horizonSelector ? parseInt(horizonSelector.value) : 30;
  const proj = calculateEGARCHProjection(ticker, horizon);
  
  const lastIdx = proj.medium.length - 1;
  const medVal = proj.medium[lastIdx];
  const highVal = proj.high[lastIdx];
  const lowVal = proj.low[lastIdx];
  
  document.getElementById('target-medium-val').textContent = `${medVal.toFixed(2)} USD`;
  document.getElementById('target-high-val').textContent = `${highVal.toFixed(2)} USD`;
  document.getElementById('target-low-val').textContent = `${lowVal.toFixed(2)} USD`;
  
  // Calcular probabilidad de retorno positivo superior a rf
  const cum_std = proj.cum_stds[proj.cum_stds.length - 1];
  const m = horizon * asset.egarch.mu_r;
  const rf_ann = 0.045; // 4.5% anual
  const rf_cum = horizon * (rf_ann / 252);
  const z = (rf_cum - m) / cum_std;
  const prob = (1.0 - getNormalCDF(z)) * 100;
  
  const consensoBox = document.getElementById('consenso-cuantificado');
  if (consensoBox) {
    consensoBox.innerHTML = `
      <strong>Consenso Cuantificado:</strong> Probabilidad de retorno positivo superior a la tasa libre de riesgo (4.5% anual) a ${horizon} días es del <strong>${prob.toFixed(2)}%</strong>, basado en una simulación Monte Carlo de precios con varianza condicional EGARCH-t.
    `;
  }
  
  let buy = 0, hold = 0, sell = 0;
  let consensusText = "";
  let consensusColor = "";
  
  if (prob >= 75) {
    buy = Math.round(prob);
    hold = 100 - buy;
    sell = 0;
    consensusText = "COMPRA FUERTE";
    consensusColor = "var(--color-green)";
  } else if (prob >= 55) {
    buy = Math.round(prob);
    hold = 100 - buy;
    sell = 0;
    consensusText = "COMPRAR";
    consensusColor = "var(--color-green)";
  } else if (prob >= 45) {
    hold = Math.round(100 - Math.abs(prob - 50) * 2);
    buy = Math.round((100 - hold) / 2 + (prob - 50));
    sell = 100 - buy - hold;
    consensusText = "MANTENER";
    consensusColor = "var(--color-warning)";
  } else {
    sell = Math.round(100 - prob);
    hold = 100 - sell;
    buy = 0;
    consensusText = "VENDER";
    consensusColor = "var(--color-red)";
  }
  
  const ctxConsensus = document.getElementById('chart-analyst-consensus').getContext('2d');
  
  if (chartAnalystConsensus) {
    chartAnalystConsensus.data.datasets[0].data = [buy, hold, sell];
    chartAnalystConsensus.update();
  } else {
    chartAnalystConsensus = new Chart(ctxConsensus, {
      type: 'doughnut',
      data: {
        labels: ['Comprar', 'Mantener', 'Vender'],
        datasets: [{
          data: [buy, hold, sell],
          backgroundColor: ['#10b981', '#f59e0b', '#f43f5e'],
          borderColor: '#0b0f19',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        cutout: '65%'
      }
    });
  }
  
  const consensusCard = document.getElementById('chart-analyst-consensus').closest('.card');
  if (consensusCard) {
    const opinionBadge = consensusCard.querySelector('span[style*="font-weight: 700"]');
    if (opinionBadge) {
      opinionBadge.textContent = consensusText;
      opinionBadge.style.color = consensusColor;
      opinionBadge.parentElement.style.borderColor = consensusColor.replace('var(', 'rgba(').replace(')', ', 0.25)');
      opinionBadge.parentElement.style.backgroundColor = consensusColor.replace('var(', 'rgba(').replace(')', ', 0.08)');
    }
    
    const legendItems = consensusCard.querySelectorAll('.weight-val');
    if (legendItems.length >= 3) {
      legendItems[0].textContent = `${buy.toFixed(1)}%`;
      legendItems[1].textContent = `${hold.toFixed(1)}%`;
      legendItems[2].textContent = `${sell.toFixed(1)}%`;
    }
  }
}

// Calcular la proyección predictiva EGARCH en cliente
function calculateEGARCHProjection(ticker, horizon) {
  const asset = dataset.assets[ticker];
  const eg = asset.egarch;
  
  const omega = eg.omega;
  const beta = eg.beta;
  const mu_r = eg.mu_r;
  const last_vol_scaled = eg.last_vol_scaled;
  
  const P0 = asset.prices[asset.prices.length - 1];
  
  // Generar fechas hábiles (business days) desde el día siguiente al último dato
  const projDates = [];
  const lastDateStr = dataset.dates[dataset.dates.length - 1];
  const parts = lastDateStr.split('-');
  const lastYear = parseInt(parts[0], 10);
  const lastMonth = parseInt(parts[1], 10) - 1;
  const lastDay = parseInt(parts[2], 10);
  let currDate = new Date(Date.UTC(lastYear, lastMonth, lastDay));
  currDate.setUTCDate(currDate.getUTCDate() + 1);
  
  while (projDates.length < horizon) {
    const day = currDate.getUTCDay();
    if (day !== 0 && day !== 6) { // saltar fin de semana
      const year = currDate.getUTCFullYear();
      const month = String(currDate.getUTCMonth() + 1).padStart(2, '0');
      const date = String(currDate.getUTCDate()).padStart(2, '0');
      projDates.push(`${year}-${month}-${date}`);
    }
    currDate.setUTCDate(currDate.getUTCDate() + 1);
  }
  
  let h_next = last_vol_scaled * last_vol_scaled;
  const sig_sq_forecasts = [];
  for (let step = 0; step < horizon; step++) {
    if (step === 0) {
      h_next = h_next;
    } else {
      h_next = Math.exp(omega + beta * Math.log(h_next));
    }
    sig_sq_forecasts.push(h_next / 10000.0);
  }
  
  const cum_vars = [];
  let sum = 0;
  for (let i = 0; i < horizon; i++) {
    sum += sig_sq_forecasts[i];
    cum_vars.push(sum);
  }
  
  const medium = [];
  const high = [];
  const low = [];
  
  for (let h = 0; h < horizon; h++) {
    const cum_std = Math.sqrt(cum_vars[h]);
    medium.push(P0 * Math.exp((h + 1) * mu_r));
    high.push(P0 * Math.exp((h + 1) * mu_r + 1.96 * cum_std));
    low.push(P0 * Math.exp((h + 1) * mu_r - 1.96 * cum_std));
  }
  
  return {
    dates: projDates,
    medium,
    high,
    low,
    cum_stds: cum_vars.map(v => Math.sqrt(v))
  };
}

// Renderizar gráfico de proyecciones a futuro (horizonte dinámico con corte de datos)
function renderPriceProjection(ticker) {
  const asset = dataset.assets[ticker];
  
  // Obtener el horizonte seleccionado por el usuario
  const horizonSelector = document.getElementById('simulation-horizon');
  const horizon = horizonSelector ? parseInt(horizonSelector.value) : 30;
  
  // Actualizar subtítulo dinámicamente con horizonte de días
  const projSubtitle = document.getElementById('projection-subtitle');
  if (projSubtitle) {
    projSubtitle.textContent = `Simulación Monte Carlo de Precios (N=10,000 iteraciones) bajo Varianza Condicional EGARCH-t (Proyección a ${horizon} Días)`;
  }
  
  // Calcular proyección predictiva EGARCH
  const proj = calculateEGARCHProjection(ticker, horizon);
  
  const histLen = 30;
  const histDates = [...dataset.dates.slice(-histLen)];
  const histPrices = asset.prices.slice(-histLen);
  
  // Resaltar la línea de corte en el eje X
  if (histDates.length > 0) {
    histDates[histDates.length - 1] = histDates[histDates.length - 1] + " (Corte Hoy)";
  }
  
  const allLabels = [...histDates, ...proj.dates];
  
  const histData = [...histPrices, ...Array(horizon).fill(null)];
  const medData = [...Array(histLen - 1).fill(null), histPrices[histLen - 1], ...proj.medium];
  const lowData = [...Array(histLen - 1).fill(null), histPrices[histLen - 1], ...proj.low];
  const highData = [...Array(histLen - 1).fill(null), histPrices[histLen - 1], ...proj.high];
  
  const ctxProjection = document.getElementById('chart-price-projection').getContext('2d');
  
  if (chartPriceProjection) {
    chartPriceProjection.destroy();
  }
  
  chartPriceProjection = new Chart(ctxProjection, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: 'Precio Histórico Real',
          data: histData,
          borderColor: '#10b981',
          borderWidth: 2,
          pointRadius: 2,
          fill: false
        },
        {
          label: 'Proyección Media (Simulado)',
          data: medData,
          borderColor: '#6366f1',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Límite Inferior (Simulado - 95%)',
          data: lowData,
          borderColor: '#f43f5e',
          borderWidth: 1.5,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Límite Superior (Simulado - 95%)',
          data: highData,
          borderColor: '#10b981',
          borderWidth: 1.5,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: 2,
          backgroundColor: 'rgba(16, 185, 129, 0.04)'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#f3f4f6' }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          afterBuildTicks: customBuildTicks,
          ticks: {
            color: '#9ca3af',
            maxRotation: 45,
            minRotation: 45,
            callback: function(val, index) {
              const label = this.getLabelForValue(val);
              return formatDateToMmmYy(label);
            }
          }
        },
        y: {
          title: { display: true, text: 'Precio (USD)', color: '#f3f4f6' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#9ca3af' }
        }
      }
    },
    plugins: [
      {
        id: 'forecastSeparator',
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          const xAxis = chart.scales.x;
          const yAxis = chart.scales.y;
          const labels = chart.data.labels;
          const index = labels.findIndex(lbl => lbl.includes('Corte Hoy'));
          if (index !== -1) {
            const x = xAxis.getPixelForValue(index);
            
            ctx.save();
            // Sombrear región de pronóstico
            ctx.fillStyle = 'rgba(99, 102, 241, 0.04)';
            ctx.fillRect(x, yAxis.top, xAxis.right - x, yAxis.bottom - yAxis.top);
            
            // Línea vertical punteada
            ctx.beginPath();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(x, yAxis.top);
            ctx.lineTo(x, yAxis.bottom);
            ctx.stroke();
            
            // Texto de etiquetas
            ctx.fillStyle = '#9ca3af';
            ctx.font = '10px Inter';
            ctx.textAlign = 'right';
            ctx.fillText('Histórico ', x - 5, yAxis.top + 15);
            ctx.textAlign = 'left';
            ctx.fillText(' Pronóstico', x + 5, yAxis.top + 15);
            
            ctx.restore();
          }
        }
      }
    ]
  });
}

// Helpers Matemáticos para Student's t, Normal CDF y Recálculo de Portafolio
function formatDateToMmmYy(label) {
  if (!label) return '';
  const isCorte = label.includes('Corte Hoy');
  const cleanLabel = label.replace(' (Corte Hoy)', '');
  const parts = cleanLabel.split('-');
  if (parts.length !== 3) return label; // Si no es YYYY-MM-DD, retornar original
  
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const yearShort = parts[0].slice(-2);
  const monthName = months[parseInt(parts[1], 10) - 1];
  const formatted = `${monthName}-${yearShort}`;
  
  return isCorte ? `${formatted} (Corte Hoy)` : formatted;
}

function customBuildTicks(axis) {
  const labels = axis.chart.data.labels;
  if (!labels || labels.length === 0) return;
  const maxTicks = 10;
  const ticks = [];
  if (labels.length <= maxTicks) {
    for (let i = 0; i < labels.length; i++) {
      ticks.push({ value: i });
    }
  } else {
    for (let i = 0; i < maxTicks; i++) {
      const idx = Math.round((i * (labels.length - 1)) / (maxTicks - 1));
      ticks.push({ value: idx });
    }
  }
  axis.ticks = ticks;
}

function formatDateToSpanishLong(dateStr) {
  if (!dateStr) return '';
  const cleanLabel = dateStr.replace(' (Corte Hoy)', '');
  const parts = cleanLabel.split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const year = parts[0];
  const monthName = months[parseInt(parts[1], 10) - 1];
  const day = String(parseInt(parts[2], 10)).padStart(2, '0');
  return `${day}-${monthName}-${year}`;
}

function getNormalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804;
  const p = d * Math.exp(-0.5 * x * x) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function getStudentQuantile(p, nu) {
  let z;
  if (p === 0.05) {
    z = -1.64485362695;
  } else if (p === 0.01) {
    z = -2.32634787404;
  } else {
    const flip = p > 0.5;
    const q = flip ? 1.0 - p : p;
    const t = Math.sqrt(-2.0 * Math.log(q));
    z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1.0 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
    if (!flip) z = -z;
  }
  
  const z3 = z * z * z;
  const z5 = z3 * z * z;
  const t = z + (z3 + z) / (4.0 * nu) + (5.0 * z5 + 16.0 * z3 + 3.0 * z) / (96.0 * nu * nu);
  return t;
}

function getCVaRFactor(conf, nu) {
  const alpha = 1.0 - conf;
  const N = 100;
  let sum = 0;
  const std_factor = Math.sqrt((nu - 2.0) / nu);
  
  for (let i = 0; i < N; i++) {
    const p = 1e-6 + (alpha - 1e-6) * (i / (N - 1));
    sum += getStudentQuantile(p, nu) * std_factor;
  }
  return -(sum / N);
}

function computePortfolioVols(weights) {
  const K = dataset.tickers.length;
  const T = dataset.dates.length;
  const lambda = dataset.ewma_optimal_lambda;
  const R = precomputedReturns;
  
  const means = new Array(K).fill(0);
  for (let t = 0; t < 50; t++) {
    const R_t = R[t];
    for (let k = 0; k < K; k++) {
      means[k] += R_t[k];
    }
  }
  for (let k = 0; k < K; k++) {
    means[k] /= 50;
  }
  
  const Sigma = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      let sum = 0;
      for (let t = 0; t < 50; t++) {
        sum += (R[t][i] - means[i]) * (R[t][j] - means[j]);
      }
      Sigma[i][j] = sum / 49;
    }
  }
  
  const portfolio_vols = new Array(T);
  
  function getPortfolioVol(S, w) {
    let sum = 0;
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        sum += w[i] * w[j] * S[i][j];
      }
    }
    return Math.sqrt(sum);
  }
  
  portfolio_vols[0] = getPortfolioVol(Sigma, weights);
  
  for (let t = 1; t < T; t++) {
    const R_prev = R[t-1];
    for (let i = 0; i < K; i++) {
      const r_i = R_prev[i];
      for (let j = 0; j < K; j++) {
        Sigma[i][j] = lambda * Sigma[i][j] + (1.0 - lambda) * (r_i * R_prev[j]);
      }
    }
    portfolio_vols[t] = getPortfolioVol(Sigma, weights);
  }
  return portfolio_vols;
}

function calculateKurtosis(arr) {
  const n = arr.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  const mean = sum / n;
  
  let varSum = 0;
  let kurtSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = arr[i] - mean;
    varSum += diff * diff;
    kurtSum += diff * diff * diff * diff;
  }
  const variance = varSum / n;
  const kurtosis = (kurtSum / n) / (variance * variance);
  return { mean, std: Math.sqrt(variance), kurtosis };
}

function recalculatePortfolio(weights) {
  const wDec = weights.map(w => w / 100.0);
  const T = dataset.dates.length;
  
  const R_portfolio = new Array(T);
  for (let t = 0; t < T; t++) {
    let ret = 0;
    const R_t = precomputedReturns[t];
    for (let k = 0; k < dataset.tickers.length; k++) {
      ret += wDec[k] * R_t[k];
    }
    R_portfolio[t] = ret;
  }
  
  const portfolio_vols = computePortfolioVols(wDec);
  const { mean, std, kurtosis } = calculateKurtosis(R_portfolio);
  
  let nu = 4.0 + 6.0 / (kurtosis - 3.0);
  if (nu <= 2.0 || isNaN(nu)) {
    nu = 4.0;
  }
  if (nu > 30.0) {
    nu = 30.0;
  }
  currentPortfolioNu = nu;
  
  const std_factor = Math.sqrt((nu - 2.0) / nu);
  const var_f_95 = -getStudentQuantile(0.05, nu) * std_factor;
  const var_f_99 = -getStudentQuantile(0.01, nu) * std_factor;
  const cvar_f_95 = getCVaRFactor(0.95, nu);
  const cvar_f_99 = getCVaRFactor(0.99, nu);
  
  const var_95 = [];
  const var_99 = [];
  const cvar_95 = [];
  const cvar_99 = [];
  
  const loc = mean;
  for (let t = 0; t < T; t++) {
    const sig = portfolio_vols[t];
    var_95.push((-loc + sig * var_f_95) * 100.0);
    var_99.push((-loc + sig * var_f_99) * 100.0);
    cvar_95.push((-loc + sig * cvar_f_95) * 100.0);
    cvar_99.push((-loc + sig * cvar_f_99) * 100.0);
  }
  
  currentPortfolioReturnsPct = R_portfolio.map(r => r * 100.0);
  currentPortfolioVolsCondPct = portfolio_vols.map(v => v * 100.0);
  currentPortfolioVar95 = var_95;
  currentPortfolioCvar95 = cvar_95;
  currentPortfolioVar99 = var_99;
  currentPortfolioCvar99 = cvar_99;
  
  document.getElementById('val-var95').textContent = `${var_95[T - 1].toFixed(4)}%`;
  document.getElementById('val-cvar95').textContent = `${cvar_95[T - 1].toFixed(4)}%`;
  document.getElementById('val-var99').textContent = `${var_99[T - 1].toFixed(4)}%`;
  document.getElementById('val-cvar99').textContent = `${cvar_99[T - 1].toFixed(4)}%`;
  
  if (chartPortfolioWeights) {
    chartPortfolioWeights.data.datasets[0].data = weights;
    chartPortfolioWeights.update();
  }
  
  updatePortfolioHistoryChart();
  
  // Recalcular el panel de backtesting con la nueva composición
  recalculateBacktesting();
  
  // Recalcular la contribución al riesgo
  renderRiskContributions();
  
  // Recalcular gráfico de distribución empírica del portafolio
  renderPortfolioDistribution();
  
  // Recalcular stress simulation
  if (window.runStressSimulation) {
    window.runStressSimulation();
  }
}

// Función Gamma usando la aproximación de Lanczos (9 coeficientes)
function gamma(x) {
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (x < 0.5) {
    return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  }
  x -= 1;
  let a = p[0];
  const t = x + 9 - 1.5; // g = 7, n = 9
  for (let i = 1; i < p.length; i++) {
    a += p[i] / (x + i);
  }
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

// Densidad de probabilidad de la distribución t-Student estándar
function tPDF(z, nu) {
  const term1 = gamma((nu + 1) / 2) / (Math.sqrt(nu * Math.PI) * gamma(nu / 2));
  const term2 = Math.pow(1 + (z * z) / nu, -(nu + 1) / 2);
  return term1 * term2;
}

// Integración numérica (regla del trapecio) para constantes de López
function integrateLopezConstants(t_q, nu) {
  const steps = 500;
  const start = -50.0; // Límite inferior práctico para t-student
  const h = (t_q - start) / steps;
  let sum1 = 0.0;
  let sum2 = 0.0;
  
  for (let i = 0; i <= steps; i++) {
    const z = start + i * h;
    const pdf = tPDF(z, nu);
    const diff = t_q - z;
    const diff2 = diff * diff;
    const diff4 = diff2 * diff2;
    
    const weight = (i === 0 || i === steps) ? 0.5 : 1.0;
    
    sum1 += diff2 * pdf * weight;
    sum2 += diff4 * pdf * weight;
  }
  
  return { A1: sum1 * h, A2: sum2 * h };
}

function recalculateBacktesting() {
  const T_eval = 250;
  const T = dataset.dates.length;
  const eval_indices = [];
  for (let i = T - T_eval; i < T; i++) {
    eval_indices.push(i);
  }
  
  const results = {};
  currentExceptions = [];
  
  const configurations = [
    { conf: 95, p: 0.05, varArr: currentPortfolioVar95, cvarArr: currentPortfolioCvar95 },
    { conf: 99, p: 0.01, varArr: currentPortfolioVar99, cvarArr: currentPortfolioCvar99 }
  ];
  
  configurations.forEach(config => {
    const failures = [];
    eval_indices.forEach(idx => {
      const loss = -currentPortfolioReturnsPct[idx];
      const varThresh = config.varArr[idx];
      if (loss > varThresh) {
        failures.push(idx);
      }
    });
    
    const N = failures.length;
    const p_hat = N / T_eval;
    const p_hat_safe = Math.max(1e-10, Math.min(1.0 - 1e-10, p_hat));
    
    // Kupiec POF
    const term_num = Math.pow(1.0 - config.p, T_eval - N) * Math.pow(config.p, N);
    const term_den = Math.pow(1.0 - p_hat_safe, T_eval - N) * Math.pow(p_hat_safe, N);
    const lr = -2.0 * Math.log(term_num / term_den);
    const p_value = 2.0 * (1.0 - getNormalCDF(Math.sqrt(Math.max(0, lr))));
    const is_valid = lr <= 3.8415;
    
    // Christoffersen Independence
    const failures_binary = new Array(T_eval).fill(0);
    eval_indices.forEach((idx, i) => {
      if (failures.includes(idx)) {
        failures_binary[i] = 1;
      }
    });
    
    let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
    for (let i = 1; i < T_eval; i++) {
      if (failures_binary[i - 1] === 0) {
        if (failures_binary[i] === 0) n00++; else n01++;
      } else {
        if (failures_binary[i] === 0) n10++; else n11++;
      }
    }
    
    const pi01 = (n00 + n01) > 0 ? n01 / (n00 + n01) : 0.0;
    const pi11 = (n10 + n11) > 0 ? n11 / (n10 + n11) : 0.0;
    const pi = (n00 + n01 + n10 + n11) > 0 ? (n01 + n11) / (n00 + n01 + n10 + n11) : 0.0;
    
    function safeLog(n, val) {
      if (n === 0 || val === 0.0) return 0.0;
      return n * Math.log(val);
    }
    
    const logL0 = safeLog(n00 + n10, 1.0 - pi) + safeLog(n01 + n11, pi);
    const logL1 = safeLog(n00, 1.0 - pi01) + safeLog(n01, pi01) + safeLog(n10, 1.0 - pi11) + safeLog(n11, pi11);
    const lr_ind = -2.0 * (logL0 - logL1);
    const p_value_ind = 2.0 * (1.0 - getNormalCDF(Math.sqrt(Math.max(0, lr_ind))));
    const is_valid_ind = lr_ind <= 3.8415;
    
    // Combined Conditional Coverage
    const lr_cc = lr + lr_ind;
    const p_value_cc = Math.exp(-lr_cc / 2.0);
    const is_valid_cc = lr_cc <= 5.9915;
    
    // Test de López
    let C_total_obs = 0.0;
    eval_indices.forEach(idx => {
      const loss = -currentPortfolioReturnsPct[idx];
      const varThresh = config.varArr[idx];
      if (loss > varThresh) {
        C_total_obs += 1.0 + Math.pow(loss - varThresh, 2);
      }
    });
    
    const stdFactor = Math.sqrt((currentPortfolioNu - 2.0) / currentPortfolioNu);
    const t_q = getStudentQuantile(config.p, currentPortfolioNu);
    const nu_calc = Math.max(currentPortfolioNu, 4.5);
    const { A1, A2 } = integrateLopezConstants(t_q, nu_calc);
    
    let E_total = 0.0;
    let Var_total = 0.0;
    
    eval_indices.forEach(idx => {
      const scale_t = currentPortfolioVolsCondPct[idx] * stdFactor;
      const E_Ct = config.p + (scale_t * scale_t) * A1;
      const E_Ct2 = config.p + 2.0 * (scale_t * scale_t) * A1 + Math.pow(scale_t, 4) * A2;
      const Var_Ct = E_Ct2 - (E_Ct * E_Ct);
      
      E_total += E_Ct;
      Var_total += Var_Ct;
    });
    
    const z_lopez = Var_total > 0.0 ? (C_total_obs - E_total) / Math.sqrt(Var_total) : 0.0;
    const p_value_lopez = 2.0 * (1.0 - getNormalCDF(Math.abs(z_lopez)));
    const is_valid_lopez = Math.abs(z_lopez) <= 1.96;
    
    results[config.conf] = {
      expected_failures: T_eval * config.p,
      real_failures: N,
      failure_rate: p_hat,
      lr_stat: lr,
      p_value: p_value,
      is_valid: is_valid,
      
      christoffersen_ind_lr: lr_ind,
      christoffersen_ind_p_value: p_value_ind,
      christoffersen_ind_is_valid: is_valid_ind,
      
      christoffersen_cc_lr: lr_cc,
      christoffersen_cc_p_value: p_value_cc,
      christoffersen_cc_is_valid: is_valid_cc,
      
      lopez_score_obs: C_total_obs,
      lopez_score_exp: E_total,
      lopez_z: z_lopez,
      lopez_p_value: p_value_lopez,
      lopez_is_valid: is_valid_lopez
    };
    
    failures.forEach(idx => {
      const asset_ret_pct = {};
      dataset.tickers.forEach(ticker => {
        asset_ret_pct[ticker] = dataset.assets[ticker].returns_pct[idx];
      });
      
      currentExceptions.push({
        conf: config.conf,
        date: dataset.dates[idx],
        portfolio_loss_pct: -currentPortfolioReturnsPct[idx],
        var_threshold_pct: config.varArr[idx],
        cvar_pct: config.cvarArr[idx],
        asset_returns_pct: asset_ret_pct
      });
    });
  });
  
  currentExceptions.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const isValid95 = results['95'].is_valid && results['95'].christoffersen_ind_is_valid && results['95'].lopez_is_valid;
  const isValid99 = results['99'].is_valid && results['99'].christoffersen_ind_is_valid && results['99'].lopez_is_valid;
  
  updateBadge('badge-k95', isValid95, 'VaR 95%');
  updateBadge('badge-k99', isValid99, 'VaR 99%');
  
  function getCalibrationDiagnostic(res) {
    const isFreqValid = res.is_valid;
    const isIndValid = res.christoffersen_ind_is_valid;
    const isLopezValid = res.lopez_is_valid;
    
    if (isFreqValid && isIndValid && isLopezValid) {
      return `<span style="color: var(--color-green);">Riesgo Calibrado (Adecuado)</span>`;
    }
    
    let diag = [];
    if (!isFreqValid) {
      if (res.real_failures > res.expected_failures) {
        diag.push(`<span style="color: var(--color-red);">Subestima frecuencia</span>`);
      } else {
        diag.push(`<span style="color: var(--color-warning);">Sobreestima frecuencia</span>`);
      }
    }
    if (!isIndValid) {
      diag.push(`<span style="color: var(--color-red);">Agrupamientos (Rachas)</span>`);
    }
    if (!isLopezValid) {
      diag.push(`<span style="color: var(--color-red);">Magnitud inadecuada</span>`);
    }
    
    return diag.join(" | ");
  }
  
  document.getElementById('bt-sample').textContent = `${T_eval} días`;
  
  // Update 95% VaR Elements
  document.getElementById('bt-fail95').textContent = `${results['95'].real_failures} fallas reales / ${results['95'].expected_failures.toFixed(2)} esperadas`;
  document.getElementById('bt-pval95').textContent = `${results['95'].p_value.toFixed(5)} (LR: ${results['95'].lr_stat.toFixed(4)})`;
  document.getElementById('bt-pval-ind95').textContent = `${results['95'].christoffersen_ind_p_value.toFixed(5)} (LR: ${results['95'].christoffersen_ind_lr.toFixed(4)})`;
  document.getElementById('bt-pval-cc95').textContent = `${results['95'].christoffersen_cc_p_value.toFixed(5)} (LR: ${results['95'].christoffersen_cc_lr.toFixed(4)})`;
  document.getElementById('bt-lopez-score95').textContent = `${results['95'].lopez_score_obs.toFixed(3)} (Obs) / ${results['95'].lopez_score_exp.toFixed(3)} (H0)`;
  document.getElementById('bt-lopez-pval95').textContent = `${results['95'].lopez_p_value.toFixed(5)} (Z: ${results['95'].lopez_z.toFixed(4)})`;
  document.getElementById('bt-diag95').innerHTML = getCalibrationDiagnostic(results['95']);
  
  // Update 99% VaR Elements
  document.getElementById('bt-fail99').textContent = `${results['99'].real_failures} fallas reales / ${results['99'].expected_failures.toFixed(2)} esperadas`;
  document.getElementById('bt-pval99').textContent = `${results['99'].p_value.toFixed(5)} (LR: ${results['99'].lr_stat.toFixed(4)})`;
  document.getElementById('bt-pval-ind99').textContent = `${results['99'].christoffersen_ind_p_value.toFixed(5)} (LR: ${results['99'].christoffersen_ind_lr.toFixed(4)})`;
  document.getElementById('bt-pval-cc99').textContent = `${results['99'].christoffersen_cc_p_value.toFixed(5)} (LR: ${results['99'].christoffersen_cc_lr.toFixed(4)})`;
  document.getElementById('bt-lopez-score99').textContent = `${results['99'].lopez_score_obs.toFixed(3)} (Obs) / ${results['99'].lopez_score_exp.toFixed(3)} (H0)`;
  document.getElementById('bt-lopez-pval99').textContent = `${results['99'].lopez_p_value.toFixed(5)} (Z: ${results['99'].lopez_z.toFixed(4)})`;
  document.getElementById('bt-diag99').innerHTML = getCalibrationDiagnostic(results['99']);
  
  document.getElementById('bt-df').textContent = currentPortfolioNu.toFixed(4);
  
  const tbody = document.getElementById('exceptions-table-body');
  tbody.innerHTML = '';
  
  if (currentExceptions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No se registraron excepciones de VaR en la muestra de evaluación.</td></tr>';
  } else {
    currentExceptions.forEach((exc, idx) => {
      const tr = document.createElement('tr');
      const excess = (exc.portfolio_loss_pct - exc.var_threshold_pct);
      tr.innerHTML = `
        <td>${exc.date}</td>
        <td><span class="badge-confidence c${exc.conf}">${exc.conf}%</span></td>
        <td style="color: var(--color-red); font-weight: 500;">${exc.portfolio_loss_pct.toFixed(4)}%</td>
        <td>${exc.var_threshold_pct.toFixed(4)}%</td>
        <td style="color: var(--color-red); font-weight: 500;">${excess.toFixed(4)}%</td>
        <td>
          <button class="btn-details" onclick="showExceptionDetails(${idx})">Ver Detalles</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  const ctxBt = document.getElementById('chart-backtesting').getContext('2d');
  const evalDates = dataset.dates.slice(T - T_eval);
  const evalLosses = currentPortfolioReturnsPct.slice(T - T_eval).map(r => -r);
  const evalVar95 = currentPortfolioVar95.slice(T - T_eval);
  const evalVar99 = currentPortfolioVar99.slice(T - T_eval);
  
  if (chartBacktesting) {
    chartBacktesting.destroy();
  }
  
  chartBacktesting = new Chart(ctxBt, {
    type: 'line',
    data: {
      labels: evalDates,
      datasets: [
        {
          label: 'Pérdida Real del Portafolio (%)',
          data: evalLosses,
          borderColor: 'rgba(243, 244, 246, 0.75)',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 1.5,
          pointBackgroundColor: '#f3f4f6',
          fill: false
        },
        {
          label: 'Umbral VaR 95% EWMA-t (%)',
          data: evalVar95,
          borderColor: '#3182bd',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Umbral VaR 99% EWMA-t (%)',
          data: evalVar99,
          borderColor: '#de2d26',
          borderWidth: 2,
          borderDash: [8, 4],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#f3f4f6' }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          afterBuildTicks: customBuildTicks,
          ticks: {
            color: '#9ca3af',
            maxRotation: 45,
            minRotation: 45,
            callback: function(val, index) {
              const label = this.getLabelForValue(val);
              return formatDateToMmmYy(label);
            }
          }
        },
        y: {
          title: { display: true, text: 'Pérdida Diaria (%)', color: '#f3f4f6' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#9ca3af' }
        }
      }
    }
  });
}

function setupPortfolioWeightListeners() {
  const inputs = document.querySelectorAll('.portfolio-weight-input');
  const errorDiv = document.getElementById('portfolio-weights-error');
  
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      let sum = 0;
      const tempWeights = [];
      inputs.forEach(inp => {
        let val = parseFloat(inp.value);
        if (isNaN(val) || val < 0) {
          val = 0;
        }
        tempWeights.push(val);
        sum += val;
      });
      
      if (errorDiv) {
        errorDiv.style.display = 'block';
        if (Math.abs(sum - 100) > 0.01) {
          errorDiv.style.backgroundColor = 'rgba(244, 63, 94, 0.1)';
          errorDiv.style.border = '1px solid rgba(244, 63, 94, 0.3)';
          errorDiv.style.color = 'var(--color-red)';
          errorDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> La suma de los pesos es <strong>${sum.toFixed(2)}%</strong>. Debe ser exactamente 100%.`;
          inputs.forEach(inp => inp.style.borderColor = 'rgba(244, 63, 94, 0.5)');
        } else {
          errorDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
          errorDiv.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          errorDiv.style.color = 'var(--color-green)';
          errorDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> Distribución válida (100%). Recalculando riesgo...`;
          inputs.forEach(inp => inp.style.borderColor = 'var(--border-color)');
          
          portfolioWeights = tempWeights;
          recalculatePortfolio(tempWeights);
        }
      }
    });
  });
}

// PESTAÑA 1: Renderizar Overview
function renderOverviewPanel() {
  document.getElementById('val-var95').textContent = `${currentPortfolioReturnsPct.length > 0 ? dataset.portfolio.var_95_pct[dataset.portfolio.var_95_pct.length - 1].toFixed(4) : '--'}%`;
  document.getElementById('val-cvar95').textContent = `${currentPortfolioReturnsPct.length > 0 ? dataset.portfolio.cvar_95_pct[dataset.portfolio.cvar_95_pct.length - 1].toFixed(4) : '--'}%`;
  document.getElementById('val-var99').textContent = `${currentPortfolioReturnsPct.length > 0 ? dataset.portfolio.var_99_pct[dataset.portfolio.var_99_pct.length - 1].toFixed(4) : '--'}%`;
  document.getElementById('val-cvar99').textContent = `${currentPortfolioReturnsPct.length > 0 ? dataset.portfolio.cvar_99_pct[dataset.portfolio.cvar_99_pct.length - 1].toFixed(4) : '--'}%`;
  
  const ctxWeights = document.getElementById('chart-portfolio-weights').getContext('2d');
  
  const colors = dataset.tickers.map((t, idx) => getAssetColor(t, idx));
  const labels = dataset.tickers.map(t => `${getAssetFullName(t)} (${t})`);
  
  if (chartPortfolioWeights) {
    chartPortfolioWeights.destroy();
  }
  
  chartPortfolioWeights = new Chart(ctxWeights, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: portfolioWeights,
        backgroundColor: colors,
        borderColor: '#0b0f19',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      cutout: '70%'
    }
  });
  
  const legendContainer = document.getElementById('portfolio-weights-legend');
  legendContainer.innerHTML = '';
  labels.forEach((label, idx) => {
    const item = document.createElement('div');
    item.className = 'weight-item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.innerHTML = `
      <span class="weight-asset">
        <span class="dot-color" style="background-color: ${colors[idx]}"></span>
        ${label}
      </span>
      <div style="display: flex; align-items: center; gap: 0.25rem;">
        <input type="number" class="portfolio-weight-input custom-input" data-index="${idx}" min="0" max="100" step="1" value="${portfolioWeights[idx]}" style="width: 70px; background: rgba(15, 23, 42, 0.8); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.2rem 0.4rem; border-radius: 4px; text-align: right; font-family: var(--font-family-title); font-size: 0.85rem;">
        <span style="font-size: 0.85rem; color: var(--text-secondary);">%</span>
      </div>
    `;
    legendContainer.appendChild(item);
  });
  
  setupPortfolioWeightListeners();
  
  // Recalcular la contribución al riesgo
  renderRiskContributions();
  
  // Recalcular la distribución empírica
  renderPortfolioDistribution();
  
  const ctxHistory = document.getElementById('chart-portfolio-history').getContext('2d');
  
  const filtered = filterPortfolioDataByRange(dataset.dates, currentPortfolioReturnsPct, currentPortfolioVolsCondPct, portfolioRange);
  
  if (chartPortfolioHistory) {
    chartPortfolioHistory.destroy();
  }
  
  chartPortfolioHistory = new Chart(ctxHistory, {
    type: 'line',
    data: {
      labels: filtered.dates,
      datasets: [
        {
          label: 'Retorno diario Portafolio (%)',
          data: filtered.returns,
          borderColor: 'rgba(99, 102, 241, 0.4)',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Volatilidad Condicional EWMA (%)',
          data: filtered.vols,
          borderColor: '#f59e0b',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          yAxisID: 'yVol'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#f3f4f6' }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          afterBuildTicks: customBuildTicks,
          ticks: {
            color: '#9ca3af',
            maxRotation: 45,
            minRotation: 45,
            callback: function(val, index) {
              const label = this.getLabelForValue(val);
              return formatDateToMmmYy(label);
            }
          }
        },
        y: {
          title: { display: true, text: 'Retorno (%)', color: '#f3f4f6' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#9ca3af' }
        },
        yVol: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Volatilidad Condicional (%)', color: '#f59e0b' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#9ca3af' }
        }
      }
    }
  });
}

// PESTAÑA 2: Renderizar EGARCH Panel
function renderEGARCHPanel() {
  updateEGARCHAsset(activeTicker);
}

function updateEGARCHAsset(ticker) {
  const asset = dataset.assets[ticker];
  
  // Actualizar Título
  document.getElementById('asset-chart-title').innerHTML = `
    <span>Análisis de Volatilidad EGARCH: ${ticker}</span>
    <span style="font-size: 0.85rem; color: var(--text-secondary);">Precios históricos frente a la volatilidad condicional estimada</span>
  `;
  
  // Renderizar Tabla Parámetros
  const tbody = document.getElementById('egarch-params-body');
  tbody.innerHTML = '';
  
  const pDescriptions = {
    'omega': 'Omega (ω): Varianza constante o de largo plazo.',
    'alpha': 'Alpha (α): Sensibilidad de la volatilidad ante nuevos retornos (reacción a corto plazo).',
    'gamma': 'Gamma (γ): Efecto de asimetría o apalancamiento. Si es negativo, las pérdidas generan más volatilidad que las ganancias.',
    'beta': 'Beta (β): Persistencia de la volatilidad (memoria del modelo).',
    'nu': 'Grados de libertad (nu): Grado de colas pesadas bajo la distribución t-Student.'
  };
  
  const mapping = [
    { key: 'omega', name: 'omega', symbol: 'ω', pkey: 'omega_p', badge: 'kpi', badgeText: 'KPI' },
    { key: 'alpha', name: 'alpha', symbol: 'α', pkey: 'alpha_p', badge: 'kpi', badgeText: 'KPI' },
    { key: 'gamma', name: 'gamma', symbol: 'γ', pkey: 'gamma_p', badge: 'kri', badgeText: 'KRI' },
    { key: 'beta', name: 'beta', symbol: 'β', pkey: 'beta_p', badge: 'kpi', badgeText: 'KPI' },
    { key: 'nu', name: 'nu', symbol: 'ν', pkey: 'nu_p', badge: 'kpi', badgeText: 'KPI' }
  ];
  
  mapping.forEach(item => {
    const coef = asset.egarch[item.key];
    const pval = asset.egarch[item.pkey];
    if (coef === undefined || pval === undefined) {
      console.warn(`Missing key ${item.key} or ${item.pkey} in egarch data for ${ticker}`);
      return;
    }
    const isSignificant = pval < 0.05;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="param-name">
        <span style="display: flex; align-items: center; gap: 0.35rem;">
          <span>${item.name} (${item.symbol})</span>
          <span class="badge-${item.badge}">${item.badgeText}</span>
        </span>
        <span class="param-desc">${pDescriptions[item.key]}</span>
      </td>
      <td class="param-val">${coef.toFixed(6)}</td>
      <td class="param-val">${pval.toExponential(3)}</td>
      <td>
        <span class="pval-badge ${isSignificant ? 'significant' : 'not-significant'}">
          ${isSignificant ? 'Significativo (5%)' : 'No Sig. (5%)'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Actualizar e inicializar gráficos del activo
  activeTicker = ticker;
  renderAssetDynamicsChart();
  updateAnalystConsensus(ticker);
  renderPriceProjection(ticker);
  renderAssetDistribution(ticker);
}

// PESTAÑA 3: EWMA Panel
function renderEWMAPanel() {
  const optLambda = dataset.ewma_optimal_lambda;
  document.getElementById('lambda-slider').value = optLambda;
  document.getElementById('lambda-value').textContent = optLambda.toFixed(3);
  
  // Ejecutar simulación inicial
  simulateEWMA(optLambda);
}

// Motor de Simulación EWMA en Tiempo Real (Soporta selección dinámica de activos y línea base)
function simulateEWMA(lambda) {
  const K = dataset.tickers.length;
  const T = dataset.dates.length;
  const R = precomputedReturns;
  
  let Sigma = calculateSampleCovariance(R, 50);
  
  const tickerA = document.getElementById('ewma-asset-a')?.value || (dataset.tickers[0] || 'NVDA');
  const tickerB = document.getElementById('ewma-asset-b')?.value || (dataset.tickers[Math.min(2, dataset.tickers.length - 1)] || 'CEG');
  let idxA = dataset.tickers.indexOf(tickerA);
  let idxB = dataset.tickers.indexOf(tickerB);
  if (idxA === -1) idxA = 0;
  if (idxB === -1) idxB = Math.min(1, dataset.tickers.length - 1);
  
  const selectedCorr = new Array(T);
  
  let stdA = Math.sqrt(Sigma[idxA][idxA]) || 1e-8;
  let stdB = Math.sqrt(Sigma[idxB][idxB]) || 1e-8;
  selectedCorr[0] = Sigma[idxA][idxB] / (stdA * stdB);
  
  for (let t = 1; t < T; t++) {
    const R_prev = R[t-1];
    
    for (let i = 0; i < K; i++) {
      const r_i = R_prev[i];
      for (let j = 0; j < K; j++) {
        Sigma[i][j] = lambda * Sigma[i][j] + (1.0 - lambda) * (r_i * R_prev[j]);
      }
    }
    
    stdA = Math.sqrt(Sigma[idxA][idxA]) || 1e-8;
    stdB = Math.sqrt(Sigma[idxB][idxB]) || 1e-8;
    selectedCorr[t] = Sigma[idxA][idxB] / (stdA * stdB);
  }
  
  // Actualizar diagnóstico del estado de la correlación
  const simCorrState = document.getElementById('sim-correlation-state');
  if (simCorrState) {
    const lastCorr = selectedCorr[T - 1];
    let statusText = "";
    let statusColor = "";
    if (lastCorr > 0.3) {
      statusText = `Correlación Positiva (${(lastCorr * 100).toFixed(1)}%)`;
      statusColor = "var(--color-green)";
    } else if (lastCorr < -0.3) {
      statusText = `Correlación Negativa (${(lastCorr * 100).toFixed(1)}%)`;
      statusColor = "var(--color-red)";
    } else {
      statusText = `Desacoplados / Débil (${(lastCorr * 100).toFixed(1)}%)`;
      statusColor = "var(--color-warning)";
    }
    simCorrState.textContent = statusText;
    simCorrState.style.color = statusColor;
  }
  
  const simPersistence = document.getElementById('sim-persistence');
  const simReactivity = document.getElementById('sim-reactivity');
  
  if (lambda > 0.96) {
    simPersistence.textContent = "Persistencia alta";
    simPersistence.style.color = "#f43f5e";
    simReactivity.textContent = "Reacción lenta";
  } else if (lambda < 0.90) {
    simPersistence.textContent = "Persistencia baja";
    simPersistence.style.color = "#10b981";
    simReactivity.textContent = "Reacción rápida";
  } else {
    simPersistence.textContent = "Persistencia moderada";
    simPersistence.style.color = "#f59e0b";
    simReactivity.textContent = "Reacción estándar";
  }
  
  const ctxEwma = document.getElementById('chart-ewma-correlations').getContext('2d');
  
  if (chartEwmaCorrelations) {
    chartEwmaCorrelations.data.datasets[0].label = `Correlación ${tickerA} vs. ${tickerB}`;
    chartEwmaCorrelations.data.datasets[0].data = selectedCorr;
    chartEwmaCorrelations.data.datasets[1].data = new Array(T).fill(0);
    chartEwmaCorrelations.update('none');
  } else {
    chartEwmaCorrelations = new Chart(ctxEwma, {
      type: 'line',
      data: {
        labels: dataset.dates,
        datasets: [
          {
            label: `Correlación ${tickerA} vs. ${tickerB}`,
            data: selectedCorr,
            borderColor: '#4f46e5',
            borderWidth: 2,
            pointRadius: 0,
            fill: false
          },
          {
            label: 'Línea Base (0.0)',
            data: new Array(T).fill(0),
            borderColor: 'rgba(255, 255, 255, 0.25)',
            borderWidth: 1.5,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#f3f4f6' }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            afterBuildTicks: customBuildTicks,
            ticks: {
              color: '#9ca3af',
              maxRotation: 45,
              minRotation: 45,
              callback: function(val, index) {
                const label = this.getLabelForValue(val);
                return formatDateToMmmYy(label);
              }
            }
          },
          y: {
            min: -1.0,
            max: 1.0,
            title: { display: true, text: 'Coeficiente de Correlación', color: '#f3f4f6' },
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#9ca3af' }
          }
        }
      }
    });
  }
  
  // Recalcular la contribución al riesgo
  renderRiskContributions();
  
  // Recalcular stress simulation
  if (window.runStressSimulation) {
    window.runStressSimulation();
  }
}

// PESTAÑA 4: Backtesting y Kupiec
function renderBacktestPanel() {
  recalculateBacktesting();
}

function updateBadge(id, isValid, name) {
  const badge = document.getElementById(id);
  if (badge) {
    if (isValid) {
      badge.textContent = `${name}: ACEPTADO`;
      badge.className = 'model-status-badge passed';
    } else {
      badge.textContent = `${name}: RECHAZADO`;
      badge.className = 'model-status-badge failed';
    }
  }
}

// Función interactiva global para abrir detalles de la anomalía
window.showExceptionDetails = function(idx) {
  const exc = currentExceptions[idx];
  const modal = document.getElementById('exception-modal');
  const modalBody = document.getElementById('modal-body-content');
  
  if (!exc || !modal || !modalBody) return;
  
  // Construir detalles
  let assetRowsHtml = '';
  dataset.tickers.forEach((ticker, idx) => {
    const retVal = exc.asset_returns_pct[ticker];
    const isLoss = retVal < 0;
    assetRowsHtml += `
      <div class="contrib-row">
        <span style="font-weight: 500;">
          <span class="dot-color" style="background-color: ${getAssetColor(ticker, idx)}; display: inline-block; margin-right: 0.25rem;"></span>
          ${getAssetFullName(ticker)} (${ticker})
        </span>
        <span style="color: ${isLoss ? 'var(--color-red)' : 'var(--color-green)'}; font-weight: 500;">
          ${retVal.toFixed(3)}%
        </span>
      </div>
    `;
  });
  
  modalBody.innerHTML = `
    <div class="modal-row">
      <span class="backtest-label">Fecha:</span>
      <span style="font-weight: 600;">${exc.date}</span>
    </div>
    <div class="modal-row">
      <span class="backtest-label">Valor en Riesgo (VaR ${exc.conf}%):</span>
      <span style="font-weight: 600;">${exc.var_threshold_pct.toFixed(4)}%</span>
    </div>
    <div class="modal-row total-loss">
      <span style="color: var(--text-primary);">Pérdida Real del Portafolio:</span>
      <span>${exc.portfolio_loss_pct.toFixed(4)}%</span>
    </div>
    <div class="modal-row">
      <span class="backtest-label">Pérdida Promedio en Cola (CVaR):</span>
      <span style="font-weight: 600; color: var(--color-warning);">${exc.cvar_pct.toFixed(4)}%</span>
    </div>
    
    <div class="asset-contributions">
      <div class="contrib-title">Retornos de las Acciones</div>
      ${assetRowsHtml}
    </div>
    
    <p style="font-size: 0.8rem; color: var(--text-secondary); text-align: justify; margin-top: 0.5rem; line-height: 1.35;">
      *Nota: La pérdida real superó la estimación del VaR debido a caídas simultáneas en los activos del portafolio.
    </p>
  `;
  
  // Mostrar modal
  modal.classList.add('active');
};

// Fallback para renderizado de fórmulas si MathJax falla (modo sin conexión)
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!window.MathJax || !window.MathJax.typesetPromise) {
      console.warn("MathJax no disponible (sin conexión). Aplicando formateador unicode de respaldo.");
      
      const mathContainers = [
        {
          element: document.querySelector('#math-modal div:nth-child(2) div[style*="background"]'),
          unicode: 'ln(σ_t²) = ω + β ln(σ_{t-1}²) + α ( |z_{t-1}| - E[|z_{t-1}|] ) + γ z_{t-1}'
        },
        {
          element: document.querySelector('#math-modal div:nth-child(3) div[style*="background"]'),
          unicode: 'CVaR_α = E[ L | L > VaR_α ] = (1/α) ∫_0^α VaR_u du'
        },
        {
          element: document.querySelector('#math-modal div:nth-child(4) div[style*="background"]'),
          unicode: 'LR_POF = -2 ln[ ((1-α)^{T-N} α^N) / ((1-p̂)^{T-N} p̂^N) ] ~ χ²(1)'
        }
      ];
      
      mathContainers.forEach(item => {
        if (item.element) {
          item.element.innerHTML = `<code class="math-fallback-code">${item.unicode}</code>`;
        }
      });
      
      // Reemplazar fórmulas inline básicas en el modal
      const inlineMath = {
        '$z_{t} = \\epsilon_t / \\sigma_t$': 'z_t = ε_t / σ_t',
        '$\\gamma$': 'γ',
        '$\\gamma < 0$': 'γ < 0',
        '$1-\\alpha$': '1 - α',
        '$VaR_{\\alpha}$': 'VaR_α',
        '$CVaR_{\\alpha}$': 'CVaR_α',
        '$t_{\\alpha}$': 't_α',
        '$\\nu$': 'ν',
        '$f_t$': 'f_t',
        '$LR_{POF}$': 'LR_POF',
        '$N$': 'N',
        '$T$': 'T',
        '$\\alpha \\cdot T$': 'α · T',
        '$\\hat{p} = N/T$': 'p̂ = N/T',
        '$H_0: p = \\alpha$': 'H_0: p = α',
        '$H_0$': 'H_0',
        '$\\chi^2(1)$': 'χ²(1)',
        '$LR_{POF} > 3.8415$': 'LR_POF > 3.8415',
        '$H_1$': 'H_1',
        '$< 0.01$': '< 0.01',
        '$\\lambda = 0.940$': 'λ = 0.940'
      };
      
      const modalBody = document.querySelector('#math-modal .modal-body');
      if (modalBody) {
        let html = modalBody.innerHTML;
        for (const [key, value] of Object.entries(inlineMath)) {
          const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(escapedKey, 'g');
          html = html.replace(regex, `<strong style="color: var(--color-accent); font-family: var(--font-family-title);">${value}</strong>`);
        }
        modalBody.innerHTML = html;
      }
    }
  }, 2500);
});

// ==========================================
// FUNCIONES Y MÓDULOS DE RIESGO AVANZADO (PROMPT 4)
// ==========================================

function getAssetColor(ticker, index) {
  const defaultColors = {
    'NVDA': '#6366f1',
    'GOOGL': '#14b8a6',
    'CEG': '#f97316',
    'MU': '#e879f9'
  };
  if (defaultColors[ticker]) return defaultColors[ticker];
  const dynamicColors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4', '#ec4899'];
  return dynamicColors[index % dynamicColors.length];
}

function getAssetFullName(ticker) {
  const names = {
    'NVDA': 'NVIDIA',
    'GOOGL': 'Alphabet',
    'CEG': 'Constellation Energy',
    'MU': 'Micron Technology'
  };
  return names[ticker] || ticker;
}

// 1. Poblador Dinámico de Selectores de UI
function populateDynamicSelectors() {
  const tickers = (dataset && dataset.tickers) ? dataset.tickers : [];
  
  // 1. Selector de activos (EGARCH)
  const assetSel = document.getElementById('asset-selector');
  if (assetSel) {
    assetSel.innerHTML = '';
    tickers.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = `${getAssetFullName(t)} (${t})`;
      assetSel.appendChild(opt);
    });
    if (tickers.includes(activeTicker)) {
      assetSel.value = activeTicker;
    } else if (tickers.length > 0) {
      activeTicker = tickers[0];
      assetSel.value = activeTicker;
    }
  }
  
  // 2. Selectores de EWMA
  const ewmaSelA = document.getElementById('ewma-asset-a');
  const ewmaSelB = document.getElementById('ewma-asset-b');
  if (ewmaSelA && ewmaSelB) {
    ewmaSelA.innerHTML = '';
    ewmaSelB.innerHTML = '';
    tickers.forEach((t, idx) => {
      const optA = document.createElement('option');
      optA.value = t;
      optA.textContent = `${getAssetFullName(t)} (${t})`;
      if (idx === 0) optA.selected = true;
      ewmaSelA.appendChild(optA);
      
      const optB = document.createElement('option');
      optB.value = t;
      optB.textContent = `${getAssetFullName(t)} (${t})`;
      if (idx === Math.min(2, tickers.length - 1)) optB.selected = true;
      ewmaSelB.appendChild(optB);
    });
  }
  
  // 3. Selector de Distribución (Eliminado por simplificación y reubicación)
  
  // 4. Selector de activos a Estresar
  const stressSel = document.getElementById('stress-asset-selector');
  if (stressSel) {
    stressSel.innerHTML = '';
    tickers.forEach((t, idx) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = `${getAssetFullName(t)} (${t})`;
      if (t === 'MU') opt.selected = true;
      stressSel.appendChild(opt);
    });
  }
  
  // 5. Actualizar listado de especificación técnica
  const specList = document.getElementById('spec-assets-list');
  if (specList) {
    specList.textContent = tickers.length > 0 ? tickers.join(', ') : 'Ninguno';
  }
  
  const specSampleRange = document.getElementById('spec-sample-range');
  if (specSampleRange && dataset && dataset.dates && dataset.dates.length > 0) {
    const firstDateFormatted = formatDateToSpanishLong(dataset.dates[0]);
    const lastDateFormatted = formatDateToSpanishLong(dataset.dates[dataset.dates.length - 1]);
    specSampleRange.textContent = `${firstDateFormatted} al ${lastDateFormatted}`;
  }
  
  const specObsCount = document.getElementById('spec-observation-count');
  if (specObsCount && dataset && dataset.dates) {
    specObsCount.textContent = dataset.dates.length.toLocaleString('es-ES');
  }
}

// 2. Cálculo e Ilustración de la Contribución al Riesgo (VaR Componente)
function renderRiskContributions() {
  if (!dataset) return;
  const lambda = parseFloat(document.getElementById('lambda-slider')?.value || dataset.ewma_optimal_lambda);
  const Sigma = getLatestEWMACovariance(lambda);
  const wDec = portfolioWeights.map(w => w / 100.0);
  const K = dataset.tickers.length;
  
  // SigmaW = Sigma * w
  const SigmaW = new Array(K).fill(0);
  let portVar = 0;
  for (let i = 0; i < K; i++) {
    let sum = 0;
    for (let j = 0; j < K; j++) {
      sum += Sigma[i][j] * wDec[j];
    }
    SigmaW[i] = sum;
    portVar += wDec[i] * sum;
  }
  
  if (portVar <= 0) portVar = 1e-8;
  
  const riskContributions = new Array(K);
  for (let i = 0; i < K; i++) {
    riskContributions[i] = (wDec[i] * SigmaW[i]) / portVar;
  }
  
  const ctxRisk = document.getElementById('chart-portfolio-risk');
  if (!ctxRisk) return;
  
  const colors = dataset.tickers.map((t, idx) => getAssetColor(t, idx));
  const labels = dataset.tickers.map(t => `${getAssetFullName(t)} (${t})`);
  
  if (chartPortfolioRisk) {
    chartPortfolioRisk.destroy();
  }
  
  chartPortfolioRisk = new Chart(ctxRisk.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: riskContributions.map(rc => rc * 100.0),
        backgroundColor: colors,
        borderColor: '#0b0f19',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      cutout: '70%'
    }
  });
  
  const legendContainer = document.getElementById('portfolio-risk-legend');
  if (legendContainer) {
    legendContainer.innerHTML = '';
    labels.forEach((label, idx) => {
      const item = document.createElement('div');
      item.className = 'weight-item';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      
      const pctRisk = riskContributions[idx] * 100.0;
      const pctCapital = portfolioWeights[idx];
      const ratio = pctRisk / (pctCapital || 1);
      
      let riskValColor = 'var(--text-primary)';
      if (ratio > 1.3) riskValColor = 'var(--color-red)';
      else if (ratio < 0.7) riskValColor = 'var(--color-green)';
      
      item.innerHTML = `
        <span class="weight-asset">
          <span class="dot-color" style="background-color: ${colors[idx]}"></span>
          ${label}
        </span>
        <span class="weight-val" style="color: ${riskValColor}; font-family: var(--font-family-title);">
          ${pctRisk.toFixed(2)}%
          <span style="font-size: 0.7rem; color: var(--text-secondary); font-weight: normal; margin-left: 0.25rem;">
            (x${ratio.toFixed(2)} cap)
          </span>
        </span>
      `;
      legendContainer.appendChild(item);
    });
  }
}

// Helper de logaritmo de función Gamma para aproximación Student's t PDF
function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let s = 0.99999999999980993;
  const c = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  for (let i = 0; i < c.length; i++) {
    s += c[i] / (x + i + 1);
  }
  const t = x + 7.5;
  return Math.log(Math.sqrt(2 * Math.PI)) + Math.log(s) - t + (x + 0.5) * Math.log(t);
}

// 3. Renderizado del Gráfico Mixto de Distribución Empírica y Curvas Teóricas
// 3. Renderizado del Gráfico Mixto de Distribución Empírica y Curvas Teóricas (Portafolio)
function renderPortfolioDistribution() {
  if (!dataset) return;
  
  let returns = [...currentPortfolioReturnsPct];
  if (returns.length === 0) return;
  
  // 1. Calcular estadísticas descriptivas
  const N = returns.length;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += returns[i];
  const mean = sum / N;
  
  let varSum = 0;
  let kurtSum = 0;
  for (let i = 0; i < N; i++) {
    const diff = returns[i] - mean;
    varSum += diff * diff;
    kurtSum += diff * diff * diff * diff;
  }
  const variance = varSum / N;
  const std = Math.sqrt(variance);
  const kurtosis = (kurtSum / N) / (variance * variance);
  const excessKurtosis = kurtosis - 3.0;
  
  // Grados de libertad estimulación Student's t
  let nu = 4.0 + 6.0 / excessKurtosis;
  if (excessKurtosis <= 0 || isNaN(nu)) {
    nu = 30.0;
  }
  if (nu < 3.0) nu = 3.0;
  if (nu > 30.0) nu = 30.0;
  
  // Parámetro de escala
  const scale = std * Math.sqrt((nu - 2.0) / nu);
  
  // 2. Histograma de Frecuencia de Densidad
  const minRet = Math.min(...returns);
  const maxRet = Math.max(...returns);
  const B = 30;
  const binWidth = (maxRet - minRet) / B;
  
  const binCounts = new Array(B).fill(0);
  returns.forEach(r => {
    let binIndex = Math.floor((r - minRet) / binWidth);
    if (binIndex >= B) binIndex = B - 1;
    if (binIndex < 0) binIndex = 0;
    binCounts[binIndex]++;
  });
  
  const binLabels = [];
  const barData = [];
  const normCurveData = [];
  const studentCurveData = [];
  
  for (let i = 0; i < B; i++) {
    const binCenter = minRet + (i + 0.5) * binWidth;
    binLabels.push(binCenter.toFixed(2));
    
    const density = binCounts[i] / (N * binWidth);
    barData.push(density);
    
    // Normal PDF
    const normPDFVal = Math.exp(-0.5 * Math.pow((binCenter - mean) / std, 2)) / (std * Math.sqrt(2 * Math.PI));
    normCurveData.push(normPDFVal);
    
    // Student's t PDF
    const z = (binCenter - mean) / scale;
    const logNum = logGamma((nu + 1) / 2) - logGamma(nu / 2);
    const logDen = 0.5 * Math.log(nu * Math.PI) + Math.log(scale) + ((nu + 1) / 2) * Math.log(1.0 + (z * z) / nu);
    const studPDFVal = Math.exp(logNum - logDen);
    studentCurveData.push(studPDFVal);
  }
  
  // 3. Imprimir caja informativa
  const statsBox = document.getElementById('portfolio-distribution-stats');
  if (statsBox) {
    statsBox.innerHTML = `
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Observaciones</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kpi">KPI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KPI Observaciones: Cantidad de datos históricos diarios en la muestra.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">${N}</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Retorno Medio</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kpi">KPI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KPI Retorno Medio: Rendimiento logarítmico promedio diario.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">${mean.toFixed(5)}%</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Volatilidad (Std Dev)</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kpi">KPI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KPI Volatilidad: Desviación estándar diaria de los retornos (dispersión).</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">${std.toFixed(5)}%</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Curtosis Total</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kri">KRI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KRI Curtosis Total: Medida del grosor de las colas y concentración central.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--color-warning);">${kurtosis.toFixed(4)}</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Exceso Curtosis</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kri">KRI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KRI Exceso Curtosis: Medida de leptocurtosis. Mayor a 0 indica colas más pesadas que la Normal.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: ${excessKurtosis > 0 ? 'var(--color-red)' : 'var(--text-primary)'};">${excessKurtosis.toFixed(4)}</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Grados Libertad (t)</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kpi">KPI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KPI Grados Libertad: Parámetro de la distribución t-Student. Menor valor implica colas más gruesas.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--color-accent);">${nu.toFixed(2)}</span>
      </div>
    `;
  }
  
  // 4. Dibujar Gráfico
  const ctx = document.getElementById('chart-portfolio-distribution');
  if (!ctx) return;
  
  if (chartPortfolioDistribution) {
    chartPortfolioDistribution.destroy();
  }
  
  chartPortfolioDistribution = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: binLabels,
      datasets: [
        {
          label: 'Densidad Empírica (Hist)',
          data: barData,
          backgroundColor: 'rgba(156, 163, 175, 0.25)',
          borderColor: 'rgba(156, 163, 175, 0.5)',
          borderWidth: 1,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
          order: 3
        },
        {
          type: 'line',
          label: 'Normal Teórica (PDF)',
          data: normCurveData,
          borderColor: '#3b82f6',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 2
        },
        {
          type: 'line',
          label: `t-Student Teórica (df=${nu.toFixed(1)})`,
          data: studentCurveData,
          borderColor: '#f43f5e',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#f3f4f6' }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Centros de Bins de Retornos (%)', color: '#f3f4f6' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#9ca3af', maxTicksLimit: 12 }
        },
        y: {
          title: { display: true, text: 'Densidad de Probabilidad', color: '#f3f4f6' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#9ca3af' }
        }
      }
    }
  });
}

// 3b. Renderizado del Gráfico Mixto de Distribución Empírica y Curvas Teóricas (Activo Individual)
function renderAssetDistribution(ticker) {
  if (!dataset || !dataset.assets[ticker]) return;
  
  let returns = [...dataset.assets[ticker].returns_pct];
  if (returns.length === 0) return;
  
  // 1. Calcular estadísticas descriptivas
  const N = returns.length;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += returns[i];
  const mean = sum / N;
  
  let varSum = 0;
  let kurtSum = 0;
  for (let i = 0; i < N; i++) {
    const diff = returns[i] - mean;
    varSum += diff * diff;
    kurtSum += diff * diff * diff * diff;
  }
  const variance = varSum / N;
  const std = Math.sqrt(variance);
  const kurtosis = (kurtSum / N) / (variance * variance);
  const excessKurtosis = kurtosis - 3.0;
  
  // Grados de libertad estimulación Student's t
  let nu = 4.0 + 6.0 / excessKurtosis;
  if (excessKurtosis <= 0 || isNaN(nu)) {
    nu = 30.0;
  }
  if (nu < 3.0) nu = 3.0;
  if (nu > 30.0) nu = 30.0;
  
  // Parámetro de escala
  const scale = std * Math.sqrt((nu - 2.0) / nu);
  
  // 2. Histograma de Frecuencia de Densidad
  const minRet = Math.min(...returns);
  const maxRet = Math.max(...returns);
  const B = 30;
  const binWidth = (maxRet - minRet) / B;
  
  const binCounts = new Array(B).fill(0);
  returns.forEach(r => {
    let binIndex = Math.floor((r - minRet) / binWidth);
    if (binIndex >= B) binIndex = B - 1;
    if (binIndex < 0) binIndex = 0;
    binCounts[binIndex]++;
  });
  
  const binLabels = [];
  const barData = [];
  const normCurveData = [];
  const studentCurveData = [];
  
  for (let i = 0; i < B; i++) {
    const binCenter = minRet + (i + 0.5) * binWidth;
    binLabels.push(binCenter.toFixed(2));
    
    const density = binCounts[i] / (N * binWidth);
    barData.push(density);
    
    // Normal PDF
    const normPDFVal = Math.exp(-0.5 * Math.pow((binCenter - mean) / std, 2)) / (std * Math.sqrt(2 * Math.PI));
    normCurveData.push(normPDFVal);
    
    // Student's t PDF
    const z = (binCenter - mean) / scale;
    const logNum = logGamma((nu + 1) / 2) - logGamma(nu / 2);
    const logDen = 0.5 * Math.log(nu * Math.PI) + Math.log(scale) + ((nu + 1) / 2) * Math.log(1.0 + (z * z) / nu);
    const studPDFVal = Math.exp(logNum - logDen);
    studentCurveData.push(studPDFVal);
  }
  
  // 3. Imprimir caja informativa
  const statsBox = document.getElementById('asset-distribution-stats');
  if (statsBox) {
    statsBox.innerHTML = `
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Observaciones</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kpi">KPI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KPI Observaciones: Cantidad de datos históricos diarios en la muestra.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">${N}</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Retorno Medio</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kpi">KPI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KPI Retorno Medio: Rendimiento logarítmico promedio diario.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">${mean.toFixed(5)}%</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Volatilidad (Std Dev)</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kpi">KPI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KPI Volatilidad: Desviación estándar diaria de los retornos (dispersión).</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">${std.toFixed(5)}%</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Curtosis Total</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kri">KRI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KRI Curtosis Total: Medida del grosor de las colas y concentración central.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--color-warning);">${kurtosis.toFixed(4)}</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Exceso Curtosis</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kri">KRI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KRI Exceso Curtosis: Medida de leptocurtosis. Mayor a 0 indica colas más pesadas que la Normal.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: ${excessKurtosis > 0 ? 'var(--color-red)' : 'var(--text-primary)'};">${excessKurtosis.toFixed(4)}</span>
      </div>
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.15rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Grados Libertad (t)</span>
          <span style="display: flex; align-items: center; gap: 0.25rem;">
            <span class="badge-kpi">KPI</span>
            <span class="tooltip-container"><i class="fa-solid fa-info-circle"></i><span class="tooltip-text">KPI Grados Libertad: Parámetro de la distribución t-Student. Menor valor implica colas más gruesas.</span></span>
          </span>
        </div>
        <span style="font-size: 0.95rem; font-weight: 600; color: var(--color-accent);">${nu.toFixed(2)}</span>
      </div>
    `;
  }
  
  // 4. Dibujar Gráfico
  const ctx = document.getElementById('chart-asset-distribution');
  if (!ctx) return;
  
  if (chartAssetDistribution) {
    chartAssetDistribution.destroy();
  }
  
  chartAssetDistribution = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: binLabels,
      datasets: [
        {
          label: 'Densidad Empírica (Hist)',
          data: barData,
          backgroundColor: 'rgba(156, 163, 175, 0.25)',
          borderColor: 'rgba(156, 163, 175, 0.5)',
          borderWidth: 1,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
          order: 3
        },
        {
          type: 'line',
          label: 'Normal Teórica (PDF)',
          data: normCurveData,
          borderColor: '#3b82f6',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 2
        },
        {
          type: 'line',
          label: `t-Student Teórica (df=${nu.toFixed(1)})`,
          data: studentCurveData,
          borderColor: '#f43f5e',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#f3f4f6' }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Centros de Bins de Retornos (%)', color: '#f3f4f6' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#9ca3af', maxTicksLimit: 12 }
        },
        y: {
          title: { display: true, text: 'Densidad de Probabilidad', color: '#f3f4f6' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#9ca3af' }
        }
      }
    }
  });
}

// 4. Drag & Drop Gestor de Carga (.csv) en Frontend
function setupCSVUploader() {
  const zone = document.getElementById('csv-drag-drop-zone');
  const fileInput = document.getElementById('csv-file-input');
  const alertDiv = document.getElementById('upload-status-alert');
  const tickerContainer = document.getElementById('ticker-input-container');
  const tickerInput = document.getElementById('new-asset-ticker');
  const btnCancel = document.getElementById('btn-cancel-upload');
  const btnSubmit = document.getElementById('btn-submit-upload');
  
  if (!zone || !fileInput) return;
  
  let uploadedFileContent = null;
  
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--color-brand)';
    zone.style.backgroundColor = 'rgba(79, 70, 229, 0.04)';
  });
  
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = 'var(--border-color)';
    zone.style.backgroundColor = 'rgba(255,255,255,0.01)';
  });
  
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--border-color)';
    zone.style.backgroundColor = 'rgba(255,255,255,0.01)';
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });
  
  zone.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });
  
  function handleFileSelected(file) {
    if (!file.name.endsWith('.csv')) {
      showAlert('Error: Solo se admiten archivos en formato .csv.', 'error');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = function(evt) {
      uploadedFileContent = evt.target.result;
      
      let suggestedTicker = file.name.replace('.csv', '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (suggestedTicker.length > 5) suggestedTicker = suggestedTicker.slice(0, 5);
      tickerInput.value = suggestedTicker;
      
      tickerContainer.style.display = 'flex';
      showAlert(`Archivo "${file.name}" listo. Digite el ticker para validar y consolidar.`, 'info');
    };
    reader.readAsText(file);
  }
  
  function showAlert(msg, type) {
    alertDiv.style.display = 'block';
    alertDiv.innerHTML = msg;
    
    if (type === 'error') {
      alertDiv.style.backgroundColor = 'rgba(244, 63, 94, 0.1)';
      alertDiv.style.border = '1px solid rgba(244, 63, 94, 0.3)';
      alertDiv.style.color = 'var(--color-red)';
    } else if (type === 'success') {
      alertDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
      alertDiv.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      alertDiv.style.color = 'var(--color-green)';
    } else {
      alertDiv.style.backgroundColor = 'rgba(79, 70, 229, 0.1)';
      alertDiv.style.border = '1px solid rgba(79, 70, 229, 0.3)';
      alertDiv.style.color = 'var(--text-primary)';
    }
  }
  
  btnCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    tickerContainer.style.display = 'none';
    alertDiv.style.display = 'none';
    uploadedFileContent = null;
    fileInput.value = '';
    tickerInput.value = '';
  });
  
  btnSubmit.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ticker = tickerInput.value.trim().toUpperCase();
    if (!ticker || ticker.length < 2) {
      showAlert('Error: El ticker debe ser de 2 a 5 letras alfanuméricas.', 'error');
      return;
    }
    
    showAlert('<i class="fa-solid fa-spinner fa-spin"></i> Validando estacionariedad e imputando nulos en el backend...', 'info');
    btnSubmit.disabled = true;
    
    try {
      const response = await fetch(`/api/upload?ticker=${encodeURIComponent(ticker)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/csv'
        },
        body: uploadedFileContent
      });
      
      const data = await response.json();
      btnSubmit.disabled = false;
      
      if (data.success) {
        showAlert(`<i class="fa-solid fa-circle-check"></i> ${data.message}<br>Actualizando base de datos...`, 'success');
        setTimeout(() => {
          window.location.reload();
        }, 2200);
      } else {
        const pValStr = data.p_value !== undefined ? `<br><strong>p-valor ADF:</strong> ${data.p_value.toFixed(6)}` : '';
        showAlert(`<i class="fa-solid fa-triangle-exclamation"></i> <strong>Error de Validación:</strong> ${data.error}${pValStr}`, 'error');
      }
    } catch (err) {
      btnSubmit.disabled = false;
      showAlert(`Error de conexión con el backend: ${err.message}`, 'error');
    }
  });
}

// Renderizar lista de activos para eliminación con soporte UI premium
function renderPortfolioAssetsDeleteList() {
  const container = document.getElementById('portfolio-assets-delete-list');
  if (!container || !dataset) return;
  const tickers = dataset.tickers || [];
  
  container.innerHTML = '';
  
  if (tickers.length === 0) {
    container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 0.5rem;">No hay activos en el portafolio.</div>';
    return;
  }
  
  tickers.forEach(ticker => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.background = 'rgba(15, 23, 42, 0.4)';
    row.style.padding = '0.35rem 0.6rem';
    row.style.borderRadius = '4px';
    row.style.border = '1px solid var(--border-color)';
    row.style.transition = 'var(--transition-fast)';
    
    row.innerHTML = `
      <span style="font-size: 0.82rem; font-family: var(--font-family-title); font-weight: 500; color: var(--text-primary);">${ticker}</span>
      <button class="delete-asset-btn" data-ticker="${ticker}" style="background: transparent; border: none; color: var(--color-red); cursor: pointer; font-size: 0.82rem; padding: 0.25rem; display: flex; align-items: center; justify-content: center; transition: var(--transition-fast);" title="Eliminar activo del portafolio">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    
    // Efecto visual hover sobre las filas de activos
    row.addEventListener('mouseenter', () => {
      row.style.borderColor = 'rgba(244, 63, 94, 0.3)';
      row.style.backgroundColor = 'rgba(244, 63, 94, 0.02)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.borderColor = 'var(--border-color)';
      row.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
    });
    
    const btn = row.querySelector('.delete-asset-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteAsset(ticker);
    });
    
    container.appendChild(row);
  });
}

// Enviar petición POST de borrado de activos al backend
async function handleDeleteAsset(ticker) {
  const confirmed = confirm(`¿Estás seguro de que deseas eliminar el activo "${ticker}" del portafolio? Esto actualizará todas las estimaciones de volatilidad, gráficas y reportes cuantitativos.`);
  if (!confirmed) return;
  
  const alertDiv = document.getElementById('upload-status-alert');
  if (alertDiv) {
    alertDiv.style.display = 'block';
    alertDiv.style.backgroundColor = 'rgba(79, 70, 229, 0.1)';
    alertDiv.style.border = '1px solid rgba(79, 70, 229, 0.3)';
    alertDiv.style.color = 'var(--text-primary)';
    alertDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Eliminando ${ticker} y recalculando el modelo econométrico completo en el backend...`;
  }
  
  try {
    const response = await fetch(`/api/delete?ticker=${encodeURIComponent(ticker)}`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (data.success) {
      if (alertDiv) {
        alertDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        alertDiv.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        alertDiv.style.color = 'var(--color-green)';
        alertDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${data.message}<br>Recargando datos actualizados...`;
      }
      setTimeout(() => {
        window.location.reload();
      }, 2200);
    } else {
      if (alertDiv) {
        alertDiv.style.backgroundColor = 'rgba(244, 63, 94, 0.1)';
        alertDiv.style.border = '1px solid rgba(244, 63, 94, 0.3)';
        alertDiv.style.color = 'var(--color-red)';
        alertDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Error al eliminar:</strong> ${data.error}`;
      }
    }
  } catch (err) {
    if (alertDiv) {
      alertDiv.style.backgroundColor = 'rgba(244, 63, 94, 0.1)';
      alertDiv.style.border = '1px solid rgba(244, 63, 94, 0.3)';
      alertDiv.style.color = 'var(--color-red)';
      alertDiv.innerHTML = `Error de conexión con el backend: ${err.message}`;
    }
  }
}

// 5. Mapeo del Último Covarianza EWMA
function getLatestEWMACovariance(lambda) {
  const K = dataset.tickers.length;
  const T = dataset.dates.length;
  const R = precomputedReturns;
  
  let Sigma = calculateSampleCovariance(R, 50);
  
  for (let t = 1; t < T; t++) {
    const R_prev = R[t-1];
    for (let i = 0; i < K; i++) {
      const r_i = R_prev[i];
      for (let j = 0; j < K; j++) {
        Sigma[i][j] = lambda * Sigma[i][j] + (1.0 - lambda) * (r_i * R_prev[j]);
      }
    }
  }
  return Sigma;
}

// 6. Simulación e Interconexión de Escenarios de Stress Testing
function setupStressTesting() {
  const assetSel = document.getElementById('stress-asset-selector');
  const slider = document.getElementById('stress-shock-slider');
  const valueLabel = document.getElementById('stress-shock-value');
  const btnReset = document.getElementById('btn-reset-stress');
  
  if (!assetSel || !slider || !valueLabel) return;
  
  assetSel.addEventListener('change', runStressSimulation);
  slider.addEventListener('input', runStressSimulation);
  btnReset.addEventListener('click', () => {
    slider.value = 0;
    runStressSimulation();
  });
  
  window.runStressSimulation = runStressSimulation;
  
  function runStressSimulation() {
    const ticker = assetSel.value;
    const shockPct = parseFloat(slider.value);
    
    valueLabel.textContent = `${shockPct > 0 ? '+' : ''}${shockPct.toFixed(1)}%`;
    if (shockPct < 0) {
      valueLabel.style.color = 'var(--color-red)';
    } else if (shockPct > 0) {
      valueLabel.style.color = 'var(--color-green)';
    } else {
      valueLabel.style.color = 'var(--text-secondary)';
    }
    
    const tickers = dataset.tickers;
    const K = tickers.length;
    const kStar = tickers.indexOf(ticker);
    if (kStar === -1) return;
    
    const r_kStar = shockPct / 100.0;
    
    const lambda = parseFloat(document.getElementById('lambda-slider')?.value || dataset.ewma_optimal_lambda);
    const Sigma = getLatestEWMACovariance(lambda);
    
    const Sigma_k_k = Sigma[kStar][kStar];
    const betas = new Array(K).fill(0);
    const expectedReturns = new Array(K).fill(0);
    
    for (let j = 0; j < K; j++) {
      betas[j] = Sigma_k_k > 0 ? Sigma[j][kStar] / Sigma_k_k : 0;
      expectedReturns[j] = betas[j] * r_kStar;
    }
    
    const wDec = portfolioWeights.map(w => w / 100.0);
    let stressedPortfolioReturnDec = 0;
    for (let i = 0; i < K; i++) {
      stressedPortfolioReturnDec += wDec[i] * expectedReturns[i];
    }
    
    let portVar = 0;
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        portVar += wDec[i] * wDec[j] * Sigma[i][j];
      }
    }
    const portVol = Math.sqrt(portVar);
    
    const nu = dataset.portfolio.nu;
    const std_factor = Math.sqrt((nu - 2.0) / nu);
    const var_f_95 = -getStudentQuantile(0.05, nu) * std_factor;
    const cvar_f_95 = getCVaRFactor(0.95, nu);
    
    const stressedVar95 = (-stressedPortfolioReturnDec + portVol * var_f_95) * 100.0;
    const stressedCvar95 = (-stressedPortfolioReturnDec + portVol * cvar_f_95) * 100.0;
    
    const baseVar95 = currentPortfolioVar95[currentPortfolioVar95.length - 1];
    const baseCvar95 = currentPortfolioCvar95[currentPortfolioCvar95.length - 1];
    
    document.getElementById('stress-portfolio-return').textContent = `${(stressedPortfolioReturnDec * 100.0).toFixed(4)}%`;
    if (stressedPortfolioReturnDec < 0) {
      document.getElementById('stress-portfolio-return').style.color = 'var(--color-red)';
    } else if (stressedPortfolioReturnDec > 0) {
      document.getElementById('stress-portfolio-return').style.color = 'var(--color-green)';
    } else {
      document.getElementById('stress-portfolio-return').style.color = 'var(--text-primary)';
    }
    
    document.getElementById('stress-var-95').textContent = `${stressedVar95.toFixed(4)}%`;
    document.getElementById('stress-base-var-95').textContent = `${baseVar95.toFixed(4)}%`;
    const changeVar95 = stressedVar95 - baseVar95;
    const changeVarPct95 = (changeVar95 / baseVar95) * 100.0;
    document.getElementById('stress-change-var-95').textContent = `${changeVar95 >= 0 ? '+' : ''}${changeVar95.toFixed(3)}% (${changeVar95 >= 0 ? '+' : ''}${changeVarPct95.toFixed(1)}%)`;
    document.getElementById('stress-change-var-95').style.color = changeVar95 >= 0 ? 'var(--color-red)' : 'var(--color-green)';
    
    document.getElementById('stress-cvar-95').textContent = `${stressedCvar95.toFixed(4)}%`;
    document.getElementById('stress-base-cvar-95').textContent = `${baseCvar95.toFixed(4)}%`;
    const changeCvar95 = stressedCvar95 - baseCvar95;
    const changeCvarPct95 = (changeCvar95 / baseCvar95) * 100.0;
    document.getElementById('stress-change-cvar-95').textContent = `${changeCvar95 >= 0 ? '+' : ''}${changeCvar95.toFixed(3)}% (${changeCvar95 >= 0 ? '+' : ''}${changeCvarPct95.toFixed(1)}%)`;
    document.getElementById('stress-change-cvar-95').style.color = changeCvar95 >= 0 ? 'var(--color-red)' : 'var(--color-green)';
    
    const listContainer = document.getElementById('stress-contagion-list');
    if (listContainer) {
      listContainer.innerHTML = '';
      tickers.forEach((t, idx) => {
        const retPct = expectedReturns[idx] * 100.0;
        const beta = betas[idx];
        const isShocked = idx === kStar;
        const color = retPct < 0 ? 'var(--color-red)' : (retPct > 0 ? 'var(--color-green)' : 'var(--text-secondary)');
        
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.gap = '0.2rem';
        item.style.padding = '0.35rem 0.5rem';
        item.style.background = isShocked ? 'rgba(244, 63, 94, 0.05)' : 'rgba(255,255,255,0.01)';
        item.style.border = isShocked ? '1px solid rgba(244, 63, 94, 0.2)' : '1px solid rgba(255,255,255,0.03)';
        item.style.borderRadius = '6px';
        
        const absVal = Math.min(100, (Math.abs(retPct) / 30.0) * 100.0);
        
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
            <span>
              <span class="dot-color" style="background-color: ${getAssetColor(t, idx)}; display: inline-block; margin-right: 0.25rem;"></span>
              <strong>${t}</strong> 
              <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 0.25rem;">
                ${isShocked ? '(Shocked)' : `(Beta: ${beta.toFixed(3)})`}
              </span>
            </span>
            <span style="color: ${color}; font-weight: bold;">${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%</span>
          </div>
          <div style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; width: 100%; overflow: hidden; position: relative;">
            <div style="height: 100%; width: ${absVal}%; background: ${color}; position: absolute; left: 0;"></div>
          </div>
        `;
        listContainer.appendChild(item);
      });
    }
  }
}

function displayEmptyStateMessage() {
  const message = "Añade al menos 2 activos en el Gestor para habilitar el análisis de correlación y riesgo";
  
  // 1. Mostrar banner en el tab de inicio
  const inicioPanel = document.getElementById('inicio');
  if (inicioPanel) {
    if (!document.getElementById('empty-portfolio-banner')) {
      const banner = document.createElement('div');
      banner.id = 'empty-portfolio-banner';
      banner.style = "margin-top: 1rem; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; padding: 1rem 1.25rem; display: flex; align-items: center; gap: 0.75rem; color: #f43f5e;";
      banner.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.25rem; flex-shrink: 0;"></i>
        <div style="flex-grow: 1;">
          <h4 style="margin: 0 0 0.15rem 0; font-size: 0.88rem; font-weight: 600; color: var(--text-primary);">Portafolio con activos insuficientes</h4>
          <p style="margin: 0; font-size: 0.78rem; color: var(--text-secondary);">${message}</p>
        </div>
      `;
      // Insertar después del primer elemento (hero-section o banner de contexto académico)
      const academicBanner = inicioPanel.querySelector('div[style*="background: rgba(79, 70, 229, 0.08)"]');
      if (academicBanner) {
        academicBanner.parentNode.insertBefore(banner, academicBanner.nextSibling);
      } else {
        inicioPanel.insertBefore(banner, inicioPanel.firstChild);
      }
    }
  }
  
  // 2. Reemplazar contenido de otras pestañas con un mensaje amigable
  const panelsToReplace = ['egarch', 'ewma', 'overview', 'backtest'];
  panelsToReplace.forEach(panelId => {
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.innerHTML = `
        <div class="card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; text-align: center; padding: 3rem; margin: 2rem auto; max-width: 600px; border: 1px dashed var(--border-color);">
          <div style="background: rgba(244, 63, 94, 0.1); color: #f43f5e; width: 4.5rem; height: 4.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; margin-bottom: 1.5rem;">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem; color: var(--text-primary);">Análisis Inhabilitado</h2>
          <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">
            ${message}.
            Actualmente el portafolio tiene ${dataset && dataset.tickers ? dataset.tickers.length : 0} activos.
          </p>
          <button class="tab-btn" onclick="document.querySelector('.tab-btn[data-tab=\\'inicio\\']').click()" style="background: var(--color-brand); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-family: var(--font-family-title); font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem; transition: var(--transition-fast);">
            <i class="fa-solid fa-folder-plus"></i> Ir al Gestor de Portafolio
          </button>
        </div>
      `;
    }
  });
}

