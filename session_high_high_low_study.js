// SESSION HIGH LOW — Current Day Only  (v11 — StepLineWithBreaks)
// ─────────────────────────────────────────────────────────────────
// plottype 11 = StepLineWithBreaks
//   • Draws a perfectly flat horizontal line from session open
//   • Stops dead (no gap bridging) when NaN is returned = at break bar
//   • Resets each new Nepal day (UTC+5:45)
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

    function mkS() {
        return { h: NaN, l: NaN, t0: null,
                 hBroke: false, lBroke: false,
                 hBrokeAt: null, lBrokeAt: null, wasIn: false };
    }
    function clrS(s) {
        s.h = NaN; s.l = NaN; s.t0 = null;
        s.hBroke = false; s.lBroke = false;
        s.hBrokeAt = null; s.lBrokeAt = null; s.wasIn = false;
    }

    const ST = { prevDay: null, asia: mkS(), lon: mkS(), ny: mkS() };

    const Study = function() {};

    Study.prototype.init = function() {
        ST.prevDay = null;
        clrS(ST.asia); clrS(ST.lon); clrS(ST.ny);
    };

    Study.prototype.main = function(ctx, inp) {
        const t  = ctx.symbol.time;
        const hi = ctx.symbol.high;
        const lo = ctx.symbol.low;

        const aS = toMin(inp(5)||'05:45'), aE = toMin(inp(6)||'14:45');
        const lS = toMin(inp(7)||'12:45'), lE = toMin(inp(8)||'21:45');
        const nS = toMin(inp(9)||'17:45'), nE = toMin(inp(10)||'02:45');

        const np  = new Date(t + NEPAL_MS);
        const day = np.getUTCFullYear()*10000 + (np.getUTCMonth()+1)*100 + np.getUTCDate();
        const min = np.getUTCHours()*60 + np.getUTCMinutes();

        if (ST.prevDay !== null && day !== ST.prevDay) {
            clrS(ST.asia); clrS(ST.lon); clrS(ST.ny);
        }
        ST.prevDay = day;

        function upd(s, sMin, eMin) {
            const now = inSess(min, sMin, eMin);
            if (now && !s.wasIn) {
                s.h = hi; s.l = lo; s.t0 = t;
                s.hBroke = false; s.lBroke = false;
                s.hBrokeAt = null; s.lBrokeAt = null;
            } else if (now) {
                if (hi > s.h) s.h = hi;
                if (lo < s.l) s.l = lo;
            }
            if (!isNaN(s.h)) {
                if (!s.hBroke && hi > s.h) { s.hBroke = true; s.hBrokeAt = t; }
                if (!s.lBroke && lo < s.l) { s.lBroke = true; s.lBrokeAt = t; }
            }
            s.wasIn = now;
        }

        upd(ST.asia, aS, aE);
        upd(ST.lon,  lS, lE);
        upd(ST.ny,   nS, nE);

        function pv(s, isH) {
            if (isNaN(s.h) || s.t0 === null || t < s.t0) return NaN;
            if (isH) { return (s.hBroke && t >= s.hBrokeAt) ? NaN : s.h; }
            else      { return (s.lBroke && t >= s.lBrokeAt) ? NaN : s.l; }
        }

        return [
            pv(ST.asia,true), pv(ST.asia,false),
            pv(ST.lon, true), pv(ST.lon, false),
            pv(ST.ny,  true), pv(ST.ny,  false),
        ];
    };

    return {
        name: "NepalSessionHL",
        metainfo: {
            _metainfoVersion: 51,
            id:               "NepalSessionHL@tv-basicstudies-1",
            description:      "SESSION HIGH LOW - Current Day Only",
            shortDescription: "Sess HL",
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
