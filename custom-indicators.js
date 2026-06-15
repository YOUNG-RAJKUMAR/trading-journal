/**
 * Custom Indicators for Lean Trading Journal
 * Includes: Session High Low - Current Day Only
 */

window.getCustomIndicators = function(PineJS) {
    return Promise.resolve([
        {
            name: 'Session High Low',
            metainfo: {
                _metainfoVersion: 51,
                id: 'SessionHighLow@tv-basicstudies-1',
                description: 'Session High Low',
                shortDescription: 'Session H/L',
                is_price_study: true,
                isCustomIndicator: true,
                format: {
                    type: 'price',
                    precision: 4,
                },
                plots: [
                    { id: 'asia_high', type: 'line' },
                    { id: 'asia_low', type: 'line' },
                    { id: 'london_high', type: 'line' },
                    { id: 'london_low', type: 'line' },
                    { id: 'ny_high', type: 'line' },
                    { id: 'ny_low', type: 'line' },
                ],
                defaults: {
                    styles: {
                        asia_high: { linestyle: 0, visible: true, linewidth: 2, plottype: 2, trackPrice: false, color: '#4488ff' },
                        asia_low: { linestyle: 1, visible: true, linewidth: 2, plottype: 2, trackPrice: false, color: '#4488ff' },
                        london_high: { linestyle: 0, visible: true, linewidth: 2, plottype: 2, trackPrice: false, color: '#ff4444' },
                        london_low: { linestyle: 1, visible: true, linewidth: 2, plottype: 2, trackPrice: false, color: '#ff4444' },
                        ny_high: { linestyle: 0, visible: true, linewidth: 2, plottype: 2, trackPrice: false, color: '#44ff88' },
                        ny_low: { linestyle: 1, visible: true, linewidth: 2, plottype: 2, trackPrice: false, color: '#44ff88' }
                    },
                    inputs: {}
                },
                styles: {
                    asia_high: { title: 'Asia High', histogramBase: 0 },
                    asia_low: { title: 'Asia Low', histogramBase: 0 },
                    london_high: { title: 'London High', histogramBase: 0 },
                    london_low: { title: 'London Low', histogramBase: 0 },
                    ny_high: { title: 'NY High', histogramBase: 0 },
                    ny_low: { title: 'NY Low', histogramBase: 0 }
                },
                inputs: [],
            },
            constructor: function() {
                this.init = function(context, inputCallback) {
                    this._context = context;
                    this._input = inputCallback;
                };

                this.main = function(context, inputCallback) {
                    this._context = context;
                    this._input = inputCallback;

                    // Use PineJS.Std to get OHLC data
                    const close = PineJS.Std.close(this._context);
                    const high = PineJS.Std.high(this._context);
                    const low = PineJS.Std.low(this._context);
                    const time = PineJS.Std.time(this._context);

                    // Initialize state if needed
                    if (!this._state) {
                        this._state = {
                            lastDay: null,
                            asia: { h: null, l: null },
                            london: { h: null, l: null },
                            ny: { h: null, l: null }
                        };
                    }

                    // Reset on new day (UTC based)
                    const day = Math.floor(time / 86400);
                    if (this._state.lastDay !== day) {
                        this._state.lastDay = day;
                        this._state.asia = { h: null, l: null };
                        this._state.london = { h: null, l: null };
                        this._state.ny = { h: null, l: null };
                    }

                    // Convert time to UTC minutes for session detection
                    const d = new Date(time * 1000);
                    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();

                    // Asia: 05:45-14:45 Kathmandu = 00:00-09:00 UTC
                    if (mins >= 0 && mins < 540) {
                        this._state.asia.h = this._state.asia.h === null ? high : Math.max(this._state.asia.h, high);
                        this._state.asia.l = this._state.asia.l === null ? low : Math.min(this._state.asia.l, low);
                    }
                    // London: 12:45-21:45 Kathmandu = 07:00-16:00 UTC
                    if (mins >= 420 && mins < 960) {
                        this._state.london.h = this._state.london.h === null ? high : Math.max(this._state.london.h, high);
                        this._state.london.l = this._state.london.l === null ? low : Math.min(this._state.london.l, low);
                    }
                    // NY: 17:45-02:45 Kathmandu = 12:00-21:00 UTC
                    if (mins >= 720 && mins < 1260) {
                        this._state.ny.h = this._state.ny.h === null ? high : Math.max(this._state.ny.h, high);
                        this._state.ny.l = this._state.ny.l === null ? low : Math.min(this._state.ny.l, low);
                    }

                    return [
                        this._state.asia.h, this._state.asia.l,
                        this._state.london.h, this._state.london.l,
                        this._state.ny.h, this._state.ny.l
                    ];
                };
            }
        }
    ]);
};
