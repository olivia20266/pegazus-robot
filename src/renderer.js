// ── State ─────────────────────────────────────────────────
let state = {
  user: null, token: null, serverUrl: '', wallet: null,
  positions: [], history: [], prices: {},
  robotOn: false, robotInterval: null,
  stats: { signals: 0, orders: 0, wins: 0, losses: 0 },
}

const SYMBOLS = [
  { id:'EUR/USD', pip:0.0001, spread:0.00012 },
  { id:'GBP/USD', pip:0.0001, spread:0.00015 },
  { id:'USD/JPY', pip:0.01,   spread:0.012   },
  { id:'XAU/USD', pip:0.01,   spread:0.3     },
  { id:'BTC/USD', pip:1,      spread:2,       binance:'BTCUSDT' },
  { id:'ETH/USD', pip:0.01,   spread:0.5,     binance:'ETHUSDT' },
]

// ── Navigation ────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('page-' + page).classList.add('active')
  document.getElementById('nav-' + page).classList.add('active')
}

// ── Login ─────────────────────────────────────────────────
async function doLogin() {
  const url   = document.getElementById('login-url').value.trim().replace(/\/$/,'')
  const email = document.getElementById('login-email').value.trim()
  const pass  = document.getElementById('login-password').value.trim()
  const btn   = document.getElementById('login-btn')
  const err   = document.getElementById('login-error')
  err.style.display = 'none'
  btn.textContent = 'Signing in...'
  btn.disabled = true

  try {
    const res = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || 'Login failed')

    state.token     = data.userId
    state.serverUrl = url
    state.user      = { email, userId: data.userId }

    localStorage.setItem('pegazus_session', JSON.stringify({ url, email, userId: data.userId }))

    await loadWallet()
    startApp()
  } catch(e) {
    err.textContent = e.message
    err.style.display = 'block'
  } finally {
    btn.textContent = 'Sign In & Launch Robot'
    btn.disabled = false
  }
}

async function loadWallet() {
  try {
    const res = await fetch(`${state.serverUrl}/api/me`, {
      headers: { 'x-user-id': state.token }
    })
    if (res.ok) {
      const data = await res.json()
      state.wallet = data.wallet
    }
  } catch(e) {}
}

function startApp() {
  document.getElementById('login-screen').style.display = 'none'
  document.getElementById('app-screen').style.display = 'grid'
  document.getElementById('user-email-sidebar').textContent = state.user.email
  document.getElementById('settings-email').textContent = state.user.email
  document.getElementById('settings-server').textContent = state.serverUrl
  updateDashboard()
  fetchPrices()
  setInterval(fetchPrices, 5000)
  setInterval(updateDashboard, 3000)
  setConnected(true)
}

function doLogout() {
  localStorage.removeItem('pegazus_session')
  state = { user:null, token:null, serverUrl:'', wallet:null, positions:[], history:[], prices:{}, robotOn:false, robotInterval:null, stats:{signals:0,orders:0,wins:0,losses:0} }
  stopRobot()
  document.getElementById('login-screen').style.display = 'flex'
  document.getElementById('app-screen').style.display = 'none'
}

