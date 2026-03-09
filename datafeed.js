// ============================================================
//  datafeed.js — TRIPLE HYBRID
//
//  History  (ALL):       Twelve Data REST
//  Live Forex:           FMP WebSocket        ← forex specialist
//  Live Crypto/Stocks:   Finnhub WebSocket    ← crypto/stock specialist
//
//  Twelve Data : ea488f33f6d841778d55e540d889c308
//  Finnhub     : d6n5iihr01qir35j8pi0d6n5iihr01qir35j8pig
//  FMP         : 06DIZiqxjdVXk5CUip9mzrxOOKbNbrXX
// ============================================================

const TwelveDataFeed = (TWELVE_KEY, FINNHUB_KEY, FMP_KEY) => {

    // ── Resolution map → Twelve Data intervals ────────────────
    const TD_RES = {
        '1':'1min','3':'3min','5':'5min','15':'15min','30':'30min',
        '60':'1h','120':'2h','240':'4h','480':'8h','720':'12h',
        'D':'1day','1D':'1day','W':'1week','1W':'1week',
        'M':'1month','1M':'1month'
    };

    const BAR_LIMIT = {
        '1':200,'3':200,'5':200,'15':300,'30':300,
        '60':400,'120':400,'240':500,
        'D':500,'1D':500,'W':300,'1W':300,'M':200,'1M':200
    };

    // ── FMP WebSocket state (live forex) ──────────────────────
    let _fmpWs      = null;
    let _fmpReady   = false;
    let _fmpLoggedIn = false;
    let _fmpQueue   = [];

    // ── Finnhub WebSocket state (crypto + stocks) ─────────────
    let _fhWs       = null;
    let _fhReady    = false;
    let _fhQueue    = [];

    // ── Shared state ──────────────────────────────────────────
    const _subs     = {};    // uid → { tdSym, fmpTicker, fhSym, type, resolution, onTick }
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

    // Twelve Data format: "EUR/USD"
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
        return s;
    }

    // FMP WebSocket ticker format: "eurusd" (lowercase, no slash)
    function toFMPTicker(raw) {
        const s = cleanRaw(raw).toLowerCase();
        return s; // e.g. "eurusd", "gbpusd", "xauusd"
    }

    // Finnhub format: "BINANCE:BTCUSDT", "AAPL"
    function toFinnhubSym(raw) {
        const s = cleanRaw(raw);
        if (s.length === 6) {
            const base  = s.slice(0,3);
            const quote = s.slice(3,6);
            if (CURRENCIES.includes(base) && CURRENCIES.includes(quote))
                return `OANDA:${base}_${quote}`; // not used for live but kept for completeness
        }
        for (const c of CRYPTO_LIST) {
            if (s.startsWith(c)) return `BINANCE:${c}USDT`;
        }
        return s;
    }

    function getType(sym) {
        const s = sym.toUpperCase().replace('/','').replace('_','');
        if (CRYPTO_LIST.some(c => s.includes(c)))      return 'crypto';
        if (s.includes('XAU') || s.includes('XAG') ||
            s.includes('GOLD')|| s.includes('SILVER')) return 'commodity';
        if (s.includes('SPX') || s.includes('NAS') ||
            s.includes('DAX') || s.includes('FTSE') ||
            s.includes('US5') || s.includes('US1'))    return 'index';
        if (s.length === 6)                             return 'forex';
        return 'stock';
    }

    // Route live price: forex+commodity → FMP WS, crypto+stock → Finnhub WS
    function wsTypeFor(type) {
        return (type === 'forex' || type === 'commodity') ? 'fmp' : 'finnhub';
    }

    function getSession(type) {
        return (type === 'forex' || type === 'crypto' || type === 'commodity')
            ? '24x7' : '0930-1600';
    }

    function getPriceScale(sym) {
        const s = sym.toUpperCase();
        if (s.includes('JPY') || s.includes('HUF') ||
            s.includes('KRW') || s.includes('IDR'))    return 1000;
        if (s.includes('XAU') || s.includes('GOLD'))   return 100;
        if (s.includes('XAG') || s.includes('SILVER')) return 1000;
        if (s.includes('BTC') || s.includes('ETH'))    return 100;
        if (s.includes('SPX') || s.includes('NAS') ||
            s.includes('US500')|| s.includes('US100')||
            s.includes('DAX')  || s.includes('FTSE'))  return 100;
        return 100000;
    }

    // ── Spike filter ──────────────────────────────────────────
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

    // ── Apply tick to bar cache + fire onTick ─────────────────
    function applyTick(tdSym, price, ts) {
        if (!price || isNaN(price)) return;

        Object.values(_subs).forEach(sub => {
            if (sub.tdSym !== tdSym) return;

            const cacheKey = `${tdSym}|${sub.resolution}`;
            let bar        = _barCache[cacheKey];
            if (!bar) return;

            // Spike guard
            const type    = getType(tdSym);
            const maxDiff = type === 'forex'  ? 0.005
                          : type === 'crypto' ? 0.12
                          : 0.05;
            if (Math.abs(price - bar.close) / bar.close > maxDiff) return;

            const resMs    = resolutionToMs(sub.resolution);
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
            sub.onTick({ ...bar });
        });
    }

    // ─────────────────────────────────────────────────────────
    //  FMP WEBSOCKET  — live forex (e.g. eurusd, gbpusd, xauusd)
    //  Protocol: connect → login → subscribe → receive quotes
    // ─────────────────────────────────────────────────────────
    function fmpWsConnect() {
        if (_fmpWs && (_fmpWs.readyState === WebSocket.OPEN ||
                       _fmpWs.readyState === WebSocket.CONNECTING)) return;

        _fmpWs      = new WebSocket('wss://forex.financialmodelingprep.com');
        _fmpReady   = false;
        _fmpLoggedIn = false;

        _fmpWs.onopen = () => {
            _fmpReady = true;
            console.log('[FMP-WS] ✓ Connected — logging in...');

            // Step 1: Login with API key
            _fmpWs.send(JSON.stringify({
                event: 'login',
                data:  { apiKey: FMP_KEY }
            }));
        };

        _fmpWs.onmessage = evt => {
            try {
                const msg = JSON.parse(evt.data);

                // Step 2: Login confirmed → subscribe all active forex symbols
                if (msg.event === 'login') {
                    if (msg.status === 200) {
                        _fmpLoggedIn = true;
                        console.log('[FMP-WS] ✓ Logged in');

                        // Flush queued subscribes
                        _fmpQueue.forEach(m => _fmpWs.send(JSON.stringify(m)));
                        _fmpQueue = [];

                        // Re-subscribe on reconnect
                        const tickers = [...new Set(
                            Object.values(_subs)
                                .filter(s => wsTypeFor(s.type) === 'fmp')
                                .map(s => s.fmpTicker)
                        )];
                        if (tickers.length > 0) {
                            _fmpWs.send(JSON.stringify({
                                event: 'subscribe',
                                data:  { ticker: tickers }
                            }));
                            console.log('[FMP-WS] Re-subscribed:', tickers);
                        }
                    } else {
                        console.warn('[FMP-WS] Login failed:', msg);
                    }
                    return;
                }

                // Step 3: Receive price updates
                // FMP sends: { s:"eurusd", bid:1.12345, ask:1.12347, t:1234567890000 }
                // OR:        { s:"eurusd", c:1.12345, t:1234567890000 }
                if (msg.s) {
                    const ticker = msg.s.toLowerCase();
                    // Use mid price: average of bid/ask, or close price
                    const price  = msg.c ? parseFloat(msg.c)
                                 : msg.bid && msg.ask ? (parseFloat(msg.bid) + parseFloat(msg.ask)) / 2
                                 : msg.bid ? parseFloat(msg.bid)
                                 : null;
                    const ts     = msg.t || Date.now();

                    if (!price || isNaN(price)) return;

                    // Match to subscriptions by FMP ticker
                    Object.values(_subs).forEach(sub => {
                        if (sub.fmpTicker === ticker && wsTypeFor(sub.type) === 'fmp') {
                            applyTick(sub.tdSym, price, ts);
                        }
                    });
                }

            } catch(e) {}
        };

        _fmpWs.onerror = () => console.warn('[FMP-WS] ✗ Error');
        _fmpWs.onclose = () => {
            _fmpReady    = false;
            _fmpLoggedIn = false;
            console.warn('[FMP-WS] Closed — reconnecting in 5s...');
            setTimeout(fmpWsConnect, 5000);
        };
    }

    function fmpSubscribe(ticker) {
        const msg = { event:'subscribe', data:{ ticker:[ticker] } };
        if (_fmpLoggedIn && _fmpWs && _fmpWs.readyState === WebSocket.OPEN) {
            _fmpWs.send(JSON.stringify(msg));
        } else {
            _fmpQueue.push(msg);
        }
    }

    function fmpUnsubscribe(ticker) {
        if (_fmpLoggedIn && _fmpWs && _fmpWs.readyState === WebSocket.OPEN) {
            _fmpWs.send(JSON.stringify({ event:'unsubscribe', data:{ ticker:[ticker] } }));
        }
    }

    // ─────────────────────────────────────────────────────────
    //  FINNHUB WEBSOCKET  — live crypto + stocks
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
                if (msg.type !== 'trade' || !msg.data) return;
                msg.data.forEach(trade => {
                    const fhSym = trade.s;
                    const price = parseFloat(trade.p);
                    const ts    = trade.t;
                    if (!price || isNaN(price)) return;
                    Object.values(_subs).forEach(sub => {
                        if (sub.fhSym === fhSym && wsTypeFor(sub.type) === 'finnhub') {
                            applyTick(sub.tdSym, price, ts);
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
        const msg = { type:action, symbol };
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
            // Boot all WebSockets immediately
            fmpWsConnect();
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
            const ws         = wsTypeFor(type);

            console.log(`[DF] resolve: "${symbolName}" → td="${tdSym}" type=${type} live-ws=${ws} scale=${pricescale}`);

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
            const tdSym    = symbolInfo.ticker || toTDSymbol(symbolInfo.name);
            const type     = getType(tdSym);
            const ws       = wsTypeFor(type);
            const fmpTicker = toFMPTicker(tdSym);
            const fhSym    = toFinnhubSym(tdSym);

            _subs[uid] = { tdSym, fmpTicker, fhSym, type, resolution, onTick };

            if (ws === 'fmp') {
                fmpSubscribe(fmpTicker);
                console.log(`[FMP-WS] subscribe → "${fmpTicker}" (${type}) res=${resolution}`);
            } else {
                fhWsSend('subscribe', fhSym);
                console.log(`[FH-WS] subscribe → "${fhSym}" (${type}) res=${resolution}`);
            }
        },

        unsubscribeBars(uid) {
            const sub = _subs[uid];
            if (!sub) return;
            const { tdSym, fmpTicker, fhSym, type } = sub;
            delete _subs[uid];

            if (wsTypeFor(type) === 'fmp') {
                const still = Object.values(_subs).some(s => s.fmpTicker === fmpTicker && wsTypeFor(s.type) === 'fmp');
                if (!still) fmpUnsubscribe(fmpTicker);
            } else {
                const still = Object.values(_subs).some(s => s.fhSym === fhSym && wsTypeFor(s.type) === 'finnhub');
                if (!still) fhWsSend('unsubscribe', fhSym);
            }
            console.log(`[DF] unsubscribe uid=${uid}`);
        },
    };
};