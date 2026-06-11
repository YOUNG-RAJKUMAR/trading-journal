function getSessionHighLowStudy() {
    return {
        name: "NepalSessionHL",
        metainfo: {
            _metainfoVersion: 51,
            id: "NepalSessionHL",
            description: "NepalSessionHL",
            shortDescription: "NSHL",
            isCustomIndicator: true,
            is_price_study: true,
            format: {
                type: 'price',
                precision: 2,
            },
            plots: [
                { id: 'asiaHigh', type: 'line' },
                { id: 'asiaLow', type: 'line' },
                { id: 'lonHigh', type: 'line' },
                { id: 'lonLow', type: 'line' },
                { id: 'nyHigh', type: 'line' },
                { id: 'nyLow', type: 'line' }
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
                { id: "lineWidth", name: "Line Width", type: "integer", min: 1, max: 5, defval: 2 },
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
                    lineWidth: 2
                },
                precision: 2
            }
        },

        constructor: function() {
            this._sessionData = {
                asia: { high: NaN, low: NaN, isActive: false, broken: { high: false, low: false } },
                london: { high: NaN, low: NaN, isActive: false, broken: { high: false, low: false } },
                newyork: { high: NaN, low: NaN, isActive: false, broken: { high: false, low: false } },
            };
            this._prevDay = null;
        },

        main: function(context, inputCallback) {
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
            const sessions = [
                { id: 'asia', start: 5*60+45, end: 14*60+45 },
                { id: 'london', start: 12*60+45, end: 21*60+45 },
                { id: 'newyork', start: 17*60+45, end: 2*60+45 }
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
                
                // Breakout check
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
        }
    };
}
