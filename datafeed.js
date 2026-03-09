// ============================================================
//  datafeed.js — Twelve Data  ·  REST history + WS live prices
//  Free tier: 800 credits/day REST  |  8 symbols via WebSocket
// ============================================================

const TwelveDataFeed = (apiKey) => {

    // ── Resolution map TradingView → Twelve Data ──────────────
    const RES = {
        '1':'1min','3':'3min','5':'5min','15':'15min','30':'30min',
        '60':'1h','120':'2h','240':'4h','480':'8h','720':'12h',
        'D':'1day','1D':'1day','W':'1week','1W':'1week',
        'M':'1month','1M':'1month'
    };

    // ── WebSocket state ───────────────────────────────────────
    let _ws            = null;
    let _wsReady       = false;
    let _wsQueue       = [];          // messages queued before WS opens
    const _subs        = {};          // uid → { symbol, resolution, onTick, lastBar }

    // ── Last known bar cache per symbol+res ──────────────────
    const _barCache    = {};          // "SYMBOL|RES" → lastBar

    // ── Open / maintain WebSocket ─────────────────────────────
    function wsConnect() {
        if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;

        _ws = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`);
        _wsReady = false;

        _ws.onopen = () => {
            _wsReady = true;
            console.log('[TwelveWS] connected');
            // Flush queued subscribe messages
            _wsQueue.forEach(m => _ws.send(JSON.stringify(m)));
            _wsQueue = [];
            // Re-subscribe any existing subs (reconnect scenario)
            Object.values(_subs).forEach(sub => wsSubscribe(sub.symbol));
        };

        _ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                // Twelve Data sends {event:"price", symbol, price, timestamp, ...}
                if (msg.event !== 'price') return;

                const sym   = msg.symbol;
                const price = parseFloat(msg.price);
                const ts    = msg.timestamp * 1000; // → ms

                // Update every subscription that listens to this symbol
                Object.values(_subs).forEach(sub => {
                    if (sub.symbol !== sym) return;

                    const resMs = resolutionToMs(sub.resolution);
                    let bar     = _barCache[`${sym}|${sub.resolution}`];

                    if (!bar) return; // wait until getBars has run first

                    const barStart = Math.floor(ts / resMs) * resMs;

                    if (barStart > bar.time) {
                        // New bar started — close old, open new
                        bar = { time: barStart, open: price, high: price, low: price, close: price, volume: 0 };
                    } else {
                        // Same bar — update OHLC
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

            } catch(e) { /* ignore malformed */ }
        };

        _ws.onerror = (e) => console.warn('[TwelveWS] error', e);
        _ws.onclose = () => {
            _wsReady = false;
            console.warn('[TwelveWS] closed — reconnecting in 5s');
            setTimeout(wsConnect, 5000);
        };
    }

    function wsSubscribe(symbol) {
        const msg = { action: 'subscribe', params: { symbols: symbol } };
        if (_wsReady) _ws.send(JSON.stringify(msg));
        else _wsQueue.push(msg);
    }

    function wsUnsubscribe(symbol) {
        const stillNeeded = Object.values(_subs).some(s => s.symbol === symbol);
        if (stillNeeded) return; // other subs still need it
        const msg = { action: 'unsubscribe', params: { symbols: symbol } };
        if (_wsReady) _ws.send(JSON.stringify(msg));
    }

    // ── Convert resolution to milliseconds ───────────────────
    function resolutionToMs(res) {
        const map = {
            '1':60000,'3':180000,'5':300000,'15':900000,'30':1800000,
            '60':3600000,'120':7200000,'240':14400000,'480':28800000,'720':43200000,
            'D':86400000,'1D':86400000,'W':604800000,'1W':604800000,
            'M':2592000000,'1M':2592000000
        };
        return map[res] || 3600000;
    }

    // ── Clean symbol (strip "ICMARKETS:" prefix etc.) ────────
    function clean(sym) {
        return sym.includes(':') ? sym.split(':')[1] : sym;
    }

    // ═════════════════════════════════════════════════════════
    //  PUBLIC DATAFEED API
    // ═════════════════════════════════════════════════════════
    return {

        onReady(callback) {
            // Start WS connection immediately
            wsConnect();
            setTimeout(() => callback({
                supported_resolutions: ['1','3','5','15','30','60','120','240','480','720','D','W','M'],
                exchanges:             [],
                symbols_types:         [],
                supports_marks:        false,
                supports_timescale_marks: false,
                supports_time:         true,
            }), 0);
        },

        searchSymbols(userInput, exchange, symbolType, onResult) {
            fetch(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(userInput)}&apikey=${apiKey}`)
                .then(r => r.json())
                .then(data => {
                    if (!data.data) { onResult([]); return; }
                    onResult(data.data.slice(0, 20).map(s => ({
                        symbol:      s.symbol,
                        full_name:   s.symbol,
                        description: s.instrument_name || s.symbol,
                        exchange:    s.exchange || '',
                        type:        (s.instrument_type || 'forex').toLowerCase(),
                    })));
                })
                .catch(() => onResult([]));
        },

        resolveSymbol(symbolName, onResolved, onError) {
            const sym = clean(symbolName);

            // Detect type from symbol length / known patterns
            const isForex  = /^[A-Z]{6}$/.test(sym) || sym.includes('/');
            const isCrypto = sym.includes('BTC') || sym.includes('ETH') || sym.includes('USD') && sym.length > 6;

            const info = {
                name:            sym,
                description:     sym,
                type:            isForex ? 'forex' : isCrypto ? 'crypto' : 'stock',
                session:         '24x7',
                timezone:        'Asia/Kathmandu',
                ticker:          sym,
                minmov:          1,
                pricescale:      isForex ? 100000 : 100,
                has_intraday:    true,
                has_daily:       true,
                has_weekly_and_monthly: true,
                supported_resolutions: ['1','3','5','15','30','60','120','240','480','720','D','W','M'],
                volume_precision: 2,
                data_status:     'streaming',
                exchange:        '',
                listed_exchange: '',
                format:          'price',
            };

            // Try to enrich from API, fall back to detected info
            fetch(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(sym)}&apikey=${apiKey}`)
                .then(r => r.json())
                .then(data => {
                    const s = data.data?.[0];
                    if (s) {
                        info.description = s.instrument_name || sym;
                        info.exchange     = s.exchange || '';
                    }
                    onResolved(info);
                })
                .catch(() => onResolved(info));
        },

        getBars(symbolInfo, resolution, periodParams, onHistory, onError) {
            const { from, to, firstDataRequest, countBack } = periodParams;
            const sym      = symbolInfo.ticker || clean(symbolInfo.name);
            const interval = RES[resolution] || '1h';

            const startISO = new Date(from * 1000).toISOString().slice(0, 19);
            const endISO   = new Date(to   * 1000).toISOString().slice(0, 19);

            const url = `https://api.twelvedata.com/time_series`
                + `?symbol=${encodeURIComponent(sym)}`
                + `&interval=${interval}`
                + `&start_date=${startISO}`
                + `&end_date=${endISO}`
                + `&outputsize=5000`
                + `&order=ASC`
                + `&apikey=${apiKey}`;

            fetch(url)
                .then(r => r.json())
                .then(data => {
                    if (data.status === 'error' || !data.values || data.values.length === 0) {
                        onHistory([], { noData: true });
                        return;
                    }

                    const bars = data.values.map(v => ({
                        time:   new Date(v.datetime.replace(' ', 'T')).getTime(),
                        open:   parseFloat(v.open),
                        high:   parseFloat(v.high),
                        low:    parseFloat(v.low),
                        close:  parseFloat(v.close),
                        volume: parseFloat(v.volume || 0),
                    }));

                    // Cache the last bar so WebSocket can update it
                    if (bars.length > 0) {
                        _barCache[`${sym}|${resolution}`] = bars[bars.length - 1];
                    }

                    onHistory(bars, { noData: false });
                })
                .catch(e => onError(e.message));
        },

        subscribeBars(symbolInfo, resolution, onTick, uid) {
            const sym = symbolInfo.ticker || clean(symbolInfo.name);

            _subs[uid] = { symbol: sym, resolution, onTick,
                           lastBar: _barCache[`${sym}|${resolution}`] || null };

            // Subscribe via WebSocket for live tick
            wsSubscribe(sym);

            console.log(`[TwelveWS] subscribeBars  uid=${uid}  sym=${sym}  res=${resolution}`);
        },

        unsubscribeBars(uid) {
            const sub = _subs[uid];
            if (!sub) return;
            delete _subs[uid];
            wsUnsubscribe(sub.symbol);
            console.log(`[TwelveWS] unsubscribeBars uid=${uid}`);
        },
    };
};