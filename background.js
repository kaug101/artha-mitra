// background.js

// --- 1. Global API Initialization ---
const FMP_API_KEY_STORAGE_KEY = 'fmpCloudApiKey'; // Kept for any future fallback, but not used in primary logic.

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

    // --- REVISED PROMPT ---
    // This prompt now asks for DCF *parameters*, not the final calculation.
    const userPrompt = `
You are acting as a prudent, neutral financial analyst. Your task is to fetch the key parameters required for a Discounted Cash Flow (DCF) valuation for the company with ticker: "${ticker}".
You must use the most current, real-time data available from your search tools.
Provide reasonable, base-case estimates for projected values.
All monetary values (cash flows, net debt) should be in Millions of USD.
All ratios/rates (wacc, growth rates) should be in decimal format (e.g., 8.5% = 0.085).
Shares outstanding should be in Millions.

Your entire response MUST be a single, validated JSON object. Do not include any text, markdown, or commentary before or after the JSON object.

The JSON object must follow this exact structure:
{
  "ticker": "${ticker}",
  "latestPrice": 0.0,
  "priceDate": "YYYY-MM-DD",
  "dcfParameters": {
    "quarterlyFreeCashFlows": [0.0, 0.0, 0.0, 0.0],
    "netDebt": 0.0,
    "wacc": 0.0,
    "sharesOutstanding": 0.0,
    "perpetualGrowthRate": 0.025,
    "cashFlowGrowthRate": 0.05
  },
  "rationale": {
    "cashFlow": "Rationale for the quarterly FCF values and the projected FCF growth rate...",
    "netDebt": "Rationale for the Net Debt value...",
    "wacc": "Rationale for the WACC (e.g., industry peers, company beta)...",
    "sharesOutstanding": "Source and date for shares outstanding...",
    "perpetualGrowthRate": "Rationale for the perpetual growth rate (e.g., long-term inflation/GDP)..."
  }
}

To populate the values, follow this methodology:
1.  Fetch the "latestPrice" and "priceDate".
2.  Populate "dcfParameters":
    * "quarterlyFreeCashFlows": Find the Free Cash Flow for the last 4 reported quarters (T_Q-3, T_Q-2, T_Q-1, T_Q_Most_Recent).
    * "netDebt": Find the most recent total Net Debt (Total Debt - Cash & Equivalents).
    * "wacc": Estimate the Weighted Average Cost of Capital. Justify your choice.
    * "sharesOutstanding": Find the latest shares outstanding.
    * "perpetualGrowthRate": Assume a reasonable terminal growth rate, typically between 2-3%.
    * "cashFlowGrowthRate": Estimate a reasonable 5-year FCF growth rate based on historical performance and future outlook.
3.  Populate "rationale": For each parameter, provide a brief (1-2 sentence) justification for the value you selected, citing sources if possible.
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
            typeof result.dcfParameters.wacc !== 'number' ||
            !Array.isArray(result.dcfParameters.quarterlyFreeCashFlows)
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
