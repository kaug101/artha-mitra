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


// --- 3. DCF/Data Logic (Mocked) ---
async function handleValuation(ticker) {
    const mockData = {
        AAPL: { 
            price: 185.5, 
            date: "Oct 17, 2025", 
            source: "Mock API",
            targets: { '3m': 190, '6m': 205, '12m': 230 } 
        },
    };
    const stock = mockData[ticker.toUpperCase()] || { price: 'N/A', targets: {} };
    const rawFinancials = {
        leadershipText: "Tim Cook, CEO, recently stated: 'Our focus on the Vision Pro ecosystem and services will drive long-term value...'",
        stockType: "Mature Growth Stock",
        macroTrend: "Rising rates and tech consolidation"
    };
    return { ...stock, rawFinancials };
}


// --- 4. HYBRID AI LOGIC ---

function timeout(ms, message) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(message || 'Nano initialization timed out')), ms));
}

async function getAIAnalysis(leadershipText, stockType, macroTrend) {
    let session = null; 

    try {
        if (!LanguageModel) {
            throw new Error("CRITICAL: LanguageModel API not found. Switching to Cloud.");
        }

        const availability = await LanguageModel.availability();
        console.log(`[Gemini Nano Status] Availability: ${availability}`);

        if (availability !== 'available') {
            throw new Error(`Nano model is not 'available' (Status: ${availability}). Switching to Cloud.`);
        }
        
        console.log("Attempting local model initialization (5-second timeout)...");
        
        session = await Promise.race([
            LanguageModel.create({ temperature: 0.8, topK: 5 }),
            timeout(5000, "Local Nano model timed out.") 
        ]);

        // --- LOCAL NANO EXECUTION SUCCESS ---
        const summaryResult = await AI_MODELS.summarizer.summarize({ text: leadershipText });
        const prompt = `Write a 50-word bullish case for a generic technology company, based on their focus on AI.`;
        const aiResponse = await session.prompt({ prompt });
        
        return { 
            strategy: aiResponse, 
            bullishScenario: "SUCCESS: Real Gemini Nano output (On-Device Processing).", 
            leadershipSummary: summaryResult.output.split('\n')
        };

    } catch (e) {
        // --- GRACEFUL FALLBACK TO CLOUD ---
        console.error(`Local Nano Failed: ${e.message}. Triggering Cloud Fallback.`);
        
        const fullPrompt = `Analyze the following: Stock Type: ${stockType}, Macro Trend: ${macroTrend}, Leadership Commentary: "${leadershipText}". Generate a JSON object with 'strategy' (3-point plan), 'bullishScenario' (2 paragraphs), and 'leadershipSummary' (bullet points).`;

        try {
            const cloudResult = await generateCloudAnalysis(fullPrompt);
            return {
                strategy: `[HYBRID SUCCESS: CLOUD FALLBACK] ` + cloudResult.strategy,
                bullishScenario: cloudResult.bullishScenario,
                leadershipSummary: cloudResult.leadershipSummary
            };
        } catch (cloudError) {
            console.error(`Cloud Fallback Failed. Using Safe Mock. Error: ${cloudError.message}`);
            const mockResponse = await MOCK_FALLBACK.prompt.prompt({ prompt: "strategy" }); 
            const mockSummary = await MOCK_FALLBACK.summarizer.summarize({ text: leadershipText });
            return {
                strategy: `[CRITICAL FAILURE] Cloud/Network Error. Using Mock Data.`,
                bullishScenario: `Architecture proved stable with graceful fallback to mock data.`,
                leadershipSummary: mockSummary.output.split('\n')
            };
        }
    } finally {
        // *** CRITICAL FIX: Only destroy the session IF it was successfully created. ***
        if (session) {
            session.destroy().catch(err => console.warn("Session cleanup failed:", err));
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
            // *** CRITICAL FIX: The parameter must be 'generationConfig' not 'config' ***
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

