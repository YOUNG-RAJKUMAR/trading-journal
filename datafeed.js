// ============================================================
//  datafeed.js — Twelve Data  ·  REST history + WS live prices
//  v3 — Fixed lag, bad candles, correct UTC timestamps
// ============================================================

const TwelveDataFeed = (apiKey) => {

    // ── Resolution → Twelve Data interval ────────────────────
    const RES = {
        '1':'1min','3':'3min','5':'5min','15':'15min','30':'30min',
        '60':'1h','120':'2h','240':'4h','480':'8h','720':'12h',
        'D':'1day','1D':'1day','W':'1week','1W':'1week',
        'M':'1month','1M':'1month'
    };

    // ── How many bars to fetch per resolution ─────────────────
    // Less bars = faster load, no lag
    const BAR_LIMIT = {
        '1':300,'3':300,'5':300,'15':300,'30':300,
        '60':500,'120':500,'240':500,'480':500,'720':500,
        'D':500,'1D':500,'W':300,'1W':300,'M':200,'1M':200
    };

    // ── WebSocket state ───────────────────────────────────────
    let _ws         = null;
    let _wsReady    = false;
    let _wsQueue    = [];
    const _subs     = {};
    const _barCache = {};

    // ── Symbol conversion ─────────────────────────────────────
    function toTwelveSymbol(raw) {
        let sym = raw.includes(':') ? raw.split(':')[1] : raw;
        sym = sym.trim().toUpperCase();
        if (sym.includes('/')) return sym;

        const CURRENCIES = [
            'USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD',
            'SGD','HKD','NOK','SEK','DKK','MXN','ZAR','TRY',
            'CNY','CNH','INR','BRL','RUB','PLN','HUF','CZK',
            'THB','IDR','MYR','PHP','KRW','ILS','SAR','AED',
            'XAU','XAG','XPT','XPD'
        ];

        if (sym.length === 6) {
            const base  = sym.slice(0, 3);
            const quote = sym.slice(3, 6);
            if (CURRENCIES.includes(base) && CURRENCIES.includes(quote)) {
                return `${base}/${quote}`;
            }
        }

        const CRYPTO = ['BTC','ETH','LTC','XRP','ADA','SOL','DOT','LINK','BNB','DOGE','AVAX','MATIC'];
        for (const c of CRYPTO) {
            if (sym.startsWith(c)) return `${c}/USD`;
        }

        return sym;
    }

    function getPriceScale(sym) {
        const s = sym.toUpperCase();
        if (s.includes('JPY') || s.includes('HUF') || s.includes('KRW') || s.includes('IDR')) return 1000;
        if (s.includes('XAU') || s.includes('GOLD'))   return 100;
        if (s.includes('XAG') || s.includes('SILVER')) return 1000;
        if (s.includes('BTC'))  return 100;
        if (s.includes('ETH'))  return 100;
        if (s.includes('SPX')  || s.includes('NAS') || s.includes('US500') ||
            s.includes('US100')|| s.includes('DAX') || s.includes('FTSE')) return 100;
        return 100000;
    }

    function getType(sym) {
        const s = sym.toUpperCase().replace('/','');
        const CRYPTO = ['BTC','ETH','LTC','XRP','ADA','SOL','DOT','BNB','DOGE','AVAX'];
        if (CRYPTO.some(c => s.includes(c))) return 'crypto';
        if (s.includes('XAU') || s.includes('XAG') || s.includes('GOLD') || s.includes('SILVER')) return 'commodity';
        if (s.includes('SPX') || s.includes('NAS') || s.includes('DAX')  ||
            s.includes('FTSE')|| s.includes('US5') || s.includes('US1')) return 'index';
        if (s.length === 6) return 'forex';
        return 'stock';
    }

    function getSession(type) {
        if (type === 'forex' || type === 'crypto' || type === 'commodity') return '24x7';
        return '0930-1600';
    }

    // ── Spike/bad candle filter ───────────────────────────────
    // Removes candles where high-low is impossibly large (data errors)
    function filterBadBars(bars, sym) {
        if (bars.length < 3) return bars;
        const type = getType(sym);

        // Max allowed wick size — forex ~500 pips, crypto ~20%, indices ~5%
        const maxWickPct = type === 'forex' ? 0.05 : type === 'crypto' ? 0.25 : 0.08;

        return bars.filter((bar, i) => {
            if (bar.open <= 0 || bar.close <= 0 || bar.high <= 0 || bar.low <= 0) return false;
            if (bar.high < bar.low) return false;
            if (bar.high < bar.open || bar.high < bar.close) return false;
            if (bar.low  > bar.open || bar.low  > bar.close) return false;

            const range = bar.high - bar.low;
            const pct   = range / bar.close;
            if (pct > maxWickPct) {
                console.warn(`[TwelveDF] Filtered bad bar at ${new Date(bar.time).toISOString()} — range ${(pct*100).toFixed(2)}%`);
                return false;
            }
            return true;
        });
    }

    // ── WebSocket ─────────────────────────────────────────────
    function wsConnect() {
        if (_ws && (_ws.readyState === WebSocket.OPEN ||
                    _ws.readyState === WebSocket.CONNECTING)) return;

        _ws      = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`);
        _wsReady = false;

        _ws.onopen = () => {
            _wsReady = true;
            console.log('[TwelveWS] ✓ Connected');
            _wsQueue.forEach(m => _ws.send(JSON.stringify(m)));
            _wsQueue = [];
            const unique = [...new Set(Object.values(_subs).map(s => s.symbol))];
            unique.forEach(sym => wsSend('subscribe', sym));
        };

        _ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.event !== 'price') return;

                const sym   = msg.symbol;
                const price = parseFloat(msg.price);
                const ts    = (msg.timestamp || Math.floor(Date.now() / 1000)) * 1000;

                if (!price || isNaN(price)) return;

                Object.values(_subs).forEach(sub => {
                    if (sub.symbol !== sym) return;

                    const resMs    = resolutionToMs(sub.resolution);
                    const barStart = Math.floor(ts / resMs) * resMs;
                    let bar        = _barCache[`${sym}|${sub.resolution}`];

                    if (!bar) return;

                    // Spike protection — ignore ticks more than 2% away from last close (forex)
                    const type       = getType(sym);
                    const maxDiffPct = type === 'forex' ? 0.02 : type === 'crypto' ? 0.10 : 0.05;
                    if (Math.abs(price - bar.close) / bar.close > maxDiffPct) return;

                    if (barStart > bar.time) {
                        bar = { time: barStart, open: price, high: price, low: price, close: price, volume: 0 };
                    } else {
                        bar = {
                            ...bar,
                            high:  Math.max(bar.high, price),
                            low:   Math.min(bar.low,  price),
                            close: price,
                        };
                    }

                    _barCache[`${sym}|${sub.resolution}`] = bar;
                    sub.onTick({ ...bar });
                });

            } catch(e) {}
        };

        _ws.onerror = () => console.warn('[TwelveWS] ✗ Connection error — check API key');
        _ws.onclose = () => {
            _wsReady = false;
            console.warn('[TwelveWS] Closed — reconnecting in 5s...');
            setTimeout(wsConnect, 5000);
        };
    }

    function wsSend(action, symbol) {
        const msg = { action, params: { symbols: symbol } };
        if (_wsReady && _ws && _ws.readyState === WebSocket.OPEN) {
            _ws.send(JSON.stringify(msg));
        } else {
            _wsQueue.push(msg);
        }
    }

    function resolutionToMs(res) {
        const map = {
            '1':60000,'3':180000,'5':300000,'15':900000,'30':1800000,
            '60':3600000,'120':7200000,'240':14400000,'480':28800000,'720':43200000,
            'D':86400000,'1D':86400000,'W':604800000,'1W':604800000,
            'M':2592000000,'1M':2592000000
        };
        return map[res] || 3600000;
    }

    // ── Parse Twelve Data datetime correctly ──────────────────
    // Twelve Data returns UTC datetimes without timezone info
    // We must parse them as UTC — NOT local time
    function parseUTCDatetime(str) {
        // "2026-03-09 13:30:00" → treat as UTC
        // Replace space with T and add Z for explicit UTC
        return new Date(str.replace(' ', 'T') + 'Z').getTime();
    }

    // ═════════════════════════════════════════════════════════
    //  PUBLIC DATAFEED API
    // ═════════════════════════════════════════════════════════
    return {

        onReady(callback) {
            wsConnect();
            setTimeout(() => callback({
                supported_resolutions: [
                    '1','3','5','15','30','60','120','240','480','720',
                    'D','1D','W','1W','M','1M'
                ],
                exchanges:                [],
                symbols_types:            [],
                supports_marks:           false,
                supports_timescale_marks: false,
                supports_time:            true,
            }), 0);
        },

        searchSymbols(userInput, exchange, symbolType, onResult) {
            const query = userInput.replace('/', '').trim();
            fetch(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${apiKey}`)
                .then(r => r.json())
                .then(data => {
                    if (!data.data) { onResult([]); return; }
                    onResult(data.data.slice(0, 30).map(s => ({
                        symbol:      s.symbol,
                        full_name:   s.symbol,
                        description: s.instrument_name || s.symbol,
                        exchange:    s.exchange || '',
                        type:        getType(s.symbol),
                    })));
                })
                .catch(() => onResult([]));
        },

        resolveSymbol(symbolName, onResolved, onError) {
            const twelveSym  = toTwelveSymbol(symbolName);
            const type       = getType(twelveSym);
            const pricescale = getPriceScale(twelveSym);
            const session    = getSession(type);

            console.log(`[TwelveDF] resolve: "${symbolName}" → "${twelveSym}" scale=${pricescale} type=${type}`);

            onResolved({
                name:            twelveSym,
                description:     twelveSym,
                type:            type,
                session:         session,
                timezone:        'Etc/UTC',       // ← always UTC internally
                ticker:          twelveSym,
                minmov:          1,
                pricescale:      pricescale,
                has_intraday:    true,
                has_daily:       true,
                has_weekly_and_monthly: true,
                supported_resolutions: [
                    '1','3','5','15','30','60','120','240','480','720',
                    'D','1D','W','1W','M','1M'
                ],
                volume_precision: 0,
                data_status:     'streaming',
                exchange:        '',
                listed_exchange: '',
                format:          'price',
            });
        },

        getBars(symbolInfo, resolution, periodParams, onHistory, onError) {
            const { from, to, firstDataRequest } = periodParams;
            const sym      = symbolInfo.ticker || toTwelveSymbol(symbolInfo.name);
            const interval = RES[resolution] || '1h';

            // ── Use outputsize instead of date range for speed ──
            // Only use date range on historical (non-first) requests
            const limit  = BAR_LIMIT[resolution] || 300;

            let url = `https://api.twelvedata.com/time_series`
                + `?symbol=${encodeURIComponent(sym)}`
                + `&interval=${interval}`
                + `&outputsize=${limit}`
                + `&order=ASC`
                + `&apikey=${apiKey}`;

            // For paginated history requests, add date range
            if (!firstDataRequest) {
                const startISO = new Date(from * 1000).toISOString().slice(0, 19);
                const endISO   = new Date(to   * 1000).toISOString().slice(0, 19);
                url += `&start_date=${startISO}&end_date=${endISO}`;
            }

            console.log(`[TwelveDF] getBars: ${sym} ${interval} limit=${limit} first=${firstDataRequest}`);

            fetch(url)
                .then(r => r.json())
                .then(data => {
                    if (data.status === 'error') {
                        console.warn(`[TwelveDF] API error for ${sym}:`, data.message);
                        onHistory([], { noData: true });
                        return;
                    }

                    if (!data.values || data.values.length === 0) {
                        onHistory([], { noData: true });
                        return;
                    }

                    const rawBars = data.values.map(v => ({
                        time:   parseUTCDatetime(v.datetime),
                        open:   parseFloat(v.open),
                        high:   parseFloat(v.high),
                        low:    parseFloat(v.low),
                        close:  parseFloat(v.close),
                        volume: parseFloat(v.volume || 0),
                    }));

                    // Remove bad/spike candles
                    const bars = filterBadBars(rawBars, sym);

                    // Cache latest bar for WebSocket
                    if (bars.length > 0) {
                        _barCache[`${sym}|${resolution}`] = bars[bars.length - 1];
                    }

                    console.log(`[TwelveDF] getBars: ${bars.length} bars (${rawBars.length - bars.length} filtered) for ${sym}`);
                    onHistory(bars, { noData: bars.length === 0 });
                })
                .catch(e => {
                    console.error(`[TwelveDF] Fetch error:`, e);
                    onError(e.message);
                });
        },

        subscribeBars(symbolInfo, resolution, onTick, uid) {
            const sym = symbolInfo.ticker || toTwelveSymbol(symbolInfo.name);
            _subs[uid] = { symbol: sym, resolution, onTick };
            wsSend('subscribe', sym);
            console.log(`[TwelveWS] subscribe → uid=${uid} sym=${sym} res=${resolution}`);
        },

        unsubscribeBars(uid) {
            const sub = _subs[uid];
            if (!sub) return;
            const sym = sub.symbol;
            delete _subs[uid];
            const stillNeeded = Object.values(_subs).some(s => s.symbol === sym);
            if (!stillNeeded) wsSend('unsubscribe', sym);
            console.log(`[TwelveWS] unsubscribe uid=${uid}`);
        },
    };
};