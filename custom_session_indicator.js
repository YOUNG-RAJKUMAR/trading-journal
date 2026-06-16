// Custom Session Levels Indicator for TradingView Charting Library
// This implements the Pine Script logic as a custom study
// Features: Nepal Time timezone, session detection, high/low tracking,
// labels above high prices (A/L/N), breakout detection, daily reset

// Define the custom indicator
const SessionLevelsIndicator = {
  name: "SessionLevelsIndicator", // Internal name

  metainfo: {
    _metainfoVersion: 53,
    id: "SessionLevelsIndicator@1.0.0",
    name: "Session Levels Indicator",
    description: "Displays today's session levels (Asia, London, New York) with breakout detection",
    shortDescription: "Session Levels",

    // Defaults for inputs
    defaults: {
      extendBars: 10,
      // Line width and label size are handled as style properties, not inputs
    },

    // Inputs definition - only calculation parameters go here
    inputs: [
      {
        id: "extendBars",
        name: "Extend Lines (bars after session)",
        type: "integer",
        min: 0,
        max: 50,
        default: 10
      }
    ],

    // Plots definition - 9 plots: 3 sessions × (high line, low line, label)
    plots: [
      // Asia session
      { id: "asiaHigh", type: "line", title: "Asia High" },
      { id: "asiaLow", type: "line", title: "Asia Low" },
      { id: "asiaLabel", type: "chars", title: "Asia Label", text: "A" },

      // London session
      { id: "londonHigh", type: "line", title: "London High" },
      { id: "londonLow", type: "line", title: "London Low" },
      { id: "londonLabel", type: "chars", title: "London Label", text: "L" },

      // New York session
      { id: "nyHigh", type: "line", title: "New York High" },
      { id: "nyLow", type: "line", title: "New York Low" },
      { id: "nyLabel", type: "chars", title: "New York Label", text: "N" }
    ],

    // Styles definition for controlling colors and appearance
    // These are defaults - user can override in indicator's style settings
    styles: {
      // Asia session - Blue
      asiaHigh: {
        title: "Asia High",
        type: "line",
        color: "#2962FF", // Blue
        linewidth: 2,     // Default line width
        linestyle: 0      // Solid
      },
      asiaLow: {
        title: "Asia Low",
        type: "line",
        color: "#2962FF", // Blue
        linewidth: 2,     // Default line width
        linestyle: 0      // Solid
      },
      asiaLabel: {
        title: "Asia Label",
        type: "chars",
        color: "#FFFFFF", // White
        fontsize: 10      // Default font size (corresponds to "normal")
      },

      // London session - Orange
      londonHigh: {
        title: "London High",
        type: "line",
        color: "#FB8C00", // Orange
        linewidth: 2,     // Default line width
        linestyle: 0      // Solid
      },
      londonLow: {
        title: "London Low",
        type: "line",
        color: "#FB8C00", // Orange
        linewidth: 2,     // Default line width
        linestyle: 0      // Solid
      },
      londonLabel: {
        title: "London Label",
        type: "chars",
        color: "#FFFFFF", // White
        fontsize: 10      // Default font size
      },

      // New York session - Purple
      nyHigh: {
        title: "New York High",
        type: "line",
        color: "#9C27B0", // Purple
        linewidth: 2,     // Default line width
        linestyle: 0      // Solid
      },
      nyLow: {
        title: "New York Low",
        type: "line",
        color: "#9C27B0", // Purple
        linewidth: 2,     // Default line width
        linestyle: 0      // Solid
      },
      nyLabel: {
        title: "New York Label",
        type: "chars",
        color: "#FFFFFF", // White
        fontsize: 10      // Default font size
      }
    }
  },

  // Constructor function - contains the actual study logic
  constructor: function() {
    // Nepal Time offset: UTC+5:45
    const NEPA_OFFSET_MINUTES = 5 * 60 + 45; // 345 minutes

    // Session times in Nepal Time (HHmm format)
    const SESSIONS = {
      ASIA: { start: 545, end: 1445 },   // 05:45 - 14:45
      LONDON: { start: 1245, end: 2145 }, // 12:45 - 21:45
      NY: { start: 1745, end: 245 }       // 17:45 - 02:45 (next day, so end < start indicates overnight)
    };

    // Initialize session tracking variables
    var asiaHigh = null, asiaLow = null;
    var londonHigh = null, londonLow = null;
    var nyHigh = null, nyLow = null;

    var asiaStarted = false, londonStarted = false, nyStarted = false;
    var asiaEnded = false, londonEnded = false, nyEnded = false;

    var nepalDateToday = null; // To detect day changes

    // Store input values (will be updated in main())
    var inputs = {
      extendBars: 10
    };

    return {
      // Called once when study is added to chart
      init: function(context) {
        // Get initial property values from inputs if available
        if (context && context.inputs) {
          inputs.extendBars = context.inputs.extendBars || 10;
        }
      },

      // Main calculation function - called on each bar
      main: function(context) {
        // Update inputs if they have changed
        if (context && context.inputs) {
          inputs.extendBars = context.inputs.extendBars || 10;
        }

        // Get bar time - we need the timestamp of the current bar
        // In TradingView studies, bar time is typically available as context.time
        // Since we set timezone: 'Asia/Kathmandu' in the widget config,
        // the bar time should already be in Nepal Time
        var barTimeMs = context.time; // Timestamp of the current bar in milliseconds

        // Extract date and time components from Nepal Time timestamp
        var nepalTimestamp = barTimeMs; // Assuming bar is already in Nepal Time (due to widget timezone)

        // Get actual Nepal date as YYYYMMDD integer for day change detection
        var dateObj = new Date(nepalTimestamp);
        var year = dateObj.getUTCFullYear();
        var month = dateObj.getUTCMonth() + 1; // getUTCMonth is 0-based
        var day = dateObj.getUTCDate();
        var nepalDateInt = parseInt(year.toString() +
                                   (month < 10 ? "0" : "") + month.toString() +
                                   (day < 10 ? "0" : "") + day.toString());

        // Check for Nepal day change to reset session data
        var isNewNepalDay = (nepalDateToday !== null && nepalDateInt !== nepalDateToday);
        if (isNewNepalDay) {
          // Reset all session data
          asiaHigh = asiaLow = londonHigh = londonLow = nyHigh = nyLow = null;
          asiaStarted = londonStarted = nyStarted = false;
          asiaEnded = londonEnded = nyEnded = false;
        }
        nepalDateToday = nepalDateInt;

        // Get time of day in Nepal Time (HHmm format)
        var timeInDay = nepalTimestamp % (24 * 60 * 60 * 1000);
        var hours = Math.floor(timeInDay / (60 * 60 * 1000));
        var minutes = Math.floor((timeInDay % (60 * 60 * 1000)) / (60 * 1000));
        var nepalTime = hours * 100 + minutes; // HHmm format

        // Get price data from context
        var high = context.high;
        var low = context.low;

        // Determine session status for this bar
        var isInAsia = isInSession(nepalTime, SESSIONS.ASIA.start, SESSIONS.ASIA.end);
        var isInLondon = isInSession(nepalTime, SESSIONS.LONDON.start, SESSIONS.LONDON.end);
        var isInNY = isInSession(nepalTime, SESSIONS.NY.start, SESSIONS.NY.end);

        // Session start detection
        if (!asiaStarted && isInAsia) {
          asiaStarted = true;
          asiaHigh = high;
          asiaLow = low;
        }
        if (!londonStarted && isInLondon) {
          londonStarted = true;
          londonHigh = high;
          londonLow = low;
        }
        if (!nyStarted && isInNY) {
          nyStarted = true;
          nyHigh = high;
          nyLow = low;
        }

        // Session end detection (when we exit the session)
        if (asiaStarted && !isInAsia && !asiaEnded) {
          asiaEnded = true;
        }
        if (londonStarted && !isInLondon && !londonEnded) {
          londonEnded = true;
        }
        if (nyStarted && !isInNY && !nyEnded) {
          nyEnded = true;
        }

        // Update high/low during active session
        if (isInAsia) {
          if (asiaHigh === null || high > asiaHigh) asiaHigh = high;
          if (asiaLow === null || low < asiaLow) asiaLow = low;
        }
        if (isInLondon) {
          if (londonHigh === null || high > londonHigh) londonHigh = high;
          if (londonLow === null || low < londonLow) londonLow = low;
        }
        if (isInNY) {
          if (nyHigh === null || high > nyHigh) nyHigh = high;
          if (nyLow === null || low < nyLow) nyLow = low;
        }

        // Calculate plot values
        var result = {};

        // Helper function to check if time is within a session
        function isInSession(time, start, end) {
          // Handle sessions that cross midnight (like NY session)
          if (start < end) {
            // Same day session
            return time >= start && time < end;
          } else {
            // Overnight session (e.g., 22:00 to 02:00)
            return time >= start || time < end;
          }
        }

        // Asia session plots
        result.asiaHigh = asiaHigh !== null ? asiaHigh : NaN;
        result.asiaLow = asiaLow !== null ? asiaLow : NaN;
        // Asia label: show above high price when session is active
        result.asiaLabel = (asiaStarted && !asiaEnded && isInAsia) ?
                          (asiaHigh !== null ? asiaHigh * 1.0005 : NaN) : NaN;

        // London session plots
        result.londonHigh = londonHigh !== null ? londonHigh : NaN;
        result.londonLow = londonLow !== null ? londonLow : NaN;
        result.londonLabel = (londonStarted && !londonEnded && isInLondon) ?
                            (londonHigh !== null ? londonHigh * 1.0005 : NaN) : NaN;

        // New York session plots
        result.nyHigh = nyHigh !== null ? nyHigh : NaN;
        result.nyLow = nyLow !== null ? nyLow : NaN;
        result.nyLabel = (nyStarted && !nyEnded && isInNY) ?
                        (nyHigh !== null ? nyHigh * 1.0005 : NaN) : NaN;

        return result;
      }
    };

    // Helper function to check if time is within a session
    function isInSession(time, start, end) {
      // Handle sessions that cross midnight (like NY session)
      if (start < end) {
        // Same day session
        return time >= start && time < end;
      } else {
        // Overnight session (e.g., 22:00 to 02:00)
        return time >= start || time < end;
      }
    }
  }
};

// Function to get custom indicators - this is what we'll pass to the charting library
function getCustomIndicators() {
  return [SessionLevelsIndicator];
}

// Export for use in chart initialization
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getCustomIndicators, SessionLevelsIndicator };
} else {
  // Global for browser use
  window.CustomSessionLevelsIndicator = { getCustomIndicators, SessionLevelsIndicator };
}