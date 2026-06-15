window.getTradingSessionIndicator = function(PineJS) {
    return {
        name: 'Trading Sessions High/Low',
        metainfo: {
            _metainfoVersion: 51,
            id: 'TradingSessionsHighLow@tv-basicstudies-1',
            description: 'Trading Sessions High/Low',
            shortDescription: 'Sess H/L',
            is_price_study: true,
            isCustomIndicator: true,
            plots: [
                { id: 'asia_high', type: 'line' },
                { id: 'asia_low', type: 'line' },
                { id: 'london_high', type: 'line' },
                { id: 'london_low', type: 'line' },
                { id: 'ny_high', type: 'line' },
                { id: 'ny_low', type: 'line' }
            ],
            defaults: {
                styles: {
                    asia_high: { linestyle: 0, linewidth: 2, plottype: 2, trackPrice: false, transparency: 0, visible: true, color: '#4488ff' },
                    asia_low: { linestyle: 0, linewidth: 2, plottype: 2, trackPrice: false, transparency: 0, visible: true, color: '#4488ff' },
                    london_high: { linestyle: 0, linewidth: 2, plottype: 2, trackPrice: false, transparency: 0, visible: true, color: '#ffcc66' },
                    london_low: { linestyle: 0, linewidth: 2, plottype: 2, trackPrice: false, transparency: 0, visible: true, color: '#ffcc66' },
                    ny_high: { linestyle: 0, linewidth: 2, plottype: 2, trackPrice: false, transparency: 0, visible: true, color: '#ff8888' },
                    ny_low: { linestyle: 0, linewidth: 2, plottype: 2, trackPrice: false, transparency: 0, visible: true, color: '#ff8888' }
                },
                inputs: {
                    timezone: 'UTC',
                    asia_session: '0000-0900',
                    london_session: '0800-1700',
                    ny_session: '1300-2200'
                }
            },
            styles: {
                asia_high: { title: 'Asia High', histogramBase: 0 },
                asia_low: { title: 'Asia Low', histogramBase: 0 },
                london_high: { title: 'London High', histogramBase: 0 },
                london_low: { title: 'London Low', histogramBase: 0 },
                ny_high: { title: 'NY High', histogramBase: 0 },
                ny_low: { title: 'NY Low', histogramBase: 0 }
            },
            inputs: [
                { id: 'timezone', name: 'Timezone', type: 'text', defval: 'UTC' },
                { id: 'asia_session', name: 'Asia Session (HHMM-HHMM)', type: 'text', defval: '0000-0900' },
                { id: 'london_session', name: 'London Session (HHMM-HHMM)', type: 'text', defval: '0800-1700' },
                { id: 'ny_session', name: 'NY Session (HHMM-HHMM)', type: 'text', defval: '1300-2200' }
            ]
        },
        constructor: function() {
            this.init = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;
            };

            this.main = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const timezone = this._input(0);
                const sessions = [
                    { range: this._input(1), highPlot: 0, lowPlot: 1 },
                    { range: this._input(2), highPlot: 2, lowPlot: 3 },
                    { range: this._input(3), highPlot: 4, lowPlot: 5 }
                ];

                const time = this._context.symbol.time;
                const date = new Date(time);
                
                const currentHHMM = date.getUTCHours().toString().padStart(2, '0') + date.getUTCMinutes().toString().padStart(2, '0');

                function isInSession(range, hhmm) {
                    const [start, end] = range.split('-');
                    if (start < end) {
                        return hhmm >= start && hhmm < end;
                    } else {
                        return hhmm >= start || hhmm < end;
                    }
                }

                const results = [NaN, NaN, NaN, NaN, NaN, NaN];

                sessions.forEach((sess, idx) => {
                    const inSess = isInSession(sess.range, currentHHMM);
                    const highVar = `_high_${idx}`;
                    const lowVar = `_low_${idx}`;
                    const inSessVar = `_inSess_${idx}`;

                    let high = context.get(highVar);
                    let low = context.get(lowVar);
                    let prevInSess = context.get(inSessVar);

                    if (inSess) {
                        if (!prevInSess) {
                            // Session just started
                            high = context.symbol.high;
                            low = context.symbol.low;
                        } else {
                            high = Math.max(high, context.symbol.high);
                            low = Math.min(low, context.symbol.low);
                        }
                        results[sess.highPlot] = high;
                        results[sess.lowPlot] = low;
                    } else {
                        high = NaN;
                        low = NaN;
                    }

                    context.set(highVar, high);
                    context.set(lowVar, low);
                    context.set(inSessVar, inSess);
                });

                return results;
            };
        }
    };
};
