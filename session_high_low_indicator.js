(function() {
    'use strict';

    var NPT_OFFSET = 5 * 60 + 45;

    var SESSIONS = {
        asia:   { start: '0545', end: '1445' },
        london: { start: '1245', end: '2145' },
        ny:     { start: '1745', end: '0245' }
    };

    function parseTime(str) {
        return parseInt(str.substring(0, 2), 10) * 60 + parseInt(str.substring(2, 4), 10);
    }

    function toNPTMinutes(utcH, utcM) {
        return ((utcH * 60 + utcM) + NPT_OFFSET) % 1440;
    }

    function getNPTDayKey(utcMs) {
        var d = new Date(utcMs);
        var nptTotal = d.getUTCHours() * 60 + d.getUTCMinutes() + NPT_OFFSET;
        var dayOffset = Math.floor(nptTotal / 1440);
        var nd = new Date(utcMs + dayOffset * 86400000);
        return nd.getUTCFullYear() * 10000 + (nd.getUTCMonth() + 1) * 100 + nd.getUTCDate();
    }

    function isInSession(nptMin, startMin, endMin) {
        if (endMin <= startMin) {
            return nptMin >= startMin || nptMin < endMin;
        }
        return nptMin >= startMin && nptMin < endMin;
    }

    var asiaStart = parseTime(SESSIONS.asia.start);
    var asiaEnd   = parseTime(SESSIONS.asia.end);
    var lonStart  = parseTime(SESSIONS.london.start);
    var lonEnd    = parseTime(SESSIONS.london.end);
    var nyStart   = parseTime(SESSIONS.ny.start);
    var nyEnd     = parseTime(SESSIONS.ny.end);

    window.TradingView = window.TradingView || {};
    window.TradingView.customStudies = window.TradingView.customStudies || {};

    window.TradingView.customStudies['Session High Low'] = {
        name: 'Session High Low — Current Day Only',
        metainfo: {
            _metainfoVersion: 42,
            id: 'SessionHighLow@custom',
            name: 'Session High Low — Current Day Only',
            description: 'Session highs/lows for Asia, London, NY with break detection',
            'short_description': 'Session H/L',
            is_hidden_study: false,
            is_price_study: true,
            precision: 8,
            defaults: {
                styles: {
                    asia_high:     { color: '#2962FF', linestyle: 0, linewidth: 2, visible: true },
                    asia_low:      { color: '#2962FF', linestyle: 0, linewidth: 2, visible: true },
                    asia_hbreak:   { color: '#2962FF', linestyle: 3, linewidth: 1, visible: true },
                    asia_lbreak:   { color: '#2962FF', linestyle: 3, linewidth: 1, visible: true },
                    london_high:   { color: '#FF1744', linestyle: 0, linewidth: 2, visible: true },
                    london_low:    { color: '#FF1744', linestyle: 0, linewidth: 2, visible: true },
                    london_hbreak: { color: '#FF1744', linestyle: 3, linewidth: 1, visible: true },
                    london_lbreak: { color: '#FF1744', linestyle: 3, linewidth: 1, visible: true },
                    ny_high:       { color: '#00E676', linestyle: 0, linewidth: 2, visible: true },
                    ny_low:        { color: '#00E676', linestyle: 0, linewidth: 2, visible: true },
                    ny_hbreak:     { color: '#00E676', linestyle: 3, linewidth: 1, visible: true },
                    ny_lbreak:     { color: '#00E676', linestyle: 3, linewidth: 1, visible: true }
                },
                precision: 8
            },
            styles: {
                asia_high:     { title: 'Asia High',    is_filled: false, type: 2, location: 'top',    plotWithPriceZero: false },
                asia_low:      { title: 'Asia Low',     is_filled: false, type: 2, location: 'bottom', plotWithPriceZero: false },
                asia_hbreak:   { title: 'Asia H Break', is_filled: false, type: 2, location: 'top',    plotWithPriceZero: false },
                asia_lbreak:   { title: 'Asia L Break', is_filled: false, type: 2, location: 'bottom', plotWithPriceZero: false },
                london_high:   { title: 'London High',  is_filled: false, type: 2, location: 'top',    plotWithPriceZero: false },
                london_low:    { title: 'London Low',   is_filled: false, type: 2, location: 'bottom', plotWithPriceZero: false },
                london_hbreak: { title: 'Lon H Break',  is_filled: false, type: 2, location: 'top',    plotWithPriceZero: false },
                london_lbreak: { title: 'Lon L Break',  is_filled: false, type: 2, location: 'bottom', plotWithPriceZero: false },
                ny_high:       { title: 'NY High',      is_filled: false, type: 2, location: 'top',    plotWithPriceZero: false },
                ny_low:        { title: 'NY Low',       is_filled: false, type: 2, location: 'bottom', plotWithPriceZero: false },
                ny_hbreak:     { title: 'NY H Break',   is_filled: false, type: 2, location: 'top',    plotWithPriceZero: false },
                ny_lbreak:     { title: 'NY L Break',   is_filled: false, type: 2, location: 'bottom', plotWithPriceZero: false }
            },
            plots: [
                { id: 'asia_high',     type: 'line' },
                { id: 'asia_low',      type: 'line' },
                { id: 'asia_hbreak',   type: 'line' },
                { id: 'asia_lbreak',   type: 'line' },
                { id: 'london_high',   type: 'line' },
                { id: 'london_low',    type: 'line' },
                { id: 'london_hbreak', type: 'line' },
                { id: 'london_lbreak', type: 'line' },
                { id: 'ny_high',       type: 'line' },
                { id: 'ny_low',        type: 'line' },
                { id: 'ny_hbreak',     type: 'line' },
                { id: 'ny_lbreak',     type: 'line' }
            ],
            inputs: []
        },

        constructor: function() {
            this._lastDay = -1;

            // Session state
            this._aH = null; this._aL = null; this._aHB = false; this._aLB = false; this._inA = false;
            this._lH = null; this._lL = null; this._lHB = false; this._lLB = false; this._inL = false;
            this._nH = null; this._nL = null; this._nHB = false; this._nLB = false; this._inN = false;

            // Persistent values for continuous line output (survive after session ends)
            this._aHval = NaN; this._aLval = NaN;
            this._lHval = NaN; this._lLval = NaN;
            this._nHval = NaN; this._nLval = NaN;
        },

        main: function(context, inputCallback) {
            var self = this;
            return {
                onUpdate: function(ctx) {
                    var time = ctx.time();
                    var high = ctx.high();
                    var low  = ctx.low();
                    if (time === null || high === null || low === null) return;

                    var utcMs = time * 1000;
                    var d = new Date(utcMs);
                    var nptMin = toNPTMinutes(d.getUTCHours(), d.getUTCMinutes());
                    var dayKey = getNPTDayKey(utcMs);

                    // Day reset
                    if (dayKey !== self._lastDay) {
                        self._lastDay = dayKey;
                        self._aH = null; self._aL = null; self._aHB = false; self._aLB = false; self._inA = false;
                        self._lH = null; self._lL = null; self._lHB = false; self._lLB = false; self._inL = false;
                        self._nH = null; self._nL = null; self._nHB = false; self._nLB = false; self._inN = false;
                        self._aHval = NaN; self._aLval = NaN;
                        self._lHval = NaN; self._lLval = NaN;
                        self._nHval = NaN; self._nLval = NaN;
                    }

                    // --- ASIA ---
                    var asiaNow = isInSession(nptMin, asiaStart, asiaEnd);
                    if (asiaNow && !self._inA) {
                        self._aH = high; self._aL = low;
                        self._aHB = false; self._aLB = false;
                        self._inA = true;
                    } else if (asiaNow && self._inA) {
                        if (high > self._aH) self._aH = high;
                        if (low  < self._aL) self._aL = low;
                    } else if (!asiaNow && self._inA) {
                        self._inA = false;
                    }

                    // --- LONDON ---
                    var lonNow = isInSession(nptMin, lonStart, lonEnd);
                    if (lonNow && !self._inL) {
                        self._lH = high; self._lL = low;
                        self._lHB = false; self._lLB = false;
                        self._inL = true;
                    } else if (lonNow && self._inL) {
                        if (high > self._lH) self._lH = high;
                        if (low  < self._lL) self._lL = low;
                    } else if (!lonNow && self._inL) {
                        self._inL = false;
                    }

                    // --- NY ---
                    var nyNow = isInSession(nptMin, nyStart, nyEnd);
                    if (nyNow && !self._inN) {
                        self._nH = high; self._nL = low;
                        self._nHB = false; self._nLB = false;
                        self._inN = true;
                    } else if (nyNow && self._inN) {
                        if (high > self._nH) self._nH = high;
                        if (low  < self._nL) self._nL = low;
                    } else if (!nyNow && self._inN) {
                        self._inN = false;
                    }

                    // --- BREAK DETECTION ---
                    if (self._aH !== null && !self._aHB && high > self._aH) self._aHB = true;
                    if (self._aL !== null && !self._aLB && low  < self._aL) self._aLB = true;
                    if (self._lH !== null && !self._lHB && high > self._lH) self._lHB = true;
                    if (self._lL !== null && !self._lLB && low  < self._lL) self._lLB = true;
                    if (self._nH !== null && !self._nHB && high > self._nH) self._nHB = true;
                    if (self._nL !== null && !self._nLB && low  < self._nL) self._nLB = true;

                    // --- PERSIST current session values (stays after session ends) ---
                    if (self._aH !== null) { self._aHval = self._aH; self._aLval = self._aL; }
                    if (self._lH !== null) { self._lHval = self._lH; self._lLval = self._lL; }
                    if (self._nH !== null) { self._nHval = self._nH; self._nLval = self._nL; }

                    // --- OUTPUT: always return all 12 plots ---
                    // Plots with NaN won't render (no line segment) — this is correct
                    // Plots with a price value WILL render — creating continuous lines
                    var out = {};

                    // Asia: solid lines during session, dashed after break, persists after session ends
                    if (!isNaN(self._aHval)) {
                        if (!self._aHB) {
                            out.asia_high = self._aHval;
                        } else {
                            out.asia_hbreak = self._aHval;
                        }
                        if (!self._aLB) {
                            out.asia_low = self._aLval;
                        } else {
                            out.asia_lbreak = self._aLval;
                        }
                    }

                    // London
                    if (!isNaN(self._lHval)) {
                        if (!self._lHB) {
                            out.london_high = self._lHval;
                        } else {
                            out.london_hbreak = self._lHval;
                        }
                        if (!self._lLB) {
                            out.london_low = self._lLval;
                        } else {
                            out.london_lbreak = self._lLval;
                        }
                    }

                    // NY
                    if (!isNaN(self._nHval)) {
                        if (!self._nHB) {
                            out.ny_high = self._nHval;
                        } else {
                            out.ny_hbreak = self._nHval;
                        }
                        if (!self._nLB) {
                            out.ny_low = self._nLval;
                        } else {
                            out.ny_lbreak = self._nLval;
                        }
                    }

                    return out;
                }
            };
        }
    };

    console.log('[SessionHighLow] Registered as "Session High Low"');
})();
