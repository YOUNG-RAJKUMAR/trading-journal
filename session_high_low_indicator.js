(function() {
    'use strict';

    var NPT_OFFSET = 5 * 60 + 45;

    function parseTime(str) {
        return parseInt(str.substring(0, 2), 10) * 60 + parseInt(str.substring(2, 4), 10);
    }

    function toNPTMinutes(utcH, utcM) {
        return ((utcH * 60 + utcM) + NPT_OFFSET) % 1440;
    }

    function isInSession(nptMin, startMin, endMin) {
        if (endMin <= startMin) return nptMin >= startMin || nptMin < endMin;
        return nptMin >= startMin && nptMin < endMin;
    }

    function getNPTDay(utcSec) {
        var d = new Date(utcSec * 1000);
        var nptTotal = d.getUTCHours() * 60 + d.getUTCMinutes() + NPT_OFFSET;
        var off = Math.floor(nptTotal / 1440);
        var nd = new Date(utcSec * 1000 + off * 86400000);
        return nd.getUTCFullYear() * 10000 + (nd.getUTCMonth() + 1) * 100 + nd.getUTCDate();
    }

    var SESSIONS = [
        { start: parseTime('0545'), end: parseTime('1445'), color: '#2962FF', label: 'A', width: 2 },
        { start: parseTime('1245'), end: parseTime('2145'), color: '#FF1744', label: 'L', width: 2 },
        { start: parseTime('1745'), end: parseTime('0245'), color: '#00E676', label: 'N', width: 2 }
    ];

    function getCandles(symbol, resolution) {
        if (!window.MT5Feed || !MT5Feed.lastData) return [];
        var actual = window.getActualSymbol ? window.getActualSymbol(symbol) : symbol;
        var d = MT5Feed.lastData[actual];
        if (!d || !d.candles || !d.candles[resolution]) return [];
        return d.candles[resolution].slice().sort(function(a, b) { return a.time - b.time; });
    }

    function getResolution() {
        if (window._currentTF && window._currentTF[0]) {
            var tf = window._currentTF[0];
            var map = {
                '1':'M1','2':'M2','3':'M3','4':'M4','5':'M5','6':'M6',
                '10':'M10','12':'M12','15':'M15','20':'M20','30':'M30',
                '60':'H1','120':'H2','180':'H3','240':'H4','D':'D1','W':'W1','M':'MN1'
            };
            return map[tf] || 'H1';
        }
        return 'H1';
    }

    window.drawSessionHighLow = function(widget) {
        if (!widget) return;
        var chart;
        try { chart = widget.activeChart(); } catch(e) { return; }
        if (!chart) return;

        // Remove old drawings
        if (widget._shlEntities) {
            widget._shlEntities.forEach(function(id) {
                try { chart.removeEntity(id); } catch(e) {}
            });
        }
        widget._shlEntities = [];

        // Get symbol from chart
        var symbol;
        try { symbol = chart.symbol(); } catch(e) { return; }
        if (!symbol) return;

        var resolution = getResolution();
        var candles = getCandles(symbol, resolution);
        if (candles.length < 2) {
            console.log('[SessionHighLow] No candle data for', symbol, resolution);
            return;
        }

        // Build session high/low from candle data
        var buckets = [];

        for (var si = 0; si < SESSIONS.length; si++) {
            var sess = SESSIONS[si];
            var currentDay = -1;
            var sessionHigh = 0;
            var sessionLow = Infinity;
            var sessionStartTime = null;
            var inSession = false;

            for (var i = 0; i < candles.length; i++) {
                var bar = candles[i];
                var utcSec = bar.time;
                var d = new Date(utcSec * 1000);
                var nptMin = toNPTMinutes(d.getUTCHours(), d.getUTCMinutes());
                var dayKey = getNPTDay(utcSec);
                var isActive = isInSession(nptMin, sess.start, sess.end);

                if (isActive) {
                    if (!inSession || dayKey !== currentDay) {
                        if (inSession && sessionStartTime !== null && sessionHigh > 0 && sessionLow < Infinity) {
                            buckets.push({
                                high: sessionHigh, low: sessionLow,
                                startTime: sessionStartTime,
                                color: sess.color, label: sess.label, width: sess.width
                            });
                        }
                        currentDay = dayKey;
                        sessionHigh = bar.high;
                        sessionLow = bar.low;
                        sessionStartTime = bar.time;
                        inSession = true;
                    } else {
                        if (bar.high > sessionHigh) sessionHigh = bar.high;
                        if (bar.low < sessionLow) sessionLow = bar.low;
                    }
                } else if (inSession) {
                    if (sessionStartTime !== null && sessionHigh > 0 && sessionLow < Infinity) {
                        buckets.push({
                            high: sessionHigh, low: sessionLow,
                            startTime: sessionStartTime,
                            color: sess.color, label: sess.label, width: sess.width
                        });
                    }
                    inSession = false;
                    sessionStartTime = null;
                }
            }
            if (inSession && sessionStartTime !== null && sessionHigh > 0 && sessionLow < Infinity) {
                buckets.push({
                    high: sessionHigh, low: sessionLow,
                    startTime: sessionStartTime,
                    color: sess.color, label: sess.label, width: sess.width
                });
            }
        }

        // Deduplicate by day+session to keep only the latest of each
        var seen = {};
        var uniqueBuckets = [];
        for (var i = buckets.length - 1; i >= 0; i--) {
            var b = buckets[i];
            var day = getNPTDay(b.startTime);
            var sessKey = b.label;
            var key = day + '_' + sessKey;
            if (!seen[key]) {
                seen[key] = true;
                uniqueBuckets.push(b);
            }
        }
        uniqueBuckets.reverse();

        // Draw horizontal lines using createMultipointShape (trend_line with 2 points at same price)
        var timeScale = chart.timeScale();
        var visibleRange = timeScale.getVisibleRange();
        var totalTime = visibleRange.to - visibleRange.from;

        uniqueBuckets.forEach(function(b) {
            // Extend lines across visible area
            var fromTime = b.startTime;
            var toTime = Math.min(b.startTime + totalTime, visibleRange.to);

            // High line - use createMultipointShape with trend_line
            try {
                var hl = chart.createMultipointShape(
                    [
                        { time: fromTime, price: b.high },
                        { time: toTime, price: b.high }
                    ],
                    {
                        shape: 'trend_line',
                        lock: true,
                        disableSelection: true,
                        disableSave: true,
                        disableUndo: true,
                        zOrder: 'top',
                        overrides: {
                            linecolor: b.color,
                            linewidth: b.width,
                            linestyle: 0,
                            showLabel: false,
                            extendLeft: false,
                            extendRight: false
                        }
                    }
                );
                if (hl !== null) widget._shlEntities.push(hl);
            } catch(e) {
                console.warn('[SessionHighLow] high line error:', e);
            }

            // Low line
            try {
                var ll = chart.createMultipointShape(
                    [
                        { time: fromTime, price: b.low },
                        { time: toTime, price: b.low }
                    ],
                    {
                        shape: 'trend_line',
                        lock: true,
                        disableSelection: true,
                        disableSave: true,
                        disableUndo: true,
                        zOrder: 'top',
                        overrides: {
                            linecolor: b.color,
                            linewidth: b.width,
                            linestyle: 0,
                            showLabel: false,
                            extendLeft: false,
                            extendRight: false
                        }
                    }
                );
                if (ll !== null) widget._shlEntities.push(ll);
            } catch(e) {
                console.warn('[SessionHighLow] low line error:', e);
            }

            // Label (A / L / N)
            try {
                var lbl = chart.createShape(
                    { time: fromTime, price: b.high },
                    {
                        shape: 'text',
                        lock: true,
                        disableSelection: true,
                        disableSave: true,
                        disableUndo: true,
                        zOrder: 'top',
                        overrides: {
                            text: b.label,
                            color: b.color,
                            fontSize: 14,
                            bold: true,
                            textHorizontalAlignment: 'center',
                            textVerticalAlignment: 'bottom'
                        }
                    }
                );
                if (lbl !== null) widget._shlEntities.push(lbl);
            } catch(e) {}
        });

        console.log('[SessionHighLow] Drew ' + uniqueBuckets.length + ' session lines (' + widget._shlEntities.length + ' entities)');
    };

    console.log('[SessionHighLow] Drawing module loaded (v3)');
})();
