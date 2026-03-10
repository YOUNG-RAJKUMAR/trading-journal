// datafeed.js — Twelve Data × TradingView Charting Library
// Free tier: 800 req/day | Resolutions: 1min, 5min, 15min, 30min, 1h, 1day, 1week

const TD_API_KEY = 'YOUR_TWELVE_DATA_API_KEY'; // ← paste your key here

// Resolution map: TradingView → Twelve Data
const RES_MAP = {
    '1':   '1min',
    '5':   '5min',
    '15':  '15min',
    '30':  '30min',
    '60':  '1h',
    '240': '4h',
    'D':   '1day',
    'W':   '1week',
    '1M':  '1month',
};

const SUPPORTED_PAIRS = [
    'EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CHF',
    'USD/CAD','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY',
    'EUR/CHF','AUD/JPY','GBP/CAD','EUR/AUD','USD/SGD',
    'USD/HKD','EUR/NOK','USD/NOK','USD/SEK','USD/DKK',
    'XAU/USD','XAG/USD'  // Gold & Silver bonus
];

function parsePair(symbol) {
    const clean = symbol.replace(/[/_]/g, '');
    if (clean.length !== 6) return null;
    return `${clean.slice(0,3).toUpperCase()}/${clean.slice(3).toUpperCase()}`;
}

// Simple in-memory cache to preserve free tier quota
const _cache = new Map();
function cacheKey(symbol, resolution, from, to) {
    return `${symbol}_${resolution}_${from}_${to}`;
}

async function fetchCandles(symbol, resolution, from, to) {
    const tdRes = RES_MAP[resolution] || '1h';

    // Convert unix timestamps → ISO strings
    const startDate = new Date(from * 1000).toISOString().slice(0, 19);
    const endDate   = new Date(to   * 1000).toISOString().slice(0, 19);

    const key = cacheKey(symbol, tdRes, startDate, endDate);
    if (_cache.has(key)) return _cache.get(key);

    const url = `https://api.twelvedata.com/time_series`
        + `?symbol=${encodeURIComponent(symbol)}`
        + `&interval=${tdRes}`
        + `&start_date=${encodeURIComponent(startDate)}`
        + `&end_date=${encodeURIComponent(endDate)}`
        + `&outputsize=5000`
        + `&format=JSON`
        + `&timezone=UTC`
        + `&apikey=${TD_API_KEY}`;

    const res  = await fetch(url);
    const data = await res.json();

    if (data.status === 'error') throw new Error(data.message || 'Twelve Data error');
    if (!data.values || data.values.length === 0) return [];

    // Twelve Data returns newest-first → reverse to oldest-first
    const bars = data.values.reverse().map(v => ({
        time:   Math.floor(new Date(v.datetime + 'Z').getTime() / 1000),
        open:   parseFloat(v.open),
        high:   parseFloat(v.high),
        low:    parseFloat(v.low),
        close:  parseFloat(v.close),
        volume: parseFloat(v.volume) || 0,
    }));

    _cache.set(key, bars);
    return bars;
}

// ─── Datafeed Object ───────────────────────────────────────────────────────
const TwelveDataFeed = {

    onReady(callback) {
        setTimeout(() => callback({
            supported_resolutions: ['1','5','15','30','60','240','D','W','1M'],
            supports_time:          true,
            supports_marks:         false,
            supports_timescale_marks: false,
            exchanges: [{
                value: 'TWELVE_DATA', name: 'Twelve Data', desc: 'Real-time Forex'
            }],
            symbols_types: [{ name: 'forex', value: 'forex' }]
        }), 0);
    },

    searchSymbols(userInput, exchange, symbolType, onResult) {
        const q = userInput.toUpperCase().replace(/[/_]/g, '');
        const results = SUPPORTED_PAIRS
            .filter(p => p.replace('/', '').includes(q))
            .map(p => ({
                symbol:      p.replace('/', ''),
                full_name:   p,
                description: `${p} Forex`,
                exchange:    'TWELVE_DATA',
                type:        'forex'
            }));
        onResult(results);
    },

    resolveSymbol(symbolName, onResolve, onError) {
        const pair = parsePair(symbolName);
        if (!pair) { onError('Invalid symbol'); return; }

        const isGold = pair === 'XAU/USD' || pair === 'XAG/USD';

        setTimeout(() => onResolve({
            name:          pair.replace('/', ''),
            full_name:     pair,
            description:   `${pair} (Twelve Data)`,
            type:          'forex',
            session:       '24x5',
            timezone:      'Asia/Kathmandu',
            exchange:      'TWELVE_DATA',
            listed_exchange: 'TWELVE_DATA',
            format:        'price',
            minmov:        1,
            pricescale:    isGold ? 100 : 100000,  // Gold = 2dp, Forex = 5dp
            has_intraday:  true,
            has_daily:     true,
            has_weekly_and_monthly: true,
            supported_resolutions: ['1','5','15','30','60','240','D','W','1M'],
            volume_precision: 0,
            data_status:   'streaming',
        }), 0);
    },

    async getBars(symbolInfo, resolution, periodParams, onResult, onError) {
        const { from, to } = periodParams;
        const pair = parsePair(symbolInfo.name);
        if (!pair) { onError('Invalid pair'); return; }

        try {
            const bars = await fetchCandles(pair, resolution, from, to);
            onResult(bars, { noData: bars.length === 0 });
        } catch (err) {
            console.error('[TwelveData]', err.message);
            onError(err.message);
        }
    },

    _subs: {},

    subscribeBars(symbolInfo, resolution, onTick, subscriberUID) {
        const pair = parsePair(symbolInfo.name);
        if (!pair) return;

        // Poll every 60s (saves free tier quota)
        const poll = async () => {
            try {
                const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(pair)}&apikey=${TD_API_KEY}`;
                const res  = await fetch(url);
                const data = await res.json();
                if (data.price) {
                    const price = parseFloat(data.price);
                    const now   = Math.floor(Date.now() / 1000);
                    onTick({ time: now, open: price, high: price, low: price, close: price, volume: 0 });
                }
            } catch (e) { /* silent */ }
        };

        poll();
        this._subs[subscriberUID] = setInterval(poll, 60000);
    },

    unsubscribeBars(subscriberUID) {
        if (this._subs[subscriberUID]) {
            clearInterval(this._subs[subscriberUID]);
            delete this._subs[subscriberUID];
        }
    }
};

export default TwelveDataFeed;