function getSessionHighLowStudy(PineJS) {
    const Study = function() {
        this._sessionData = {};
        this._barIndex = 0;
    };

    Study.prototype.main = function(context, inputCallback) {
        this._barIndex++;
        const time = context.symbol.time;
        const nepalOffset = 5.75 * 3600 * 1000;
        const nepalTime = new Date(time + nepalOffset);
        
        const dayId = `${nepalTime.getUTCFullYear()}-${nepalTime.getUTCMonth()}-${nepalTime.getUTCDate()}`;
        if (!this._sessionData[dayId]) {
            this._sessionData[dayId] = {
                asia: { high: NaN, low: NaN, highBar: null, lowBar: null, isActive: false, endBar: null, broken: { high: false, low: false } },
                london: { high: NaN, low: NaN, highBar: null, lowBar: null, isActive: false, endBar: null, broken: { high: false, low: false } },
                newyork: { high: NaN, low: NaN, highBar: null, lowBar: null, isActive: false, endBar: null, broken: { high: false, low: false } }
            };
        }
        const dayData = this._sessionData[dayId];

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

        const getVal = (id, type) => {
            const d = dayData[id];
            if (isNaN(d.high) || d.isActive) return NaN;
            
            const startBar = (type === 'high') ? d.highBar : d.lowBar;
            const isBroken = (type === 'high') ? d.broken.high : d.broken.low;
            const breakBar = (type === 'high') ? d.highBreakBar : d.lowBreakBar;
            
            let endBar = d.endBar + extDist;
            if (isBroken && breakBar) endBar = breakBar;
            
            if (this._barIndex >= startBar && this._barIndex <= endBar) {
                return type === 'high' ? d.high : d.low;
            }
            return NaN;
        };

        return [
            getVal('asia', 'high'), getVal('asia', 'low'),
            getVal('london', 'high'), getVal('london', 'low'),
            getVal('newyork', 'high'), getVal('newyork', 'low')
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
                { id: 'asiaHigh', type: 'line' }, { id: 'asiaLow', type: 'line' },
                { id: 'lonHigh', type: 'line' }, { id: 'lonLow', type: 'line' },
                { id: 'nyHigh', type: 'line' }, { id: 'nyLow', type: 'line' }
            ],
            styles: {
                asiaHigh: { title: 'Asia High', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#2962FF' },
                asiaLow: { title: 'Asia Low', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#2962FF' },
                lonHigh: { title: 'London High', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#E91E63' },
                lonLow: { title: 'London Low', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#E91E63' },
                nyHigh: { title: 'NY High', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#FF9800' },
                nyLow: { title: 'NY Low', linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, color: '#FF9800' }
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
                    asiaHigh: { color: '#2962FF', visible: true, linewidth: 2, linestyle: 0 },
                    asiaLow: { color: '#2962FF', visible: true, linewidth: 2, linestyle: 0 },
                    lonHigh: { color: '#E91E63', visible: true, linewidth: 2, linestyle: 0 },
                    lonLow: { color: '#E91E63', visible: true, linewidth: 2, linestyle: 0 },
                    nyHigh: { color: '#FF9800', visible: true, linewidth: 2, linestyle: 0 },
                    nyLow: { color: '#FF9800', visible: true, linewidth: 2, linestyle: 0 }
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
