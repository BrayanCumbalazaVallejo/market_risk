# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=[('index.html', '.'), ('styles.css', '.'), ('app.js', '.'), ('data/processed/dashboard_data.json', 'data/processed'), ('data/raw', 'data/raw')],
    hiddenimports=['server', 'src.export_dashboard_data', 'src.risk_model', 'scipy.optimize._highspy'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'seaborn', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'wx',
        'matplotlib.backends.backend_qt5agg', 'matplotlib.backends.backend_qt6agg',
        'matplotlib.backends.backend_wxagg', 'matplotlib.backends.backend_gtk3agg',
        'matplotlib.backends.backend_gtk4agg',
        'matplotlib.backends.backend_tkagg', 'matplotlib.backends.backend_pdf',
        'matplotlib.backends.backend_svg', 'matplotlib.backends.backend_ps',
        'matplotlib.backends.backend_pgf',
        'numpy.tests', 'scipy.tests', 'pandas.tests', 'matplotlib.tests',
        'PIL._avif', 'PIL._webp', 'PIL._imagingcms',
        'sqlite3', '_sqlite3', 'pydoc_data',
        'torch', 'torchvision', 'h5py', 'tensorflow', 'tensorboard',
        'IPython', 'ipykernel', 'notebook', 'jedi', 'astropy', 'sympy'
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='Proyecto_Riesgo_Mercado',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
