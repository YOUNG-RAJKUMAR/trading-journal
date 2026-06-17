(function() {
    'use strict';

    var NPT_OFFSET = 5 * 60 + 45;

    var SESSIONS = {
        asia:   { start: '0545', end: '1445', color: '#2962FF', label: 'A' },
        london: { start: '1245', end: '2145', color: '#FF1744', label: 'L' },
        ny:     { start: '1745', end: '0245', color: '#00E676', label: 'N' }
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

    var asiaStart  = parseTime(SESSIONS.asia.start);
    var asiaEnd    = parseTime(SESSIONS.asia.end);
    var lonStart   = parseTime(SESSIONS.london.start);
    var lonEnd     = parseTime(SESSIONS.london.end);
    var nyStart    = parseTime(SESSIONS.ny.start);
    var nyEnd      = parseTime(SESSIONS.ny.end);

    window.TradingView = window.TradingView || {};
    window.TradingView.customStudies = window.TradingView.customStudies || {};

    window.TradingView.customStudies['Session High Low'] = {
        name: 'Session High Low — Current Day Only',
        metainfo: {
            _metainfoVersion: 42,
            id: 'SessionHighLow@custom',
            name: 'Session High Low — Current Day Only',
            description: 'Session highs/lows for Asia, London, NY — current day only',
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
            this._aH = null; this._aL = null; this._aHB = false; this._aLB = false; this._inA = false;
            this._lH = null; this._lL = null; this._lHB = false; this._lLB = false; this._inL = false;
            this._nH = null; this._nL = null; this._nHB = false; this._nLB = false; this._inN = false;
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

                    if (dayKey !== self._lastDay) {
                        self._lastDay = dayKey;
                        self._aH = null; self._aL = null; self._aHB = false; self._aLB = false; self._inA = false;
                        self._lH = null; self._lL = null; self._lHB = false; self._lLB = false; self._inL = false;
                        self._nH = null; self._nL = null; self._nHB = false; self._nLB = false; self._inN = false;
                    }

                    var asiaActive = isInSession(nptMin, asiaStart, asiaEnd);
                    var lonActive  = isInSession(nptMin, lonStart, lonEnd);
                    var nyActive   = isInSession(nptMin, nyStart, nyEnd);

                    if (asiaActive) {
                        if (!self._inA) {
                            self._aH = high; self._aL = low;
                            self._aHB = false; self._aLB = false;
                            self._inA = true;
                        } else {
                            if (high > self._aH) self._aH = high;
                            if (low  < self._aL) self._aL = low;
                        }
                    } else {
                        self._inA = false;
                    }

                    if (lonActive) {
                        if (!self._inL) {
                            self._lH = high; self._lL = low;
                            self._lHB = false; self._lLB = false;
                            self._inL = true;
                        } else {
                            if (high > self._lH) self._lH = high;
                            if (low  < self._lL) self._lL = low;
                        }
                    } else {
                        self._inL = false;
                    }

                    if (nyActive) {
                        if (!self._inN) {
                            self._nH = high; self._nL = low;
                            self._nHB = false; self._nLB = false;
                            self._inN = true;
                        } else {
                            if (high > self._nH) self._nH = high;
                            if (low  < self._nL) self._nL = low;
                        }
                    } else {
                        self._inN = false;
                    }

                    if (self._aH !== null && !self._aHB && high > self._aH) self._aHB = true;
                    if (self._aL !== null && !self._aLB && low  < self._aL) self._aLB = true;
                    if (self._lH !== null && !self._lHB && high > self._lH) self._lHB = true;
                    if (self._lL !== null && !self._lLB && low  < self._lL) self._lLB = true;
                    if (self._nH !== null && !self._nHB && high > self._nH) self._nHB = true;
                    if (self._nL !== null && !self._nLB && low  < self._nL) self._nLB = true;

                    var out = {};

                    if (self._aH !== null) {
                        if (!self._aHB) out.asia_high = self._aH;
                        else            out.asia_hbreak = self._aH;
                    }
                    if (self._aL !== null) {
                        if (!self._aLB) out.asia_low = self._aL;
                        else            out.asia_lbreak = self._aL;
                    }

                    if (self._lH !== null) {
                        if (!self._lHB) out.london_high = self._lH;
                        else            out.london_hbreak = self._lH;
                    }
                    if (self._lL !== null) {
                        if (!self._lLB) out.london_low = self._lL;
                        else            out.london_lbreak = self._lL;
                    }

                    if (self._nH !== null) {
                        if (!self._nHB) out.ny_high = self._nH;
                        else            out.ny_hbreak = self._nH;
                    }
                    if (self._nL !== null) {
                        if (!self._nLB) out.ny_low = self._nL;
                        else            out.ny_lbreak = self._nL;
                    }

                    return out;
                }
            };
        }
    };

    console.log('[SessionHighLow] Custom study registered as "Session High Low"');
})();
