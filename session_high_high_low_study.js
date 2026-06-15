function getSessionHighLowStudy(PineJS) {
    const Study = function() {
        this._sessionData = {}; // Stores data by dayId: { [dayId]: { sessionData } }
        this._prevTime = null;
        this._barIndex = 0;
    };

    Study.prototype.main = function(context, inputCallback) {
        const time = context.symbol.time;
        // Robust bar index tracking to prevent scattering
        if (this._prevTime === null || time > this._prevTime) {
            this._barIndex++;
            this._prevTime = time;
        }

        const nepalOffset = 5.75 * 3600 * 1000;
        const nepalTime = new Date(time + nepalOffset);
        const todayId = `${nepalTime.getUTCFullYear()}-${nepalTime.getUTCMonth()}-${nepalTime.getUTCDate()}`;

        // Calculate yesterday's date
        const yesterdayTime = new Date(nepalTime.getTime() - (24 * 60 * 60 * 1000));
        const yesterdayId = `${yesterdayTime.getUTCFullYear()}-${yesterdayTime.getUTCMonth()}-${yesterdayTime.getUTCDate()}`;

        // Ensure we have data for both today and yesterday
        if (!this._sessionData[todayId]) {
            this._sessionData[todayId] = {
                asia: { high: NaN, low: NaN, highBar: null, lowBar: null, isActive: false, endBar: null, broken: { high: false, low: false } },
                london: { high: NaN, low: NaN, highBar: null, lowBar: null, isActive: false, endBar: null, broken: { high: false, low: false } },
                newyork: { high: NaN, low: NaN, highBar: null, lowBar: null, isActive: false, endBar: null, broken: { high: false, low: false } }
            };
        }

        if (!this._sessionData[yesterdayId]) {
            this._sessionData[yesterdayId] = {
                asia: { high: NaN, low: NaN, highBar: null, lowBar: null, isActive: false, endBar: null, broken: { high: false, low: false } },
                london: { high: NaN, low: NaN, highBar: null, lowBar: null, isActive: false, endBar: null, broken: { high: false, low: false } },
                newyork: { high: NaN, low: NaN, highBar: null, lowBar: null, isActive: false, endBar: null, broken: { high: false, low: false } }
            };
        }

        const todayData = this._sessionData[todayId];
        const yesterdayData = this._sessionData[yesterdayId];

        const currentMinutes = nepalTime.getUTCHours() * 60 + nepalTime.getUTCMinutes();
        const parseTime = (timeStr) => {
            const parts = (timeStr || "").split(':');
            return parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : 0;
        };

        const extDist = inputCallback(0);
        const sessions = [
            { id: 'asia', start: parseTime(inputCallback(1)), end: parseTime(inputCallback(2)) },
            { id: 'london', start: parseTime(inputCallback(3)), end: parseTime(inputCallback(4)) },
            { id: 'newyork', start: parseTime(inputCallback(5)), end: parseTime(inputCallback(6)) }
        ];

        // Process both today's and yesterday's session data
        const processDayData = (dayData, dayLabel) => {
            sessions.forEach(s => {
                const data = dayData[s.id];
                const inSession = (s.start < s.end) ? (currentMinutes >= s.start && currentMinutes < s.end) : (currentMinutes >= s.start || currentMinutes < s.end);

                if (inSession) {
                    if (!data.isActive) {
                        data.isActive = true;
                        data.high = context.symbol.high;
                        data.low = context.symbol.low;
                        data.highBar = this._barIndex;
                        data.lowBar = this._barIndex;
                    } else {
                        if (context.symbol.high > data.high || isNaN(data.high)) {
                            data.high = context.symbol.high;
                            data.highBar = this._barIndex;
                        }
                        if (context.symbol.low < data.low || isNaN(data.low)) {
                            data.low = context.symbol.low;
                            data.lowBar = this._barIndex;
                        }
                    }
                } else if (data.isActive) {
                    data.isActive = false;
                    data.endBar = this._barIndex;
                }

                // Break detection
                if (!data.isActive && !isNaN(data.high)) {
                    if (!data.broken.high && context.symbol.high > data.high) {
                        data.broken.high = true;
                        data.highBreakBar = this._barIndex;
                    }
                    if (!data.broken.low && context.symbol.low < data.low) {
                        data.broken.low = true;
                        data.lowBreakBar = this._barIndex;
                    }
                }
            });
        };

        // Process both days
        processDayData(todayData, 'today');
        processDayData(yesterdayData, 'yesterday');

        const getVal = (dayData, id, type) => {
            const d = dayData[id];
            // Only draw after session is complete to ensure horizontal stability
            // For active sessions, we might want to show current progress (commented out for now)
            if (isNaN(d.high) || d.isActive) return NaN;

            const startBar = (type === 'high') ? d.highBar : d.lowBar;
            const isBroken = (type === 'high') ? d.broken.high : d.broken.low;
            const breakBar = (type === 'high') ? d.highBreakBar : d.lowBreakBar;

            let endBar = d.endBar + extDist;
            if (isBroken && breakBar) endBar = breakBar;

            // By strictly limiting the bar range and returning NaN outside,
            // we prevent the library from connecting segments diagonally.
            if (this._barIndex >= startBar && this._barIndex <= endBar) {
                return type === 'high' ? d.high : d.low;
            }
            return NaN;
        };

        // Return values: [todayAsiaHigh, todayAsiaLow, todayLonHigh, todayLonLow, todayNYHigh, todayNYLow,
        //                yesterdayAsiaHigh, yesterdayAsiaLow, yesterdayLonHigh, yesterdayLonLow, yesterdayNYHigh, yesterdayNYLow]
        return [
            getVal(todayData, 'asia', 'high'), getVal(todayData, 'asia', 'low'),
            getVal(todayData, 'london', 'high'), getVal(todayData, 'london', 'low'),
            getVal(todayData, 'newyork', 'high'), getVal(todayData, 'newyork', 'low'),
            getVal(yesterdayData, 'asia', 'high'), getVal(yesterdayData, 'asia', 'low'),
            getVal(yesterdayData, 'london', 'high'), getVal(yesterdayData, 'london', 'low'),
            getVal(yesterdayData, 'newyork', 'high'), getVal(yesterdayData, 'newyork', 'low')
        ];
    };

    return {
        name: "NepalSessionHL",
        metainfo: {
            _metainfoVersion: 51,
            id: "NepalSessionHL@tv-basicstudies-9",
            description: "NepalSessionHL",
            shortDescription: "NSHL",
            isCustomIndicator: true,
            is_price_study: true,
            format: { type: 'price', precision: 2 },
            plots: [
                { id: 'todayAsiaHigh', type: 'line' }, { id: 'todayAsiaLow', type: 'line' },
                { id: 'todayLonHigh', type: 'line' }, { id: 'todayLonLow', type: 'line' },
                { id: 'todayNYHigh', type: 'line' }, { id: 'todayNYLow', type: 'line' },
                { id: 'yesterdayAsiaHigh', type: 'line' }, { id: 'yesterdayAsiaLow', type: 'line' },
                { id: 'yesterdayLonHigh', type: 'line' }, { id: 'yesterdayLonLow', type: 'line' },
                { id: 'yesterdayNYHigh', type: 'line' }, { id: 'yesterdayNYLow', type: 'line' }
            ],
            styles: {
                todayAsiaHigh: { title: 'Today Asia High', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#2962FF' },
                todayAsiaLow: { title: 'Today Asia Low', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#2962FF' },
                todayLonHigh: { title: 'Today London High', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#E91E63' },
                todayLonLow: { title: 'Today London Low', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#E91E63' },
                todayNYHigh: { title: 'Today NY High', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#FF9800' },
                todayNYLow: { title: 'Today NY Low', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#FF9800' },
                yesterdayAsiaHigh: { title: 'Yesterday Asia High', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#2962FF', linestyle: 2 }, // Dashed for yesterday
                yesterdayAsiaLow: { title: 'Yesterday Asia Low', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#2962FF', linestyle: 2 },
                yesterdayLonHigh: { title: 'Yesterday London High', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#E91E63', linestyle: 2 },
                yesterdayLonLow: { title: 'Yesterday London Low', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#E91E63', linestyle: 2 },
                yesterdayNYHigh: { title: 'Yesterday NY High', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#FF9800', linestyle: 2 },
                yesterdayNYLow: { title: 'Yesterday NY Low', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#FF9800', linestyle: 2 }
            },
            inputs: [
                { id: "extDist", name: "Extension Distance (Bars)", type: "integer", min: 0, max: 100, defval: 10 },
                { id: "asiaStart", name: "Asia Start", type: "text", defval: "05:45" },
                { id: "asiaEnd", name: "Asia End", type: "text", defval: "14:45" },
                { id: "lonStart", name: "London Start", type: "text", defval: "12:45" },
                { id: "lonEnd", name: "London End", type: "text", defval: "21:45" },
                { id: "nyStart", name: "NY Start", type: "text", defval: "17:45" },
                { id: "nyEnd", name: "NY End", type: "text", defval: "02:45" }
            ],
            defaults: {
                styles: {
                    todayAsiaHigh: { color: '#2962FF', visible: true, linewidth: 2, linestyle: 0 },
                    todayAsiaLow: { color: '#2962FF', visible: true, linewidth: 2, linestyle: 0 },
                    todayLonHigh: { color: '#E91E63', visible: true, linewidth: 2, linestyle: 0 },
                    todayLonLow: { color: '#E91E63', visible: true, linewidth: 2, linestyle: 0 },
                    todayNYHigh: { color: '#FF9800', visible: true, linewidth: 2, linestyle: 0 },
                    todayNYLow: { color: '#FF9800', visible: true, linewidth: 2, linestyle: 0 },
                    yesterdayAsiaHigh: { color: '#2962FF', visible: true, linewidth: 2, linestyle: 2 }, // Dashed
                    yesterdayAsiaLow: { color: '#2962FF', visible: true, linewidth: 2, linestyle: 2 },
                    yesterdayLonHigh: { color: '#E91E63', visible: true, linewidth: 2, linestyle: 2 },
                    yesterdayLonLow: { color: '#E91E63', visible: true, linewidth: 2, linestyle: 2 },
                    yesterdayNYHigh: { color: '#FF9800', visible: true, linewidth: 2, linestyle: 2 },
                    yesterdayNYLow: { color: '#FF9800', visible: true, linewidth: 2, linestyle: 2 }
                },
                inputs: {
                    extDist: 100,
                    asiaStart: "05:45", asiaEnd: "14:45",
                    lonStart: "12:45", lonEnd: "21:45",
                    nyStart: "17:45", nyEnd: "02:45"
                },
                precision: 2
            }
        },
        constructor: Study
    };
}