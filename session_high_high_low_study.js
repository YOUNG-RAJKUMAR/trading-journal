function getSessionHighLowStudy(PineJS) {
    const Study = function() {
        this._sessionData = {
            asia: { high: NaN, low: NaN, isActive: false, endBar: null, day: null, finalHigh: NaN, finalLow: NaN },
            london: { high: NaN, low: NaN, isActive: false, endBar: null, day: null, finalHigh: NaN, finalLow: NaN },
            newyork: { high: NaN, low: NaN, isActive: false, endBar: null, day: null, finalHigh: NaN, finalLow: NaN },
        };
        this._prevDay = null;
        this._barIndex = 0;
    };

    Study.prototype.main = function(context, inputCallback) {
        this._context = context;
        this._input = inputCallback;
        this._barIndex++;

        const time = context.symbol.time;
        const nepalOffset = 5.75 * 3600 * 1000;
        const nepalTime = new Date(time + nepalOffset);
        const currentDay = nepalTime.getUTCDate();
        const currentMonth = nepalTime.getUTCMonth();
        const currentYear = nepalTime.getUTCFullYear();
        const dayId = `${currentYear}-${currentMonth}-${currentDay}`;

        if (this._prevDay !== dayId) {
            this._prevDay = dayId;
            Object.keys(this._sessionData).forEach(k => {
                this._sessionData[k].high = NaN;
                this._sessionData[k].low = NaN;
                this._sessionData[k].isActive = false;
                this._sessionData[k].endBar = null;
                this._sessionData[k].day = null;
                this._sessionData[k].finalHigh = NaN;
                this._sessionData[k].finalLow = NaN;
            });
        }

        const currentMinutes = nepalTime.getUTCHours() * 60 + nepalTime.getUTCMinutes();
        const parseTime = (timeStr) => {
            if (!timeStr || typeof timeStr !== 'string') return 0;
            const parts = timeStr.split(':');
            return parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : 0;
        };

        const extDist = this._input(0);

        const sessions = [
            { id: 'asia', start: parseTime(this._input(1)), end: parseTime(this._input(2)) },
            { id: 'london', start: parseTime(this._input(3)), end: parseTime(this._input(4)) },
            { id: 'newyork', start: parseTime(this._input(5)), end: parseTime(this._input(6)) }
        ];

        sessions.forEach(s => {
            const data = this._sessionData[s.id];
            let inSession = (s.start < s.end) ? (currentMinutes >= s.start && currentMinutes < s.end) : (currentMinutes >= s.start || currentMinutes < s.end);

            if (inSession) {
                if (!data.isActive) {
                    data.isActive = true;
                    data.high = context.symbol.high;
                    data.low = context.symbol.low;
                    data.day = dayId;
                } else {
                    data.high = Math.max(data.high, context.symbol.high);
                    data.low = Math.min(data.low, context.symbol.low);
                }
            } else if (data.isActive) {
                data.isActive = false;
                data.endBar = this._barIndex;
                data.finalHigh = data.high;
                data.finalLow = data.low;
            }
        });

        const getVal = (id, type) => {
            const d = this._sessionData[id];
            // Only draw AFTER the session is complete to ensure the line is perfectly horizontal
            if (isNaN(d.finalHigh) || d.day !== dayId) return NaN;
            
            // Draw from the end of the session for the specified extension distance
            if (this._barIndex >= d.endBar && this._barIndex <= d.endBar + extDist) {
                return type === 'high' ? d.finalHigh : d.finalLow;
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
                asiaHigh: { title: 'Asia High', linestyle: 2, linewidth: 2, plottype: 8, trackPrice: false, color: '#2962FF' },
                asiaLow: { title: 'Asia Low', linestyle: 2, linewidth: 2, plottype: 8, trackPrice: false, color: '#2962FF' },
                lonHigh: { title: 'London High', linestyle: 2, linewidth: 2, plottype: 8, trackPrice: false, color: '#E91E63' },
                lonLow: { title: 'London Low', linestyle: 2, linewidth: 2, plottype: 8, trackPrice: false, color: '#E91E63' },
                nyHigh: { title: 'NY High', linestyle: 2, linewidth: 2, plottype: 8, trackPrice: false, color: '#FF9800' },
                nyLow: { title: 'NY Low', linestyle: 2, linewidth: 2, plottype: 8, trackPrice: false, color: '#FF9800' }
            },
            inputs: [
                { id: "extDist", name: "Line Length (Bars)", type: "integer", min: 1, max: 1000, defval: 100 },
                { id: "asiaStart", name: "Asia Start", type: "text", defval: "05:45" },
                { id: "asiaEnd", name: "Asia End", type: "text", defval: "14:45" },
                { id: "lonStart", name: "London Start", type: "text", defval: "12:45" },
                { id: "lonEnd", name: "London End", type: "text", defval: "21:45" },
                { id: "nyStart", name: "NY Start", type: "text", defval: "17:45" },
                { id: "nyEnd", name: "NY End", type: "text", defval: "02:45" }
            ],
            defaults: {
                styles: {
                    asiaHigh: { color: '#2962FF', visible: true, linewidth: 2, linestyle: 2 },
                    asiaLow: { color: '#2962FF', visible: true, linewidth: 2, linestyle: 2 },
                    lonHigh: { color: '#E91E63', visible: true, linewidth: 2, linestyle: 2 },
                    lonLow: { color: '#E91E63', visible: true, linewidth: 2, linestyle: 2 },
                    nyHigh: { color: '#FF9800', visible: true, linewidth: 2, linestyle: 2 },
                    nyLow: { color: '#FF9800', visible: true, linewidth: 2, linestyle: 2 }
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
