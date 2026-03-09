// ============================================================
//  datafeed.js
//  History:    Twelve Data /time_series  (REST)
//  Live price: Twelve Data /price        ← real-time even on free tier
//              Polled every 5 seconds
//
//  Key: ea488f33f6d841778d55e540d889c308
// ============================================================

const TwelveDataFeed = (TWELVE_KEY) => {

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

    // Poll every 5 seconds using /price endpoint
    const POLL_MS = 5000;

    const _polls    = {};   // uid → intervalId
    const _barCache = {};   // "tdSym|RES" → last bar
    const _subs     = {};   // uid → { tdSym, resolution, onTick }

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

    function getType(sym) {
        const s = sym.toUpperCase().replace('/','').replace('_','');
        if (CRYPTO_LIST.some(c => s.includes(c)))       return 'crypto';
        if (s.includes('XAU') || s.includes('XAG') ||
            s.includes('GOLD') || s.includes('SILVER')) return 'commodity';
        if (s.includes('SPX') || s.includes('NAS') ||
            s.includes('DAX')  || s.includes('FTSE'))   return 'index';
        if (s.length === 6)                              return 'forex';
        return 'stock';
    }

    function getSession(type) {
        return (type === 'forex' || type === 'crypto' || type === 'commodity')
            ? '24x7' : '0930-1600';
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
                console.warn(`[DF] Spike filtered ${new Date(b.time).toISOString()}`);
                return false;
            }
            return true;
        });
    }

    // ─────────────────────────────────────────────────────────
    //  REAL-TIME PRICE POLL using /price endpoint
    //  This endpoint returns CURRENT live price — no delay
    // ─────────────────────────────────────────────────────────
    async function pollLivePrice(uid) {
        const sub = _subs[uid];
        if (!sub) return;

        const { tdSym, resolution, onTick } = sub;
        const cacheKey = `${tdSym}|${resolution}`;
        let bar        = _barCache[cacheKey];

        // Don't poll until getBars has populated the cache
        if (!bar) return;

        try {
            // /price gives the ACTUAL current market price in real-time
            const url  = `https://api.twelvedata.com/price`
                       + `?symbol=${encodeURIComponent(tdSym)}`
                       + `&apikey=${TWELVE_KEY}`;

            const data = await fetch(url).then(r => r.json());

            if (!data.price) {
                console.warn(`[POLL] No price returned for ${tdSym}`, data);
                return;
            }

            const price = parseFloat(data.price);
            if (isNaN(price) || price <= 0) return;

            // Skip if price unchanged
            if (price === bar.close) return;

            // Spike guard
            const type    = getType(tdSym);
            const maxDiff = type === 'forex'  ? 0.01
                          : type === 'crypto' ? 0.15
                          : 0.05;
            if (Math.abs(price - bar.close) / bar.close > maxDiff) {
                console.warn(`[POLL] Spike ignored: new=${price} last=${bar.close}`);
                return;
            }

            const now      = Date.now();
            const resMs    = resolutionToMs(resolution);
            const barStart = Math.floor(now / resMs) * resMs;

            if (barStart > bar.time) {
                // New candle started
                bar = {
                    time:   barStart,
                    open:   price,
                    high:   price,
                    low:    price,
                    close:  price,
                    volume: 0
                };
                console.log(`[POLL] ${tdSym} NEW candle @ ${new Date(barStart).toISOString()}`);
            } else {
                // Update current candle
                bar = {
                    ...bar,
                    high:  Math.max(bar.high, price),
                    low:   Math.min(bar.low,  price),
                    close: price,
                };
            }

            _barCache[cacheKey] = bar;
            onTick({ ...bar });

            console.log(`[POLL] ✓ ${tdSym} → ${price}`);

        } catch(e) {
            console.warn(`[POLL] Error for ${tdSym}:`, e.message);
        }
    }

    // ─────────────────────────────────────────────────────────
    //  PUBLIC DATAFEED API
    // ─────────────────────────────────────────────────────────
    return {

        onReady(callback) {
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

            console.log(`[DF] resolve: "${symbolName}" → "${tdSym}" scale=${pricescale}`);

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
                const s = new Date(from * 1000).toISOString().slice(0,19);
                const e = new Date(to   * 1000).toISOString().slice(0,19);
                url += `&start_date=${s}&end_date=${e}&outputsize=${limit}`;
            }

            console.log(`[DF] getBars: ${tdSym} ${interval} first=${firstDataRequest}`);

            fetch(url)
                .then(r => r.json())
                .then(data => {
                    if (data.status === 'error') {
                        console.warn(`[DF] TD error:`, data.message);
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
                        // Cache last bar — polling will extend it
                        _barCache[`${tdSym}|${resolution}`] = { ...bars[bars.length - 1] };
                    }

                    console.log(`[DF] ${bars.length} bars for ${tdSym}`);
                    onHistory(bars, { noData: bars.length === 0 });
                })
                .catch(e => {
                    console.error('[DF] Fetch error:', e);
                    onError(e.message);
                });
        },

        // ── Subscribe = start /price polling every 5s ─────────
        subscribeBars(symbolInfo, resolution, onTick, uid) {
            const tdSym = symbolInfo.ticker || toTDSymbol(symbolInfo.name);

            // Store sub info
            _subs[uid] = { tdSym, resolution, onTick };

            // Clear any old poll
            if (_polls[uid]) clearInterval(_polls[uid]);

            console.log(`[POLL] ▶ Started uid=${uid} sym=${tdSym} res=${resolution} interval=${POLL_MS/1000}s`);

            // First poll after 2s (give getBars time to populate cache)
            setTimeout(() => pollLivePrice(uid), 2000);

            // Then poll every 5 seconds
            _polls[uid] = setInterval(() => pollLivePrice(uid), POLL_MS);
        },

        // ── Unsubscribe = stop polling ────────────────────────
        unsubscribeBars(uid) {
            if (_polls[uid]) {
                clearInterval(_polls[uid]);
                delete _polls[uid];
            }
            delete _subs[uid];
            console.log(`[POLL] ■ Stopped uid=${uid}`);
        },
    };
};