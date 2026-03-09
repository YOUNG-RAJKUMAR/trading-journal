// ============================================================
//  datafeed.js — SMART HYBRID
//
//  History (ALL):        Twelve Data REST
//  Live Forex:           Twelve Data WebSocket   ← only one that works free
//  Live Crypto/Stocks:   Finnhub WebSocket       ← works free for these
//
//  Twelve Data key : ea488f33f6d841778d55e540d889c308
//  Finnhub key     : d6n5iihr01qir35j8pi0d6n5iihr01qir35j8pig
// ============================================================

const TwelveDataFeed = (TWELVE_KEY, FINNHUB_KEY) => {

    // ── Resolution map → Twelve Data intervals ────────────────
    const TD_RES = {
        '1':'1min','3':'3min','5':'5min','15':'15min','30':'30min',
        '60':'1h','120':'2h','240':'4h','480':'8h','720':'12h',
        'D':'1day','1D':'1day','W':'1week','1W':'1week',
        'M':'1month','1M':'1month'
    };

    // Max bars per resolution — keeps load fast
    const BAR_LIMIT = {
        '1':200,'3':200,'5':200,'15':300,'30':300,
        '60':400,'120':400,'240':500,
        'D':500,'1D':500,'W':300,'1W':300,'M':200,'1M':200
    };

    // ── Twelve Data WebSocket state (forex) ───────────────────
    let _tdWs       = null;
    let _tdReady    = false;
    let _tdQueue    = [];

    // ── Finnhub WebSocket state (crypto + stocks) ─────────────
    let _fhWs       = null;
    let _fhReady    = false;
    let _fhQueue    = [];

    // ── Shared subscription + bar cache ───────────────────────
    const _subs     = {};    // uid → { tdSym, fhSym, type, resolution, onTick }
    const _barCache = {};    // "tdSym|RES" → last bar

    // ─────────────────────────────────────────────────────────
    //  SYMBOL HELPERS
    // ─────────────────────────────────────────────────────────
    const CURRENCIES = [
        'USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD',
        'SGD','HKD','NOK','SEK','DKK','MXN','ZAR','TRY',
        'CNY','CNH','INR','BRL','PLN','HUF','CZK',
        'THB','IDR','MYR','PHP','KRW','SAR','AED',
        'XAU','XAG','XPT','XPD'
    ];
    const CRYPTO_LIST = [
        'BTC','ETH','LTC','XRP','ADA','SOL','DOT',
        'LINK','BNB','DOGE','AVAX','MATIC'
    ];

    function cleanRaw(raw) {
        let s = raw.includes(':') ? raw.split(':')[1] : raw;
        return s.trim().toUpperCase().replace('/','').replace('_','');
    }

    // Twelve Data format: EUR/USD, XAU/USD, BTC/USD, AAPL
    function toTDSymbol(raw) {
        const s = cleanRaw(raw);
        if (s.length === 6) {
            const base  = s.slice(0,3);
            const quote = s.slice(3,6);
            if (CURRENCIES.includes(base) && CURRENCIES.includes(quote))
                return `${base}/${quote}`;
        }
        for (const c of CRYPTO_LIST) {
            if (s.startsWith(c)) return `${c}/USD`;
        }
        return s; // stocks/indices as-is
    }

    // Finnhub format: OANDA:EUR_USD, BINANCE:BTCUSDT, AAPL
    function toFinnhubSym(raw) {
        const s = cleanRaw(raw);
        if (s.length === 6) {
            const base  = s.slice(0,3);
            const quote = s.slice(3,6);
            if (CURRENCIES.includes(base) && CURRENCIES.includes(quote))
                return `OANDA:${base}_${quote}`;
        }
        for (const c of CRYPTO_LIST) {
            if (s.startsWith(c)) return `BINANCE:${c}USDT`;
        }
        return s; // stocks as-is e.g. AAPL
    }

    function getType(sym) {
        const s = sym.toUpperCase().replace('/','').replace('_','');
        if (CRYPTO_LIST.some(c => s.includes(c)))      return 'crypto';
        if (s.includes('XAU') || s.includes('XAG') ||
            s.includes('GOLD')|| s.includes('SILVER')) return 'commodity';
        if (s.includes('SPX') || s.includes('NAS') ||
            s.includes('DAX') || s.includes('FTSE') ||
            s.includes('US5') || s.includes('US1'))    return 'index';
        if (s.replace('OANDA:','').replace('_','').length === 6
            || s.length === 6)                         return 'forex';
        return 'stock';
    }

    // Decide which WS handles this type
    // forex + commodity → Twelve Data WS
    // crypto + stock + index → Finnhub WS
    function wsTypeFor(type) {
        return (type === 'forex' || type === 'commodity') ? 'twelvedata' : 'finnhub';
    }

    function getSession(type) {
        return (type === 'forex' || type === 'crypto' || type === 'commodity')
            ? '24x7' : '0930-1600';
    }

    function getPriceScale(sym) {
        const s = sym.toUpperCase();
        if (s.includes('JPY') || s.includes('HUF') ||
            s.includes('KRW') || s.includes('IDR'))   return 1000;
        if (s.includes('XAU') || s.includes('GOLD'))  return 100;
        if (s.includes('XAG') || s.includes('SILVER'))return 1000;
        if (s.includes('BTC') || s.includes('ETH'))   return 100;
        if (s.includes('SPX') || s.includes('NAS') ||
            s.includes('US500')|| s.includes('US100')||
            s.includes('DAX')  || s.includes('FTSE')) return 100;
        return 100000;
    }

    // ── Bad candle / spike filter ─────────────────────────────
    function filterBadBars(bars, sym) {
        if (bars.length < 2) return bars;
        const type     = getType(sym);
        const maxRange = type === 'forex' ? 0.03
                       : type === 'crypto' ? 0.20 : 0.08;
        return bars.filter(b => {
            if (!b.open || !b.close || !b.high || !b.low) return false;
            if (b.high < b.low || b.high < b.open || b.high < b.close) return false;
            if (b.low  > b.open || b.low  > b.close) return false;
            const range = (b.high - b.low) / b.close;
            if (range > maxRange) {
                console.warn(`[DF] Spike filtered ${new Date(b.time).toISOString()} range=${(range*100).toFixed(2)}%`);
                return false;
            }
            return true;
        });
    }

    // ── Apply incoming tick to cached bar ─────────────────────
    function applyTick(tdSym, resolution, price, ts) {
        if (!price || isNaN(price)) return;

        const cacheKey = `${tdSym}|${resolution}`;
        let bar        = _barCache[cacheKey];
        if (!bar) return;

        // Spike guard
        const type    = getType(tdSym);
        const maxDiff = type === 'forex'  ? 0.005
                      : type === 'crypto' ? 0.12
                      : 0.05;
        if (Math.abs(price - bar.close) / bar.close > maxDiff) {
            console.warn(`[DF] Tick spike ignored price=${price} last=${bar.close}`);
            return;
        }

        const resMs    = resolutionToMs(resolution);
        const barStart = Math.floor(ts / resMs) * resMs;

        if (barStart > bar.time) {
            bar = { time:barStart, open:price, high:price, low:price, close:price, volume:0 };
        } else {
            bar = { ...bar,
                high:  Math.max(bar.high, price),
                low:   Math.min(bar.low,  price),
                close: price
            };
        }

        _barCache[cacheKey] = bar;

        // Fire onTick for all matching subscriptions
        Object.values(_subs).forEach(sub => {
            if (sub.tdSym === tdSym && sub.resolution === resolution) {
                sub.onTick({ ...bar });
            }
        });
    }

    // ─────────────────────────────────────────────────────────
    //  TWELVE DATA WEBSOCKET  — forex & commodities
    // ─────────────────────────────────────────────────────────
    function tdWsConnect() {
        if (_tdWs && (_tdWs.readyState === WebSocket.OPEN ||
                      _tdWs.readyState === WebSocket.CONNECTING)) return;

        _tdWs   = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${TWELVE_KEY}`);
        _tdReady = false;

        _tdWs.onopen = () => {
            _tdReady = true;
            console.log('[TD-WS] ✓ Connected (forex/commodity)');
            _tdQueue.forEach(m => _tdWs.send(JSON.stringify(m)));
            _tdQueue = [];
            // Re-subscribe on reconnect
            const unique = [...new Set(
                Object.values(_subs)
                    .filter(s => wsTypeFor(s.type) === 'twelvedata')
                    .map(s => s.tdSym)
            )];
            unique.forEach(sym => tdWsSend('subscribe', sym));
        };

        _tdWs.onmessage = evt => {
            try {
                const msg = JSON.parse(evt.data);
                // { event:"price", symbol:"EUR/USD", price:1.12345, timestamp:1234567890 }
                if (msg.event !== 'price') return;
                const price = parseFloat(msg.price);
                const ts    = (msg.timestamp || Math.floor(Date.now()/1000)) * 1000;
                const sym   = msg.symbol; // TD format e.g. "EUR/USD"

                Object.values(_subs).forEach(sub => {
                    if (sub.tdSym === sym && wsTypeFor(sub.type) === 'twelvedata') {
                        applyTick(sym, sub.resolution, price, ts);
                    }
                });
            } catch(e) {}
        };

        _tdWs.onerror = () => console.warn('[TD-WS] ✗ Error');
        _tdWs.onclose = () => {
            _tdReady = false;
            console.warn('[TD-WS] Closed — reconnecting in 5s...');
            setTimeout(tdWsConnect, 5000);
        };
    }

    function tdWsSend(action, symbol) {
        const msg = { action, params: { symbols: symbol } };
        if (_tdReady && _tdWs && _tdWs.readyState === WebSocket.OPEN) {
            _tdWs.send(JSON.stringify(msg));
        } else {
            _tdQueue.push(msg);
        }
    }

    // ─────────────────────────────────────────────────────────
    //  FINNHUB WEBSOCKET  — crypto & stocks
    // ─────────────────────────────────────────────────────────
    function fhWsConnect() {
        if (_fhWs && (_fhWs.readyState === WebSocket.OPEN ||
                      _fhWs.readyState === WebSocket.CONNECTING)) return;

        _fhWs   = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);
        _fhReady = false;

        _fhWs.onopen = () => {
            _fhReady = true;
            console.log('[FH-WS] ✓ Connected (crypto/stocks)');
            _fhQueue.forEach(m => _fhWs.send(JSON.stringify(m)));
            _fhQueue = [];
            // Re-subscribe on reconnect
            const unique = [...new Set(
                Object.values(_subs)
                    .filter(s => wsTypeFor(s.type) === 'finnhub')
                    .map(s => s.fhSym)
            )];
            unique.forEach(sym => fhWsSend('subscribe', sym));
        };

        _fhWs.onmessage = evt => {
            try {
                const msg = JSON.parse(evt.data);
                // { type:"trade", data:[{ s:"BINANCE:BTCUSDT", p:65000, t:1234567890000 }] }
                if (msg.type !== 'trade' || !msg.data) return;

                msg.data.forEach(trade => {
                    const fhSym = trade.s;
                    const price = parseFloat(trade.p);
                    const ts    = trade.t; // already ms

                    // Find matching subscription by finnhub symbol
                    Object.values(_subs).forEach(sub => {
                        if (sub.fhSym === fhSym && wsTypeFor(sub.type) === 'finnhub') {
                            applyTick(sub.tdSym, sub.resolution, price, ts);
                        }
                    });
                });
            } catch(e) {}
        };

        _fhWs.onerror = () => console.warn('[FH-WS] ✗ Error');
        _fhWs.onclose = () => {
            _fhReady = false;
            console.warn('[FH-WS] Closed — reconnecting in 5s...');
            setTimeout(fhWsConnect, 5000);
        };
    }

    function fhWsSend(action, symbol) {
        const msg = { type: action, symbol };
        if (_fhReady && _fhWs && _fhWs.readyState === WebSocket.OPEN) {
            _fhWs.send(JSON.stringify(msg));
        } else {
            _fhQueue.push(msg);
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

    // ─────────────────────────────────────────────────────────
    //  PUBLIC DATAFEED API
    // ─────────────────────────────────────────────────────────
    return {

        onReady(callback) {
            // Connect both WebSockets immediately on page load
            tdWsConnect();
            fhWsConnect();
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
            if (!userInput || userInput.trim() === '') { onResult([]); return; }
            const query = userInput.replace('/','').trim();
            fetch(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${TWELVE_KEY}`)
                .then(r => r.json())
                .then(data => {
                    if (!data.data) { onResult([]); return; }
                    onResult(data.data.slice(0,30).map(s => ({
                        symbol:      toTDSymbol(s.symbol),
                        full_name:   toTDSymbol(s.symbol),
                        description: s.instrument_name || s.symbol,
                        exchange:    s.exchange || '',
                        type:        getType(s.symbol),
                    })));
                })
                .catch(() => onResult([]));
        },

        resolveSymbol(symbolName, onResolved, onError) {
            const tdSym      = toTDSymbol(symbolName);
            const type       = getType(tdSym);
            const pricescale = getPriceScale(tdSym);
            const session    = getSession(type);

            console.log(`[DF] resolve: "${symbolName}" → td="${tdSym}" type=${type} ws=${wsTypeFor(type)} scale=${pricescale}`);

            setTimeout(() => onResolved({
                name:            tdSym,
                description:     tdSym,
                type:            type,
                session:         session,
                timezone:        'Etc/UTC',
                ticker:          tdSym,
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
            }), 0);
        },

        getBars(symbolInfo, resolution, periodParams, onHistory, onError) {
            const { from, to, firstDataRequest } = periodParams;
            const tdSym    = symbolInfo.ticker || toTDSymbol(symbolInfo.name);
            const interval = TD_RES[resolution] || '1h';
            const limit    = BAR_LIMIT[resolution] || 300;

            let url = `https://api.twelvedata.com/time_series`
                + `?symbol=${encodeURIComponent(tdSym)}`
                + `&interval=${interval}`
                + `&order=ASC`
                + `&apikey=${TWELVE_KEY}`;

            if (firstDataRequest) {
                url += `&outputsize=${limit}`;
            } else {
                const startISO = new Date(from * 1000).toISOString().slice(0,19);
                const endISO   = new Date(to   * 1000).toISOString().slice(0,19);
                url += `&start_date=${startISO}&end_date=${endISO}&outputsize=${limit}`;
            }

            console.log(`[DF] getBars: ${tdSym} ${interval} first=${firstDataRequest}`);

            fetch(url)
                .then(r => r.json())
                .then(data => {
                    if (data.status === 'error') {
                        console.warn(`[DF] TD error for ${tdSym}:`, data.message);
                        onHistory([], { noData: true });
                        return;
                    }
                    if (!data.values || data.values.length === 0) {
                        onHistory([], { noData: true });
                        return;
                    }

                    const rawBars = data.values.map(v => ({
                        time:   new Date(v.datetime.replace(' ','T') + 'Z').getTime(),
                        open:   parseFloat(v.open),
                        high:   parseFloat(v.high),
                        low:    parseFloat(v.low),
                        close:  parseFloat(v.close),
                        volume: parseFloat(v.volume || 0),
                    })).filter(b => !isNaN(b.open) && b.time > 0);

                    const bars = filterBadBars(rawBars, tdSym);

                    if (bars.length > 0) {
                        _barCache[`${tdSym}|${resolution}`] = bars[bars.length - 1];
                    }

                    console.log(`[DF] ${bars.length} bars for ${tdSym} (${rawBars.length - bars.length} filtered)`);
                    onHistory(bars, { noData: bars.length === 0 });
                })
                .catch(e => {
                    console.error('[DF] Fetch error:', e);
                    onError(e.message);
                });
        },

        subscribeBars(symbolInfo, resolution, onTick, uid) {
            const tdSym = symbolInfo.ticker || toTDSymbol(symbolInfo.name);
            const fhSym = toFinnhubSym(symbolInfo.name || tdSym);
            const type  = getType(tdSym);
            const ws    = wsTypeFor(type);

            _subs[uid] = { tdSym, fhSym, type, resolution, onTick };

            if (ws === 'twelvedata') {
                tdWsSend('subscribe', tdSym);
                console.log(`[TD-WS] subscribe → ${tdSym} (${type}) res=${resolution}`);
            } else {
                fhWsSend('subscribe', fhSym);
                console.log(`[FH-WS] subscribe → ${fhSym} (${type}) res=${resolution}`);
            }
        },

        unsubscribeBars(uid) {
            const sub = _subs[uid];
            if (!sub) return;
            const { tdSym, fhSym, type } = sub;
            delete _subs[uid];

            if (wsTypeFor(type) === 'twelvedata') {
                const stillNeeded = Object.values(_subs).some(s => s.tdSym === tdSym && wsTypeFor(s.type) === 'twelvedata');
                if (!stillNeeded) tdWsSend('unsubscribe', tdSym);
            } else {
                const stillNeeded = Object.values(_subs).some(s => s.fhSym === fhSym && wsTypeFor(s.type) === 'finnhub');
                if (!stillNeeded) fhWsSend('unsubscribe', fhSym);
            }
            console.log(`[DF] unsubscribe uid=${uid}`);
        },
    };
};