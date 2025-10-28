// background.js

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
    
    if (request.action === "getNews") {
        handleNewsRequest(request.timeframe).then(sendResponse);
        return true; // Keep message channel open for async response
    }
    
    // NEW: Add listener for sector rotation
    if (request.action === "getSectorRotation") {
        handleSectorRotation().then(sendResponse);
        return true; // Keep message channel open for async response
    }
    return true;
});


// --- 3. Gemini-Powered DCF Parameter Fetch ---

async function getGeminiApiKey() {
    const result = await chrome.storage.local.get('geminiCloudApiKey');
    return result.geminiCloudApiKey;
}

// Re-usable retry logic for Gemini API calls
async function fetchWithRetry(apiKey, endpoint, payload) {
    const maxRetries = 3;
    let delay = 2000; // 2 seconds
    let lastError = null; // Store the last error encountered

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // FIX: Construct the full URL properly
            const fullUrl = `${endpoint}?key=${apiKey}`;
            
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                // --- SUCCESS ---
                const data = await response.json();
                if (!data.candidates || !data.candidates[0].content.parts[0].text) {
                    throw new Error("Invalid response structure from Gemini API.");
                }
                
                const rawText = data.candidates[0].content.parts[0].text;
                
                // --- FIX: Improved JSON extraction ---
                // Try to find a JSON block fenced with ```json
                let jsonMatch = rawText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
                
                if (jsonMatch && jsonMatch[1]) {
                    // Found fenced JSON
                    return jsonMatch[1];
                }

                // Fallback: Try to find the first non-greedy JSON object
                // This is kept for compatibility
                jsonMatch = rawText.match(/\{[\s\S]*?\}/); 
                
                if (jsonMatch) {
                    console.warn("Could not find fenced JSON, falling back to first-object match.");
                    return jsonMatch[0]; // Return the first JSON object string
                }

                console.error("Could not find JSON object in model response:", rawText);
                throw new Error("Could not find a valid JSON object in the model's response.");
            }

            // --- RETRYABLE SERVER ERROR (like 500, 503, 504, or 429) ---
            const status = response.status;
            // Added 429 (Too Many Requests) as a retryable error
            if (status === 500 || status === 503 || status === 504 || status === 429) {
                const errorText = await response.text();
                lastError = new Error(`API Error (${status}): ${errorText}. Retrying...`); // Store this error
                console.warn(`Attempt ${attempt} failed with ${status}. Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
                continue; // Go to the next attempt
            }

            // --- NON-RETRYABLE CLIENT ERROR (like 400, 401, 403) ---
            const errorText = await response.text();
            lastError = new Error(`API Error (${status}): ${errorText}`); // Store this error
            throw lastError; // Throw to exit the retry loop immediately

        } catch (error) {
            // This will catch network errors or the thrown non-retryable error
            lastError = error; // Store this error
            
            // Check for the specific URL parsing error as well
            if (error.message.startsWith('API Error') || error.message.includes('Failed to parse URL')) {
                 // This was a non-retryable error, so we break the loop
                 console.error(`Non-retryable error encountered: ${error.message}`);
                 break; 
            }

            // --- NETWORK ERROR or other fetch-related error ---
            console.warn(`Attempt ${attempt} failed with network error: ${error.message}. Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }

    // --- FAILED ALL RETRIES or broke from loop ---
    // Throw a more informative error
    throw new Error(`Failed to get a response from Gemini after ${maxRetries} attempts. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
}


async function handleValuation(ticker) {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        return { error: "Gemini API Key not found. Please add it via the cloud icon in the popup." };
    }

    // --- REVISED PROMPT (Added analystConsensus, sectoralMegatrends, swotAnalysis) ---
    const userPrompt = `
You are acting as a prudent, neutral financial analyst. Your task is to fetch the key parameters required for a detailed Discounted Cash Flow (DCF) valuation for the company with ticker: "${ticker}".
You must use the most current, real-time data available from your search tools.
Provide reasonable, base-case estimates for projected values.
All monetary values should be in Millions of USD.
All ratios/rates (cost of equity, cost of debt, tax rate, growth rates) should be in decimal format (e.g., 8.5% = 0.085).
Shares outstanding should be in Millions.

Your entire response MUST be a single, validated JSON object, enclosed in triple backticks (\\\`\`\`json ... \\\`\`\`).
Do not include any text, markdown, or commentary before or after the JSON block.

The JSON object must follow this exact structure:
\\\`\`\`json
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
  "analystConsensus": {
    "target_3m": 0.0,
    "target_6m": 0.0,
    "target_12m": 0.0
  },
  "rationale": {
    "ufcfComponents": "Rationale for TTM NOPAT, D&A, CapEx, and Change in NWC. CapEx should be positive.",
    "ufcfGrowthRate": "Rationale for the 5-year UFCF growth rate.",
    "waccComponents": "Rationale for Market Value of Equity, Market Value of Debt, Cost of Equity (Re), Cost of Debt (Rd), and Corporate Tax Rate (t).",
    "netDebt": "Rationale for the Net Debt value (Total Debt - Cash).",
    "sharesOutstanding": "Source and date for shares outstanding.",
    "perpetualGrowthRate": "Rationale for the perpetual growth rate (e.g., long-term inflation/GDP).",
    "analystConsensus": "Source and rationale for the 3, 6, and 12-month analyst consensus price targets.",
    "sectoralMegatrends": "Rationale for key secular trends affecting the stock's sector (e.g., AI adoption, regulatory changes, consumer behavior shifts).",
    "swotAnalysis": "Brief rationale for the stock's fundamental Strengths, Weaknesses, Opportunities, and Threats (SWOT)."
  }
}
\\\`\`\`

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
3.  Populate "analystConsensus":
    * Fetch the 3-month, 6-month, and 12-month analyst consensus price targets.
4.  Populate "rationale": For each group of parameters, provide a brief (1-2 sentence) justification for the values.
    * **NEW**: Also populate "sectoralMegatrends" with key trends for the company's industry.
    * **NEW**: Also populate "swotAnalysis" with a brief fundamental SWOT.
`;

    // FIX: Removed Markdown formatting from the URL string.
    const GEMINI_CLOUD_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";
    
    const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        tools: [{ "google_search": {} }],
        generationConfig: {
            temperature: 0.1
            // REMOVED: responseMimeType: "application/json" // This caused the 400 error with tools
        }
    };

    try {
        const rawJsonString = await fetchWithRetry(apiKey, GEMINI_CLOUD_ENDPOINT, payload);
        const result = JSON.parse(rawJsonString);

        if (
            !result ||
            typeof result.latestPrice !== 'number' ||
            !result.dcfParameters ||
            !result.rationale ||
            !result.analystConsensus ||
            typeof result.dcfParameters.ttmNopat !== 'number' ||
            typeof result.dcfParameters.costOfEquity !== 'number' ||
            typeof result.analystConsensus.target_12m !== 'number' // Corrected this line
        ) {
            throw new Error("The parsed JSON does not match the expected DCF parameter structure.");
        }
        
        return result; // Success

    } catch (error) {
        console.error(`Valuation parameter fetch failed for ${ticker}:`, error);
        return { error: `Failed to get parameters. ${error.message}` };
    }
}

// --- NEW: 4. Gemini-Powered News Fetch ---
async function handleNewsRequest(timeframe) {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        return { error: "Gemini API Key not found. Please add it via the cloud icon in the popup." };
    }

    // --- UPDATED PROMPT ---
    const newsPrompt = `
You are a financial news analyst. Your task is to find the "Top 10" most impactful global financial or economic news stories from the specified timeframe: "${timeframe}".
You must use your search tools to find real-time, relevant news.
For each news item, provide:
1.  A brief 1-2 sentence summary.
2.  The source (e.g., Bloomberg, Reuters).
3.  The publication date and time as a string (e.g., "October 26, 2025, 10:30 AM" or "2025-10-26T10:30:00Z"). Provide the most precise timestamp you can find.
4.  A maximum of 3 key specific stocks (with tickers) that are most affected.
5.  The direct URL to the source article.

Your entire response MUST be a single, validated JSON object, enclosed in triple backticks (\\\`\`\`json ... \\\`\`\`).
Do not include any text, markdown, or commentary before or after the JSON block.

The JSON object must follow this exact structure:
\\\`\`\`json
{
    "newsItems": [
    {
      "headline": "Example: Fed Hints at Earlier-Than-Expected Rate Cuts",
      "summary": "Summary of the news item, explaining what happened and why it matters.",
      "source": "Reputable news source (e.g., Bloomberg, Reuters, WSJ)",
      "datetime": "October 26, 2025, 10:30 AM",
      "sourceUrl": "https://www.bloomberg.com/example-article-path",
      "affectedAssets": [
        { "name": "US Technology Sector", "ticker": null },
        { "name": "Gold", "ticker": "GLD" },
        { "name": "JPMorgan Chase", "ticker": "JPM" }
      ]
    }
  ]
}
\\\`\`\`

To populate this JSON:
- For "affectedAssets", if you find more than one, ensure they are in a JSON array, with each object separated by a comma.
- Ensure all strings are properly escaped.
`;
    // --- END UPDATED PROMPT ---

    // FIX: Removed Markdown formatting from the URL string.
    const GEMINI_CLOUD_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";
    
    const payload = {
        // FIX: Changed userPrompt to newsPrompt
        contents: [{ parts: [{ text: newsPrompt }] }],
        tools: [{ "google_search": {} }],
        generationConfig: {
            temperature: 0.2
            // REMOVED: responseMimeType: "application/json" // This caused the 400 error with tools
        }
    };

    try {
        const rawJsonString = await fetchWithRetry(apiKey, GEMINI_CLOUD_ENDPOINT, payload);
        const result = JSON.parse(rawJsonString);

        // Validate the structure
        if (!result || !Array.isArray(result.newsItems)) {
             throw new Error("The parsed JSON does not match the expected news structure (missing newsItems array).");
        }
        
        // Optional: Validate first item for new field
        if (result.newsItems.length > 0) {
            if (typeof result.newsItems[0].datetime !== 'string') {
                console.warn("Gemini response news item is missing 'datetime' string field.");
                // Don't throw an error, just warn, in case model fails
            }
            // MODIFICATION: Check for sourceUrl
            if (typeof result.newsItems[0].sourceUrl !== 'string') {
                console.warn("Gemini response news item is missing 'sourceUrl' string field.");
            }
        }
        
        return result; // Success

    } catch (error) { // FIX: Removed the stray 'Copy' identifier here
        console.error(`Global news fetch failed:`, error);
        return { error: `Failed to get news. ${error.message}` };
    }
}

