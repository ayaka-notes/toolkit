const pickerStorageKey = 'ayakaleaf.workbench.model'
let workbenchSelection = ''
try { workbenchSelection = localStorage.getItem(pickerStorageKey) || '' } catch {}
const effortStorageKey = pickerStorageKey + '.efforts'
let workbenchEfforts = new Map()
try { workbenchEfforts = new Map(JSON.parse(localStorage.getItem(effortStorageKey) || '[]')) } catch {}
const effortHelp = 'Controls how much time and quota the model spends reasoning before it responds. Higher effort can improve accuracy on difficult tasks, but may take longer and use more quota.'
const levelName = level => level ? level[0].toUpperCase() + level.slice(1) : ''
const effectiveLevel = model => levelName(workbenchEfforts.get(model.key) || model.defaultLevel)

function WorkbenchModelPicker({ disabled }) {
  const [choice, setChoice] = C.useState(workbenchSelection)
  const [directory, setDirectory] = C.useState(null)
  const trigger = C.useRef(null)
  const menu = C.useRef(null)
  const menuId = C.useId()
  const submenu = C.useRef(null)
  const origin = C.useRef(null)
  const [candidate, setCandidate] = C.useState(null)
  const [help, setHelp] = C.useState(false)
  function showHelp(event) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const width = Math.min(320, window.innerWidth - 16)
    const left = Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8))
    setHelp({ width, left, ...(bounds.top >= 140
      ? { bottom: window.innerHeight - bounds.top + 6 }
      : { top: bounds.bottom + 6 }) })
  }
  C.useEffect(() => {
    const abort = new AbortController()
    fetch('/workbench/models', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error()
      const result = await response.json()
      if (!abort.signal.aborted) setDirectory(result)
    }).catch(() => {
      if (!abort.signal.aborted) setDirectory({ models: [] })
    })
    return () => abort.abort()
  }, [])
  const options = [{ key: '', label: 'Default model' }, ...(directory?.models || [])]
  const selected = options.find(option => option.key === choice) || { key: choice, label: choice }
  const effortText = effectiveLevel(selected)
  const selectionText = [selected.label, effortText].filter(Boolean).join(' ')
  function openMenu() {
    const panel = menu.current
    if (panel.matches(':popover-open')) return panel.hidePopover()
    const bounds = trigger.current.getBoundingClientRect()
    const width = Math.min(270, window.innerWidth - 16)
    const above = bounds.top >= 196 || bounds.top > window.innerHeight - bounds.bottom
    Object.assign(panel.style, {
      width: `${width}px`,
      left: `${Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8))}px`,
      top: above ? 'auto' : `${bounds.bottom + 4}px`,
      bottom: above ? `${window.innerHeight - bounds.top + 4}px` : 'auto',
      maxHeight: `${Math.min(192, Math.max(32, (above ? bounds.top : window.innerHeight - bounds.bottom) - 12))}px`,
    })
    panel.showPopover()
    const active = panel.querySelector('[aria-selected="true"]') || panel.firstElementChild
    active?.focus()
    active?.scrollIntoView({ block: 'nearest' })
  }
  function closeLevels() {
    submenu.current?.hidePopover()
    setHelp(false)
    setCandidate(null)
  }
  function openLevels(option, button, focus) {
    origin.current = button
    setCandidate(option)
    setHelp(false)
    const panel = submenu.current
    const bounds = menu.current.getBoundingClientRect()
    const width = Math.min(210, window.innerWidth - 16)
    const left = bounds.right + width <= window.innerWidth - 8 ? bounds.right :
      Math.max(8, bounds.left - width)
    Object.assign(panel.style, { width: width + 'px', left: left + 'px',
      top: Math.max(8, Math.min(button.getBoundingClientRect().top, window.innerHeight - Math.min(280, 68 + option.levels.length * 30) - 8)) + 'px' })
    if (!panel.matches(':popover-open')) panel.showPopover()
    if (focus) requestAnimationFrame(() => panel.querySelector('[aria-checked="true"]')?.focus())
  }
  function choose(key, level) {
    if (level) workbenchEfforts.set(key, level)
    else workbenchEfforts.delete(key)
    try { localStorage.setItem(effortStorageKey, JSON.stringify([...workbenchEfforts])) } catch {}
    closeLevels()
    workbenchSelection = key
    setChoice(key)
    try { localStorage.setItem(pickerStorageKey, key) } catch {}
    menu.current.hidePopover()
    trigger.current.focus()
  }
  return I.jsxs(I.Fragment, {
    children: [
      I.jsx('button', {
        ref: trigger, type: 'button', disabled, 'aria-label': `AI model: ${selectionText}`,
        'aria-haspopup': 'listbox', 'aria-controls': menuId, title: selectionText,
        onClick: openMenu,
        style: { display: 'inline-flex', alignItems: 'baseline', gap: 5, flex: '0 1 auto', minWidth: 0, marginInlineEnd: 12, whiteSpace: 'nowrap', border: 0, borderRadius: 4, padding: '3px 6px', color: 'inherit', background: 'transparent', font: 'inherit', fontSize: 'var(--font-size-02)' },
        children: [
          I.jsx('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }, children: selected.label }, 'model'),
          effortText && I.jsx('span', { style: { flexShrink: 0, color: 'var(--content-secondary-themed, GrayText)' }, children: effortText }, 'effort'),
        ],
      }),
      I.jsx('div', {
        ref: menu, id: menuId, popover: 'auto', role: 'listbox', 'aria-label': 'AI model',
        onToggle: event => {
          if (event.target !== event.currentTarget) return
          const opened = event.currentTarget.matches(':popover-open')
          trigger.current?.setAttribute('aria-expanded', String(opened))
          if (!opened) closeLevels()
        },
        onKeyDown(event) {
          const item = event.target
          if (submenu.current.contains(item)) return
          const next = { ArrowDown: item.nextElementSibling?.matches('button') && item.nextElementSibling, ArrowUp: item.previousElementSibling, Home: menu.current.firstElementChild, End: submenu.current.previousElementSibling }
          if (Object.hasOwn(next, event.key)) {
            event.preventDefault()
            if (next[event.key]) next[event.key].focus()
          }
          if (event.key === 'Tab') menu.current.hidePopover()
        },
        style: { position: 'fixed', inset: 'auto', margin: 0, boxSizing: 'border-box', overflowY: 'auto', overscrollBehavior: 'contain', padding: 3, border: '1px solid var(--border-divider, #aaa)', borderRadius: 6, background: 'var(--bg-light-primary, Canvas)', color: 'inherit', boxShadow: '0 3px 12px #0002' },
        children: [...options.map(option => I.jsx('button', {
          type: 'button', role: 'option', tabIndex: -1, 'aria-selected': option.key === choice,
          title: option.label, 'aria-haspopup': option.levels?.length ? 'menu' : undefined,
          onMouseEnter: event => option.levels?.length ? openLevels(option, event.currentTarget, false) : closeLevels(),
          onKeyDown(event) {
            if (event.key === 'ArrowRight' && option.levels?.length) {
              event.preventDefault()
              openLevels(option, event.currentTarget, true)
            }
          },
          onClick: () => choose(option.key, workbenchEfforts.get(option.key)),
          style: { display: 'block', width: '100%', height: 30, textAlign: 'start', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: 0, borderRadius: 3, padding: '2px 8px', color: 'inherit', background: option.key === choice ? 'var(--bg-light-secondary, #8882)' : 'transparent', font: 'inherit', fontSize: 'var(--font-size-02)' },
          children: option.levels?.length ? [
            I.jsx('span', { style: { float: 'right', marginLeft: 4 }, onClick: event => { event.stopPropagation(); openLevels(option, event.currentTarget.parentElement, true) }, children: effectiveLevel(option) + ' ›' }, 'level'),
            option.label,
          ] : option.label,
        }, option.key)), I.jsxs('div', {
          ref: submenu, popover: 'auto', role: 'menu', 'aria-label': 'Thinking effort',
          style: { position: 'fixed', inset: 'auto', margin: 0, padding: 5, boxSizing: 'border-box', maxHeight: 'min(280px, 90vh)', overflowY: 'auto', color: 'inherit', background: 'var(--bg-light-primary, Canvas)', border: '1px solid var(--border-divider, #aaa)', borderRadius: 6, boxShadow: '0 3px 12px #0002', fontSize: 'var(--font-size-02)' },
          onKeyDown(event) {
            if (event.key === 'ArrowLeft' || event.key === 'Escape') {
              event.preventDefault()
              closeLevels()
              origin.current?.focus()
            }
            const buttons = [...submenu.current.querySelectorAll('[role="menuitemradio"]')]
            const index = buttons.indexOf(event.target)
            if (['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(event.key) && buttons.length) {
              event.preventDefault()
              const offset = event.key === 'ArrowDown' ? 1 : -1
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + offset + buttons.length) % buttons.length
              buttons[next].focus()
            }
          },
          children: [
            I.jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px' }, children: [
              'Thinking effort', I.jsx('button', { type: 'button', 'aria-label': 'About thinking effort', 'aria-describedby': help ? menuId + '-help' : undefined,
                onMouseEnter: showHelp, onMouseLeave: () => setHelp(false), onFocus: showHelp, onBlur: () => setHelp(false),
                onClick: showHelp, style: { background: 'transparent', color: 'inherit', border: 0, cursor: 'help' }, children: 'ⓘ' }),
            ] }),
            help && I.jsx('div', { role: 'tooltip', id: menuId + '-help', style: {
              position: 'fixed', ...help, pointerEvents: 'none', zIndex: 1, boxSizing: 'border-box',
              padding: '6px 10px', background: 'var(--bg-light-primary, Canvas)', border: '1px solid var(--border-divider, #aaa)',
              borderRadius: 6, boxShadow: '0 3px 12px #0002',
            }, children: effortHelp }),
            ...(candidate ? ['', ...candidate.levels].map(level => I.jsx('button', {
              type: 'button', role: 'menuitemradio', 'aria-checked': (workbenchEfforts.get(candidate.key) || '') === level,
              style: { display: 'block', width: '100%', height: 30, padding: '2px 8px', color: 'inherit', textAlign: 'start', border: 0, background: 'transparent', font: 'inherit' },
              onClick: () => choose(candidate.key, level), children: (levelName(level) || `Default (${levelName(candidate.defaultLevel)})`) + ((workbenchEfforts.get(candidate.key) || '') === level ? ' ✓' : ''),
            }, level)) : []),
          ],
        }, 'effort-menu')],
      }),
    ],
  })
}