// ── Prices ────────────────────────────────────────────────
async function fetchPrices() {
  try {
    const binanceSyms = SYMBOLS.filter(s => s.binance)
    if (binanceSyms.length) {
      const syms = binanceSyms.map(s => `"${s.binance}"`).join(',')
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=[${syms}]`)
      const data = await res.json()
      if (Array.isArray(data)) {
        data.forEach(d => {
          const sym = binanceSyms.find(s => s.binance === d.symbol)
          if (sym) state.prices[sym.id] = {
            bid: parseFloat(d.lastPrice),
            ask: parseFloat(d.lastPrice) * 1.0001,
            change: parseFloat(d.priceChangePercent),
          }
        })
      }
    }
    // Simulate forex prices
    SYMBOLS.filter(s => !s.binance).forEach(s => {
      const base = state.prices[s.id]?.bid || { 'EUR/USD':1.085,'GBP/USD':1.272,'USD/JPY':149.5,'XAU/USD':2320 }[s.id] || 1
      const drift = (Math.random() - 0.499) * s.pip * 3
      state.prices[s.id] = {
        bid: Math.max(base * 0.5, base + drift),
        ask: Math.max(base * 0.5, base + drift + s.spread),
        change: (Math.random() - 0.5) * 0.5,
      }
    })
    renderPrices()
    document.getElementById('price-time').textContent = new Date().toLocaleTimeString()
  } catch(e) {}
}

function renderPrices() {
  const tbody = document.getElementById('prices-table')
  tbody.innerHTML = Object.entries(state.prices).map(([sym, p]) => {
    const dp = sym === 'BTC/USD' ? 0 : sym.includes('JPY') ? 2 : 5
    const col = p.change >= 0 ? '#2dd4a0' : '#f0544f'
    return `<tr>
      <td style="font-weight:600">${sym}</td>
      <td class="mono">${p.bid.toFixed(dp)}</td>
      <td class="mono">${p.ask.toFixed(dp)}</td>
      <td class="mono" style="color:${col}">${p.change >= 0 ? '+' : ''}${p.change.toFixed(2)}</td>
      <td class="mono" style="color:${col}">${p.change >= 0 ? '+' : ''}${p.change.toFixed(2)}%</td>
    </tr>`
  }).join('')
}

// ── Dashboard ─────────────────────────────────────────────
function updateDashboard() {
  const bal = state.wallet?.balance || 0
  const pl  = state.positions.reduce((s, p) => s + p.pl, 0)
  document.getElementById('dash-balance').textContent   = '$' + bal.toFixed(2)
  document.getElementById('dash-equity').textContent    = '$' + (bal + pl).toFixed(2)
  document.getElementById('dash-pl').textContent        = (pl >= 0 ? '+$' : '-$') + Math.abs(pl).toFixed(2)
  document.getElementById('dash-pl').style.color        = pl >= 0 ? '#2dd4a0' : '#f0544f'
  document.getElementById('dash-positions').textContent = state.positions.length
  document.getElementById('settings-balance').textContent = '$' + bal.toFixed(2)
  document.getElementById('pos-summary').textContent    = state.positions.length + ' open positions — P&L: ' + (pl >= 0 ? '+' : '') + '$' + pl.toFixed(2)
  document.getElementById('hist-summary').textContent   = state.history.length + ' closed trades'
  document.getElementById('stat-signals').textContent   = state.stats.signals
  document.getElementById('stat-orders').textContent    = state.stats.orders
  document.getElementById('stat-wins').textContent      = state.stats.wins
  document.getElementById('stat-losses').textContent    = state.stats.losses
  updatePositionsTable()
  updateHistoryTable()
}

function updatePositionsTable() {
  const tbody = document.getElementById('positions-table')
  if (!state.positions.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#5a677d;padding:24px">No open positions</td></tr>'
    return
  }
  tbody.innerHTML = state.positions.map(p => {
    const dp = p.symbol === 'BTC/USD' ? 0 : 5
    return `<tr>
      <td style="font-weight:600">${p.symbol}</td>
      <td><span class="badge ${p.type.toLowerCase()}">${p.type}</span></td>
      <td class="mono">${p.lot}</td>
      <td class="mono">${p.openPrice.toFixed(dp)}</td>
      <td class="mono">${p.currentPrice.toFixed(dp)}</td>
      <td class="mono" style="color:#f0544f">${p.sl.toFixed(dp)}</td>
      <td class="mono" style="color:#2dd4a0">${p.tp.toFixed(dp)}</td>
      <td class="mono ${p.pl >= 0 ? 'pl-pos' : 'pl-neg'}">${p.pl >= 0 ? '+' : ''}$${Math.abs(p.pl).toFixed(2)}</td>
      <td style="color:#5a677d;font-size:11px">${p.openTime}</td>
    </tr>`
  }).join('')
}

function updateHistoryTable() {
  const tbody = document.getElementById('history-table')
  if (!state.history.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#5a677d;padding:24px">No trades yet</td></tr>'
    return
  }
  tbody.innerHTML = state.history.slice(0, 50).map(t => {
    const dp = t.symbol === 'BTC/USD' ? 0 : 5
    return `<tr>
      <td style="font-weight:600">${t.symbol}</td>
      <td><span class="badge ${t.type.toLowerCase()}">${t.type}</span></td>
      <td class="mono">${t.lot}</td>
      <td class="mono">${t.openPrice.toFixed(dp)}</td>
      <td class="mono">${t.closePrice.toFixed(dp)}</td>
      <td><span class="badge ${t.result.toLowerCase()}">${t.result}</span></td>
      <td class="mono ${t.pl >= 0 ? 'pl-pos' : 'pl-neg'}">${t.pl >= 0 ? '+' : ''}$${Math.abs(t.pl).toFixed(2)}</td>
      <td style="color:#5a677d;font-size:11px">${t.closeTime}</td>
    </tr>`
  }).join('')
}

// ── Robot ─────────────────────────────────────────────────
function toggleRobot() {
  if (state.robotOn) stopRobot()
  else startRobot()
}

function startRobot() {
  state.robotOn = true
  const btn = document.getElementById('robot-toggle-btn')
  btn.className = 'toggle-robot-btn stop'
  btn.textContent = '⏹ Stop Robot'
  document.getElementById('stat-status').textContent = 'ACTIVE'
  document.getElementById('stat-status').style.color = '#2dd4a0'
  document.getElementById('robot-badge').textContent = 'ACTIVE'
  document.getElementById('robot-badge').style.color = '#2dd4a0'
  window.electron?.setRobotStatus(true)
  addLog('▶ Robot started — EMA' + document.getElementById('ema-fast').value + '/' + document.getElementById('ema-slow').value, 'info')

  state.robotInterval = setInterval(runRobotCycle, 5000)
}

function stopRobot() {
  state.robotOn = false
  clearInterval(state.robotInterval)
  const btn = document.getElementById('robot-toggle-btn')
  if (btn) {
    btn.className = 'toggle-robot-btn start'
    btn.textContent = '▶ Start Robot'
  }
  document.getElementById('stat-status').textContent = 'STOPPED'
  document.getElementById('stat-status').style.color = '#5a677d'
  document.getElementById('robot-badge').textContent = 'STOPPED'
  document.getElementById('robot-badge').style.color = '#5a677d'
  window.electron?.setRobotStatus(false)
  addLog('⏹ Robot stopped', 'system')
}

function runRobotCycle() {
  state.stats.signals++
  const maxPos = parseInt(document.getElementById('max-pos').value) || 5
  if (state.positions.length >= maxPos) return

  SYMBOLS.forEach(sym => {
    const price = state.prices[sym.id]
    if (!price) return
    const onSym = state.positions.filter(p => p.symbol === sym.id).length
    if (onSym >= 2) return

    // Signal aléatoire pondéré (simulation EMA)
    const signal = Math.random()
    const lot    = parseFloat(document.getElementById('lot-size').value) || 0.01
    const sl     = parseInt(document.getElementById('sl-pips').value) || 15
    const tp     = parseInt(document.getElementById('tp-pips').value) || 30

    if (signal > 0.85) {
      const type  = signal > 0.925 ? 'BUY' : 'SELL'
      const entry = type === 'BUY' ? price.ask : price.bid
      const pos   = {
        id: Date.now() + sym.id,
        symbol: sym.id, type, lot,
        openPrice: entry, currentPrice: entry,
        sl: type === 'BUY' ? entry - sl * sym.pip : entry + sl * sym.pip,
        tp: type === 'BUY' ? entry + tp * sym.pip : entry - tp * sym.pip,
        pl: 0,
        openTime: new Date().toLocaleTimeString(),
      }
      state.positions.push(pos)
      state.stats.orders++
      addLog(`${type === 'BUY' ? '▲' : '▼'} ${type} ${lot} lot ${sym.id} @ ${entry.toFixed(sym.id==='BTC/USD'?0:5)}`, type.toLowerCase())
      window.electron?.notify('Pegazus Robot', `${type} ${sym.id} @ ${entry.toFixed(4)}`)

      // Auto-close after random time (simulate SL/TP)
      const holdTime = 10000 + Math.random() * 50000
      setTimeout(() => closePosition(pos.id), holdTime)
    }
  })

  updateDashboard()
}

function closePosition(id) {
  const idx = state.positions.findIndex(p => p.id === id)
  if (idx === -1) return
  const pos = state.positions[idx]
  const price = state.prices[pos.symbol]
  if (!price) return

  const dp    = pos.symbol === 'BTC/USD' ? 0 : 5
  const cur   = pos.type === 'BUY' ? price.bid : price.ask
  const pipDiff = pos.type === 'BUY' ? (cur - pos.openPrice) / (SYMBOLS.find(s=>s.id===pos.symbol)?.pip||0.0001) : (pos.openPrice - cur) / (SYMBOLS.find(s=>s.id===pos.symbol)?.pip||0.0001)
  const pl    = parseFloat((pipDiff * pos.lot * 10).toFixed(2))
  const isWin = pl >= 0

  state.history.unshift({
    ...pos, closePrice: cur, pl,
    result: isWin ? 'WIN' : 'LOSS',
    closeTime: new Date().toLocaleTimeString(),
  })
  state.positions.splice(idx, 1)
  if (isWin) state.stats.wins++
  else       state.stats.losses++

  addLog(`${isWin ? '✅' : '❌'} ${pos.type} ${pos.symbol} closed — P&L: ${pl >= 0 ? '+' : ''}$${Math.abs(pl).toFixed(2)}`, isWin ? 'buy' : 'sell')

  // Sync avec Pegazus
  if (state.serverUrl && state.token) {
    fetch(`${state.serverUrl}/api/trading/close-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionId: pos.id, symbol: pos.symbol, type: pos.type, lot: pos.lot, openPrice: pos.openPrice, closePrice: cur, pl, reason: isWin ? 'TP' : 'SL', isWin }),
    }).catch(() => {})
  }

  updateDashboard()
}

