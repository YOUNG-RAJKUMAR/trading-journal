/**
 * Trading Sessions High/Low Indicator
 * Perfect Horizontal Lines - Current Day Only
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
                { id: 'timezone_offset', name: 'Timezone Offset', type: 'float', defval: 5.75 },
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
            this._prevDay = null;
            this._sessions = [
                { h: NaN, l: NaN, hBroken: false, lBroken: false }, // Asia
                { h: NaN, l: NaN, hBroken: false, lBroken: false }, // London
                { h: NaN, l: NaN, hBroken: false, lBroken: false }  // NY
            ];

            this.main = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                const tz = this._input(0);
                const sessionInputs = [this._input(1), this._input(2), this._input(3)];

                const time = context.symbol.time;
                const d = new Date(time * 1000);
                const day = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();

                // RESET on new day
                if (this._prevDay !== day) {
                    this._sessions.forEach(s => {
                        s.h = NaN; s.l = NaN;
                        s.hBroken = false; s.lBroken = false;
                    });
                    this._prevDay = day;
                }

                const utcMins = d.getUTCHours() * 60 + d.getUTCMinutes();
                const adjMins = (utcMins + Math.round(tz * 60) + 1440) % 1440;
                const hhmm = Math.floor(adjMins / 60).toString().padStart(2, '0') + (adjMins % 60).toString().padStart(2, '0');

                const high = context.symbol.high;
                const low = context.symbol.low;

                function check(range, now) {
                    const [s, e] = range.split('-');
                    return s < e ? (now >= s && now < e) : (now >= s || now < e);
                }

                const results = [NaN, NaN, NaN, NaN, NaN, NaN];

                this._sessions.forEach((s, i) => {
                    const inSess = check(sessionInputs[i], hhmm);
                    
                    if (inSess) {
                        if (isNaN(s.h)) {
                            s.h = high;
                            s.l = low;
                        } else {
                            s.h = Math.max(s.h, high);
                            s.l = Math.min(s.l, low);
                        }
                    }

                    if (!isNaN(s.h)) {
                        // Break logic: only check break if NOT in session anymore
                        if (!inSess) {
                            if (high > s.h) s.hBroken = true;
                            if (low < s.l) s.lBroken = true;
                        }

                        if (!s.hBroken) results[i * 2] = s.h;
                        if (!s.lBroken) results[i * 2 + 1] = s.l;
                    }
                });

                return results;
            };
        }
    };
};
