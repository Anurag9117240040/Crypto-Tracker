// Using React from global UMD build (included via CDN in index.html)
const { useState, useEffect, useMemo } = React;

// react-chartjs-2 UMD exposes ReactChartJS2 on window
// Chart.js is available globally as Chart

// Register needed Chart.js components
if (window.Chart && window.Chart.register) {
  const {
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    TimeScale,
    Tooltip,
    Legend,
    Filler,
  } = window.Chart;
  try {
    window.Chart.register(CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Legend, Filler);
  } catch (_) {}
}

const timeframeConfig = {
  '24h': { days: 1, interval: 'hourly' },
  '7d': { days: 7, interval: 'hourly' },
  '30d': { days: 30, interval: 'daily' },
  '1y': { days: 365, interval: 'daily' },
};

const CoinChart = () => {
  const [coinId, setCoinId] = useState('bitcoin');
  const [timeframe, setTimeframe] = useState('7d');
  const [series, setSeries] = useState([]); // [{t, y}]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Listen for coin selection events from the non-React UI
  useEffect(() => {
    const handler = (e) => {
      if (e && e.detail && e.detail.id) {
        setCoinId(String(e.detail.id).toLowerCase());
      }
    };
    window.addEventListener('coin-selected', handler);
    // Initialize from current select if available
    const select = document.getElementById('coin');
    if (select && select.value) setCoinId(String(select.value).toLowerCase());
    return () => window.removeEventListener('coin-selected', handler);
  }, []);

  // Fetch data when coin or timeframe changes
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        const cfg = timeframeConfig[timeframe] || timeframeConfig['7d'];
        const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${cfg.days}&interval=${cfg.interval}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch chart data');
        const json = await res.json();
        const points = Array.isArray(json.prices)
          ? json.prices.map((p) => ({ t: p[0], y: p[1] }))
          : [];
        if (!cancelled) setSeries(points);
      } catch (err) {
        if (!cancelled) setError('Could not load chart data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (coinId) fetchData();
    return () => { cancelled = true; };
  }, [coinId, timeframe]);

  const data = useMemo(() => {
    return {
      labels: series.map((p) => new Date(p.t)),
      datasets: [
        {
          label: `${coinId} price (USD)`,
          data: series.map((p) => p.y),
          borderColor: '#ff512f',
          backgroundColor: 'rgba(255,81,47,0.08)',
          pointRadius: 0,
          borderWidth: 2,
          fill: true,
          tension: 0.2,
        },
      ],
    };
  }, [series, coinId]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.y;
            return ` ${val?.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`;
          },
          title: (items) => {
            if (!items || !items.length) return '';
            const x = items[0].parsed.x;
            return new Date(x).toLocaleString();
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: timeframe === '24h' ? 'hour' : 'day' },
        grid: { display: false },
        ticks: { color: '#e0e6f7' },
      },
      y: {
        beginAtZero: false,
        grid: { color: 'rgba(255,255,255,0.08)' },
        ticks: { color: '#e0e6f7' },
      },
    },
  }), [timeframe]);

  const Line = window.ReactChartJS2 && window.ReactChartJS2.Line ? window.ReactChartJS2.Line : null;

  return (
    <div style={{ background: 'rgba(34, 40, 60, 0.7)', borderRadius: '12px', padding: '1rem', border: '1.5px solid rgba(0,255,231,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h4 style={{ margin: 0, color: '#00ffe7', textShadow: '0 2px 12px #00ffe7cc' }}>Interactive Chart</h4>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['24h','7d','30d','1y'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                background: timeframe === tf ? 'linear-gradient(90deg, #00ffe7 0%, #7f5af0 100%)' : '#232946',
                color: timeframe === tf ? '#181c2f' : '#e0e6f7',
                border: '1px solid rgba(0,255,231,0.5)',
                borderRadius: '8px',
                padding: '6px 10px',
                fontWeight: 'bold',
              }}
            >{tf}</button>
          ))}
        </div>
      </div>
      <div style={{ height: '280px' }}>
        {error ? (
          <div style={{ color: '#ff6b6b' }}>{error}</div>
        ) : loading || !Line ? (
          <div style={{ color: '#e0e6f7' }}>Loading chart...</div>
        ) : (
          <Line data={data} options={options} />
        )}
      </div>
    </div>
  );
};

// Expose globally
if (typeof window !== 'undefined') {
  window.CoinChart = CoinChart;
}

