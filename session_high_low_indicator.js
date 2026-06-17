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

        // Get all panes and their series
        var panes = chart.panes();
        if (!panes || panes.length === 0) return;
        var pane = panes[0];
        var sources = pane.dataSources();
        var mainSeries = null;
        for (var i = 0; i < sources.length; i++) {
            if (sources[i].isMainSeries && sources[i].isMainSeries()) {
                mainSeries = sources[i];
                break;
            }
        }
        if (!mainSeries) return;

        var data = mainSeries.data();
        if (!data || data.length < 2) return;

        // Build session high/low from candle data
        var buckets = [];

        for (var si = 0; si < SESSIONS.length; si++) {
            var sess = SESSIONS[si];

            // Track per-day session data
            var currentDay = -1;
            var sessionHigh = 0;
            var sessionLow = Infinity;
            var sessionStart = null;
            var inSession = false;

            for (var i = 0; i < data.length; i++) {
                var bar = data[i];
                var utcSec = bar.time;
                var d = new Date(utcSec * 1000);
                var nptMin = toNPTMinutes(d.getUTCHours(), d.getUTCMinutes());
                var dayKey = getNPTDay(utcSec);
                var isActive = isInSession(nptMin, sess.start, sess.end);

                if (isActive) {
                    if (!inSession || dayKey !== currentDay) {
                        // New session start
                        if (inSession && sessionStart !== null && sessionHigh > 0 && sessionLow < Infinity) {
                            buckets.push({
                                high: sessionHigh, low: sessionLow,
                                startTime: sessionStart.time,
                                endTime: data[i - 1].time,
                                color: sess.color, label: sess.label, width: sess.width
                            });
                        }
                        currentDay = dayKey;
                        sessionHigh = bar.high;
                        sessionLow = bar.low;
                        sessionStart = bar;
                        inSession = true;
                    } else {
                        if (bar.high > sessionHigh) sessionHigh = bar.high;
                        if (bar.low < sessionLow) sessionLow = bar.low;
                    }
                } else if (inSession) {
                    // Session just ended
                    if (sessionStart !== null && sessionHigh > 0 && sessionLow < Infinity) {
                        buckets.push({
                            high: sessionHigh, low: sessionLow,
                            startTime: sessionStart.time,
                            endTime: data[i - 1].time,
                            color: sess.color, label: sess.label, width: sess.width
                        });
                    }
                    inSession = false;
                    sessionStart = null;
                }
            }

            // Handle last session if still active
            if (inSession && sessionStart !== null && sessionHigh > 0 && sessionLow < Infinity) {
                buckets.push({
                    high: sessionHigh, low: sessionLow,
                    startTime: sessionStart.time,
                    endTime: data[data.length - 1].time,
                    color: sess.color, label: sess.label, width: sess.width
                });
            }
        }

        // Draw lines using createShape with horizontal_line
        buckets.forEach(function(b) {
            // High line
            try {
                var hl = chart.createShape(
                    { price: b.high, time: b.startTime },
                    {
                        shape: 'horizontal_line',
                        lock: true,
                        disableSelection: true,
                        disableSave: true,
                        disableUndo: true,
                        zOrder: 'top',
                        overrides: {
                            linecolor: b.color,
                            linewidth: b.width,
                            linestyle: 0,
                            showLabel: false
                        }
                    }
                );
                if (hl !== null) widget._shlEntities.push(hl);
            } catch(e) {
                console.warn('[SessionHighLow] high line error:', e);
            }

            // Low line
            try {
                var ll = chart.createShape(
                    { price: b.low, time: b.startTime },
                    {
                        shape: 'horizontal_line',
                        lock: true,
                        disableSelection: true,
                        disableSave: true,
                        disableUndo: true,
                        zOrder: 'top',
                        overrides: {
                            linecolor: b.color,
                            linewidth: b.width,
                            linestyle: 0,
                            showLabel: false
                        }
                    }
                );
                if (ll !== null) widget._shlEntities.push(ll);
            } catch(e) {
                console.warn('[SessionHighLow] low line error:', e);
            }

            // Label (A / L / N) at session start
            try {
                var lbl = chart.createShape(
                    { price: b.high, time: b.startTime },
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

        console.log('[SessionHighLow] Drew ' + buckets.length + ' session buckets (' + widget._shlEntities.length + ' entities)');
    };

    console.log('[SessionHighLow] Drawing module loaded (v2)');
})();
