🤖 Artha-Mitra: AI Stock Valuation Expert

✨ AI-Powered Financial Intelligence, Right in Your Browser

Artha-Mitra is a comprehensive Chrome Extension that transforms raw stock data and company news into actionable investment intelligence using Chrome's built-in AI APIs (Gemini Nano) and external cloud APIs. It drastically reduces the time needed for investment research by synthesizing complex analysis—DCF valuations, leadership summaries, and tailored trading strategies—into a simple, on-demand popup.

🏆 Hackathon Compliance: Use of Chrome Built-in AI

This project directly leverages the Chrome AI APIs to deliver on its core features, ensuring efficient, on-device (client-side) processing powered by Gemini Nano.

Artha-Mitra Feature

Chrome AI API Used

Purpose of AI Integration

Strategy Recommendations

Prompt API (chrome.ai.prompt)

Generates a concise, 3-point trading strategy (Timing, Risk, Allocation) tailored to the stock's type and the current macroeconomic environment.

Bullish/Bearish Scenarios

Prompt API (chrome.ai.prompt)

Creates a persuasive, two-paragraph bull case scenario, synthesizing financial data into a compelling narrative, demonstrating creative content generation.

Leadership Analysis

Summarizer API (chrome.ai.summarizer)

Analyzes mock CEO commentary (simulating earnings call transcripts) and distills the core strategic points into a bulleted list for rapid consumption.

Global News Coverage Insight

Prompt API (chrome.ai.prompt)

Takes a news headline and snippet and generates an instant, structured JSON output detailing "Why It’s Happening" and "What Investors Should Do."

🚀 Key Features

Real-Time Discounted Cash Flow (DCF): Calculates intrinsic stock value using live financial statements.

AI-Driven Analysis: Instantly generates a leadership summary and actionable strategy recommendations using Gemini Nano.

Hybrid AI: Seamlessly switches between local Gemini Nano and a more powerful cloud-based Gemini model if an API key is provided.

API Key Management: A simple UI to add and manage your API keys for financial data and cloud AI.

🛠️ Getting Started (Installation for Judges)

This extension requires a version of Chrome (e.g., Canary) that supports the chrome.ai namespace.

IMPORTANT: This extension now uses the Financial Modeling Prep (FMP) API for real-time financial data. You will need a free API key from their website to run the DCF valuation.

Get your FMP API Key:

Visit the FMP website and sign up for a free plan to get your API key.

Clone the Repository:

git clone [https://github.com/kaug101/artha-mitra.git](https://github.com/kaug101/artha-mitra.git)
cd artha-mitra


Enable Developer Mode in Chrome:

Open Chrome.

Navigate to chrome://extensions/.

Toggle "Developer mode" on (usually in the top right corner).

Load the Extension:

Click the "Load unpacked" button.

Select the entire artha-mitra/ folder.

Pin the Extension & Configure Keys:

Click the puzzle piece icon (Extensions) next to the address bar.

Click the pin icon next to "Artha-Mitra" to make it easily accessible.

Click the Artha-Mitra icon to open the popup.

Click the cloud icon in the top-right.

Enter your FMP API Key and click "Save FMP Key". The status should turn green.

(Optional) Enter your Gemini Cloud API Key for more advanced AI analysis.

🧪 Testing and Demo Guide

The following steps cover all the key features and demonstrate the use of the required AI APIs:

Step

Action

Expected AI Output & API Used

1. Run Valuation

Make sure you've added your FMP API Key. Enter a sample ticker (e.g., AAPL), and click "Analyze Stock 📈".

Displays the current stock price and a full DCF valuation with its intrinsic value.

2. Trigger AI Analysis

Click the "Show AI Analysis" button in the results section.

Gemini Nano (or Cloud) runs. The details section populates with a leadership summary and strategy.

3. Test Content Script

Click the "Re-check Numbers (L2 Data)" button at the bottom of the details section.

A confirmation alert is displayed. Check the Chrome console for the extension's Service Worker to see the message passing and the mock live data response from the content.js script.

📁 Repository Structure Overview

artha-mitra/
├── manifest.json            <- Configuration, Permissions (including "chrome.ai" and financial APIs)
├── background.js            <- Service Worker: Contains all DCF and AI logic.
├── popup/
│   ├── popup.html           <- The main UI.
│   ├── popup.js             <- UI logic, sends requests to background.js.
│   └── popup.css            <- Styling for the finance-themed UI.
└── content_scripts/
    └── content.js           <- Injected script for Level II data mocking.


⚖️ License

This project is licensed under the MIT License.