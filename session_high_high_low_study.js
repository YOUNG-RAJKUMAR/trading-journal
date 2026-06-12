function getSessionHighLowStudy() {
    return {
        name: "Nepal Session High-Low",
        metainfo: {
            _metainfoVersion: 51,
            id: "nepal-session-high-low@1",
            description: "Nepal Session High-Low with Breakouts",
            shortDescription: "NSHL",
            is  : true, // Is an indicator
            overlay: true, // Display on the chart
            bands: [],
            plots: [],
            defaults: {
                styles: {},
                inputs: {},
            },
            inputs: [
                {
                    id: "lineWidth",
                    name: "Line Width",
                    type: "integer",
                    min: 1,
                    max: 5,
                    defval: 2,
                },
                {
                    id: "labelSize",
                    name: "Label Size",
                    type: "string",
                    options: ["tiny", "small", "normal", "large", "huge"],
                    defval: "normal",
                },
                {
                    id: "extDist",
                    name: "Extension Distance (Bars)",
                    type: "integer",
                    min: 0,
                    defval: 5,
                },
                {
                    id: "colorAsia",
                    name: "Asia Color",
                    type: "color",
                    defval: "#2962FF",
                },
                {
                    id: "colorLon",
                    name: "London Color",
                    type: "color",
                    defval: "#E91E63",
                },
                {
                    id: "colorNY",
                    name: "New York Color",
                    type: "color",
                    defval: "#FF9800",
                },
            ],
        },

        // Internal state for each session
        _sessionData: {
            asia: { high: NaN, low: NaN, highLine: null, lowLine: null, highLabel: null, isActive: false, highBroken: false, lowBroken: false, breakoutBarHigh: NaN, breakoutBarLow: NaN },
            london: { high: NaN, low: NaN, highLine: null, lowLine: null, highLabel: null, isActive: false, highBroken: false, lowBroken: false, breakoutBarHigh: NaN, breakoutBarLow: NaN },
            newyork: { high: NaN, low: NaN, highLine: null, lowLine: null, highLabel: null, isActive: false, highBroken: false, lowBroken: false, breakoutBarHigh: NaN, breakoutBarLow: NaN },
        },

        // Store all created entities for cleanup
        _allEntities: [],

        // Helper to get current time in Nepal Time
        _getNepalTime: function(timestamp) {
            const date = new Date(timestamp * 1000);
            // Nepal Time is UTC+5:45
            const utc = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
            return new Date(utc + (5 * 3600 * 1000) + (45 * 60 * 1000));
        },

        // Check if a new day has started in Nepal Time
        _isNewDay: function(chart) {
            const prevBarTime = chart.get  // Placeholder for previous bar time
            if (this._prevDay === undefined) {
                this._prevDay = this._getNepalTime(chart.time()).getDate();
                return false;
            }
            const currentDay = this._getNepalTime(chart.time()).getDate();
            const newDay = currentDay !== this._prevDay;
            this._prevDay = currentDay;
            return newDay;
        },

        // Clean up all objects from previous days
        _cleanupObjects: function(chart) {
            this._allEntities.forEach(entity => chart.removeEntity(entity));
            this._allEntities = [];
        },

        // Update session logic
        _updateSession: function(chart, sessionData, sessionTimes, sessColor, sessLabel, inputs) {
            const nepalTime = this._getNepalTime(chart.time());
            const currentHour = nepalTime.getHours();
            const currentMinute = nepalTime.getMinutes();
            const currentTimeInMinutes = currentHour * 60 + currentMinute;

            const [startHour, startMinute] = sessionTimes[0].split(":").map(Number);
            const [endHour, endMinute] = sessionTimes[1].split(":").map(Number);
            let sessionStartInMinutes = startHour * 60 + startMinute;
            let sessionEndInMinutes = endHour * 60 + endMinute;

            // Handle sessions crossing midnight
            if (sessionEndInMinutes < sessionStartInMinutes) {
                sessionEndInMinutes += 24 * 60;
                if (currentTimeInMinutes < sessionStartInMinutes) {
                    currentTimeInMinutes += 24 * 60;
                }
            }

            const inSession = currentTimeInMinutes >= sessionStartInMinutes && currentTimeInMinutes <= sessionEndInMinutes;
            const isStart = inSession && !sessionData.isActive;

            if (isStart) {
                sessionData.isActive = true;
                sessionData.high = chart.high();
                sessionData.low = chart.low();
                sessionData.highBroken = false;
                sessionData.lowBroken = false;
                sessionData.breakoutBarHigh = NaN;
                sessionData.breakoutBarLow = NaN;

                // Create lines and labels
                sessionData.highLine = chart.createShape({
                    shape: "horizontal_line",
                    points: [{ x: chart.time(), y: sessionData.high }],
                    overrides: {
                        lineColor: sessColor,
                        lineWidth: inputs.lineWidth,
                        showLabel: false,
                    },
                });
                sessionData.lowLine = chart.createShape({
                    shape: "horizontal_line",
                    points: [{ x: chart.time(), y: sessionData.low }],
                    overrides: {
                        lineColor: sessColor,
                        lineWidth: inputs.lineWidth,
                        showLabel: false,
                    },
                });
                sessionData.highLabel = chart.createShape({
                    shape: "label",
                    points: [{ x: chart.time(), y: sessionData.high }],
                    text: sessLabel,
                    overrides: {
                        textColor: "#FFFFFF",
                        backgroundColor: sessColor,
                        fontSize: inputs.labelSize,
                        // labelStyle: "label_down", // Not directly supported, need to adjust position
                    },
                });

                this._allEntities.push(sessionData.highLine, sessionData.lowLine, sessionData.highLabel);

            } else if (inSession) {
                // Update High/Low
                if (chart.high() > sessionData.high) {
                    sessionData.high = chart.high();
                }
                if (chart.low() < sessionData.low) {
                    sessionData.low = chart.low();
                }

                // Update visual positions
                if (sessionData.highLine) {
                    chart.setShapePoints(sessionData.highLine, [{ x: chart.time(), y: sessionData.high }]);
                    chart.setShapeOptions(sessionData.highLine, { extendLeft: false, extendRight: true }); // Extend right
                }
                if (sessionData.lowLine) {
                    chart.setShapePoints(sessionData.lowLine, [{ x: chart.time(), y: sessionData.low }]);
                    chart.setShapeOptions(sessionData.lowLine, { extendLeft: false, extendRight: true }); // Extend right
                }
                if (sessionData.highLabel) {
                    chart.setShapePoints(sessionData.highLabel, [{ x: chart.time(), y: sessionData.high }]);
                }

            } else if (sessionData.isActive) {
                // Session just ended
                sessionData.isActive = false;

                // Finalize line extension if no breakout occurred
                if (sessionData.highLine && !sessionData.highBroken) {
                    chart.setShapeOptions(sessionData.highLine, { extendRight: false });
                    // Optionally extend a small configurable distance into the future
                    // This would require calculating a future bar_index, which is tricky in JS without bar_index concept
                    // For now, it will just end at the current bar.
                }
                if (sessionData.lowLine && !sessionData.lowBroken) {
                    chart.setShapeOptions(sessionData.lowLine, { extendRight: false });
                }
            }

            // Breakout Logic (Only if not already broken)
            if (!isNaN(sessionData.high)) {
                // High Breakout
                if (!sessionData.highBroken) {
                    if (chart.high() > sessionData.high) {
                        sessionData.highBroken = true;
                        sessionData.breakoutBarHigh = chart.barIndex(); // Assuming barIndex is available
                        if (sessionData.highLine) {
                            chart.setShapeOptions(sessionData.highLine, { extendRight: false });
                        }
                    }
                }

                // Low Breakout
                if (!sessionData.lowBroken) {
                    if (chart.low() < sessionData.low) {
                        sessionData.lowBroken = true;
                        sessionData.breakoutBarLow = chart.barIndex(); // Assuming barIndex is available
                        if (sessionData.lowLine) {
                            chart.setShapeOptions(sessionData.lowLine, { extendRight: false });
                        }
                    }
                }
            }
        },

        init: function(context, inputs) {
            this.context = context;
            this.inputs = inputs;
            this._prevDay = undefined; // Initialize for _isNewDay

            // Clear any existing entities on init
            this._cleanupObjects(context.chart);
        },

        onUpdate: function(context, inputs) {
            const chart = context.chart;

            // Check for new day and cleanup
            if (this._isNewDay(chart)) {
                this._cleanupObjects(chart);
                // Reset session states for the new day
                this._sessionData.asia = { high: NaN, low: NaN, highLine: null, lowLine: null, highLabel: null, isActive: false, highBroken: false, lowBroken: false, breakoutBarHigh: NaN, breakoutBarLow: NaN };
                this._sessionData.london = { high: NaN, low: NaN, highLine: null, lowLine: null, highLabel: null, isActive: false, highBroken: false, lowBroken: false, breakoutBarHigh: NaN, breakoutBarLow: NaN };
                this._sessionData.newyork = { high: NaN, low: NaN, highLine: null, lowLine: null, highLabel: null, isActive: false, highBroken: false, lowBroken: false, breakoutBarHigh: NaN, breakoutBarLow: NaN };
            }

            // Update each session
            this._updateSession(chart, this._sessionData.asia, ["05:45", "14:45"], inputs.colorAsia, "A", inputs);
            this._updateSession(chart, this._sessionData.london, ["12:45", "21:45"], inputs.colorLon, "L", inputs);
            this._updateSession(chart, this._sessionData.newyork, ["17:45", "02:45"], inputs.colorNY, "N", inputs);
        },

        onRemove: function(context) {
            this._cleanupObjects(context.chart);
        },
    };
}
