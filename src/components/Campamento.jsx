import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Campamento.module.css';
import {
  COLORS,
  STAFF,
  cloudEnabled,
  fetchPeople,
  loadState,
  norm,
  pickColors,
  saveState,
} from '../lib/campamento';
import {
  IconActualizar,
  IconBusqueda,
  IconAvisos,
  IconAsistencia,
  IconCheck,
  IconDeshacer,
  IconWarning,
  IconCloudCheck,
  IconWhatsApp,
} from './icons';
import cjrLogo from '../assets/28.png';

const GROUPS = [...COLORS, STAFF];
const COLOR_OPTIONS = [
  { name: '', label: 'Sin color', hex: null },
  ...COLORS.map((c) => ({ name: c.name, label: c.name, hex: c.hex, ink: c.ink })),
];

const titleCase = (s = '') => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '');
const firstName = (n = '') => titleCase(n.split(' ')[0]);
const shortDate = (iso) => new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
const waLink = (r) =>
  `https://wa.me/${r.tel}?text=${encodeURIComponent(`Hola ${firstName(r.nombre)}, tu color para el campamento es ${r.colorName}.`)}`;

const getColorObj = (r) => {
  if (r.rol === 'staff' || r.colorName === STAFF.name) return STAFF;
  if (r.colorName) {
    return COLORS.find((c) => c.name === r.colorName) || null;
  }
  return null;
};

const getRowBorderColor = (r) => {
  const colorObj = getColorObj(r);
  if (colorObj) {
    if (colorObj.name === STAFF.name) return '#64748b';
    return colorObj.hex;
  }
  return '#cbd5e1';
};

