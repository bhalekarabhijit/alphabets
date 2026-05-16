# Alphabets - AI-Powered Indian Stock Market Intelligence

A comprehensive stock analysis platform for the Indian market (NSE/BSE) that combines real market data, technical indicators, fundamental analysis, news sentiment, and AI reasoning to deliver actionable investment insights.

## Features

### Daily Investment Pick
- Scans all **50 Nifty stocks** every day
- Analyzes fundamentals (P/E, ROE, margins, debt, growth)
- Computes technical indicators (RSI, MACD, SMA, Bollinger Bands, ATR)
- Evaluates recent news sentiment
- AI selects the **single best investment opportunity** with entry, target, stop-loss, and risk assessment

### Individual Stock Analysis
- Real-time quotes from Yahoo Finance
- Deep fundamental analysis (valuation, profitability, growth, financial health)
- Technical analysis with interactive charts (SMA, EMA, RSI, MACD, Bollinger Bands)
- AI-powered intraday trading recommendations
- Latest news feed

### Watchlist Scanner
- Track your favorite stocks
- Scan for trading opportunities across your watchlist
- Signal-based recommendations (BUY/SELL/NEUTRAL)

## Tech Stack

- **Frontend**: React 19 + Vite + Chart.js
- **Backend**: Node.js + Express
- **Data**: Yahoo Finance API (real market data)
- **AI**: Google Gemini Flash for analysis and recommendations
- **Technical Indicators**: technicalindicators library

## Setup

### 1. Install Dependencies

```bash
# Frontend
npm install

# Backend
cd server && npm install
```

### 2. Configure API Keys

Copy `.env.example` to `.env` in the `server/` directory:

```bash
cd server
cp .env.example .env
```

Edit `.env` and add your Gemini API key:
- Get free Gemini API key: https://aistudio.google.com/

### 3. Run the Application

```bash
# From the root directory
npm start
```

This starts both the frontend (Vite dev server) and backend (Express on port 3001).

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/quote/:ticker` | Real-time stock quote |
| `GET /api/search?q=query` | Search Indian stocks |
| `GET /api/chart/:ticker?period=1d` | Historical price data |
| `GET /api/fundamentals/:ticker` | Fundamental metrics |
| `GET /api/technicals/:ticker` | Technical indicators |
| `GET /api/news/:ticker` | Latest news |
| `GET /api/analyze/:ticker` | Full AI analysis |
| `GET /api/daily-pick` | Today's best investment pick |
| `POST /api/watchlist/scan` | Scan watchlist for signals |

## How Daily Pick Works

1. **Data Collection**: Fetches real-time data for all 50 Nifty stocks
2. **Fundamental Analysis**: P/E ratios, ROE, profit margins, debt levels, revenue growth
3. **Technical Analysis**: RSI, MACD, moving averages, trend signals, volatility
4. **News Sentiment**: Recent headlines and catalysts
5. **AI Reasoning**: Gemini evaluates all candidates using a professional investment framework:
   - Fundamental Health (25%)
   - Technical Setup (25%)
   - News Sentiment (20%)
   - Risk-Reward (15%)
   - Market Context (15%)
6. **Output**: Single best pick with detailed thesis, risks, entry/exit strategy

## Disclaimer

This tool is for educational and informational purposes only. It is NOT certified financial advice. All trading and investment decisions carry risk. Always do your own research and consult a qualified financial advisor before making investment decisions.
