function getSessionHighLowStudy(PineJS) {
    const Study = function() {
        this._sessionData = {
            asia: { high: NaN, low: NaN, isActive: false, broken: { high: false, low: false } },
            london: { high: NaN, low: NaN, isActive: false, broken: { high: false, low: false } },
            newyork: { high: NaN, low: NaN, isActive: false, broken: { high: false, low: false } },
        };
        this._prevDay = null;
    };

    Study.prototype.main = function(context, inputCallback) {
        this._context = context;
        this._input = inputCallback;

        const time = context.symbol.time;
        const nepalOffset = 5.75 * 3600 * 1000;
        const nepalTime = new Date(time + nepalOffset);
        const currentDay = nepalTime.getUTCDate();

        if (this._prevDay !== currentDay) {
            this._prevDay = currentDay;
            Object.keys(this._sessionData).forEach(k => {
                this._sessionData[k].high = NaN;
                this._sessionData[k].low = NaN;
                this._sessionData[k].isActive = false;
                this._sessionData[k].broken = { high: false, low: false };
            });
        }

        const currentMinutes = nepalTime.getUTCHours() * 60 + nepalTime.getUTCMinutes();

        const parseTime = (timeStr) => {
            const parts = timeStr.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };

        const sessions = [
            { id: 'asia', start: parseTime(this._input(1)), end: parseTime(this._input(2)) },
            { id: 'london', start: parseTime(this._input(3)), end: parseTime(this._input(4)) },
            { id: 'newyork', start: parseTime(this._input(5)), end: parseTime(this._input(6)) }
        ];

        sessions.forEach(s => {
            const data = this._sessionData[s.id];
            let inSession = (s.start < s.end) 
                ? (currentMinutes >= s.start && currentMinutes < s.end)
                : (currentMinutes >= s.start || currentMinutes < s.end);

            if (inSession) {
                if (!data.isActive) {
                    data.isActive = true;
                    data.high = context.symbol.high;
                    data.low = context.symbol.low;
                    data.broken = { high: false, low: false };
                } else {
                    data.high = Math.max(data.high, context.symbol.high);
                    data.low = Math.min(data.low, context.symbol.low);
                }
            } else {
                data.isActive = false;
            }

            if (!isNaN(data.high)) {
                if (!data.broken.high && context.symbol.high > data.high) data.broken.high = true;
                if (!data.broken.low && context.symbol.low < data.low) data.broken.low = true;
            }
        });

        const getVal = (id, type) => {
            const d = this._sessionData[id];
            if (isNaN(d.high)) return NaN;
            if (d.broken[type]) return NaN;
            return type === 'high' ? d.high : d.low;
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
            id: "NepalSessionHL@tv-basicstudies-1",
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
                asiaHigh: { title: 'Asia High', linestyle: 0, linewidth: 2, plottype: 8, trackPrice: false, color: '#2962FF' },
                asiaLow: { title: 'Asia Low', linestyle: 0, linewidth: 2, plottype: 8, trackPrice: false, color: '#2962FF' },
                lonHigh: { title: 'London High', linestyle: 0, linewidth: 2, plottype: 8, trackPrice: false, color: '#E91E63' },
                lonLow: { title: 'London Low', linestyle: 0, linewidth: 2, plottype: 8, trackPrice: false, color: '#E91E63' },
                nyHigh: { title: 'NY High', linestyle: 0, linewidth: 2, plottype: 8, trackPrice: false, color: '#FF9800' },
                nyLow: { title: 'NY Low', linestyle: 0, linewidth: 2, plottype: 8, trackPrice: false, color: '#FF9800' }
            },
            inputs: [
                { id: "lineWidth", name: "Line Width", type: "integer", min: 1, max: 5, defval: 2 },
                { id: "asiaStart", name: "Asia Start", type: "text", defval: "05:45" },
                { id: "asiaEnd", name: "Asia End", type: "text", defval: "14:45" },
                { id: "lonStart", name: "London Start", type: "text", defval: "12:45" },
                { id: "lonEnd", name: "London End", type: "text", defval: "21:45" },
                { id: "nyStart", name: "NY Start", type: "text", defval: "17:45" },
                { id: "nyEnd", name: "NY End", type: "text", defval: "02:45" }
            ],
            defaults: {
                styles: {
                    asiaHigh: { color: '#2962FF', visible: true, linewidth: 2 },
                    asiaLow: { color: '#2962FF', visible: true, linewidth: 2 },
                    lonHigh: { color: '#E91E63', visible: true, linewidth: 2 },
                    lonLow: { color: '#E91E63', visible: true, linewidth: 2 },
                    nyHigh: { color: '#FF9800', visible: true, linewidth: 2 },
                    nyLow: { color: '#FF9800', visible: true, linewidth: 2 }
                },
                inputs: {
                    lineWidth: 2,
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
