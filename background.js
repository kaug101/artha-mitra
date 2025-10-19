// background.js

// --- 0. Mock Fallback Definitions ---
const MOCK_FALLBACK = {
    prompt: {
        prompt: async ({ prompt }) => {
            console.warn("MOCK: AI_MODELS.prompt used for fallback.");
            if (prompt.includes("strategy")) {
                return { text: "1. Mock Strategy: Buy low, sell high. 2. Mock Bullish Scenario: Everything goes up!" };
            }
            return { text: '{"why": "Mock News Reason.", "action": "Mock Investor Action."}' };
        }
    },
    summarizer: {
        summarize: async ({ text }) => {
            console.warn("MOCK: AI_MODELS.summarizer used for fallback.");
            return { output: "Mock Summary: Leadership is stable, according to pre-processed data." };
        }
    },
    LanguageModel: undefined
};

// --- 1. Global API Initialization ---
const AI_MODELS = self.ai || chrome.ai || MOCK_FALLBACK;
const LanguageModel = AI_MODELS.LanguageModel || self.LanguageModel;
const FMP_API_KEY_STORAGE_KEY = 'fmpCloudApiKey';

// --- Function to create and manage the popup window ---
function createPopupWindow() {
  chrome.windows.create({
    url: 'popup/popup.html',
    type: 'popup',
    width: 400,
    height: 650
  }, (window) => {
    // Store the window ID so we don't open multiple windows
    chrome.storage.local.set({ popupWindowId: window.id });
  });
}

// --- Listen for the extension icon click ---
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get('popupWindowId', (data) => {
    const popupId = data.popupWindowId;

    if (popupId) {
      // If a window ID is stored, try to focus it
      chrome.windows.get(popupId, (window) => {
        if (chrome.runtime.lastError) {
          // The window was closed without us knowing. Create a new one.
          createPopupWindow();
        } else {
          // The window exists, just focus it.
          chrome.windows.update(popupId, { focused: true });
        }
      });
    } else {
      // No window ID is stored, so create a new one.
      createPopupWindow();
    }
  });
});

// --- Listen for when a window is closed ---
chrome.windows.onRemoved.addListener((windowId) => {
    chrome.storage.local.get('popupWindowId', (data) => {
        if (data.popupWindowId === windowId) {
            // The popup window was closed, so remove its ID from storage
            chrome.storage.local.remove('popupWindowId');
        }
    });
});


// --- 2. CORE MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "runValuation") {
        handleValuation(request.ticker).then(sendResponse);
        return true;
    } else if (request.action === "getAIAnalysis") {
        getAIAnalysis(request.leadershipText, request.stockType, request.macroTrend).then(sendResponse);
        return true;
    } else if (request.action === "getAINewsInsight") {
        getAINewsInsight(request.newsTitle, request.newsSnippet).then(sendResponse);
        return true;
    }
    return true; // Keep message channel open for async responses
});


// --- 3. DCF/Data Logic (REAL DATA) ---

async function getFmpApiKey() {
    const result = await chrome.storage.local.get(FMP_API_KEY_STORAGE_KEY);
    return result[FMP_API_KEY_STORAGE_KEY];
}

