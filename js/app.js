const form = document.querySelector('#searchForm');
const res = document.querySelector('#resTable');

// ===== Price Alerts (LocalStorage + Notifications) =====
const ALERTS_KEY = 'priceAlerts';
const normalizeId = (val) => (typeof val === 'string' ? val.toLowerCase() : '');

function loadAlerts() {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out = {};
    Object.keys(parsed || {}).forEach((k) => {
      const id = normalizeId(k);
      const v = Number(parsed[k]);
      if (id && Number.isFinite(v) && v > 0) out[id] = v;
    });
    return out;
  } catch (_) {
    return {};
  }
}

function saveAlerts(alerts) {
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  } catch (_) {}
}

let alerts = loadAlerts();

function ensureNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (_) {}
  }
}

async function checkAlertsOnce() {
  const ids = Object.keys(alerts);
  if (ids.length === 0) return;
  const uniqueIds = Array.from(new Set(ids.map(normalizeId)));
  if (uniqueIds.length === 0) return;
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: uniqueIds.join(','), vs_currencies: 'usd' }
    });
    const triggered = [];
    uniqueIds.forEach((id) => {
      const price = data && data[id] && typeof data[id].usd === 'number' ? data[id].usd : undefined;
      const target = alerts[id];
      if (price !== undefined && Number.isFinite(target) && price >= target) {
        triggered.push({ id, price, target });
      }
    });
    if (triggered.length > 0) {
      triggered.forEach(({ id, price, target }) => {
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Crypto Price Alert', {
              body: `${id} reached ${price.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} (target ${target.toLocaleString(undefined, { style: 'currency', currency: 'USD' })})`
            });
          } catch (_) {}
        }
      });
      // remove triggered alerts
      triggered.forEach(({ id }) => { delete alerts[id]; });
      saveAlerts(alerts);
    }
  } catch (_) {}
}

let alertsTimer = null;
function startAlertsBackgroundChecker() {
  if (alertsTimer) return;
  checkAlertsOnce();
  alertsTimer = setInterval(checkAlertsOnce, 60000);
}

// Update both price table and chart on submit
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ctype = form.elements.coinType.value;
    fetchPrice(ctype);
    showChartContainer();
    // Tell React chart which coin to show
    try { window.dispatchEvent(new CustomEvent('coin-selected', { detail: { id: ctype } })); } catch(_) {}
});

const showChartContainer = () => {
  const chartContainer = document.getElementById('chartContainer');
  if (chartContainer) {
    chartContainer.style.display = 'block';
  }
};

const fetchPrice = async (ctype) => {
    try {
        // CoinGecko API endpoint for a single coin
        const r = await axios.get(`https://api.coingecko.com/api/v3/coins/${ctype}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
        showPrice(r.data);
    } catch (err) {
        console.error('API fetch error:', err);
        if (err.response && err.response.status === 404) {
            res.innerHTML = `<tr><td colspan=\"2\" style=\"color:red;\">Coin not found. Please select a valid coin.</td></tr>`;
        } else {
            res.innerHTML = `<tr><td colspan=\"2\" style=\"color:red;\">Failed to fetch data. Please check your internet connection or try again later.</td></tr>`;
        }
    }
};

// CoinGecko logo URLs for top 20 coins
const coinLogoMap = {
  bitcoin: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  ethereum: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  tether: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  binancecoin: 'https://assets.coingecko.com/coins/images/825/large/binance-coin-logo.png',
  solana: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  'usd-coin': 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
  ripple: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
  dogecoin: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
  toncoin: 'https://assets.coingecko.com/coins/images/17980/large/toncoin.png',
  cardano: 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
  'shiba-inu': 'https://assets.coingecko.com/coins/images/11939/large/shiba.png',
  'avalanche-2': 'https://assets.coingecko.com/coins/images/12559/large/coin-round-red.png',
  tron: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
  polkadot: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
  chainlink: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
  polygon: 'https://assets.coingecko.com/coins/images/4713/large/polygon.png',
  litecoin: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
  'internet-computer': 'https://assets.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png',
  dai: 'https://assets.coingecko.com/coins/images/9956/large/4943.png',
  uniswap: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png',
};

// Enhance dropdown: add coin logos
function enhanceDropdownWithLogos() {
  const select = document.getElementById('coin');
  if (!select) return;
  // Only run if not already enhanced
  if (select.classList.contains('logos-enhanced')) return;
  select.classList.add('logos-enhanced');
  // Replace options with HTML including logos
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    const logo = coinLogoMap[opt.value];
    if (logo) {
      opt.innerHTML = ` <img src='${logo}' class='coin-logo' style='width:22px;height:22px;vertical-align:middle;margin-right:6px;'>${opt.text}`;
    }
  }
}