// --- NEW: 5. Gemini-Powered Sector Rotation Fetch ---
async function handleSectorRotation() {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        return { error: "Gemini API Key not found. Please add it via the cloud icon in the popup." };
    }

    const sectorPrompt = `
You are a financial data analyst. Your task is to perform a historical price analysis for the following 11 US sector ETFs:
XLK, XLV, XLF, XLY, XLC, XLI, XLP, XLE, XLU, XLRE, XLB.

You must use your search tools to find the requested price data.
- "Current Price" should be the last market close.
- "Price 7 Days Ago" should be the closing price from the nearest prior trading day if 7 days ago was a non-trading day.
- "Price 55 Days Ago" should be the closing price from the nearest prior trading day if 55 days ago was a non-trading day.

Calculate the 7-Day and 55-Day growth percentages based on these prices.

Your entire response MUST be a single, validated JSON object. Do not include any text, markdown, or commentary before or after the JSON.

The JSON object must follow this exact structure:
{
  "sectorData": [
    {
      "symbol": "XLK",
      "name": "Technology Select Sector SPDR Fund",
      "price_55_days_ago": 0.0,
      "price_7_days_ago": 0.0,
      "current_price": 0.0,
      "growth_7_day_pct": 0.0,
      "growth_55_day_pct": 0.0
    }
  ]
}

Populate the "sectorData" array with exactly 11 objects, one for each symbol listed above. The 'name' field must be the full name of the ETF. 'growth_7_day_pct' and 'growth_55_day_pct' should be in decimal format (e.g., 5.5% = 0.055).
`;

    // FIX: Removed Markdown formatting from the URL string.
    const GEMINI_CLOUD_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";
    
    const payload = {
        // FIX: Changed userPrompt to sectorPrompt
        contents: [{ parts: [{ text: sectorPrompt }] }],
        tools: [{ "google_search": {} }],
        generationConfig: {
            temperature: 0.1
            // NOTE: No JSON mime type here, as the handler for this
            // in popup.js (displaySectorRotation) is designed
            // to display the raw string. This is correct.
        }
    };

    try {
        const rawJsonString = await fetchWithRetry(apiKey, GEMINI_CLOUD_ENDPOINT, payload);
        
        // --- START MODIFICATION ---
        // User requested to display raw data, so we don't parse it here.
        // We just return the raw JSON string.
        
        // Return the raw string, but keep the object structure for popup.js
        return { sectorData: rawJsonString };
        // --- END MODIFICATION ---

    } catch (error) {
        console.error(`Sector rotation fetch failed:`, error);
        return { error: `Failed to get sector data. ${error.message}` };
    }
}


