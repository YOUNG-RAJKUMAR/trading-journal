/**
 * Trading Sessions High/Low Indicator
 * draws static horizontal lines for each session high/low.
 * Logic: One line for the entire session.
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
            // Internal state
            this._sessions = [
                { high: NaN, low: NaN, hBroken: false, lBroken: false }, // Asia
                { high: NaN, low: NaN, hBroken: false, lBroken: false }, // London
                { high: NaN, low: NaN, hBroken: false, lBroken: false }  // NY
            ];
            this._prevDayKey = null;

            this.main = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const tzOffset = this._input(0);
                const sessionTimes = [this._input(1), this._input(2), this._input(3)];

                const barTime = context.symbol.time;
                const date = new Date(barTime * 1000);
                
                // Day Change Detection
                const dayKey = date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
                if (this._prevDayKey !== dayKey) {
                    this._sessions.forEach(s => {
                        s.high = NaN; s.low = NaN;
                        s.hBroken = false; s.lBroken = false;
                    });
                    this._prevDayKey = dayKey;
                }

                // Get adjusted HHMM
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

                const results = [NaN, NaN, NaN, NaN, NaN, NaN];

                sessionTimes.forEach((sessRange, i) => {
                    const s = this._sessions[i];
                    const inSess = isInSession(sessRange, currentHHMM);

                    if (inSess) {
                        // During session, find the session's high/low
                        if (isNaN(s.high)) {
                            s.high = high;
                            s.low = low;
                        } else {
                            s.high = Math.max(s.high, high);
                            s.low = Math.min(s.low, low);
                        }
                    }

                    // Draw the line if session has started and it hasn't been broken
                    if (!isNaN(s.high)) {
                        // Break Detection (only if not in session anymore, or optional based on user preference)
                        // In your Pine script, it breaks if price crosses the high/low
                        if (!s.hBroken && high > s.high && !inSess) s.hBroken = true;
                        if (!s.lBroken && low < s.low && !inSess) s.lBroken = true;

                        if (!s.hBroken) results[i * 2] = s.high;
                        if (!s.lBroken) results[i * 2 + 1] = s.low;
                    }
                });

                return results;
            };
        }
    };
};

console.log('[SessionIndicator] One-Line Version Loaded (Kathmandu Time)');