const showPrice = (coinData) => {
    const market = coinData.market_data;
    const price = market.current_price.usd;
    const vol = market.total_volume.usd;
    const change = market.price_change_percentage_24h;
    const coin = coinData.name;
    const curr = 'USD';
    const marketCap = market.market_cap.usd;
    const high24h = market.high_24h.usd;
    const low24h = market.low_24h.usd;
    const lastUpdated = new Date(coinData.last_updated).toLocaleString();
    let col = "green";
    if (change < 0) {
        col = "red";
    }
    // Coin logo
    const logo = coinLogoMap[coinData.id] ? `<img src='${coinLogoMap[coinData.id]}' class='coin-logo floating' style='width:36px;height:36px;'>` : '';
    res.innerHTML = `
    <tr class="bg-primary" style="color: white;">
        <td>Property</td>
        <td>Value</td>
    </tr>
    <tr>
        <td>Logo</td>
        <td>${logo}</td>
    </tr>
    <tr>
        <td>Name</td>
        <td>${coin}</td>
    </tr>
    <tr>
        <td>Price</td>
        <td style="color:${col};"><span style="font-size: 1.3em;">${price.toLocaleString(undefined, {maximumFractionDigits: 8})}</span> ${curr}</td>
    </tr>
    <tr>
        <td>Market Cap</td>
        <td>${marketCap.toLocaleString(undefined, {maximumFractionDigits: 0})} ${curr}</td>
    </tr>
    <tr>
        <td>Volume (24hrs)</td>
        <td>${vol.toLocaleString(undefined, {maximumFractionDigits: 0})} ${curr}</td>
    </tr>
    <tr>
        <td>Change (24hrs)</td>
        <td style="color:${col};">${change.toFixed(2)}%</td>
    </tr>
    <tr>
        <td>24h High</td>
        <td>${high24h.toLocaleString(undefined, {maximumFractionDigits: 8})} ${curr}</td>
    </tr>
    <tr>
        <td>24h Low</td>
        <td>${low24h.toLocaleString(undefined, {maximumFractionDigits: 8})} ${curr}</td>
    </tr>
    <tr>
        <td>Last Updated</td>
        <td>${lastUpdated}</td>
    </tr>
    <tr>
        <td>Set Price Alert</td>
        <td>
            <div style="display:flex;gap:8px;align-items:center;">
                <input id="alertInput-${coinData.id}" type="number" min="0" step="any" placeholder="Target USD"
                  style="background:#232946;color:#e0e6f7;border:1px solid rgba(0,255,231,0.5);border-radius:8px;padding:6px;width:160px;" />
                <button id="alertBtn-${coinData.id}" class="btn btn-secondary" style="padding:6px 10px;">Set Alert</button>
            </div>
            <div id="alertInfo-${coinData.id}" style="margin-top:6px;color:#00ffe7;"></div>
        </td>
    </tr>
    `;
    // Animate table fade-in
    res.classList.remove('fade-in');
    void res.offsetWidth; // trigger reflow
    res.classList.add('fade-in');

    // Wire up alert button
    const inputEl = document.getElementById(`alertInput-${coinData.id}`);
    const btnEl = document.getElementById(`alertBtn-${coinData.id}`);
    const infoEl = document.getElementById(`alertInfo-${coinData.id}`);
    const id = normalizeId(coinData.id);
    if (alerts[id]) {
      infoEl.textContent = `Current target: ${alerts[id].toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`;
    }
    if (btnEl) {
      btnEl.addEventListener('click', () => {
        const target = Number(inputEl && inputEl.value);
        if (!Number.isFinite(target) || target <= 0) return;
        alerts[id] = target;
        saveAlerts(alerts);
        ensureNotificationPermission();
        infoEl.textContent = `Current target: ${target.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`;
      });
    }
};

// Animation on scroll for sections and images
function animateOnScroll() {
  const fadeEls = document.querySelectorAll('.fade-in');
  const slideEls = document.querySelectorAll('.slide-in-left');
  const observer = new window.IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = 1;
        entry.target.style.transform = 'none';
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  fadeEls.forEach(el => observer.observe(el));
  slideEls.forEach(el => observer.observe(el));
}

// Chart.js chart instance
const showChartBtn = document.getElementById('showChartBtn');
if (showChartBtn) {
  showChartBtn.addEventListener('click', () => {
    const ctype = form.elements.coinType.value;
    showChartContainer();
    // Also notify React chart
    try { window.dispatchEvent(new CustomEvent('coin-selected', { detail: { id: ctype } })); } catch(_) {}
  });
}

document.addEventListener('DOMContentLoaded', function() {
  // Add animation classes to sections and about image
  document.querySelectorAll('section').forEach((el, i) => {
    el.classList.add(i % 2 === 0 ? 'fade-in' : 'slide-in-left');
  });
  const aboutImg = document.querySelector('#about img');
  if (aboutImg) aboutImg.classList.add('fade-in');
  animateOnScroll();
  enhanceDropdownWithLogos();
  ensureNotificationPermission();
  startAlertsBackgroundChecker();
});