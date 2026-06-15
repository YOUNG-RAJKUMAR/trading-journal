/**
 * Trading Sessions High/Low Indicator
 * Uses standard plots but with a "locked" value logic to simulate horizontal lines.
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
                { id: 'asia_high', type: 'line' }, { id: 'asia_low', type: 'line' },
                { id: 'london_high', type: 'line' }, { id: 'london_low', type: 'line' },
                { id: 'ny_high', type: 'line' }, { id: 'ny_low', type: 'line' }
            ],
            inputs: [
                { id: 'timezone_offset', name: 'Timezone Offset (e.g. 5.75 for Kathmandu)', type: 'float', defval: 5.75 },
                { id: 'session_asia', name: 'Asia Session', type: 'text', defval: '0545-1445' },
                { id: 'session_london', name: 'London Session', type: 'text', defval: '1245-2145' },
                { id: 'session_ny', name: 'New York Session', type: 'text', defval: '1745-0245' }
            ],
            defaults: {
                styles: {
                    asia_high: { linestyle: 0, linewidth: 2, plottype: 2, color: '#0000FF', visible: true, transparency: 0 },
                    asia_low: { linestyle: 0, linewidth: 2, plottype: 2, color: '#0000FF', visible: true, transparency: 0 },
                    london_high: { linestyle: 0, linewidth: 2, plottype: 2, color: '#FF0000', visible: true, transparency: 0 },
                    london_low: { linestyle: 0, linewidth: 2, plottype: 2, color: '#FF0000', visible: true, transparency: 0 },
                    ny_high: { linestyle: 0, linewidth: 2, plottype: 2, color: '#008000', visible: true, transparency: 0 },
                    ny_low: { linestyle: 0, linewidth: 2, plottype: 2, color: '#008000', visible: true, transparency: 0 }
                },
                inputs: {
                    timezone_offset: 5.75,
                    session_asia: '0545-1445',
                    session_london: '1245-2145',
                    session_ny: '1745-0245'
                }
            },
            styles: {
                asia_high: { title: 'Asia High' }, asia_low: { title: 'Asia Low' },
                london_high: { title: 'London High' }, london_low: { title: 'London Low' },
                ny_high: { title: 'NY High' }, ny_low: { title: 'NY Low' }
            },
            format: { type: 'price', precision: 2 }
        },
        constructor: function() {
            // Internal state to persist values across bars
            this._asiaHigh = NaN; this._asiaLow = NaN;
            this._lonHigh = NaN; this._lonLow = NaN;
            this._nyHigh = NaN; this._nyLow = NaN;
            this._prevDayKey = null;

            this.main = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const tzOffset = this._input(0);
                const sessionTimes = [this._input(1), this._input(2), this._input(3)];

                const barTime = context.symbol.time;
                const date = new Date(barTime * 1000);
                const dayKey = date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

                // Day Change Reset
                if (this._prevDayKey !== dayKey) {
                    this._asiaHigh = NaN; this._asiaLow = NaN;
                    this._lonHigh = NaN; this._lonLow = NaN;
                    this._nyHigh = NaN; this._nyLow = NaN;
                    this._prevDayKey = dayKey;
                }

                const utcMins = date.getUTCHours() * 60 + date.getUTCMinutes();
                const adjMins = (utcMins + Math.round(tzOffset * 60) + 1440) % 1440;
                const hh = Math.floor(adjMins / 60);
                const mm = adjMins % 60;
                const currentHHMM = hh.toString().padStart(2, '0') + mm.toString().padStart(2, '0');

                const high = context.symbol.high;
                const low = context.symbol.low;

                function isInSession(range, hhmm) {
                    const [start, end] = range.split('-');
                    if (start < end) return hhmm >= start && hhmm < end;
                    return hhmm >= start || hhmm < end;
                }

                // We calculate session H/L and return them for EVERY bar once set.
                // This creates a horizontal line because the value doesn't change until the next session.
                
                // Asia
                if (isInSession(sessionTimes[0], currentHHMM)) {
                    if (isNaN(this._asiaHigh)) { this._asiaHigh = high; this._asiaLow = low; }
                    else { this._asiaHigh = Math.max(this._asiaHigh, high); this._asiaLow = Math.min(this._asiaLow, low); }
                }
                
                // London
                if (isInSession(sessionTimes[1], currentHHMM)) {
                    if (isNaN(this._lonHigh)) { this._lonHigh = high; this._lonLow = low; }
                    else { this._lonHigh = Math.max(this._lonHigh, high); this._lonLow = Math.min(this._lonLow, low); }
                }

                // NY
                if (isInSession(sessionTimes[2], currentHHMM)) {
                    if (isNaN(this._nyHigh)) { this._nyHigh = high; this._nyLow = low; }
                    else { this._nyHigh = Math.max(this._nyHigh, high); this._nyLow = Math.min(this._nyLow, low); }
                }

                return [this._asiaHigh, this._asiaLow, this._lonHigh, this._lonLow, this._nyHigh, this._nyLow];
            };
        }
    };
};

console.log('[SessionIndicator] V5 Horizontal Version Loaded');