// ── Log ───────────────────────────────────────────────────
function addLog(msg, type = 'system') {
  const box = document.getElementById('robot-log')
  const ts  = new Date().toLocaleTimeString()
  const div = document.createElement('div')
  div.className = 'log-line ' + type
  div.textContent = `[${ts}] ${msg}`
  box.insertBefore(div, box.firstChild)
  if (box.children.length > 100) box.removeChild(box.lastChild)
}

function clearLog() {
  document.getElementById('robot-log').innerHTML = ''
}

// ── Connection status ─────────────────────────────────────
function setConnected(ok) {
  const dot   = document.getElementById('conn-dot')
  const label = document.getElementById('conn-label')
  dot.className   = 'status-dot ' + (ok ? 'green' : 'red')
  label.textContent = ok ? 'Connected' : 'Disconnected'
}

// ── Electron bridge ───────────────────────────────────────
window.electron?.onToggleRobot(() => toggleRobot())

// ── Auto-login ────────────────────────────────────────────
const saved = localStorage.getItem('pegazus_session')
if (saved) {
  try {
    const s = JSON.parse(saved)
    document.getElementById('login-url').value   = s.url
    document.getElementById('login-email').value = s.email
    state.serverUrl = s.url
    state.token     = s.userId
    state.user      = { email: s.email, userId: s.userId }
    loadWallet().then(() => startApp())
  } catch(e) { localStorage.removeItem('pegazus_session') }
}
