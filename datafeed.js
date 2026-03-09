// ============================================================
//  datafeed.js — Finnhub.io  ·  REST history + WS live prices
//  Free tier: 60 calls/min  |  WebSocket: forex, crypto, stocks
//  Get free API key: https://finnhub.io/register
// ============================================================

const TwelveDataFeed = (apiKey) => {

    // ── Resolution map TradingView → Finnhub ─────────────────
    // Finnhub uses minutes as integers, D/W/M as strings
    const RES = {
        '1':   '1',
        '5':   '5',
        '15':  '15',
        '30':  '30',
        '60':  '60',
        '120': '120',
        '240': '240',
        'D':   'D',
        '1D':  'D',
        'W':   'W',
        '1W':  'W',
        'M':   'M',
        '1M':  'M',
    };

    // ── How many bars to load per resolution ─────────────────
    const BAR_LIMIT = {
        '1':300,'5':300,'15':300,'30':300,
        '60':400,'120':400,'240':400,
        'D':500,'1D':500,'W':300,'1W':300,'M':200,'1M':200
    };

    // ── WebSocket state ───────────────────────────────────────
    let _ws        = null;
    let _wsReady   = false;
    let _wsQueue   = [];
    const _subs    = {};      // uid → { symbol, resolution, onTick }
    const _barCache = {};     // "SYMBOL|RES" → last bar

    // ── Symbol helpers ────────────────────────────────────────

    // Finnhub forex symbols use OANDA format: "OANDA:EUR_USD"
    // Finnhub crypto: "BINANCE:BTCUSDT"
    // We keep an internal clean symbol for caching/display
    // and build the Finnhub-specific symbol for API calls

    function toFinnhubForex(sym) {
        // Strip broker prefix e.g. "ICMARKETS:EURUSD" → "EURUSD"
        let s = sym.includes(':') ? sym.split(':')[1] : sym;
        s = s.trim().toUpperCase().replace('/', '');

        // Already in Finnhub format
        if (sym.startsWith('OANDA:')) return sym;

        // 6-char forex → OANDA:EUR_USD
        const CURRENCIES = [
            'USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD',
            'SGD','HKD','NOK','SEK','DKK','MXN','ZAR','TRY',
            'CNY','CNH','INR','BRL','PLN','HUF','CZK',
            'THB','IDR','MYR','PHP','KRW','SAR','AED',
            'XAU','XAG'
        ];

        if (s.length === 6) {
            const base  = s.slice(0, 3);
            const quote = s.slice(3, 6);
            if (CURRENCIES.includes(base) && CURRENCIES.includes(quote)) {
                return `OANDA:${base}_${quote}`;
            }
        }

        return null; // not a forex pair
    }

    function toFinnhubCrypto(sym) {
        let s = sym.includes(':') ? sym.split(':')[1] : sym;
        s = s.trim().toUpperCase().replace('/', '');
        const CRYPTO = ['BTC','ETH','LTC','XRP','ADA','SOL','DOT','LINK','BNB','DOGE','AVAX','MATIC'];
        for (const c of CRYPTO) {
            if (s.startsWith(c)) return `BINANCE:${c}USDT`;
        }
        return null;
    }

    // Get the Finnhub API symbol from any input
    function toFinnhubSymbol(raw) {
        if (raw.startsWith('OANDA:') || raw.startsWith('BINANCE:')) return raw;

        const forex  = toFinnhubForex(raw);
        if (forex)  return forex;

        const crypto = toFinnhubCrypto(raw);
        if (crypto) return crypto;

        // Stock/index — use as-is
        let s = raw.includes(':') ? raw.split(':')[1] : raw;
        return s.trim().toUpperCase();
    }

    // Clean display symbol (no OANDA: prefix)
    function toDisplaySymbol(finnhubSym) {
        if (finnhubSym.startsWith('OANDA:')) {
            return finnhubSym.replace('OANDA:','').replace('_','/');
        }
        if (finnhubSym.startsWith('BINANCE:')) {
            const s = finnhubSym.replace('BINANCE:','');
            return s.replace('USDT','/USDT');
        }
        return finnhubSym;
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
        return 100000; // standard 5-decimal forex
    }

    function getType(sym) {
        const s = sym.toUpperCase().replace('/','').replace('_','');
        if (s.startsWith('BINANCE') || s.includes('BTC') || s.includes('ETH') ||
            s.includes('SOL') || s.includes('ADA') || s.includes('DOGE')) return 'crypto';
        if (s.includes('XAU') || s.includes('XAG') || s.includes('GOLD') || s.includes('SILVER')) return 'commodity';
        if (s.includes('SPX') || s.includes('NAS') || s.includes('DAX') || s.includes('FTSE')) return 'index';
        if (s.includes('OANDA') || s.length === 6) return 'forex';
        return 'stock';
    }

    function getSession(type) {
        if (type === 'forex' || type === 'crypto' || type === 'commodity') return '24x7';
        return '0930-1600';
    }

    // ── Spike / bad candle filter ─────────────────────────────
    function filterBadBars(bars, sym) {
        if (bars.length < 2) return bars;
        const type = getType(sym);
        const maxRange = type === 'forex' ? 0.03 : type === 'crypto' ? 0.20 : 0.08;

        return bars.filter(bar => {
            if (!bar.open || !bar.close || !bar.high || !bar.low) return false;
            if (bar.high < bar.low)   return false;
            if (bar.high < bar.open)  return false;
            if (bar.high < bar.close) return false;
            if (bar.low  > bar.open)  return false;
            if (bar.low  > bar.close) return false;
            const range = (bar.high - bar.low) / bar.close;
            if (range > maxRange) {
                console.warn(`[FinnhubDF] Filtered spike bar: ${new Date(bar.time).toISOString()} range=${(range*100).toFixed(2)}%`);
                return false;
            }
            return true;
        });
    }

    // ── Finnhub REST — forex candles ──────────────────────────
    // Finnhub endpoint differs by instrument type
    function buildCandleUrl(finnhubSym, resolution, from, to) {
        const res = RES[resolution] || '60';
        const type = getType(finnhubSym);

        if (type === 'forex' || finnhubSym.startsWith('OANDA:')) {
            return `https://finnhub.io/api/v1/forex/candle`
                + `?symbol=${encodeURIComponent(finnhubSym)}`
                + `&resolution=${res}`
                + `&from=${from}&to=${to}`
                + `&token=${apiKey}`;
        }

        if (type === 'crypto' || finnhubSym.startsWith('BINANCE:')) {
            return `https://finnhub.io/api/v1/crypto/candle`
                + `?symbol=${encodeURIComponent(finnhubSym)}`
                + `&resolution=${res}`
                + `&from=${from}&to=${to}`
                + `&token=${apiKey}`;
        }

        // Stock / index
        return `https://finnhub.io/api/v1/stock/candle`
            + `?symbol=${encodeURIComponent(finnhubSym)}`
            + `&resolution=${res}`
            + `&from=${from}&to=${to}`
            + `&token=${apiKey}`;
    }

    // ── WebSocket ─────────────────────────────────────────────
    function wsConnect() {
        if (_ws && (_ws.readyState === WebSocket.OPEN ||
                    _ws.readyState === WebSocket.CONNECTING)) return;

        _ws      = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
        _wsReady = false;

        _ws.onopen = () => {
            _wsReady = true;
            console.log('[FinnhubWS] ✓ Connected');
            // Flush queue
            _wsQueue.forEach(m => _ws.send(JSON.stringify(m)));
            _wsQueue = [];
            // Re-subscribe all active subs on reconnect
            const unique = [...new Set(Object.values(_subs).map(s => s.finnhubSym))];
            unique.forEach(sym => wsSend('subscribe', sym));
        };

        _ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);

                // Finnhub sends: { type:"trade", data:[{ s, p, t, v }] }
                if (msg.type !== 'trade' || !msg.data) return;

                msg.data.forEach(trade => {
                    const finnhubSym = trade.s;
                    const price      = parseFloat(trade.p);
                    const ts         = trade.t; // milliseconds

                    if (!price || isNaN(price)) return;

                    // Match to subscriptions by finnhubSym
                    Object.values(_subs).forEach(sub => {
                        if (sub.finnhubSym !== finnhubSym) return;

                        const resMs    = resolutionToMs(sub.resolution);
                        const barStart = Math.floor(ts / resMs) * resMs;
                        const cacheKey = `${finnhubSym}|${sub.resolution}`;
                        let bar        = _barCache[cacheKey];

                        if (!bar) return;

                        // Spike protection
                        const type       = getType(finnhubSym);
                        const maxDiffPct = type === 'forex' ? 0.02 : type === 'crypto' ? 0.15 : 0.05;
                        if (Math.abs(price - bar.close) / bar.close > maxDiffPct) return;

                        if (barStart > bar.time) {
                            // New candle
                            bar = { time: barStart, open: price, high: price, low: price, close: price, volume: parseFloat(trade.v || 0) };
                        } else {
                            bar = {
                                ...bar,
                                high:   Math.max(bar.high, price),
                                low:    Math.min(bar.low,  price),
                                close:  price,
                                volume: bar.volume + parseFloat(trade.v || 0),
                            };
                        }

                        _barCache[cacheKey] = bar;
                        sub.onTick({ ...bar });
                    });
                });

            } catch(e) {}
        };

        _ws.onerror = () => console.warn('[FinnhubWS] ✗ Error — check API key');
        _ws.onclose = () => {
            _wsReady = false;
            console.warn('[FinnhubWS] Closed — reconnecting in 5s...');
            setTimeout(wsConnect, 5000);
        };
    }

    function wsSend(action, symbol) {
        const msg = { type: action, symbol };
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

    // ── Calculate from/to timestamps for history ──────────────
    function getFromTo(resolution) {
        const now    = Math.floor(Date.now() / 1000);
        const limit  = BAR_LIMIT[resolution] || 300;
        const resMs  = resolutionToMs(resolution) / 1000; // in seconds
        const from   = now - (limit * resMs * 1.5); // 1.5x buffer for weekends/gaps
        return { from: Math.floor(from), to: now };
    }

    // ═════════════════════════════════════════════════════════
    //  PUBLIC DATAFEED API
    // ═════════════════════════════════════════════════════════
    return {

        onReady(callback) {
            wsConnect();
            setTimeout(() => callback({
                supported_resolutions: [
                    '1','5','15','30','60','120','240',
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
            const query = userInput.replace('/','').replace('_','').trim();
            fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${apiKey}`)
                .then(r => r.json())
                .then(data => {
                    if (!data.result) { onResult([]); return; }
                    onResult(data.result.slice(0, 30).map(s => ({
                        symbol:      s.symbol,
                        full_name:   s.symbol,
                        description: s.description || s.symbol,
                        exchange:    s.displaySymbol || '',
                        type:        getType(s.symbol),
                    })));
                })
                .catch(() => onResult([]));
        },

        resolveSymbol(symbolName, onResolved, onError) {
            const finnhubSym = toFinnhubSymbol(symbolName);
            const displaySym = toDisplaySymbol(finnhubSym);
            const type       = getType(finnhubSym);
            const pricescale = getPriceScale(finnhubSym);
            const session    = getSession(type);

            console.log(`[FinnhubDF] resolve: "${symbolName}" → finnhub="${finnhubSym}" display="${displaySym}" scale=${pricescale}`);

            onResolved({
                name:            displaySym,
                description:     displaySym,
                type:            type,
                session:         session,
                timezone:        'Etc/UTC',
                ticker:          finnhubSym,   // ← internal ticker = Finnhub format
                minmov:          1,
                pricescale:      pricescale,
                has_intraday:    true,
                has_daily:       true,
                has_weekly_and_monthly: true,
                supported_resolutions: [
                    '1','5','15','30','60','120','240',
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
            const finnhubSym = symbolInfo.ticker;
            const { firstDataRequest, from, to } = periodParams;

            // For first request use our own calculated range (faster, no empty responses)
            let reqFrom, reqTo;
            if (firstDataRequest) {
                const t  = getFromTo(resolution);
                reqFrom  = t.from;
                reqTo    = t.to;
            } else {
                reqFrom = from;
                reqTo   = to;
            }

            const url = buildCandleUrl(finnhubSym, resolution, reqFrom, reqTo);
            console.log(`[FinnhubDF] getBars: ${finnhubSym} res=${resolution} first=${firstDataRequest}`);

            fetch(url)
                .then(r => r.json())
                .then(data => {
                    // Finnhub returns { s:"ok", t:[], o:[], h:[], l:[], c:[], v:[] }
                    // or { s:"no_data" }
                    if (data.s === 'no_data' || !data.t || data.t.length === 0) {
                        console.log(`[FinnhubDF] No data for ${finnhubSym}`);
                        onHistory([], { noData: true });
                        return;
                    }

                    if (data.s !== 'ok') {
                        console.warn(`[FinnhubDF] Error for ${finnhubSym}:`, data);
                        onHistory([], { noData: true });
                        return;
                    }

                    const rawBars = data.t.map((ts, i) => ({
                        time:   ts * 1000,           // Finnhub gives UNIX seconds → convert to ms
                        open:   parseFloat(data.o[i]),
                        high:   parseFloat(data.h[i]),
                        low:    parseFloat(data.l[i]),
                        close:  parseFloat(data.c[i]),
                        volume: parseFloat(data.v[i] || 0),
                    })).sort((a, b) => a.time - b.time); // ensure ascending order

                    // Filter bad candles
                    const bars = filterBadBars(rawBars, finnhubSym);

                    // Cache latest bar for WebSocket live updates
                    if (bars.length > 0) {
                        _barCache[`${finnhubSym}|${resolution}`] = bars[bars.length - 1];
                    }

                    console.log(`[FinnhubDF] ${bars.length} bars for ${finnhubSym} (${rawBars.length - bars.length} filtered)`);
                    onHistory(bars, { noData: bars.length === 0 });
                })
                .catch(e => {
                    console.error(`[FinnhubDF] Fetch error:`, e);
                    onError(e.message);
                });
        },

        subscribeBars(symbolInfo, resolution, onTick, uid) {
            const finnhubSym = symbolInfo.ticker;
            _subs[uid] = { finnhubSym, resolution, onTick };
            wsSend('subscribe', finnhubSym);
            console.log(`[FinnhubWS] subscribe → uid=${uid} sym=${finnhubSym} res=${resolution}`);
        },

        unsubscribeBars(uid) {
            const sub = _subs[uid];
            if (!sub) return;
            const { finnhubSym } = sub;
            delete _subs[uid];
            const stillNeeded = Object.values(_subs).some(s => s.finnhubSym === finnhubSym);
            if (!stillNeeded) wsSend('unsubscribe', finnhubSym);
            console.log(`[FinnhubWS] unsubscribe uid=${uid}`);
        },
    };
};