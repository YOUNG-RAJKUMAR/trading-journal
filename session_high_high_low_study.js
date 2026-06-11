// SESSION HIGH LOW — Current Day Only
// Custom TradingView Charting Library Study
// Mirrors Pine Script v5 "SESSION HIGH LOW - Current Day Only"
// ─────────────────────────────────────────────────────────────
// Behaviour:
//   • Line starts at first bar of each session
//   • Line stops (returns NaN) the bar a level is broken
//   • Resets every new day in Nepal time (UTC+5:45)
//   • Configurable colors, line width, and session times
// ─────────────────────────────────────────────────────────────

function getSessionHighLowStudy(PineJS) {

    const NEPAL_OFFSET_MS = 5.75 * 3600 * 1000; // UTC+5:45

    function parseSessionMinutes(str) {
        const p = (str || '').split(':');
        return parseInt(p[0] || 0) * 60 + parseInt(p[1] || 0);
    }

    function inSession(minuteOfDay, startMin, endMin) {
        if (startMin < endMin) {
            return minuteOfDay >= startMin && minuteOfDay < endMin;
        }
        return minuteOfDay >= startMin || minuteOfDay < endMin;
    }

    const _state = {
        prevDayKey: null,
        sessions: { asia: makeSess(), london: makeSess(), newyork: makeSess() }
    };

    function makeSess() {
        return {
            high: NaN, low: NaN,
            startTime: null,
            highBrokenBar: null, lowBrokenBar: null,
            hBroken: false, lBroken: false,
            prevInSession: false,
        };
    }

    function resetSess(s) {
        s.high = NaN; s.low = NaN;
        s.startTime = null;
        s.highBrokenBar = null; s.lowBrokenBar = null;
        s.hBroken = false; s.lBroken = false;
        s.prevInSession = false;
    }

    const Study = function() {};

    Study.prototype.init = function(context, inputCallback) {
        _state.prevDayKey = null;
        Object.keys(_state.sessions).forEach(k => resetSess(_state.sessions[k]));
    };

    Study.prototype.main = function(context, inputCallback) {
        const barTime = context.symbol.time;
        const high    = context.symbol.high;
        const low     = context.symbol.low;

        const asiaColor  = inputCallback(2) || '#2962FF';
        const lonColor   = inputCallback(3) || '#FF1744';
        const nyColor    = inputCallback(4) || '#00C853';
        const asiaStart  = parseSessionMinutes(inputCallback(5) || '05:45');
        const asiaEnd    = parseSessionMinutes(inputCallback(6) || '14:45');
        const lonStart   = parseSessionMinutes(inputCallback(7) || '12:45');
        const lonEnd     = parseSessionMinutes(inputCallback(8) || '21:45');
        const nyStart    = parseSessionMinutes(inputCallback(9) || '17:45');
        const nyEnd      = parseSessionMinutes(inputCallback(10) || '02:45');

        const nepalTime   = new Date(barTime + NEPAL_OFFSET_MS);
        const dayKey      = nepalTime.getUTCFullYear() * 10000
                          + (nepalTime.getUTCMonth()+1) * 100
                          + nepalTime.getUTCDate();
        const minuteOfDay = nepalTime.getUTCHours() * 60 + nepalTime.getUTCMinutes();

        if (_state.prevDayKey !== null && dayKey !== _state.prevDayKey) {
            Object.keys(_state.sessions).forEach(k => resetSess(_state.sessions[k]));
        }
        _state.prevDayKey = dayKey;

        const defs = [
            { key: 'asia',    startMin: asiaStart, endMin: asiaEnd  },
            { key: 'london',  startMin: lonStart,  endMin: lonEnd   },
            { key: 'newyork', startMin: nyStart,   endMin: nyEnd    },
        ];

        defs.forEach(def => {
            const s   = _state.sessions[def.key];
            const now = inSession(minuteOfDay, def.startMin, def.endMin);

            if (now && !s.prevInSession) {
                s.high = high; s.low = low;
                s.startTime = barTime;
                s.hBroken = false; s.lBroken = false;
                s.highBrokenBar = null; s.lowBrokenBar = null;
            }
            if (now && s.prevInSession) {
                if (high > s.high) s.high = high;
                if (low  < s.low)  s.low  = low;
            }
            if (!isNaN(s.high)) {
                if (!s.hBroken && high > s.high) { s.hBroken = true; s.highBrokenBar = barTime; }
                if (!s.lBroken && low  < s.low)  { s.lBroken = true; s.lowBrokenBar  = barTime; }
            }
            s.prevInSession = now;
        });

        function getPlotVal(key, isHigh) {
            const s = _state.sessions[key];
            if (isNaN(s.high) || barTime < s.startTime) return NaN;
            if (isHigh) {
                if (s.hBroken && barTime >= s.highBrokenBar) return NaN;
                return s.high;
            } else {
                if (s.lBroken && barTime >= s.lowBrokenBar) return NaN;
                return s.low;
            }
        }

        return [
            getPlotVal('asia',    true),
            getPlotVal('asia',    false),
            getPlotVal('london',  true),
            getPlotVal('london',  false),
            getPlotVal('newyork', true),
            getPlotVal('newyork', false),
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
                { id: 'asiaHigh', type: 'line' },
                { id: 'asiaLow',  type: 'line' },
                { id: 'lonHigh',  type: 'line' },
                { id: 'lonLow',   type: 'line' },
                { id: 'nyHigh',   type: 'line' },
                { id: 'nyLow',    type: 'line' },
            ],
            styles: {
                asiaHigh: { title: 'Asia High',   linestyle: 0, linewidth: 2, plottype: 8, trackPrice: true, color: '#2962FF' },
                asiaLow:  { title: 'Asia Low',    linestyle: 0, linewidth: 2, plottype: 8, trackPrice: true, color: '#2962FF' },
                lonHigh:  { title: 'London High', linestyle: 0, linewidth: 2, plottype: 8, trackPrice: true, color: '#FF1744' },
                lonLow:   { title: 'London Low',  linestyle: 0, linewidth: 2, plottype: 8, trackPrice: true, color: '#FF1744' },
                nyHigh:   { title: 'NY High',     linestyle: 0, linewidth: 2, plottype: 8, trackPrice: true, color: '#00C853' },
                nyLow:    { title: 'NY Low',      linestyle: 0, linewidth: 2, plottype: 8, trackPrice: true, color: '#00C853' },
            },
            inputs: [
                { id: "lineWidth",  name: "Line Width",    type: "integer", min: 1, max: 5, defval: 2        },
                { id: "labelSize",  name: "Label Size",    type: "text",                    defval: "small"  },
                { id: "asiaColor",  name: "Asia Color",    type: "text",                    defval: "#2962FF"},
                { id: "lonColor",   name: "London Color",  type: "text",                    defval: "#FF1744"},
                { id: "nyColor",    name: "NY Color",      type: "text",                    defval: "#00C853"},
                { id: "asiaStart",  name: "Asia Start",    type: "text",                    defval: "05:45"  },
                { id: "asiaEnd",    name: "Asia End",      type: "text",                    defval: "14:45"  },
                { id: "lonStart",   name: "London Start",  type: "text",                    defval: "12:45"  },
                { id: "lonEnd",     name: "London End",    type: "text",                    defval: "21:45"  },
                { id: "nyStart",    name: "NY Start",      type: "text",                    defval: "17:45"  },
                { id: "nyEnd",      name: "NY End",        type: "text",                    defval: "02:45"  },
            ],
            defaults: {
                styles: {
                    asiaHigh: { color: '#2962FF', visible: true, linewidth: 2, linestyle: 0 },
                    asiaLow:  { color: '#2962FF', visible: true, linewidth: 2, linestyle: 0 },
                    lonHigh:  { color: '#FF1744', visible: true, linewidth: 2, linestyle: 0 },
                    lonLow:   { color: '#FF1744', visible: true, linewidth: 2, linestyle: 0 },
                    nyHigh:   { color: '#00C853', visible: true, linewidth: 2, linestyle: 0 },
                    nyLow:    { color: '#00C853', visible: true, linewidth: 2, linestyle: 0 },
                },
                inputs: {
                    lineWidth: 2, labelSize: "small",
                    asiaColor: "#2962FF", lonColor: "#FF1744", nyColor: "#00C853",
                    asiaStart: "05:45", asiaEnd: "14:45",
                    lonStart:  "12:45", lonEnd:  "21:45",
                    nyStart:   "17:45", nyEnd:   "02:45",
                },
                precision: 5,
                palettes: {},
            }
        },
        constructor: Study
    };
}
