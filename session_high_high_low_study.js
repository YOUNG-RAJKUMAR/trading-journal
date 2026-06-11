// SESSION HIGH LOW — Exact Pine Script Port (v13)
// ─────────────────────────────────────────────────────────────────
// This version exactly replicates the provided Pine Script logic:
//   • Timezone: Asia/Kathmandu (UTC+5:45)
//   • Sessions: Asia (05:45-14:45), London (12:45-21:45), NY (17:45-02:45)
//   • Breakout Logic: Lines stop exactly at the break bar.
//   • Persistence: Levels stay until broken (as per the reference image).
// ─────────────────────────────────────────────────────────────────

function getSessionHighLowStudy(PineJS) {
    const NEPAL_MS = 5.75 * 3600 * 1000;

    function toMin(s) {
        const p = (s || '00:00').split(':');
        return parseInt(p[0]) * 60 + parseInt(p[1] || 0);
    }

    function inSess(m, s, e) {
        return s < e ? (m >= s && m < e) : (m >= s || m < e);
    }

    function mkLevel(price, startTime, type, sessionName, label) {
        return { price: price, t0: startTime, type: type, session: sessionName, label: label, broken: false, brokenAt: null };
    }

    const ST = {
        levels: [],
        asia: { h: NaN, l: NaN, wasIn: false, t0: null },
        lon:  { h: NaN, l: NaN, wasIn: false, t0: null },
        ny:   { h: NaN, l: NaN, wasIn: false, t0: null }
    };

    const Study = function() {};

    Study.prototype.init = function() {
        ST.levels = [];
        ST.asia = { h: NaN, l: NaN, wasIn: false, t0: null };
        ST.lon  = { h: NaN, l: NaN, wasIn: false, t0: null };
        ST.ny   = { h: NaN, l: NaN, wasIn: false, t0: null };
    };

    Study.prototype.main = function(ctx, inp) {
        const t  = ctx.symbol.time;
        const hi = ctx.symbol.high;
        const lo = ctx.symbol.low;

        const aS = toMin(inp(5)||'05:45'), aE = toMin(inp(6)||'14:45');
        const lS = toMin(inp(7)||'12:45'), lE = toMin(inp(8)||'21:45');
        const nS = toMin(inp(9)||'17:45'), nE = toMin(inp(10)||'02:45');

        const np  = new Date(t + NEPAL_MS);
        const min = np.getUTCHours()*60 + np.getUTCMinutes();

        function updSession(s, sMin, eMin, name, label) {
            const now = inSess(min, sMin, eMin);
            if (now && !s.wasIn) {
                s.h = hi; s.l = lo; s.t0 = t;
            } else if (now) {
                if (hi > s.h) s.h = hi;
                if (lo < s.l) s.l = lo;
            } else if (!now && s.wasIn) {
                if (!isNaN(s.h)) {
                    ST.levels.push(mkLevel(s.h, s.t0, 'high', name, label));
                    ST.levels.push(mkLevel(s.l, s.t0, 'low', name, label));
                }
            }
            s.wasIn = now;
        }

        updSession(ST.asia, aS, aE, 'asia', 'A');
        updSession(ST.lon,  lS, lE, 'lon',  'L');
        updSession(ST.ny,   nS, nE, 'ny',   'N');

        for (let i = 0; i < ST.levels.length; i++) {
            const lv = ST.levels[i];
            if (!lv.broken) {
                if (lv.type === 'high' && hi > lv.price) { lv.broken = true; lv.brokenAt = t; }
                else if (lv.type === 'low' && lo < lv.price) { lv.broken = true; lv.brokenAt = t; }
            }
        }

        function getPlotValue(sessionName, type) {
            const s = ST[sessionName];
            if (s.wasIn && !isNaN(s.h)) { return type === 'high' ? s.h : s.l; }
            for (let i = ST.levels.length - 1; i >= 0; i--) {
                const lv = ST.levels[i];
                if (lv.session === sessionName && lv.type === type) {
                    if (t < lv.t0) continue;
                    if (!lv.broken) return lv.price;
                    if (t < lv.brokenAt) return lv.price;
                }
            }
            return NaN;
        }

        return [
            getPlotValue('asia', 'high'), getPlotValue('asia', 'low'),
            getPlotValue('lon',  'high'), getPlotValue('lon',  'low'),
            getPlotValue('ny',   'high'), getPlotValue('ny',   'low'),
        ];
    };

    return {
        name: "NepalSessionHL",
        metainfo: {
            _metainfoVersion: 51,
            id:               "NepalSessionHL@tv-basicstudies-1",
            description:      "SESSION HIGH LOW - Exact Port",
            shortDescription: "Sess HL v13",
            isCustomIndicator: true,
            is_price_study:    true,
            format: { type: 'price', precision: 5 },
            plots: [
                { id: 'asiaHigh', type: 'line' }, { id: 'asiaLow', type: 'line' },
                { id: 'lonHigh',  type: 'line' }, { id: 'lonLow',  type: 'line' },
                { id: 'nyHigh',   type: 'line' }, { id: 'nyLow',   type: 'line' },
            ],
            styles: {
                asiaHigh: { title:'Asia High',   linestyle:0, linewidth:2, plottype:11, trackPrice:true, color:'#2962FF' },
                asiaLow:  { title:'Asia Low',    linestyle:0, linewidth:2, plottype:11, trackPrice:true, color:'#2962FF' },
                lonHigh:  { title:'London High', linestyle:0, linewidth:2, plottype:11, trackPrice:true, color:'#FF1744' },
                lonLow:   { title:'London Low',  linestyle:0, linewidth:2, plottype:11, trackPrice:true, color:'#FF1744' },
                nyHigh:   { title:'NY High',     linestyle:0, linewidth:2, plottype:11, trackPrice:true, color:'#00C853' },
                nyLow:    { title:'NY Low',      linestyle:0, linewidth:2, plottype:11, trackPrice:true, color:'#00C853' },
            },
            inputs: [
                { id:'lineWidth', name:'Line Width',   type:'integer', min:1, max:5, defval:2       },
                { id:'labelSize', name:'Label Size',   type:'text',               defval:'small'   },
                { id:'asiaColor', name:'Asia Color',   type:'text',               defval:'#2962FF' },
                { id:'lonColor',  name:'London Color', type:'text',               defval:'#FF1744' },
                { id:'nyColor',   name:'NY Color',     type:'text',               defval:'#00C853' },
                { id:'asiaStart', name:'Asia Start',   type:'text',               defval:'05:45'   },
                { id:'asiaEnd',   name:'Asia End',     type:'text',               defval:'14:45'   },
                { id:'lonStart',  name:'London Start', type:'text',               defval:'12:45'   },
                { id:'lonEnd',    name:'London End',   type:'text',               defval:'21:45'   },
                { id:'nyStart',   name:'NY Start',     type:'text',               defval:'17:45'   },
                { id:'nyEnd',     name:'NY End',       type:'text',               defval:'02:45'   },
            ],
            defaults: {
                styles: {
                    asiaHigh: { color:'#2962FF', visible:true, linewidth:2, linestyle:0, plottype:11 },
                    asiaLow:  { color:'#2962FF', visible:true, linewidth:2, linestyle:0, plottype:11 },
                    lonHigh:  { color:'#FF1744', visible:true, linewidth:2, linestyle:0, plottype:11 },
                    lonLow:   { color:'#FF1744', visible:true, linewidth:2, linestyle:0, plottype:11 },
                    nyHigh:   { color:'#00C853', visible:true, linewidth:2, linestyle:0, plottype:11 },
                    nyLow:    { color:'#00C853', visible:true, linewidth:2, linestyle:0, plottype:11 },
                },
                inputs: {
                    lineWidth:2, labelSize:'small',
                    asiaColor:'#2962FF', lonColor:'#FF1744', nyColor:'#00C853',
                    asiaStart:'05:45', asiaEnd:'14:45',
                    lonStart:'12:45',  lonEnd:'21:45',
                    nyStart:'17:45',   nyEnd:'02:45',
                },
                precision: 5,
                palettes: {},
            }
        },
        constructor: Study
    };
}
