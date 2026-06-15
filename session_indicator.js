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
                { id: 'timezone', name: 'Timezone (UTC offset)', type: 'text', defval: '0', tooltip: 'Enter UTC offset (e.g., 0, +5.5, -5)' },
                { id: 'asia_start', name: 'Asia Start (HH:MM)', type: 'text', defval: '00:00' },
                { id: 'asia_end', name: 'Asia End (HH:MM)', type: 'text', defval: '09:00' },
                { id: 'london_start', name: 'London Start (HH:MM)', type: 'text', defval: '08:00' },
                { id: 'london_end', name: 'London End (HH:MM)', type: 'text', defval: '17:00' },
                { id: 'ny_start', name: 'NY Start (HH:MM)', type: 'text', defval: '13:00' },
                { id: 'ny_end', name: 'NY End (HH:MM)', type: 'text', defval: '22:00' },
                { id: 'asia_color', name: 'Asia Color', type: 'color', defval: '#4488ff' },
                { id: 'london_color', name: 'London Color', type: 'color', defval: '#ffcc66' },
                { id: 'ny_color', name: 'NY Color', type: 'color', defval: '#ff8888' }
            ],
            defaults: {
                styles: {
                    asia_high: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#4488ff' },
                    asia_low: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#4488ff' },
                    london_high: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#ffcc66' },
                    london_low: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#ffcc66' },
                    ny_high: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#ff8888' },
                    ny_low: { linestyle: 0, linewidth: 2, plottype: 0, trackPrice: false, transparency: 30, visible: true, color: '#ff8888' }
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
            this.init = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;
            };

            this.main = function(context, inputCallback) {
                this._context = context;
                this._input = inputCallback;

                // Get input values
                const timezone = parseFloat(this._input(0)) || 0;
                const asiaStart = this._input(1) || '00:00';
                const asiaEnd = this._input(2) || '09:00';
                const londonStart = this._input(3) || '08:00';
                const londonEnd = this._input(4) || '17:00';
                const nyStart = this._input(5) || '13:00';
                const nyEnd = this._input(6) || '22:00';

                // Get current time
                const barTime = context.symbol.time;
                const date = new Date(barTime * 1000);
                
                // Adjust for timezone
                const utcHours = date.getUTCHours();
                const utcMinutes = date.getUTCMinutes();
                const adjustedHours = (utcHours + timezone + 24) % 24;
                const currentHHMM = String(Math.floor(adjustedHours)).padStart(2, '0') + String(utcMinutes).padStart(2, '0');

                // Helper function to convert HH:MM to HHMM
                function timeToHHMM(timeStr) {
                    const parts = timeStr.split(':');
                    return String(parts[0]).padStart(2, '0') + String(parts[1] || '00').padStart(2, '0');
                }

                // Helper function to check if current time is in session
                function isInSession(start, end, current) {
                    const startNum = parseInt(timeToHHMM(start));
                    const endNum = parseInt(timeToHHMM(end));
                    const currentNum = parseInt(current);

                    if (startNum <= endNum) {
                        return currentNum >= startNum && currentNum < endNum;
                    } else {
                        return currentNum >= startNum || currentNum < endNum;
                    }
                }

                // Track session highs and lows
                const sessions = [
                    { start: asiaStart, end: asiaEnd, highKey: '_asia_high', lowKey: '_asia_low' },
                    { start: londonStart, end: londonEnd, highKey: '_london_high', lowKey: '_london_low' },
                    { start: nyStart, end: nyEnd, highKey: '_ny_high', lowKey: '_ny_low' }
                ];

                const results = [NaN, NaN, NaN, NaN, NaN, NaN];
                const high = context.symbol.high;
                const low = context.symbol.low;

                sessions.forEach((sess, idx) => {
                    const inSession = isInSession(sess.start, sess.end, currentHHMM);
                    let sessionHigh = context.get(sess.highKey);
                    let sessionLow = context.get(sess.lowKey);

                    if (inSession) {
                        if (isNaN(sessionHigh) || sessionHigh === undefined) {
                            sessionHigh = high;
                        } else {
                            sessionHigh = Math.max(sessionHigh, high);
                        }

                        if (isNaN(sessionLow) || sessionLow === undefined) {
                            sessionLow = low;
                        } else {
                            sessionLow = Math.min(sessionLow, low);
                        }

                        results[idx * 2] = sessionHigh;
                        results[idx * 2 + 1] = sessionLow;

                        context.set(sess.highKey, sessionHigh);
                        context.set(sess.lowKey, sessionLow);
                    } else {
                        // Reset when session ends
                        context.set(sess.highKey, NaN);
                        context.set(sess.lowKey, NaN);
                    }
                });

                return results;
            };
        }
    };
};

console.log('[SessionIndicator] Loaded and ready for registration');
