/**
 * Trading Sessions High/Low Indicator
 * Based on user-provided Pine Script logic
 * Draws horizontal lines for Asia, London, and NY sessions
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
                { id: 'timezone', name: 'Timezone', type: 'text', defval: 'Asia/Kathmandu' },
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
                    timezone: 'Asia/Kathmandu',
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
            // Persistent state
            this._asiaHigh = NaN; this._asiaLow = NaN;
            this._lonHigh = NaN; this._lonLow = NaN;
            this._nyHigh = NaN; this._nyLow = NaN;
            this._prevDayKey = null;

            this.main = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const timezone = this._input(0);
                const sessAsia = this._input(1);
                const sessLon = this._input(2);
                const sessNY = this._input(3);

                const barTime = context.symbol.time;
                const date = new Date(barTime * 1000);
                const dayKey = date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

                // New Day Reset
                if (this._prevDayKey !== dayKey) {
                    this._asiaHigh = NaN; this._asiaLow = NaN;
                    this._lonHigh = NaN; this._lonLow = NaN;
                    this._nyHigh = NaN; this._nyLow = NaN;
                    this._prevDayKey = dayKey;
                }

                const high = context.symbol.high;
                const low = context.symbol.low;

                // Helper to check session
                function checkSession(sessionStr, date) {
                    const [start, end] = sessionStr.split('-');
                    // Simple UTC HHMM for now
                    const hhmm = date.getUTCHours().toString().padStart(2, '0') + date.getUTCMinutes().toString().padStart(2, '0');
                    if (start < end) return hhmm >= start && hhmm < end;
                    return hhmm >= start || hhmm < end;
                }

                // Logic: Only update High/Low DURING the session. 
                // Once session ends, the value stays the same (flat line).
                // On new day, it resets to NaN.

                // Asia
                if (checkSession(sessAsia, date)) {
                    if (isNaN(this._asiaHigh)) { this._asiaHigh = high; this._asiaLow = low; }
                    else { this._asiaHigh = Math.max(this._asiaHigh, high); this._asiaLow = Math.min(this._asiaLow, low); }
                }

                // London
                if (checkSession(sessLon, date)) {
                    if (isNaN(this._lonHigh)) { this._lonHigh = high; this._lonLow = low; }
                    else { this._lonHigh = Math.max(this._lonHigh, high); this._lonLow = Math.min(this._lonLow, low); }
                }

                // NY
                if (checkSession(sessNY, date)) {
                    if (isNaN(this._nyHigh)) { this._nyHigh = high; this._nyLow = low; }
                    else { this._nyHigh = Math.max(this._nyHigh, high); this._nyLow = Math.min(this._nyLow, low); }
                }

                return [this._asiaHigh, this._asiaLow, this._lonHigh, this._lonLow, this._nyHigh, this._nyLow];
            };
        }
    };
};

console.log('[SessionIndicator] V4 Loaded - Fixed Line Logic');
