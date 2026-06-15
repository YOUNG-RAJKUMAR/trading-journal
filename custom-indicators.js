/**
 * Custom Indicators for Lean Trading Journal
 * Includes: Session High Low - Current Day Only
 */

window.getCustomIndicators = function(PineJS) {
    return Promise.resolve([
        {
            name: 'Session High Low - Current Day Only',
            metainfo: {
                _metainfoVersion: 51,
                id: 'SessionHighLow@lean-trading-journal-1',
                description: 'SESSION HIGH LOW - Current Day Only',
                shortDescription: 'Session High Low',
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
                        asia_high: {
                            linestyle: 0,
                            visible: true,
                            linewidth: 2,
                            plottype: 2,
                            trackPrice: false,
                            color: '#4488ff'
                        },
                        asia_low: {
                            linestyle: 1,
                            visible: true,
                            linewidth: 2,
                            plottype: 2,
                            trackPrice: false,
                            color: '#4488ff'
                        },
                        london_high: {
                            linestyle: 0,
                            visible: true,
                            linewidth: 2,
                            plottype: 2,
                            trackPrice: false,
                            color: '#ff4444'
                        },
                        london_low: {
                            linestyle: 1,
                            visible: true,
                            linewidth: 2,
                            plottype: 2,
                            trackPrice: false,
                            color: '#ff4444'
                        },
                        ny_high: {
                            linestyle: 0,
                            visible: true,
                            linewidth: 2,
                            plottype: 2,
                            trackPrice: false,
                            color: '#44ff88'
                        },
                        ny_low: {
                            linestyle: 1,
                            visible: true,
                            linewidth: 2,
                            plottype: 2,
                            trackPrice: false,
                            color: '#44ff88'
                        }
                    },
                    inputs: {}
                },
                styles: {
                    asia_high: {
                        title: 'Asia High',
                        histogramBase: 0,
                    },
                    asia_low: {
                        title: 'Asia Low',
                        histogramBase: 0,
                    },
                    london_high: {
                        title: 'London High',
                        histogramBase: 0,
                    },
                    london_low: {
                        title: 'London Low',
                        histogramBase: 0,
                    },
                    ny_high: {
                        title: 'NY High',
                        histogramBase: 0,
                    },
                    ny_low: {
                        title: 'NY Low',
                        histogramBase: 0,
                    }
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

                    // Get current bar data
                    const close = PineJS.Std.close(this._context);
                    const high = PineJS.Std.high(this._context);
                    const low = PineJS.Std.low(this._context);
                    const time = PineJS.Std.time(this._context);

                    // Session times (UTC offset for Asia/Kathmandu: +5:45)
                    // Asia:   05:45 - 14:45 UTC+5:45 = 00:00 - 09:00 UTC
                    // London: 12:45 - 21:45 UTC+5:45 = 07:00 - 16:00 UTC
                    // NY:     17:45 - 02:45 UTC+5:45 = 12:00 - 21:00 UTC

                    const barTime = new Date(time * 1000);
                    const utcHours = barTime.getUTCHours();
                    const utcMinutes = barTime.getUTCMinutes();
                    const utcTimeInMinutes = utcHours * 60 + utcMinutes;

                    // Session detection
                    const inAsia = utcTimeInMinutes >= 0 && utcTimeInMinutes < 540; // 00:00 - 09:00 UTC
                    const inLondon = utcTimeInMinutes >= 420 && utcTimeInMinutes < 960; // 07:00 - 16:00 UTC
                    const inNY = utcTimeInMinutes >= 720 && utcTimeInMinutes < 1260; // 12:00 - 21:00 UTC

                    // Initialize session tracking variables (using context state)
                    if (!this._sessionState) {
                        this._sessionState = {
                            currentDay: null,
                            asia: { high: null, low: null, started: false },
                            london: { high: null, low: null, started: false },
                            ny: { high: null, low: null, started: false }
                        };
                    }

                    const dayKey = Math.floor(time / 86400); // Day boundary in seconds

                    // Reset on new day
                    if (this._sessionState.currentDay !== dayKey) {
                        this._sessionState.currentDay = dayKey;
                        this._sessionState.asia = { high: null, low: null, started: false };
                        this._sessionState.london = { high: null, low: null, started: false };
                        this._sessionState.ny = { high: null, low: null, started: false };
                    }

                    // Update Asia session
                    if (inAsia) {
                        if (!this._sessionState.asia.started) {
                            this._sessionState.asia.high = high;
                            this._sessionState.asia.low = low;
                            this._sessionState.asia.started = true;
                        } else {
                            this._sessionState.asia.high = Math.max(this._sessionState.asia.high, high);
                            this._sessionState.asia.low = Math.min(this._sessionState.asia.low, low);
                        }
                    }

                    // Update London session
                    if (inLondon) {
                        if (!this._sessionState.london.started) {
                            this._sessionState.london.high = high;
                            this._sessionState.london.low = low;
                            this._sessionState.london.started = true;
                        } else {
                            this._sessionState.london.high = Math.max(this._sessionState.london.high, high);
                            this._sessionState.london.low = Math.min(this._sessionState.london.low, low);
                        }
                    }

                    // Update NY session
                    if (inNY) {
                        if (!this._sessionState.ny.started) {
                            this._sessionState.ny.high = high;
                            this._sessionState.ny.low = low;
                            this._sessionState.ny.started = true;
                        } else {
                            this._sessionState.ny.high = Math.max(this._sessionState.ny.high, high);
                            this._sessionState.ny.low = Math.min(this._sessionState.ny.low, low);
                        }
                    }

                    // Return plot values
                    return [
                        this._sessionState.asia.high || close,      // asia_high
                        this._sessionState.asia.low || close,       // asia_low
                        this._sessionState.london.high || close,    // london_high
                        this._sessionState.london.low || close,     // london_low
                        this._sessionState.ny.high || close,        // ny_high
                        this._sessionState.ny.low || close          // ny_low
                    ];
                };
            }
        }
    ]);
};
