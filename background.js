// background.js

// --- 0. Mock Fallback Definitions (Guaranteed to exist) ---
const MOCK_FALLBACK = {
    prompt: {
        prompt: async ({ prompt }) => {
            console.warn("MOCK: AI_MODELS.prompt used for fallback.");
            if (prompt.includes("strategy")) {
                // Mock structure for strategy/bullish case
                return { text: "1. Mock Strategy: Buy low, sell high. 2. Mock Bullish Scenario: Everything goes up!" };
            }
            // Mock structure for news insight (JSON output)
            return { text: '{"why": "Mock News Reason.", "action": "Mock Investor Action."}' };
        }
    },
    summarizer: {
        summarize: async ({ text }) => {
            console.warn("MOCK: AI_MODELS.summarizer used for fallback.");
            // Mock structure for summary (must have 'output' property)
            return { output: "Mock Summary: Leadership is stable, according to pre-processed data." };
        }
    },
    // The core LanguageModel object is still checked for existence (it's the only one that throws the DOMException)
    LanguageModel: undefined 
};

// --- 1. Global API Initialization ---
// Initialize AI_MODELS to the real API (self.ai or chrome.ai) OR the robust MOCK_FALLBACK.
const AI_MODELS = self.ai || chrome.ai || MOCK_FALLBACK;
const LanguageModel = AI_MODELS.LanguageModel || self.LanguageModel; 


// --- 2. CORE MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Return true to indicate an asynchronous response
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
});


// --- 3. DCF/Data Logic (Mocked for Hackathon) ---

async function handleValuation(ticker) {
    const mockData = {
        AAPL: { 
            price: 185.50, 
            date: "Oct 17, 2025", 
            source: "Mock API",
            targets: { '3m': 190, '6m': 205, '12m': 230 } 
        },
    };

    const stock = mockData[ticker] || { price: 'N/A', targets: {} };
    
    const rawFinancials = {
        leadershipText: "Tim Cook, CEO, recently stated: 'Our focus on the Vision Pro ecosystem and services will drive long-term value, even as macro headwinds temper short-term growth in hardware. We are committed to margin expansion...'",
        stockType: "Mature Growth Stock",
        macroTrend: "Rising rates and tech consolidation"
    };

    return { 
        ...stock, 
        rawFinancials: rawFinancials
    };
}


// --- 4. CHROME AI API INTEGRATION ---

/**
 * Uses Summarizer and Prompt APIs for in-depth analysis.
 */
// background.js (Focus on the getAIAnalysis function)

// background.js

// ... (API Initialization, MOCK_FALLBACK, handleValuation remain the same) ...

/**
 * @function getAIAnalysis (Final Hybrid Logic)
 * 1. Checks Nano's availability.
 * 2. Attempts session creation (the step that tests GPU/Memory limits).
 * 3. On DOMException failure, immediately executes the Cloud Fallback.
 */
async function getAIAnalysis(leadershipText, stockType, macroTrend) {
    let statusMessage = "AI Inference Failed.";
    let session = null; 

    try {
        if (!LanguageModel) {
            statusMessage = "CRITICAL: LanguageModel API not found. Running in mock mode.";
            throw new Error(statusMessage); // Jumps to catch block for final mock fallback
        }

        const availability = await LanguageModel.availability();
        console.log(`[Gemini Nano Status] Availability: ${availability}`);

        if (availability !== 'available') {
            statusMessage = `Nano model is not 'available' (Status: ${availability}). Switching to Cloud.`;
            throw new Error(statusMessage); // Force cloud if model isn't ready
        }
        
        // --- CRITICAL STEP: Attempting Local Initialization ---
        // This is the point where the OS/Browser typically fails if GPU/memory limits are hit.
        // We set a short timeout (though not guaranteed to stop the promise) and rely on the catch.
        statusMessage = "Attempting local model initialization (testing GPU capability)...";
        
        session = await LanguageModel.create({ 
            temperature: 0.8, 
            topK: 5
        });

        // --- LOCAL NANO EXECUTION SUCCESS ---
        // If we reach here, local hardware is capable. Execute Nano logic:
        const summaryResult = await AI_MODELS.summarizer.summarize({ text: leadershipText });
        const leadershipSummary = summaryResult.output.split('\n');

        const prompt = `Write a 50-word bullish case for a generic technology company, based on their focus on AI. Respond with only the text of the case, no markdown or extra formatting.`;
        const aiResponse = await session.prompt({ prompt: prompt });
        
        session.destroy();

        return { 
            strategy: aiResponse.text, 
            bullishScenario: "PROMPT SUCCESS: Real Gemini Nano output (On-Device Processing).", 
            leadershipSummary: leadershipSummary
        };

    } catch (e) {
        // --- 4. GRACEFUL FALLBACK TO CLOUD ---
        // If 'LanguageModel.create()' throws ANY error (like the DOMException or a timeout/availability error), 
        // we assume it's a hardware/resource failure and switch to the reliable Cloud API.
        console.error(`Local Nano Failed. Triggering Cloud Fallback. Error: ${e.message}`);
        
        // --- Prepare Comprehensive Prompt for Cloud ---
        const fullPrompt = `Analyze the following company data for a trading strategy: 
            Stock Type: ${stockType}
            Macro Trend: ${macroTrend}
            Leadership Commentary: "${leadershipText}"
            
            Based on this, generate a JSON object with the following fields:
            1. 'strategy': A concise, 3-point trading strategy.
            2. 'bullishScenario': A 2-paragraph bullish investment thesis.
            3. 'leadershipSummary': A bulleted summary of the commentary.
            
            Ensure the output is ONLY a parsable JSON object, enclosed in three backticks.`;

        try {
            const cloudResult = await generateCloudAnalysis(fullPrompt);

            // Cloud analysis returns structured data, which we format for the UI
            return {
                strategy: `[HYBRID SUCCESS: CLOUD FALLBACK] ` + cloudResult.strategy,
                bullishScenario: cloudResult.bullishScenario,
                leadershipSummary: cloudResult.leadershipSummary
            };
        } catch (cloudError) {
            // Final failure: Cloud key missing or network failed. Use mock.
            console.error(`Cloud Fallback Failed. Using Safe Mock. Error: ${cloudError.message}`);
            
            const mockResponse = await AI_MODELS.prompt.prompt({ prompt: "strategy" }); 
            const mockSummary = await AI_MODELS.summarizer.summarize({ text: leadershipText });

            return {
                strategy: `[CRITICAL FAILURE] Cloud/Network Error. ${mockResponse.text}`,
                bullishScenario: `Architecture proved stable with graceful fallback to mock data.`,
                leadershipSummary: mockSummary.output.split('\n')
            };
        } finally {
            // Clean up the session if it was created but failed later
            if (session) {
                session.destroy().catch(err => console.warn("Session cleanup failed:", err));
            }
        }
    }
}