// Function to fetch data from Financial Modeling Prep
async function fetchFinancialData(ticker, apiKey) {
    const endpoints = {
        profile: `https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${apiKey}`,
        cashFlow: `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${ticker}&period=quarter&apikey=${apiKey}`,
        incomeStatement: `https://financialmodelingprep.com/stable/income-statement?symbol=${ticker}&period=quarter&apikey=${apiKey}`,
        enterpriseValue: `https://financialmodelingprep.com/stable/enterprise-values?symbol=${ticker}&period=quarter&apikey=${apiKey}`
    };

    try {
        const [profileRes, cashFlowRes, incomeRes, evRes] = await Promise.all([
            fetch(endpoints.profile),
            fetch(endpoints.cashFlow),
            fetch(endpoints.incomeStatement),
            fetch(endpoints.enterpriseValue)
        ]);

        if (!profileRes.ok || !cashFlowRes.ok || !incomeRes.ok || !evRes.ok) {
            // Find the first failing response to get its details
            const failedResponse = [profileRes, cashFlowRes, incomeRes, evRes].find(res => !res.ok);
            let detailedError = `API request failed with status: ${failedResponse.status}.`;

            // Provide more specific feedback for common HTTP errors
            if (failedResponse.status === 403 || failedResponse.status === 401) {
                try {
                    const errorData = await failedResponse.json();
                    // FMP API often provides a 'message' or 'error' key
                    const apiMessage = errorData.message || errorData.error || "Please verify your FMP API key and plan permissions.";
                    detailedError = `API Error (${failedResponse.status}): ${apiMessage}`;
                } catch (e) {
                    detailedError = `API Error (${failedResponse.status}). The API key may be invalid or your plan may not have access to this data.`;
                }
            }
            throw new Error(detailedError);
        }

        const profileData = await profileRes.json();
        const cashFlowData = await cashFlowRes.json();
        const incomeData = await incomeRes.json();
        const evData = await evRes.json();

        if (!profileData.length || !cashFlowData.length || !incomeData.length || !evData.length) {
            throw new Error('Incomplete data from API for DCF calculation.');
        }
        
        return {
            price: profileData[0].price,
            freeCashFlow: cashFlowData.map(d => d.freeCashFlow),
            revenue: incomeData.map(d => d.revenue),
            sharesOutstanding: evData[0].numberOfShares,
        };
    } catch (error) {
        console.error("Error fetching financial data:", error);
        throw error; // Re-throw to be caught by the caller
    }
}


