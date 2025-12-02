// Using React from global UMD build (included via CDN in index.html)
const { useState, useEffect } = React;

/**
 * Portfolio
 * A simple component that lets users add a coin by id and quantity,
 * and displays a table with Coin, Current Price, Quantity, and Total Value.
 * Uses mock data for current prices for now.
 */
const Portfolio = () => {
  const [coinIdInput, setCoinIdInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [alertInputs, setAlertInputs] = useState({}); // id -> input string
  const [alerts, setAlerts] = useState({}); // id -> target price number

  // Mock prices as a temporary UI fallback before API loads
  const mockPriceById = {
    bitcoin: 68000,
    ethereum: 3600,
    solana: 160,
    'binancecoin': 590,
    cardano: 0.45,
  };

  // Store only id and quantity in portfolio
  const [portfolio, setPortfolio] = useState([
    { id: 'bitcoin', quantity: 0.25 },
    { id: 'ethereum', quantity: 1.5 },
  ]);

  // Live prices fetched from CoinGecko (id -> price in USD)
  const [prices, setPrices] = useState({});

  const STORAGE_KEY = 'portfolioData';
  const ALERTS_KEY = 'priceAlerts';

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .filter((row) => row && typeof row.id === 'string' && Number.isFinite(Number(row.quantity)))
        .map((row) => ({ id: row.id.toLowerCase(), quantity: Number(row.quantity) }));
      if (normalized.length > 0) {
        setPortfolio(normalized);
      }
    } catch (e) {
      // ignore malformed storage
    }
  }, []);

  // Load alerts from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ALERTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const normalized = {};
        Object.keys(parsed).forEach((k) => {
          const id = normalizeId(k);
          const val = Number(parsed[k]);
          if (id && Number.isFinite(val) && val > 0) {
            normalized[id] = val;
          }
        });
        setAlerts(normalized);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist to localStorage whenever portfolio changes (store only id and quantity)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
    } catch (e) {
      // ignore storage write errors
    }
  }, [portfolio]);

  // Persist alerts whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    } catch (e) {
      // ignore
    }
  }, [alerts]);

  const normalizeId = (val) => (typeof val === 'string' ? val.toLowerCase() : '');

  // Fetch current prices for all coins in the portfolio
  useEffect(() => {
    const ids = portfolio.map((p) => normalizeId(p.id));
    if (ids.length === 0) return;
    const uniqueIds = Array.from(new Set(ids));

    const controller = new AbortController();
    const fetchPrices = async () => {
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(uniqueIds.join(','))}&vs_currencies=usd`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to fetch prices');
        const data = await res.json();
        const next = {};
        uniqueIds.forEach((id) => {
          const entry = data && data[id];
          const price = entry && typeof entry.usd === 'number' ? entry.usd : undefined;
          if (price !== undefined) {
            next[id] = price;
          } else {
            // fallback to mock price if available
            next[id] = mockPriceById[id] ?? 0;
          }
        });
        setPrices(next);
      } catch (err) {
        // On error, fallback to mock prices for displayed coins
        const fallback = {};
        uniqueIds.forEach((id) => {
          fallback[id] = mockPriceById[id] ?? 0;
        });
        setPrices(fallback);
      }
    };

    fetchPrices();
    return () => controller.abort();
  }, [portfolio]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (_) {}
    }
  }, []);

  // Background checker for alerts
  useEffect(() => {
    const ids = Object.keys(alerts);
    if (ids.length === 0) return;
    let timer = null;

    const checkAlerts = async () => {
      const uniqueIds = Array.from(new Set(ids.map((id) => normalizeId(id))));
      if (uniqueIds.length === 0) return;
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(uniqueIds.join(','))}&vs_currencies=usd`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const triggered = [];
        uniqueIds.forEach((id) => {
          const entry = data && data[id];
          const price = entry && typeof entry.usd === 'number' ? entry.usd : undefined;
          const target = alerts[id];
          if (price !== undefined && Number.isFinite(target)) {
            if (price >= target) {
              triggered.push({ id, price, target });
            }
          }
        });
        if (triggered.length > 0) {
          // Notify and remove triggered alerts
          triggered.forEach(({ id, price, target }) => {
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Crypto Price Alert', {
                  body: `${id} reached ${price.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} (target ${target.toLocaleString(undefined, { style: 'currency', currency: 'USD' })})`,
                });
              } catch (_) {}
            }
          });
          setAlerts((prev) => {
            const next = { ...prev };
            triggered.forEach(({ id }) => { delete next[id]; });
            return next;
          });
        }
      } catch (_) {
        // ignore network errors
      }
    };

    // run immediately and then every 60s
    checkAlerts();
    timer = setInterval(checkAlerts, 60000);
    return () => { if (timer) clearInterval(timer); };
  }, [alerts]);

  const handleAddCoin = (event) => {
    event.preventDefault();
    const trimmedId = coinIdInput.trim().toLowerCase();
    const parsedQty = Number(quantityInput);

    if (!trimmedId) return;
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) return;

    setPortfolio((prev) => {
      const existingIndex = prev.findIndex((row) => row.id === trimmedId);
      if (existingIndex !== -1) {
        const updated = [...prev];
        const existing = updated[existingIndex];
        updated[existingIndex] = {
          ...existing,
          quantity: existing.quantity + parsedQty,
        };
        return updated;
      }
      return [
        ...prev,
        { id: trimmedId, quantity: parsedQty },
      ];
    });

    setCoinIdInput('');
    setQuantityInput('');
  };

  return (
    <div style={{ padding: '1rem', backgroundColor: '#181c2f', color: '#e0e6f7', borderRadius: '12px', boxShadow: '0 8px 32px 0 rgba(0,255,231,0.08), 0 1.5px 6px rgba(0,255,231,0.10)' }}>
      <h2 style={{ marginBottom: '1rem', color: '#00ffe7', textShadow: '0 2px 12px #00ffe7cc' }}>Portfolio</h2>

      <form onSubmit={handleAddCoin} style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="coinId"><strong>Coin ID</strong></label>
            <input
              id="coinId"
              type="text"
              placeholder="e.g., bitcoin"
              value={coinIdInput}
              onChange={(e) => setCoinIdInput(e.target.value)}
              style={{ background: '#232946', color: '#e0e6f7', border: '1px solid rgba(0,255,231,0.5)', borderRadius: '8px', padding: '0.5rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="quantity"><strong>Quantity</strong></label>
            <input
              id="quantity"
              type="number"
              step="any"
              min="0"
              placeholder="e.g., 0.5"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              style={{ background: '#232946', color: '#e0e6f7', border: '1px solid rgba(0,255,231,0.5)', borderRadius: '8px', padding: '0.5rem' }}
            />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button type="submit" style={{ background: 'linear-gradient(90deg, #00ffe7 0%, #7f5af0 100%)', color: '#181c2f', border: 'none', fontWeight: 'bold', borderRadius: '10px', padding: '0.55rem 0.9rem', boxShadow: '0 2px 16px #00ffe744, 0 0.5px 2px #7f5af044' }}>Add Coin</button>
          </div>
        </div>
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#232946', borderRadius: '12px', overflow: 'hidden' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', background: 'linear-gradient(90deg, #00ffe7 0%, #7f5af0 100%)', color: '#181c2f', padding: '0.6rem' }}>Coin</th>
              <th style={{ textAlign: 'right', background: 'linear-gradient(90deg, #00ffe7 0%, #7f5af0 100%)', color: '#181c2f', padding: '0.6rem' }}>Current Price</th>
              <th style={{ textAlign: 'right', background: 'linear-gradient(90deg, #00ffe7 0%, #7f5af0 100%)', color: '#181c2f', padding: '0.6rem' }}>Quantity</th>
              <th style={{ textAlign: 'right', background: 'linear-gradient(90deg, #00ffe7 0%, #7f5af0 100%)', color: '#181c2f', padding: '0.6rem' }}>Total Value</th>
              <th style={{ textAlign: 'right', background: 'linear-gradient(90deg, #00ffe7 0%, #7f5af0 100%)', color: '#181c2f', padding: '0.6rem' }}>Alert Target</th>
              <th style={{ textAlign: 'right', background: 'linear-gradient(90deg, #00ffe7 0%, #7f5af0 100%)', color: '#181c2f', padding: '0.6rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.map((row) => {
              const rowId = normalizeId(row.id);
              const price = (prices[rowId] !== undefined ? prices[rowId] : (mockPriceById[rowId] ?? 0));
              const totalValue = price * row.quantity;
              return (
                <tr key={row.id} style={{ background: 'rgba(24,28,47,0.6)' }}>
                  <td style={{ padding: '0.6rem', borderBottom: '1px solid rgba(0,255,231,0.25)' }}>{row.id}</td>
                  <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid rgba(0,255,231,0.25)' }}>
                    {price.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                  </td>
                  <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid rgba(0,255,231,0.25)' }}>
                    {row.quantity}
                  </td>
                  <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid rgba(0,255,231,0.25)' }}>
                    {totalValue.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                  </td>
                  <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid rgba(0,255,231,0.25)' }}>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g., 50000"
                      value={alertInputs[rowId] || ''}
                      onChange={(e) => setAlertInputs((prev) => ({ ...prev, [rowId]: e.target.value }))}
                      style={{ background: '#232946', color: '#e0e6f7', border: '1px solid rgba(0,255,231,0.5)', borderRadius: '8px', padding: '0.4rem', width: '140px' }}
                    />
                  </td>
                  <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid rgba(0,255,231,0.25)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const raw = alertInputs[rowId];
                        const target = Number(raw);
                        if (!Number.isFinite(target) || target <= 0) return;
                        setAlerts((prev) => ({ ...prev, [rowId]: target }));
                      }}
                      style={{ background: 'linear-gradient(90deg, #00ffe7 0%, #7f5af0 100%)', color: '#181c2f', border: 'none', fontWeight: 'bold', borderRadius: '10px', padding: '0.4rem 0.7rem', boxShadow: '0 2px 16px #00ffe744, 0 0.5px 2px #7f5af044' }}
                    >
                      Set Alert
                    </button>
                    {alerts[rowId] ? (
                      <div style={{ marginTop: '0.25rem', color: '#00ffe7' }}>Target: {alerts[rowId].toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ padding: '0.6rem', borderTop: '2px solid rgba(0,255,231,0.5)' }} colSpan="3"><strong style={{ color: '#00ffe7' }}>Grand Total</strong></td>
              <td style={{ padding: '0.6rem', textAlign: 'right', borderTop: '2px solid rgba(0,255,231,0.5)', color: '#00ffe7' }}>
                {portfolio
                  .reduce((sum, row) => {
                    const rowId = normalizeId(row.id);
                    const p = (prices[rowId] !== undefined ? prices[rowId] : (mockPriceById[rowId] ?? 0));
                    return sum + p * row.quantity;
                  }, 0)
                  .toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// Expose globally for direct usage in the browser without a bundler
if (typeof window !== 'undefined') {
  window.Portfolio = Portfolio;
}

