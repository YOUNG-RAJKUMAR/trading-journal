/**
 * Trading Sessions High/Low Indicator
 * Displays horizontal lines for the high and low of Asian, London, and New York sessions
 */

window.getTradingSessionIndicator = function(PineJS) {
    return {
        name: 'Trading Sessions High/Low',
        metainfo: {
            _metainfoVersion: 53,
            id: 'SessionHighLow@tv-basicstudies-1',
            description: 'Trading Sessions High/Low',
            shortDescription: 'Sessions H/L',
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
            inputs: [
                { id: 'timezone', name: 'Timezone (UTC offset)', type: 'text', defval: '0' },
                { id: 'asia_start', name: 'Asia Start (HH:MM)', type: 'text', defval: '00:00' },
                { id: 'asia_end', name: 'Asia End (HH:MM)', type: 'text', defval: '09:00' },
                { id: 'london_start', name: 'London Start (HH:MM)', type: 'text', defval: '08:00' },
                { id: 'london_end', name: 'London End (HH:MM)', type: 'text', defval: '17:00' },
                { id: 'ny_start', name: 'NY Start (HH:MM)', type: 'text', defval: '13:00' },
                { id: 'ny_end', name: 'NY End (HH:MM)', type: 'text', defval: '22:00' }
            ],
            defaults: {
                styles: {
                    asia_high: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#4488ff' },
                    asia_low: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#4488ff' },
                    london_high: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#ffcc66' },
                    london_low: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#ffcc66' },
                    ny_high: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#ff8888' },
                    ny_low: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#ff8888' }
                },
                inputs: {
                    timezone: '0',
                    asia_start: '00:00',
                    asia_end: '09:00',
                    london_start: '08:00',
                    london_end: '17:00',
                    ny_start: '13:00',
                    ny_end: '22:00'
                }
            },
            styles: {
                asia_high: { title: 'Asia High' },
                asia_low: { title: 'Asia Low' },
                london_high: { title: 'London High' },
                london_low: { title: 'London Low' },
                ny_high: { title: 'NY High' },
                ny_low: { title: 'NY Low' }
            },
            format: { type: 'price', precision: 2 }
        },
        constructor: function() {
            // Internal state to track highs and lows across bars
            this._asiaHigh = NaN;
            this._asiaLow = NaN;
            this._londonHigh = NaN;
            this._londonLow = NaN;
            this._nyHigh = NaN;
            this._nyLow = NaN;
            this._lastBarTime = 0;

            this.main = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const timezone = parseFloat(this._input(0)) || 0;
                const asiaStart = this._input(1);
                const asiaEnd = this._input(2);
                const londonStart = this._input(3);
                const londonEnd = this._input(4);
                const nyStart = this._input(5);
                const nyEnd = this._input(6);

                const barTime = context.symbol.time;
                const date = new Date(barTime * 1000);
                
                const utcHours = date.getUTCHours();
                const utcMinutes = date.getUTCMinutes();
                const adjustedHours = (utcHours + timezone + 24) % 24;
                const currentHHMM = String(Math.floor(adjustedHours)).padStart(2, '0') + String(utcMinutes).padStart(2, '0');

                function timeToHHMM(timeStr) {
                    if (!timeStr) return '0000';
                    const parts = timeStr.split(':');
                    return String(parts[0]).padStart(2, '0') + String(parts[1] || '00').padStart(2, '0');
                }

                function isInSession(start, end, current) {
                    const startNum = parseInt(timeToHHMM(start));
                    const endNum = parseInt(timeToHHMM(end));
                    const currentNum = parseInt(current);
                    if (startNum <= endNum) return currentNum >= startNum && currentNum < endNum;
                    return currentNum >= startNum || currentNum < endNum;
                }

                const high = context.symbol.high;
                const low = context.symbol.low;

                // Asia Session
                if (isInSession(asiaStart, asiaEnd, currentHHMM)) {
                    if (isNaN(this._asiaHigh)) {
                        this._asiaHigh = high;
                        this._asiaLow = low;
                    } else {
                        this._asiaHigh = Math.max(this._asiaHigh, high);
                        this._asiaLow = Math.min(this._asiaLow, low);
                    }
                } else {
                    this._asiaHigh = NaN;
                    this._asiaLow = NaN;
                }

                // London Session
                if (isInSession(londonStart, londonEnd, currentHHMM)) {
                    if (isNaN(this._londonHigh)) {
                        this._londonHigh = high;
                        this._londonLow = low;
                    } else {
                        this._londonHigh = Math.max(this._londonHigh, high);
                        this._londonLow = Math.min(this._londonLow, low);
                    }
                } else {
                    this._londonHigh = NaN;
                    this._londonLow = NaN;
                }

                // NY Session
                if (isInSession(nyStart, nyEnd, currentHHMM)) {
                    if (isNaN(this._nyHigh)) {
                        this._nyHigh = high;
                        this._nyLow = low;
                    } else {
                        this._nyHigh = Math.max(this._nyHigh, high);
                        this._nyLow = Math.min(this._nyLow, low);
                    }
                } else {
                    this._nyHigh = NaN;
                    this._nyLow = NaN;
                }

                return [this._asiaHigh, this._asiaLow, this._londonHigh, this._londonLow, this._nyHigh, this._nyLow];
            };
        }
    };
};

console.log('[SessionIndicator] Loaded and ready for registration');