// Simplified DCF Calculation
function calculateDCF(financials) {
    // --- 1. DEFINE ASSUMPTIONS ---
    const projectionYears = 5;
    const terminalGrowthRate = 0.025; // Standard terminal growth rate (inflation)
    const discountRate = 0.09; // WACC assumption - can be refined with Beta

    // --- 2. GATHER INPUTS ---
    const recentFCF = financials.freeCashFlow[0];
    if (recentFCF <= 0) {
        throw new Error("Cannot run DCF on company with negative Free Cash Flow.");
    }
    const sharesOutstanding = financials.sharesOutstanding;
    
    // --- 3. CALCULATE FCF GROWTH RATE ---
    // Use historical free cash flow growth directly.
    const cashFlows = financials.freeCashFlow.slice().reverse(); // Oldest to newest
    let growthSum = 0;
    let validPeriods = 0;
    for (let i = 1; i < cashFlows.length; i++) {
        // Only calculate growth if the previous period's FCF was positive to avoid misleading figures
        if (cashFlows[i - 1] > 0) {
            const growth = (cashFlows[i] - cashFlows[i - 1]) / cashFlows[i - 1];
            growthSum += growth;
            validPeriods++;
        }
    }
    const averageGrowth = validPeriods > 0 ? growthSum / validPeriods : 0.03; // Default to 3% if no data
    // Cap and floor the growth rate for stability
    const fcfGrowthRate = Math.min(Math.max(averageGrowth, 0.01), 0.15); 

    // --- 4. PROJECT FUTURE FCF & DISCOUNT TO PRESENT ---
    let presentValueFCF = 0;
    let lastProjectedFCF = recentFCF;
    const projectedFcfList = [];
    for (let i = 1; i <= projectionYears; i++) {
        const projectedFCF = lastProjectedFCF * (1 + fcfGrowthRate);
        projectedFcfList.push(projectedFCF);
        presentValueFCF += projectedFCF / Math.pow(1 + discountRate, i);
        lastProjectedFCF = projectedFCF;
    }

    // --- 5. CALCULATE TERMINAL VALUE & DISCOUNT TO PRESENT ---
    const terminalValue = (lastProjectedFCF * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
    const presentTerminalValue = terminalValue / Math.pow(1 + discountRate, projectionYears);

    // --- 6. CALCULATE FINAL INTRINSIC VALUE ---
    const intrinsicValue = presentValueFCF + presentTerminalValue;
    const dcfPrice = intrinsicValue / sharesOutstanding;

    return {
        dcfPrice: dcfPrice,
        inputs: {
            fcfGrowthRate: fcfGrowthRate,
            discountRate: discountRate,
            recentFCF: recentFCF,
            sharesOutstanding: sharesOutstanding,
            terminalGrowthRate: terminalGrowthRate,
        },
        calculation: {
            projectedFcfList: projectedFcfList,
            presentValueFCF: presentValueFCF,
            terminalValue: terminalValue,
            presentTerminalValue: presentTerminalValue,
            intrinsicValue: intrinsicValue
        }
    };
}

// --- Function to estimate future price targets ---
function calculatePriceEstimates(currentPrice, dcfPrice) {
    const upside = dcfPrice - currentPrice;
    // Assume linear convergence to intrinsic value over 12 months
    const estimate3M = currentPrice + upside * 0.25; // 3/12
    const estimate6M = currentPrice + upside * 0.50; // 6/12
    const estimate12M = dcfPrice;

    return {
        threeMonth: estimate3M,
        sixMonth: estimate6M,
        twelveMonth: estimate12M
    };
}


async function handleValuation(ticker) {
    const fmpApiKey = await getFmpApiKey();
    if (!fmpApiKey) {
        // Fallback to old mock data if no key
        console.warn("FMP API Key not found. Falling back to mock data.");
        return {
            price: 185.5,
            date: "N/A",
            source: "Mock Data (Add FMP Key)",
            dcf: { 
                dcfPrice: 200, 
                inputs: { fcfGrowthRate: 0.05, discountRate: 0.09, recentFCF: 50e9, sharesOutstanding: 15e9, terminalGrowthRate: 0.025 },
                calculation: { projectedFcfList: [52.5e9, 55.125e9, 57.88e9, 60.77e9, 63.81e9], presentValueFCF: 230e9, terminalValue: 1000e9, presentTerminalValue: 620e9, intrinsicValue: 850e9 }
            },
            estimates: {
                threeMonth: 189.13,
                sixMonth: 192.75,
                twelveMonth: 200.00
            },
            rawFinancials: {
                leadershipText: "Tim Cook, CEO, recently stated: 'Our focus on the Vision Pro ecosystem and services will drive long-term value...'",
                stockType: "Mature Growth Stock",
                macroTrend: "Rising rates and tech consolidation"
            },
            error: "FMP API Key not found. Please add it via the cloud icon."
        };
    }

    try {
        const financialData = await fetchFinancialData(ticker, fmpApiKey);
        const dcfResult = calculateDCF(financialData);
        const priceEstimates = calculatePriceEstimates(financialData.price, dcfResult.dcfPrice);

        // This data is still needed for the AI analysis part
        const rawFinancials = {
            leadershipText: `Mock leadership text for ${ticker}. Focus on innovation and market expansion.`, // This can be replaced with a real news API call later
            stockType: "Growth Stock", // This can also be refined
            macroTrend: "Global economic recovery"
        };
        
        return {
            price: financialData.price,
            dcf: dcfResult,
            estimates: priceEstimates,
            rawFinancials: rawFinancials
        };

    } catch (error) {
        console.error(`Valuation failed for ${ticker}:`, error);
        return { price: 'N/A', dcf: { dcfPrice: 'Error' }, error: error.message };
    }
}


// --- 4. HYBRID AI LOGIC (Cloud-First Strategy) ---

function timeout(ms, message) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(message || 'Nano initialization timed out')), ms));
}

