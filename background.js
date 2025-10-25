// background.js

// --- 1. Global API Initialization ---
const FMP_API_KEY_STORAGE_KEY = 'fmpCloudApiKey'; // Kept for any future fallback, but not used in primary logic.

// --- 1.A. Open in Independent Window ---
// Listen for the extension icon to be clicked
chrome.action.onClicked.addListener((tab) => {
    // Define window properties
    const windowWidth = 400;
    const windowHeight = 650;

    // Try to get the current window to center the new window
    chrome.windows.getLastFocused((lastWindow) => {
        let top = (lastWindow.height - windowHeight) / 2 + lastWindow.top;
        let left = (lastWindow.width - windowWidth) / 2 + lastWindow.left;

        chrome.windows.create({
            url: 'popup/popup.html',
            type: 'popup', // 'popup' or 'panel' type creates a simple window
            width: windowWidth,
            height: windowHeight,
            top: Math.round(top),
            left: Math.round(left)
        });
    });
});


// --- 2. CORE MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "runValuation") {
        handleValuation(request.ticker).then(sendResponse);
        return true; // Keep message channel open for async response
    }
    return true;
});


// --- 3. Gemini-Powered DCF Parameter Fetch ---

async function getGeminiApiKey() {
    const result = await chrome.storage.local.get('geminiCloudApiKey');
    return result.geminiCloudApiKey;
}

async function handleValuation(ticker) {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        return { error: "Gemini API Key not found. Please add it via the cloud icon in the popup." };
    }

    // --- REVISED PROMPT (Using full UFCF and WACC components) ---
    const userPrompt = `
You are acting as a prudent, neutral financial analyst. Your task is to fetch the key parameters required for a detailed Discounted Cash Flow (DCF) valuation for the company with ticker: "${ticker}".
You must use the most current, real-time data available from your search tools.
Provide reasonable, base-case estimates for projected values.
All monetary values should be in Millions of USD.
All ratios/rates (cost of equity, cost of debt, tax rate, growth rates) should be in decimal format (e.g., 8.5% = 0.085).
Shares outstanding should be in Millions.

Your entire response MUST be a single, validated JSON object. Do not include any text, markdown, or commentary before or after the JSON object.

The JSON object must follow this exact structure:
{
  "ticker": "${ticker}",
  "latestPrice": 0.0,
  "priceDate": "YYYY-MM-DD",
  "dcfParameters": {
    "ttmNopat": 0.0,
    "ttmDepreciationAndAmortization": 0.0,
    "ttmCapitalExpenditures": 0.0,
    "ttmChangeInNetWorkingCapital": 0.0,
    "ufcfGrowthRate": 0.05,
    "marketValueEquity": 0.0,
    "marketValueDebt": 0.0,
    "costOfEquity": 0.0,
    "costOfDebt": 0.0,
    "corporateTaxRate": 0.0,
    "netDebt": 0.0,
    "sharesOutstanding": 0.0,
    "perpetualGrowthRate": 0.025
  },
  "rationale": {
    "ufcfComponents": "Rationale for TTM NOPAT, D&A, CapEx, and Change in NWC. CapEx should be negative.",
    "ufcfGrowthRate": "Rationale for the 5-year UFCF growth rate.",
    "waccComponents": "Rationale for Market Value of Equity, Market Value of Debt, Cost of Equity (Re), Cost of Debt (Rd), and Corporate Tax Rate (t).",
    "netDebt": "Rationale for the Net Debt value (Total Debt - Cash).",
    "sharesOutstanding": "Source and date for shares outstanding.",
    "perpetualGrowthRate": "Rationale for the perpetual growth rate (e.g., long-term inflation/GDP)."
  }
}

To populate the values, follow this methodology:
1.  Fetch the "latestPrice" and "priceDate".
2.  Populate "dcfParameters":
    * "ttmNopat": Trailing Twelve Months Net Operating Profit After Tax.
    * "ttmDepreciationAndAmortization": TTM D&A.
    * "ttmCapitalExpenditures": TTM CapEx (Note: This should be a positive number, e.g., 1000, not -1000, as the formula will subtract it).
    * "ttmChangeInNetWorkingCapital": TTM Change in NWC.
    * "ufcfGrowthRate": Estimate a reasonable 5-year UFCF growth rate.
    * "marketValueEquity": Current Market Cap.
    * "marketValueDebt": Most recent total Market Value of Debt.
    * "costOfEquity": Estimated Cost of Equity (Re), e.g., from CAPM.
    * "costOfDebt": Estimated pre-tax Cost of Debt (Rd).
    * "corporateTaxRate": Effective corporate tax rate (t).
    * "netDebt": Most recent total Net Debt (Total Debt - Cash & Equivalents).
    * "sharesOutstanding": Latest shares outstanding.
    * "perpetualGrowthRate": Assume a reasonable terminal growth rate, typically between 2-3%.
3.  Populate "rationale": For each group of parameters, provide a brief (1-2 sentence) justification for the values.
`;

    const GEMINI_CLOUD_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

    try {
        const response = await fetch(`${GEMINI_CLOUD_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }],
                // Use Google Search grounding to get real-time financial data.
                tools: [{ "google_search": {} }],
                generationConfig: {
                    temperature: 0.1, // Very low temperature for factual data retrieval
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        if (!data.candidates || !data.candidates[0].content.parts[0].text) {
             throw new Error("Invalid response structure from Gemini API.");
        }
        
        // --- PARSING LOGIC TO EXTRACT JSON FROM A TEXT RESPONSE ---
        const rawText = data.candidates[0].content.parts[0].text;
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Could not find a valid JSON object in the model's response.");
        }
        
        const result = JSON.parse(jsonMatch[0]);
        
        // A robust validation check for the new structure
        if (
            !result ||
            typeof result.latestPrice !== 'number' ||
            !result.dcfParameters ||
            !result.rationale ||
            typeof result.dcfParameters.ttmNopat !== 'number' ||
            typeof result.dcfParameters.costOfEquity !== 'number'
        ) {
            throw new Error("The parsed JSON does not match the expected DCF parameter structure.");
        }
        
        // Return the full JSON object to the popup
        return result;

    } catch (error) {
        console.error(`Valuation parameter fetch failed for ${ticker}:`, error);
        return { error: `Failed to get parameters from Gemini. ${error.message}` };
    }
}