export default function Campamento() {
  const [people, setPeople] = useState([]);
  const [saved, setSaved] = useState({});
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [syncStatus, setSyncStatus] = useState('saved'); // 'saved' | 'saving' | 'error'
  const [gistFallback, setGistFallback] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('todos'); // 'todos' | 'sincolor' | 'sinavisar' | 'faltan'
  const [colorFilter, setColorFilter] = useState(null);
  const [tab, setTab] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') || 'avisos' : 'avisos'));
  const [confirmingSendId, setConfirmingSendId] = useState(null);
  const [showBalance, setShowBalance] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Estado del menú desplegable de color con createPortal
  const [openColorMenu, setOpenColorMenu] = useState(null);
  const [activeOptionIdx, setActiveOptionIdx] = useState(0);
  const triggerRefs = useRef({});
  const menuRef = useRef(null);
  const savedRef = useRef({});

  // Carga inicial y recarga
  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const [list, gistResult] = await Promise.all([fetchPeople(), loadState()]);
      const state = gistResult.state || {};
      savedRef.current = state;
      setSaved(state);
      setGistFallback(Boolean(gistResult.fallback));
      setPeople(list);
      setStatus('ready');
      setSyncStatus('saved');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Persistencia: solo color, enviado y asistio
  const commit = useCallback((next) => {
    savedRef.current = next;
    setSaved(next);
    setSyncStatus('saving');
    saveState(next)
      .then(() => {
        setSyncStatus('saved');
        setSaveError('');
      })
      .catch((e) => {
        setSyncStatus('error');
        setSaveError(e.message);
      });
  }, []);

  const patch = useCallback((id, p) => commit({ ...savedRef.current, [id]: { ...savedRef.current[id], ...p } }), [commit]);

  // Filas: rol, genero y tel provienen EXCLUSIVAMENTE del Excel
  const rows = useMemo(() => people.map((p) => {
    const st = saved[p.id] || {};
    const rol = p.isStaff ? 'staff' : 'participante';
    return {
      ...p,
      rol,
      colorName: rol === 'staff' ? STAFF.name : (st.color || ''),
      enviado: st.enviado || '',
      asistio: Boolean(st.asistio),
    };
  }), [people, saved]);

  const hasDuplicateTs = useMemo(() => rows.some((r) => r.hasDuplicateTs), [rows]);

  const picks = useMemo(() => pickColors(rows), [rows]);
  const toAssign = Object.keys(picks).length;

  const assign = () => {
    if (!toAssign) return;
    const next = { ...savedRef.current };
    for (const [id, color] of Object.entries(picks)) {
      next[id] = { ...next[id], color };
    }
    commit(next);
  };

  useEffect(() => {
    if (status === 'ready' && cloudEnabled && toAssign > 0) {
      assign();
    }
  }, [status, toAssign]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeColor = useCallback((r, color) => {
    if (r.enviado && !window.confirm(`${firstName(r.nombre)} ya fue avisado. ¿Cambiar su color y volver a avisarle?`)) {
      return;
    }
    patch(r.id, { color, enviado: '' });
  }, [patch]);

  // Abrir y posicionar el menú de color
  const handleToggleColorMenu = (r) => {
    if (openColorMenu?.id === r.id) {
      setOpenColorMenu(null);
      return;
    }
    const triggerEl = triggerRefs.current[r.id];
    if (!triggerEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const menuEstimatedHeight = 236; // 5 opciones x 44px + padding y borde
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Si debajo no cabe el menú completo, ábrelo hacia arriba
    const spaceBelow = viewportHeight - rect.bottom;
    const openUpwards = spaceBelow < menuEstimatedHeight && rect.top > spaceBelow;

    const top = openUpwards ? null : Math.round(rect.bottom + 4);
    const bottom = openUpwards ? Math.max(8, Math.round(viewportHeight - rect.top + 4)) : null;
    const minWidth = Math.max(Math.round(rect.width), 150);

    // Si se sale por la derecha de la pantalla, alinéalo al borde derecho del botón
    const overflowsRight = rect.left + minWidth > viewportWidth - 8;
    const alignRight = overflowsRight;
    const left = alignRight ? null : Math.max(8, Math.round(rect.left));
    const right = alignRight ? Math.max(8, Math.round(viewportWidth - rect.right)) : null;

    const currentIdx = COLOR_OPTIONS.findIndex((c) => c.name === r.colorName);
    setActiveOptionIdx(currentIdx >= 0 ? currentIdx : 0);

    setOpenColorMenu({
      id: r.id,
      row: r,
      top,
      bottom,
      left,
      right,
      alignRight,
      minWidth,
      openUpwards,
      triggerRect: rect,
    });
  };

  const closeColorMenu = useCallback((restoreFocus = false) => {
    setOpenColorMenu((current) => {
      if (!current) return null;
      if (restoreFocus && current.id && triggerRefs.current[current.id]) {
        setTimeout(() => {
          triggerRefs.current[current.id]?.focus();
        }, 0);
      }
      return null;
    });
  }, []);

  // Eventos de teclado, clic fuera, scroll y resize para cerrar el menú
  useEffect(() => {
    if (!openColorMenu) return;

    const handleScrollOrResize = () => {
      closeColorMenu(false);
    };

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        const triggerEl = triggerRefs.current[openColorMenu.id];
        if (triggerEl && triggerEl.contains(e.target)) return;
        closeColorMenu(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeColorMenu(true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveOptionIdx((prev) => (prev + 1) % COLOR_OPTIONS.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveOptionIdx((prev) => (prev - 1 + COLOR_OPTIONS.length) % COLOR_OPTIONS.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedOption = COLOR_OPTIONS[activeOptionIdx];
        if (selectedOption) {
          changeColor(openColorMenu.row, selectedOption.name);
          closeColorMenu(true);
        }
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openColorMenu, activeOptionIdx, closeColorMenu, changeColor]);

  const visible = rows.filter((r) => {
    if (query && !norm(`${r.nombre} ${r.iglesia}`).includes(norm(query))) return false;
    if (colorFilter && r.colorName !== colorFilter) return false;
    if (filter === 'sincolor') return r.rol === 'participante' && !r.colorName;
    if (filter === 'sinavisar') return r.colorName && !r.enviado;
    if (filter === 'faltan') return !r.asistio;
    return true;
  });

  const churches = [...new Set(rows.filter((r) => r.rol === 'participante').map((r) => r.iglesia))].sort();
  const totalCount = rows.length;
  const avisadosCount = rows.filter((r) => r.enviado).length;
  const asistieronCount = rows.filter((r) => r.asistio).length;
  const avisadosPct = totalCount ? Math.round((avisadosCount / totalCount) * 100) : 0;
  const asistieronPct = totalCount ? Math.round((asistieronCount / totalCount) * 100) : 0;
  const avisosPendientes = rows.filter((r) => !r.enviado && r.colorName).length;

  if (status === 'loading') {
    return (
      <div className={styles.center}>
        <div className={styles.loadingSpinner} />
        <p>Cargando inscritos del campamento…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.center}>
        <IconWarning size={32} weight="bold" color="#991b1b" />
        <p>{error}</p>
        <button type="button" className={styles.btnSecundario} onClick={load}>
          <IconActualizar />
          <span>Reintentar</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.appLayout}>
      {/* ====================================================================
          1. PANEL LATERAL DE ESCRITORIO (>= 1024px)
          ==================================================================== */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.sidebarBrand}>
            <div className={styles.logoCircleWrapper}>
              <img src={cjrLogo} alt="CJR 28" className={styles.sidebarLogo} />
            </div>
            <div className={styles.sidebarBrandText}>
              <h2>AGIOS 2026</h2>
              <span className={`${styles.saveBadge} ${styles[syncStatus]}`}>
                <IconCloudCheck size={14} weight="bold" />
                <span>{cloudEnabled ? (syncStatus === 'saving' ? 'Sincronizando…' : 'Sincronizado') : 'Guardado local'}</span>
              </span>
            </div>
          </div>

          <div className={styles.sidebarSection}>
            <span className={styles.sidebarSectionTitle}>Filtrar por estado</span>
            <div className={styles.sidebarFilterList}>
              {[
                { id: 'todos', label: 'Todos los inscritos', count: rows.length },
                { id: 'sincolor', label: 'Sin asignar', count: rows.filter((r) => r.rol === 'participante' && !r.colorName).length },
                { id: 'sinavisar', label: 'Sin avisar', count: avisosPendientes },
                { id: 'faltan', label: 'Faltan llegar', count: rows.filter((r) => !r.asistio).length },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.sidebarFilterBtn} ${filter === c.id ? styles.sidebarFilterBtnActive : ''}`}
                  onClick={() => setFilter(c.id)}
                >
                  <span>{c.label}</span>
                  <span className={styles.sidebarFilterCount}>{c.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.sidebarBottom}>
          <span className={styles.sidebarSectionTitle}>Progreso general</span>
          <div className={styles.sidebarMetrics}>
            <div className={styles.sidebarMetricItem} title={`WhatsApp: ${avisadosCount} de ${totalCount}`}>
              <div className={styles.sidebarMetricLabels}>
                <span>WhatsApp ({avisadosCount}/{totalCount})</span>
                <strong>{avisadosPct}%</strong>
              </div>
              <div className={styles.sidebarMetricTrack}>
                <div className={styles.sidebarMetricFillWa} style={{ width: `${avisadosPct}%` }} />
              </div>
            </div>
            <div className={styles.sidebarMetricItem} title={`Asistencia: ${asistieronCount} de ${totalCount}`}>
              <div className={styles.sidebarMetricLabels}>
                <span>Asistencia ({asistieronCount}/{totalCount})</span>
                <strong>{asistieronPct}%</strong>
              </div>
              <div className={styles.sidebarMetricTrack}>
                <div className={styles.sidebarMetricFillAsist} style={{ width: `${asistieronPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ====================================================================
          2. ÁREA PRINCIPAL
          ==================================================================== */}
      <main className={styles.mainContent}>
        {/* Cabecera Móvil (< 1024px) */}
        <header className={styles.mobileHeader}>
          <div className={styles.mobileHeaderTop}>
            <div className={styles.mobileBrand}>
              <div className={styles.logoCircleWrapperSmall}>
                <img src={cjrLogo} alt="CJR 28" className={styles.mobileLogo} />
              </div>
              <div className={styles.mobileBrandInfo}>
                <h1>AGIOS 2026</h1>
                <span className={`${styles.saveBadge} ${styles[syncStatus]}`}>
                  <IconCloudCheck size={12} weight="bold" />
                  <span>{cloudEnabled ? (syncStatus === 'saving' ? 'Sync…' : 'Sincronizado') : 'Local'}</span>
                </span>
              </div>
            </div>
            <button
              type="button"
              className={`${styles.btnMobileFilter} ${filter !== 'todos' ? styles.btnMobileFilterActive : ''}`}
              onClick={() => setShowMobileFilters(true)}
              aria-label="Abrir filtros"
            >
              Filtros {filter !== 'todos' ? '•' : ''}
            </button>
          </div>

          <div className={styles.mobileMetricsRow}>
            <div className={styles.mobileMetricTrackWrap}>
              <span className={styles.mobileMetricLabel}>WhatsApp {avisadosPct}%</span>
              <div className={styles.sidebarMetricTrack}>
                <div className={styles.sidebarMetricFillWa} style={{ width: `${avisadosPct}%` }} />
              </div>
            </div>
            <div className={styles.mobileMetricTrackWrap}>
              <span className={styles.mobileMetricLabel}>Llegaron {asistieronPct}%</span>
              <div className={styles.sidebarMetricTrack}>
                <div className={styles.sidebarMetricFillAsist} style={{ width: `${asistieronPct}%` }} />
              </div>
            </div>
          </div>

          <div className={styles.mobileSearchRow}>
            <div className={styles.searchWrapper}>
              <span className={styles.searchIcon}><IconBusqueda /></span>
              <input
                type="search"
                placeholder="Buscar por nombre o iglesia..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.mobileChipsRow}>
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'sincolor', label: 'Sin asignar' },
              { id: 'sinavisar', label: 'Sin avisar' },
              { id: 'faltan', label: 'Faltan llegar' },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                className={`${styles.mobileChipBtn} ${filter === c.id ? styles.mobileChipBtnActive : ''}`}
                onClick={() => setFilter(c.id)}
              >
                {c.label}
              </button>
            ))}

            {colorFilter && (
              <button
                type="button"
                className={styles.chipColorActive}
                onClick={() => setColorFilter(null)}
                title="Quitar filtro de equipo"
              >
                <span
                  className={styles.chipColorDot}
                  style={{
                    backgroundColor:
                      colorFilter === STAFF.name
                        ? '#64748b'
                        : COLORS.find((c) => c.name === colorFilter)?.hex || '#12281C',
                  }}
                />
                <span>{colorFilter === STAFF.name ? 'Staff' : `Equipo ${colorFilter}`}</span>
                <span>✕</span>
              </button>
            )}
          </div>
        </header>

        {/* Barra de Herramientas de Escritorio (>= 1024px) */}
        <div className={styles.desktopToolbar}>
          <div className={styles.segmentedControl}>
            <button
              type="button"
              className={`${styles.segmentBtn} ${tab === 'avisos' ? styles.segmentBtnActive : ''}`}
              onClick={() => setTab('avisos')}
            >
              <IconAvisos />
              <span>Avisos WhatsApp</span>
              <span className={styles.segmentCount}>({avisosPendientes})</span>
            </button>
            <button
              type="button"
              className={`${styles.segmentBtn} ${tab === 'asistencia' ? styles.segmentBtnActive : ''}`}
              onClick={() => setTab('asistencia')}
            >
              <IconAsistencia />
              <span>Control Asistencia</span>
              <span className={styles.segmentCount}>({asistieronCount}/{totalCount})</span>
            </button>
          </div>

          <div className={styles.searchWrapper}>
            <span className={styles.searchIcon}><IconBusqueda /></span>
            <input
              type="search"
              placeholder="Buscar participante por nombre o iglesia..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className={styles.toolbarActionsGroup}>
            <button
              type="button"
              className={`${styles.btnSecundario} ${showBalance ? styles.btnSecundarioActive : ''}`}
              onClick={() => setShowBalance(!showBalance)}
              title="Ver distribución por iglesia"
            >
              <span>Reparto</span>
            </button>

            <button
              type="button"
              className={styles.btnSecundario}
              onClick={load}
              title="Sincronizar y actualizar hoja de inscritos"
            >
              <IconActualizar />
              <span>Actualizar</span>
            </button>

            <div className={styles.primaryActionWrapper}>
              <button
                type="button"
                className={toAssign > 0 ? styles.btnPrincipal : styles.btnDisabled}
                onClick={assign}
                disabled={!toAssign}
                title={toAssign > 0 ? `Asignar automáticamente color a ${toAssign} participantes` : 'No hay nuevos por asignar'}
              >
                <span>Asignar nuevos ({toAssign})</span>
              </button>
              {toAssign === 0 && (
                <span className={styles.btnHelperText}>No hay inscritos nuevos</span>
              )}
            </div>
          </div>
        </div>

        {/* ====================================================================
            TARJETAS DE EQUIPO (Rojo, Amarillo, Verde, Azul, Staff)
            2 columnas: Izquierda (Nombre y Total) | Derecha (Mujeres y Varones)
            Línea inferior: Llegaron X
            ==================================================================== */}
        <section id="teams-section" className={styles.teamsGrid}>
          {GROUPS.map((g) => {
            const isStaff = g.name === STAFF.name;
            const m = rows.filter((r) => r.colorName === g.name);
            const isSelected = colorFilter === g.name;
            const accentColor = isStaff ? '#64748b' : g.hex;
            const displayName = isStaff ? 'Staff' : g.name;
            const mujeresCount = m.filter((r) => r.genero === 'F').length;
            const varonesCount = m.filter((r) => r.genero === 'M').length;
            const arrivedCount = m.filter((r) => r.asistio).length;

            const isDarkBg = isSelected && !isStaff && g.ink === '#ffffff';
            const footerDividerColor = isSelected
              ? (isDarkBg ? 'rgba(255, 255, 255, 0.45)' : 'rgba(18, 40, 28, 0.3)')
              : undefined;

            const cardStyle = isSelected
              ? (isStaff
                ? {
                    backgroundColor: '#FFFFFF',
                    border: '3px solid #12281C',
                    color: '#12281C',
                  }
                : {
                    backgroundColor: g.hex,
                    border: `1px solid ${g.hex}`,
                    borderLeftColor: g.hex,
                    color: g.ink,
                  })
              : { borderLeftColor: accentColor };

            return (
              <button
                key={g.name}
                type="button"
                className={`${styles.teamCard} ${isSelected ? styles.teamCardActive : ''} ${isStaff ? styles.teamCardStaff : ''}`}
                style={cardStyle}
                onClick={() => setColorFilter(isSelected ? null : g.name)}
                title={`Filtrar por ${displayName}`}
                aria-pressed={isSelected}
              >
                <div className={styles.teamCardMain}>
                  {/* Izquierda: nombre del equipo (pequeño) y debajo el total en número grande */}
                  <div className={styles.teamCardLeft}>
                    <span className={styles.teamCardName}>{displayName}</span>
                    <span className={styles.teamCardTotal}>{m.length}</span>
                  </div>

                  {/* Derecha: dos cifras grandes con su etiqueta debajo: Mujeres y Varones */}
                  <div className={styles.teamCardRight}>
                    <div className={styles.teamStat}>
                      <span className={styles.teamStatNum}>{mujeresCount}</span>
                      <span className={styles.teamStatLabel}>Mujeres</span>
                    </div>
                    <div className={styles.teamStat}>
                      <span className={styles.teamStatNum}>{varonesCount}</span>
                      <span className={styles.teamStatLabel}>Varones</span>
                    </div>
                  </div>
                </div>

                {/* Debajo: línea a todo lo ancho con Llegaron X */}
                <div
                  className={styles.teamCardFooter}
                  style={footerDividerColor ? { borderTopColor: footerDividerColor } : undefined}
                >
                  <span>Llegaron <strong>{arrivedCount}</strong></span>
                </div>
              </button>
            );
          })}
        </section>

        {/* Avisos del Sistema */}
        {hasDuplicateTs && (
          <div className={styles.alertWarn}>
            <IconWarning size={20} weight="bold" color="#991b1b" />
            <span>Hay inscritos con la misma marca temporal. No se asignarán hasta resolverlo en el Excel.</span>
          </div>
        )}

        {gistFallback && (
          <div className={styles.alertAmber}>
            <IconWarning size={20} weight="bold" color="#854d0e" />
            <span>No se pudo leer GitHub; usando copia local</span>
          </div>
        )}

        {!cloudEnabled && !gistFallback && (
          <div className={styles.alertNote}>
            <span>GitHub no está configurado: los cambios solo se guardan en este navegador.</span>
          </div>
        )}

        {saveError && (
          <div className={styles.alertWarn}>
            <IconWarning size={20} weight="bold" color="#991b1b" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Panel Desplegable de Reparto por Iglesia */}
        {showBalance && (
          <div className={styles.balancePanel}>
            <div className={styles.balanceHeader}>
              <strong>Distribución por Iglesia y Color</strong>
              <button
                type="button"
                className={styles.balanceClose}
                onClick={() => setShowBalance(false)}
              >
                ✕ Cerrar
              </button>
            </div>
            <div className={styles.scroll}>
              <table>
                <thead>
                  <tr>
                    <th>Iglesia</th>
                    {COLORS.map((c) => (
                      <th key={c.name}>{c.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {churches.map((ig) => (
                    <tr key={ig}>
                      <td>{ig}</td>
                      {COLORS.map((c) => (
                        <td key={c.name}>
                          {rows.filter((r) => r.iglesia === ig && r.colorName === c.name).length}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Cuadrícula de Participantes */}
        <ul className={styles.list}>
          {visible.length === 0 && (
            <li className={styles.empty}>No hay inscritos que coincidan con los filtros aplicados.</li>
          )}

          {visible.map((r) => {
            const isConfirming = confirmingSendId === r.id;
            const colorObj = getColorObj(r);
            const isStaffRow = r.rol === 'staff' || r.colorName === STAFF.name;
            const isMenuOpen = openColorMenu?.id === r.id;

            return (
              <li
                key={r.id}
                className={`${styles.row} ${tab === 'asistencia' ? styles.rowAsistencia : styles.rowAvisos}`}
                style={{ borderLeftColor: getRowBorderColor(r) }}
              >
                <div className={styles.rowMain}>
                  <div className={styles.who}>
                    <div className={styles.whoHeader}>
                      <strong>{r.nombre}</strong>
                    </div>

                    <div className={styles.metaRow}>
                      {r.iglesia && <span className={styles.churchPill}>{r.iglesia}</span>}
                      <span className={styles.metaDetails}>
                        {[
                          r.edad && `${r.edad} años`,
                          r.genero === 'F' ? 'Femenino' : r.genero === 'M' ? 'Masculino' : '',
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </div>

                    {(!r.genero || !r.tel) && (
                      <div className={styles.missingTags}>
                        {!r.genero && (
                          <span className={styles.badgeWarn}>
                            <IconWarning size={14} weight="bold" />
                            <span>Falta género en el Excel</span>
                          </span>
                        )}
                        {!r.tel && (
                          <span className={styles.badgeWarn}>
                            <IconWarning size={14} weight="bold" />
                            <span>Celular inválido en el Excel</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* VISTA: PESTAÑA AVISOS */}
                  {tab === 'avisos' && (
                    <div className={styles.avisosControls}>
                      {/* Botón trigger para menú de color */}
                      {isStaffRow ? (
                        <div className={styles.staffBadgeRow}>
                          <span className={styles.staffCircle} />
                          <span className={styles.staffLabel}>Staff</span>
                        </div>
                      ) : (
                        <div className={styles.colorTriggerWrapper}>
                          <button
                            id={`color-trigger-${r.id}`}
                            ref={(el) => { triggerRefs.current[r.id] = el; }}
                            type="button"
                            className={`${styles.colorSelectTrigger} ${isMenuOpen ? styles.colorSelectTriggerActive : ''}`}
                            onClick={() => handleToggleColorMenu(r)}
                            aria-haspopup="listbox"
                            aria-expanded={isMenuOpen}
                            aria-label={`Cambiar color para ${r.nombre}, actual: ${r.colorName || 'Sin color'}`}
                          >
                            <span
                              className={styles.colorTriggerDot}
                              style={colorObj ? { backgroundColor: colorObj.hex } : { border: '1.5px dashed #94a3b8' }}
                            />
                            <span className={styles.colorTriggerLabel}>
                              {r.colorName ? r.colorName : 'Sin color'}
                            </span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={isMenuOpen ? styles.chevronRotated : ''}>
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* Botón WhatsApp y confirmación */}
                      <div className={styles.sendSection}>
                        {isConfirming ? (
                          <div className={styles.confirmBox}>
                            <span className={styles.confirmQuestion}>¿Ya lo enviaste?</span>
                            <div className={styles.confirmButtons}>
                              <button
                                type="button"
                                className={styles.btnPrincipal}
                                onClick={() => {
                                  patch(r.id, { enviado: new Date().toISOString() });
                                  setConfirmingSendId(null);
                                }}
                              >
                                <span>Sí, enviado</span>
                              </button>
                              <button
                                type="button"
                                className={styles.btnSecundario}
                                onClick={() => setConfirmingSendId(null)}
                              >
                                <span>No</span>
                              </button>
                            </div>
                          </div>
                        ) : r.tel && r.colorName ? (
                          <div className={styles.waActionWrapper}>
                            <a
                              className={styles.btnWhatsApp}
                              href={waLink(r)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setConfirmingSendId(r.id)}
                            >
                              <IconWhatsApp size={18} />
                              <span>{r.enviado ? 'Reenviar aviso' : 'Avisar por WhatsApp'}</span>
                            </a>
                            {r.enviado && (
                              <div className={styles.sentInfo}>
                                <span>Avisado el {shortDate(r.enviado)}</span>
                                <button
                                  type="button"
                                  className={styles.btnTerciario}
                                  onClick={() => patch(r.id, { enviado: '' })}
                                >
                                  <IconDeshacer size={14} weight="bold" />
                                  <span>Deshacer</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={styles.waOff}>
                            {!r.tel ? 'Celular inválido en el Excel' : 'Falta asignar color'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* VISTA: PESTAÑA ASISTENCIA */}
                  {tab === 'asistencia' && (
                    <div className={styles.asistenciaControls}>
                      <div
                        className={styles.colorPillBadge}
                        style={colorObj ? {
                          backgroundColor: colorObj.hex,
                          color: colorObj.ink,
                          borderColor: colorObj.name === STAFF.name ? '#64748b' : 'transparent',
                        } : {
                          backgroundColor: '#e2e8f0',
                          color: '#64748b',
                          borderColor: '#cbd5e1',
                          borderStyle: 'dashed',
                        }}
                      >
                        <span
                          className={styles.colorPillDot}
                          style={{ backgroundColor: colorObj ? colorObj.ink : '#64748b' }}
                        />
                        <span className={styles.colorPillText}>
                          {isStaffRow ? 'Staff' : (r.colorName ? `Equipo ${r.colorName}` : 'Sin color')}
                        </span>
                      </div>

                      {/* Casilla grande "Llegó" */}
                      <button
                        type="button"
                        className={`${styles.btnLlego} ${r.asistio ? styles.btnLlegoActive : ''}`}
                        onClick={() => patch(r.id, { asistio: !r.asistio })}
                        aria-pressed={r.asistio}
                      >
                        <span className={styles.checkLlegoBox}>
                          {r.asistio && <IconCheck size={18} weight="bold" color="#ffffff" />}
                        </span>
                        <span className={styles.checkLlegoText}>{r.asistio ? 'Llegó' : 'Marcar llegada'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </main>

      {/* ====================================================================
          3. MENÚ DE COLOR RENDERIZADO CON PORTAL EN document.body
          position: fixed, z-index: 9999, fondo blanco sólido, borde 1px #D9E0D8
          ==================================================================== */}
      {openColorMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Seleccionar color de equipo"
          className={styles.colorPortalMenu}
          style={{
            position: 'fixed',
            ...(openColorMenu.openUpwards
              ? { bottom: `${openColorMenu.bottom}px` }
              : { top: `${openColorMenu.top}px` }),
            ...(openColorMenu.alignRight
              ? { right: `${openColorMenu.right}px` }
              : { left: `${openColorMenu.left}px` }),
            minWidth: `${openColorMenu.minWidth}px`,
            zIndex: 9999,
          }}
        >
          {COLOR_OPTIONS.map((opt, idx) => {
            const isSelected = openColorMenu.row.colorName === opt.name;
            const isHighlighted = activeOptionIdx === idx;
            return (
              <div
                key={opt.name || 'none'}
                role="option"
                aria-selected={isSelected}
                className={`${styles.colorPortalOption} ${isSelected ? styles.colorPortalOptionSelected : ''} ${isHighlighted ? styles.colorPortalOptionHighlighted : ''}`}
                onClick={() => {
                  changeColor(openColorMenu.row, opt.name);
                  closeColorMenu(true);
                }}
                onMouseEnter={() => setActiveOptionIdx(idx)}
              >
                <span
                  className={styles.colorOptionDot}
                  style={opt.hex ? { backgroundColor: opt.hex } : { border: '1.5px dashed #94a3b8' }}
                />
                <span className={styles.colorOptionLabel}>{opt.label}</span>
                {isSelected && (
                  <span className={styles.colorOptionCheck}>
                    <IconCheck size={16} weight="bold" />
                  </span>
                )}
              </div>
            );
          })}
        </div>,
        document.body
      )}

      {/* ====================================================================
          4. BARRA DE NAVEGACIÓN INFERIOR MÓVIL (< 1024px)
          ==================================================================== */}
      <nav className={styles.bottomNav} aria-label="Navegación móvil">
        <button
          type="button"
          className={styles.bottomNavItem}
          onClick={() => {
            const el = document.getElementById('teams-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <div className={styles.bottomNavIconWrapper}>
            <span className={styles.teamDotIndicator} />
          </div>
          <span>Equipos</span>
        </button>

        <button
          type="button"
          className={`${styles.bottomNavItem} ${tab === 'avisos' ? styles.bottomNavItemActive : ''}`}
          onClick={() => setTab('avisos')}
        >
          <div className={styles.bottomNavIconWrapper}>
            <IconAvisos size={20} />
            {avisosPendientes > 0 && (
              <span className={styles.bottomNavBadge}>{avisosPendientes}</span>
            )}
          </div>
          <span>WhatsApp</span>
        </button>

        <button
          type="button"
          className={`${styles.bottomNavItem} ${tab === 'asistencia' ? styles.bottomNavItemActive : ''}`}
          onClick={() => setTab('asistencia')}
        >
          <div className={styles.bottomNavIconWrapper}>
            <IconAsistencia size={20} />
            <span className={styles.bottomNavBadge}>{asistieronCount}</span>
          </div>
          <span>Asistencia</span>
        </button>

        <button
          type="button"
          className={`${styles.bottomNavItem} ${showMobileFilters || filter !== 'todos' ? styles.bottomNavItemActive : ''}`}
          onClick={() => setShowMobileFilters(true)}
        >
          <div className={styles.bottomNavIconWrapper}>
            <span className={styles.filterDotIcon} />
          </div>
          <span>Filtros</span>
        </button>
      </nav>

      {/* ====================================================================
          5. BOTTOM SHEET MÓVIL (< 1024px)
          ==================================================================== */}
      {showMobileFilters && (
        <div className={styles.bottomSheetOverlay} onClick={() => setShowMobileFilters(false)}>
          <div className={styles.bottomSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeader}>
              <h3>Filtros y Herramientas</h3>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={() => setShowMobileFilters(false)}
                aria-label="Cerrar panel de filtros"
              >
                ✕
              </button>
            </div>

            <div className={styles.sheetBody}>
              <div className={styles.sheetSection}>
                <span className={styles.sheetLabel}>Filtrar participantes por estado:</span>
                <div className={styles.sheetChips}>
                  {[
                    { id: 'todos', label: 'Todos', count: rows.length },
                    { id: 'sincolor', label: 'Sin asignar', count: rows.filter((r) => r.rol === 'participante' && !r.colorName).length },
                    { id: 'sinavisar', label: 'Sin avisar', count: avisosPendientes },
                    { id: 'faltan', label: 'Faltan llegar', count: rows.filter((r) => !r.asistio).length },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`${styles.sheetChipBtn} ${filter === c.id ? styles.sheetChipBtnActive : ''}`}
                      onClick={() => {
                        setFilter(c.id);
                        setShowMobileFilters(false);
                      }}
                    >
                      <span>{c.label}</span>
                      <span className={styles.chipCount}>{c.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.sheetSection}>
                <span className={styles.sheetLabel}>Herramientas:</span>
                <button
                  type="button"
                  className={`${styles.btnSecundario} ${showBalance ? styles.btnSecundarioActive : ''}`}
                  onClick={() => {
                    setShowBalance(!showBalance);
                    setShowMobileFilters(false);
                  }}
                >
                  <span>{showBalance ? 'Ocultar Reparto por Iglesia' : 'Ver Reparto por Iglesia'}</span>
                </button>
              </div>

              <div className={styles.sheetSection}>
                <span className={styles.sheetLabel}>Acciones globales:</span>
                <div className={styles.sheetActions}>
                  <button
                    type="button"
                    className={styles.btnSecundario}
                    onClick={() => {
                      load();
                      setShowMobileFilters(false);
                    }}
                  >
                    <IconActualizar />
                    <span>Actualizar hoja</span>
                  </button>

                  <div className={styles.primaryActionWrapper}>
                    <button
                      type="button"
                      className={toAssign > 0 ? styles.btnPrincipal : styles.btnDisabled}
                      onClick={() => {
                        assign();
                        setShowMobileFilters(false);
                      }}
                      disabled={!toAssign}
                    >
                      <span>Asignar nuevos ({toAssign})</span>
                    </button>
                    {toAssign === 0 && (
                      <span className={styles.btnHelperText}>No hay inscritos nuevos</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