/**
 * Uses Prompt API to generate actionable investment insight from a news story.
 * (Uses mock logic for now to prevent redundant error handling)
 */
async function getAINewsInsight(title, snippet) {
    // For simplicity, this is just calling the mock prompt function
    const aiResponse = await AI_MODELS.prompt.prompt({ prompt: "news" });
    
    try {
        const jsonStart = aiResponse.text.indexOf('{');
        const jsonEnd = aiResponse.text.lastIndexOf('}') + 1;
        const jsonString = aiResponse.text.substring(jsonStart, jsonEnd);
        
        return JSON.parse(jsonString);

    } catch (e) {
        console.error("News Insight JSON parsing error:", e);
        return {
            why: "AI analysis unavailable.",
            action: "Review the full article manually."
        };
    }
}

// background.js

/**
 * @function generateCloudAnalysis
 * Executes the fallback to the Gemini 2.5 Flash Cloud API using the user's stored key.
 * @param {string} prompt - The comprehensive prompt containing all necessary data.
 * @returns {Promise<Object>} An object containing strategy, bullishScenario, and leadershipSummary.
 */
async function generateCloudAnalysis(prompt) {
    // 1. Retrieve API Key from Chrome Storage
    const result = await chrome.storage.local.get('geminiCloudApiKey');
    const GEMINI_CLOUD_API_KEY = result.geminiCloudApiKey;

    if (!GEMINI_CLOUD_API_KEY) {
         // Stop execution if the key is missing (user hasn't entered it)
         throw new Error("[CLOUD FALLBACK ERROR] Gemini Cloud API Key is missing from storage. Please enter the key in the popup to enable hybrid mode.");
    }

    const GEMINI_CLOUD_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

    // 2. Execute the Network Request to the Cloud API
    const response = await fetch(`${GEMINI_CLOUD_ENDPOINT}?key=${GEMINI_CLOUD_API_KEY}`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
            // Send the full text prompt
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                temperature: 0.7,
                // Request structured output to ensure predictable JSON parsing
                responseMimeType: "application/json", 
                responseSchema: {
                    type: "object",
                    properties: {
                        strategy: { type: "string", description: "A concise 3-point trading strategy." },
                        bullishScenario: { type: "string", description: "A two-paragraph bullish investment thesis." },
                        leadershipSummary: { type: "string", description: "A bulleted summary of the commentary text." }
                    }
                }
            }
        })
    });

    // 3. Handle Network Errors
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloud API request failed (${response.status}): ${errorText.substring(0, 100)}...`);
    }

    // 4. Parse the Structured Response
    const data = await response.json();
    
    // Safety check for candidates
    if (!data.candidates || data.candidates.length === 0) {
         throw new Error("Cloud API returned a successful status but no content candidates.");
    }

    // The output is structured as JSON due to the request schema
    const rawJsonText = data.candidates[0].content.parts[0].text;
    
    // We expect the model to wrap the JSON in markdown; remove surrounding ticks if present.
    let cleanJsonText = rawJsonText.trim();
    if (cleanJsonText.startsWith('```')) {
        cleanJsonText = cleanJsonText.substring(cleanJsonText.indexOf('{'), cleanJsonText.lastIndexOf('}') + 1);
    }
    
    const analysis = JSON.parse(cleanJsonText);

    // 5. Return Structured Data
    return {
        strategy: analysis.strategy,
        bullishScenario: analysis.bullishScenario,
        // The summary comes as a single string from the cloud; split it for UI formatting
        leadershipSummary: analysis.leadershipSummary.split('\n') 
    };
}