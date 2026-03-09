// ============================================================
//  datafeed.js — HYBRID
//  History:    Twelve Data REST  (free, forex candles work)
//  Live price: Finnhub WebSocket (free, real-time ticks)
// ============================================================

const TwelveDataFeed = (TWELVE_KEY, FINNHUB_KEY) => {

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

    let _ws         = null;
    let _wsReady    = false;
    let _wsQueue    = [];
    const _subs     = {};
    const _barCache = {};

    const CURRENCIES = [
        'USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD',
        'SGD','HKD','NOK','SEK','DKK','MXN','ZAR','TRY',
        'CNY','CNH','INR','BRL','PLN','HUF','CZK',
        'THB','IDR','MYR','PHP','KRW','SAR','AED',
        'XAU','XAG','XPT','XPD'
    ];
    const CRYPTO_LIST = ['BTC','ETH','LTC','XRP','ADA','SOL','DOT','LINK','BNB','DOGE','AVAX','MATIC'];

    function cleanRaw(raw) {
        let s = raw.includes(':') ? raw.split(':')[1] : raw;
        return s.trim().toUpperCase().replace('/','').replace('_','');
    }

    function toTDSymbol(raw) {
        const s = cleanRaw(raw);
        if (s.length === 6) {
            const base  = s.slice(0,3);
            const quote = s.slice(3,6);
            if (CURRENCIES.includes(base) && CURRENCIES.includes(quote)) return `${base}/${quote}`;
        }
        for (const c of CRYPTO_LIST) { if (s.startsWith(c)) return `${c}/USD`; }
        return s;
    }

    function toFinnhubSym(raw) {
        const s = cleanRaw(raw);
        if (s.length === 6) {
            const base  = s.slice(0,3);
            const quote = s.slice(3,6);
            if (CURRENCIES.includes(base) && CURRENCIES.includes(quote)) return `OANDA:${base}_${quote}`;
        }
        for (const c of CRYPTO_LIST) { if (s.startsWith(c)) return `BINANCE:${c}USDT`; }
        return s;
    }

    function getPriceScale(sym) {
        const s = sym.toUpperCase();
        if (s.includes('JPY') || s.includes('HUF') || s.includes('KRW') || s.includes('IDR')) return 1000;
        if (s.includes('XAU') || s.includes('GOLD'))   return 100;
        if (s.includes('XAG') || s.includes('SILVER')) return 1000;
        if (s.includes('BTC') || s.includes('ETH'))    return 100;
        if (s.includes('SPX') || s.includes('NAS') || s.includes('US500') ||
            s.includes('US100')|| s.includes('DAX') || s.includes('FTSE')) return 100;
        return 100000;
    }

    function getType(sym) {
        const s = sym.toUpperCase().replace('/','').replace('_','');
        if (CRYPTO_LIST.some(c => s.includes(c))) return 'crypto';
        if (s.includes('XAU') || s.includes('XAG') || s.includes('GOLD') || s.includes('SILVER')) return 'commodity';
        if (s.includes('SPX') || s.includes('NAS') || s.includes('DAX') || s.includes('FTSE')) return 'index';
        if (s.replace('OANDA:','').replace('_','').length === 6 || s.length === 6) return 'forex';
        return 'stock';
    }

    function getSession(type) {
        return (type === 'forex' || type === 'crypto' || type === 'commodity') ? '24x7' : '0930-1600';
    }

    function filterBadBars(bars, sym) {
        if (bars.length < 2) return bars;
        const type     = getType(sym);
        const maxRange = type === 'forex' ? 0.03 : type === 'crypto' ? 0.20 : 0.08;
        return bars.filter(b => {
            if (!b.open || !b.close || !b.high || !b.low) return false;
            if (b.high < b.low || b.high < b.open || b.high < b.close) return false;
            if (b.low  > b.open || b.low  > b.close) return false;
            const range = (b.high - b.low) / b.close;
            if (range > maxRange) {
                console.warn(`[DF] Spike filtered: ${new Date(b.time).toISOString()} range=${(range*100).toFixed(2)}%`);
                return false;
            }
            return true;
        });
    }

    function wsConnect() {
        if (_ws && (_ws.readyState === WebSocket.OPEN ||
                    _ws.readyState === WebSocket.CONNECTING)) return;

        _ws      = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);
        _wsReady = false;

        _ws.onopen = () => {
            _wsReady = true;
            console.log('[WS] ✓ Finnhub connected');
            _wsQueue.forEach(m => _ws.send(JSON.stringify(m)));
            _wsQueue = [];
            const unique = [...new Set(Object.values(_subs).map(s => s.finnhubSym))];
            unique.forEach(sym => wsSend('subscribe', sym));
        };

        _ws.onmessage = evt => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.type !== 'trade' || !msg.data) return;
                msg.data.forEach(trade => {
                    const price      = parseFloat(trade.p);
                    const ts         = trade.t;
                    const finnhubSym = trade.s;
                    if (!price || isNaN(price)) return;
                    Object.values(_subs).forEach(sub => {
                        if (sub.finnhubSym !== finnhubSym) return;
                        const cacheKey = `${sub.tdSym}|${sub.resolution}`;
                        const resMs    = resolutionToMs(sub.resolution);
                        const barStart = Math.floor(ts / resMs) * resMs;
                        let bar        = _barCache[cacheKey];
                        if (!bar) return;
                        const type    = getType(finnhubSym);
                        const maxDiff = type === 'forex' ? 0.02 : type === 'crypto' ? 0.12 : 0.05;
                        if (Math.abs(price - bar.close) / bar.close > maxDiff) return;
                        if (barStart > bar.time) {
                            bar = { time:barStart, open:price, high:price, low:price, close:price, volume:parseFloat(trade.v||0) };
                        } else {
                            bar = { ...bar, high:Math.max(bar.high,price), low:Math.min(bar.low,price), close:price, volume:bar.volume+parseFloat(trade.v||0) };
                        }
                        _barCache[cacheKey] = bar;
                        sub.onTick({ ...bar });
                    });
                });
            } catch(e) {}
        };

        _ws.onerror = () => console.warn('[WS] ✗ Finnhub error');
        _ws.onclose = () => {
            _wsReady = false;
            console.warn('[WS] Finnhub closed — reconnecting in 5s...');
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

    return {

        onReady(callback) {
            wsConnect();
            setTimeout(() => callback({
                supported_resolutions: ['1','3','5','15','30','60','120','240','480','720','D','1D','W','1W','M','1M'],
                exchanges: [], symbols_types: [],
                supports_marks: false, supports_timescale_marks: false, supports_time: true,
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
            console.log(`[DF] resolve: "${symbolName}" → td="${tdSym}" finnhub="${toFinnhubSym(symbolName)}" scale=${pricescale}`);
            setTimeout(() => onResolved({
                name: tdSym, description: tdSym, type, session,
                timezone: 'Etc/UTC', ticker: tdSym,
                minmov: 1, pricescale,
                has_intraday: true, has_daily: true, has_weekly_and_monthly: true,
                supported_resolutions: ['1','3','5','15','30','60','120','240','480','720','D','1D','W','1W','M','1M'],
                volume_precision: 0, data_status: 'streaming',
                exchange: '', listed_exchange: '', format: 'price',
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
                .catch(e => { console.error(`[DF] Fetch error:`, e); onError(e.message); });
        },

        subscribeBars(symbolInfo, resolution, onTick, uid) {
            const tdSym      = symbolInfo.ticker || toTDSymbol(symbolInfo.name);
            const finnhubSym = toFinnhubSym(symbolInfo.name || tdSym);
            _subs[uid] = { tdSym, finnhubSym, resolution, onTick };
            wsSend('subscribe', finnhubSym);
            console.log(`[WS] subscribe → uid=${uid} td=${tdSym} finnhub=${finnhubSym} res=${resolution}`);
        },

        unsubscribeBars(uid) {
            const sub = _subs[uid];
            if (!sub) return;
            const { finnhubSym } = sub;
            delete _subs[uid];
            const stillNeeded = Object.values(_subs).some(s => s.finnhubSym === finnhubSym);
            if (!stillNeeded) wsSend('unsubscribe', finnhubSym);
            console.log(`[WS] unsubscribe uid=${uid}`);
        },
    };
};