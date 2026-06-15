# Trading Journal

A web-based trading journal application with custom session high/low indicators.

## Features

- Custom session indicator showing Asia, London, and New York session highs and lows
- Displays both current day and previous day session levels
- Visual distinction between today's (solid lines) and yesterday's (dashed lines) session levels
- Session times configurable via inputs
- Extension distance configurable to show how far lines project into future bars

## Session Times (Default - Nepal Time UTC+5:45)
- Asia: 05:45 - 14:45
- London: 12:45 - 21:45  
- New York: 17:45 - 02:45 (overnight)

## Files
- `index.html` - Main application file
- `session_high_high_low_study.js` - Custom study for session high/low lines
- `session_high_low_indicator.pine` - PineScript version of the indicator (for TradingView)
- `charting_library/` - Charting library files
- `copy_trading_settings.html` - Settings panel
- Various icon and manifest files for PWA functionality

## How the Session Indicator Works
The indicator tracks the high and low prices during each trading session (Asia, London, New York). When a session ends, it draws horizontal lines extending from the session's high/low price levels:
- Solid lines: Current day's session levels
- Dashed lines: Previous day's session levels
- Lines extend forward by the configured "Extension Distance" (in bars)

The indicator only draws lines for completed sessions to ensure stability and prevent repainting.