async function getAIAnalysis(leadershipText, stockType, macroTrend) {
    const keyResult = await chrome.storage.local.get('geminiCloudApiKey');
    const hasCloudKey = keyResult.geminiCloudApiKey;

    // --- STRATEGY 1: Prioritize Cloud API if key is available ---
    if (hasCloudKey) {
        console.log("Cloud API key found. Prioritizing cloud analysis.");
        const fullPrompt = `Analyze the following: Stock Type: ${stockType}, Macro Trend: ${macroTrend}, Leadership Commentary: "${leadershipText}". Generate a JSON object with 'strategy' (3-point plan), 'bullishScenario' (2 paragraphs), and 'leadershipSummary' (bullet points).`;
        try {
            const cloudResult = await generateCloudAnalysis(fullPrompt);
            return {
                source: "Cloud",
                strategy: `[CLOUD ANALYSIS] ` + cloudResult.strategy,
                bullishScenario: cloudResult.bullishScenario,
                leadershipSummary: cloudResult.leadershipSummary
            };
        } catch (cloudError) {
            console.error(`Cloud analysis failed despite having a key: ${cloudError.message}. Falling back to Nano.`);
            // If cloud fails, we proceed to the Nano fallback below.
        }
    }

    // --- STRATEGY 2: Use Nano if key is missing or cloud failed ---
    console.log("Cloud API key not found or cloud failed. Attempting local Nano model.");
    let session = null;
    try {
        if (!LanguageModel) {
            throw new Error("CRITICAL: LanguageModel API not found. Cannot run locally.");
        }
        const availability = await LanguageModel.availability();
        if (availability !== 'available') {
            throw new Error(`Nano model is not 'available' (Status: ${availability}).`);
        }
        
        console.log("Attempting local model initialization (5-second timeout)...");
        session = await Promise.race([
            LanguageModel.create({ temperature: 0.8, topK: 5 }),
            timeout(5000, "Local Nano model timed out.")
        ]);

        const summaryResult = await AI_MODELS.summarizer.summarize({ text: leadershipText });
        const prompt = `Write a 50-word bullish case for a generic technology company, based on their focus on AI.`;
        const aiResponse = await session.prompt({ prompt });
        
        return {
            source: "Nano",
            strategy: aiResponse.text,
            bullishScenario: "This analysis was generated on-device using Gemini Nano.",
            leadershipSummary: summaryResult.output.split('\n')
        };

    } catch (e) {
        // --- FINAL FALLBACK: Mock Data ---
        console.error(`Local Nano Failed: ${e.message}. Using Safe Mock Data as final fallback.`);
        const mockResponse = await MOCK_FALLBACK.prompt.prompt({ prompt: "strategy" });
        const mockSummary = await MOCK_FALLBACK.summarizer.summarize({ text: leadershipText });
        return {
            source: "Mock",
            strategy: `[CRITICAL FAILURE] Cloud and Nano failed. Using Mock Data.`,
            bullishScenario: `Architecture proved stable with graceful fallback to mock data.`,
            leadershipSummary: mockSummary.output.split('\n')
        };
    } finally {
        if (session) {
            try {
                session.destroy();
            } catch (err) {
                console.warn("Session cleanup failed:", err);
            }
        }
    }
}


async function generateCloudAnalysis(prompt) {
    const result = await chrome.storage.local.get('geminiCloudApiKey');
    const GEMINI_CLOUD_API_KEY = result.geminiCloudApiKey;

    if (!GEMINI_CLOUD_API_KEY) {
         throw new Error("[CLOUD FALLBACK ERROR] Gemini Cloud API Key is missing from storage.");
    }

    const GEMINI_CLOUD_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    const response = await fetch(`${GEMINI_CLOUD_ENDPOINT}?key=${GEMINI_CLOUD_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        strategy: { type: "STRING" },
                        bullishScenario: { type: "STRING" },
                        leadershipSummary: { type: "STRING" }
                    }
                }
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloud API request failed (${response.status}): ${errorText.substring(0, 100)}...`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0].content) {
         throw new Error("Cloud API returned no valid candidates in the response.");
    }

    const rawJsonText = data.candidates[0].content.parts[0].text;
    let cleanJsonText = rawJsonText.trim().replace(/^```json|```$/g, '');
    const analysis = JSON.parse(cleanJsonText);

    return {
        strategy: analysis.strategy,
        bullishScenario: analysis.bullishScenario,
        leadershipSummary: analysis.leadershipSummary.split('\n')
    };
}

async function getAINewsInsight(title, snippet) {
    const aiResponse = await MOCK_FALLBACK.prompt.prompt({ prompt: "news" });
    try {
        const jsonString = aiResponse.text.substring(aiResponse.text.indexOf('{'), aiResponse.text.lastIndexOf('}') + 1);
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("News Insight JSON parsing error:", e);
        return { why: "AI analysis unavailable.", action: "Review the full article manually." };
    }
}

