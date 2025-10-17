# 🤖 Artha-Mitra: AI Stock Valuation Expert

## ✨ AI-Powered Financial Intelligence, Right in Your Browser

Artha-Mitra is a comprehensive Chrome Extension that transforms raw stock data and company news into actionable investment intelligence using **Chrome's built-in AI APIs (Gemini Nano)**. It drastically reduces the time needed for investment research by synthesizing complex analysis—DCF targets, leadership summaries, and tailored trading strategies—into a simple, on-demand popup.

## 🏆 Hackathon Compliance: Use of Chrome Built-in AI

This project directly leverages the Chrome AI APIs to deliver on its core features, ensuring efficient, on-device (client-side) processing powered by **Gemini Nano**.

| Artha-Mitra Feature | Chrome AI API Used | Purpose of AI Integration |
| :--- | :--- | :--- |
| **Strategy Recommendations** | **Prompt API** (`chrome.ai.prompt`) | Generates a concise, 3-point trading strategy (Timing, Risk, Allocation) tailored to the stock's type and the current macroeconomic environment. |
| **Bullish/Bearish Scenarios** | **Prompt API** (`chrome.ai.prompt`) | Creates a persuasive, two-paragraph bull case scenario, synthesizing financial data into a compelling narrative, demonstrating creative content generation. |
| **Leadership Analysis** | **Summarizer API** (`chrome.ai.summarizer`) | Analyzes mock CEO commentary (simulating earnings call transcripts) and distills the core strategic points into a bulleted list for rapid consumption. |
| **Global News Coverage Insight**| **Prompt API** (`chrome.ai.prompt`) | Takes a news headline and snippet and generates an instant, structured JSON output detailing "Why It’s Happening" and "What Investors Should Do." |

## 🚀 Key Features

  * **Discounted Cash Flow (DCF) Targets:** Provides price targets for 3, 6, and 12 months (Mock Data).
  * **AI-Driven Analysis:** Instantly generates a leadership summary and actionable strategy recommendations using **Gemini Nano**.
  * **Real-time Quick Reply Prompts:** Interactive buttons for immediate next steps.
  * **Re-check Numbers (Level II Mock):** Demonstrates use of a Content Script to inject into a webpage and gather dynamic, live data (Level II mock for architecture demo).

## 🛠️ Getting Started (Installation for Judges)

This extension requires a version of Chrome (e.g., Canary) that supports the `chrome.ai` namespace.

1.  **Clone the Repository:**

    ```bash
    git clone https://github.com/YourUsername/artha-mitra.git
    cd artha-mitra
    ```

2.  **Enable Developer Mode in Chrome:**

      * Open Chrome.
      * Navigate to `chrome://extensions/`.
      * Toggle **"Developer mode"** on (usually in the top right corner).

3.  **Load the Extension:**

      * Click the **"Load unpacked"** button.
      * Select the entire `artha-mitra/` folder.

4.  **Pin the Extension:**

      * Click the puzzle piece icon (Extensions) next to the address bar.
      * Click the pin icon next to "Artha-Mitra: AI Stock Valuation Expert" to make it easily accessible.

## 🧪 Testing and Demo Guide

The following steps cover all the key features and demonstrate the use of the required AI APIs:

| Step | Action | Expected AI Output & API Used |
| :--- | :--- | :--- |
| **1. Run Valuation** | Click the Artha-Mitra icon, enter a sample ticker (e.g., `AAPL`), and click **"Analyze Stock 📈"**. | Displays immediate results (Current Price, DCF Targets). |
| **2. Trigger AI Analysis**| Click the **"Show Background & AI Analysis"** button in the results section. | **Gemini Nano** runs (via $\text{background.js}$). The details section populates with: \<ul\>\<li\>**Leadership Analysis (Summarizer API):** Bulleted summary of key strategic points.\</li\>\<li\>**Strategy & Scenario (Prompt API):** A concise 3-point strategy and a persuasive bullish narrative.\</li\>\</ul\>|
| **3. Test Content Script**| Click the **"Re-check Numbers (L2 Data)"** button at the bottom of the details section. | A confirmation alert is displayed. Check the Chrome console for the extension's **Service Worker** to see the message passing and the mock live data response from the $\text{content.js}$ script. |
| **4. Check News Analysis**| Open the **Service Worker console** (via `chrome://extensions/`). The script attempts to run a news analysis function upon load (uncommented in `popup.js`). | The console will show the structured JSON output from the **Prompt API** for the mocked news item, including "why" the news is happening and "what investors should do." |
| **5. Test Feedback Loop**| Click the **"No"** quick reply button. | A simulated browser alert confirms the link to the feedback form (`https://forms.gle/...`). |

## 📁 Repository Structure Overview

```
artha-mitra/
├── manifest.json            <- Configuration, Permissions (including "chrome.ai")
├── background.js            <- Service Worker: Contains all AI logic (Prompt, Summarizer), data mocks, and message handlers.
├── popup/
│   ├── popup.html           <- The main UI.
│   ├── popup.js             <- UI logic, sends requests to background.js.
│   └── popup.css            <- Styling for the finance-themed UI.
└── content_scripts/
    └── content.js           <- Injected script for Level II data mocking and interaction with the live tab.
```

## ⚖️ License

This project is licensed under the **MIT License**.
