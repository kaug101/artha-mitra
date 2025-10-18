// background.js

//const AI_MODELS = chrome.ai;
const AI_MODELS = self.ai || chrome.ai || {}; 
const LanguageModel = AI_MODELS.LanguageModel || self.LanguageModel; 

// Mock implementation for resilience (in case LanguageModel is undefined)
if (!LanguageModel) {
    console.error("CRITICAL: LanguageModel API is NOT available. Using mock mode.");
    // Re-create mock objects if the real API is missing
    AI_MODELS.prompt = {
        prompt: async ({ prompt }) => {
            console.warn("MOCK: AI_MODELS.prompt used.");
            if (prompt.includes("strategy")) {
                return { text: "1. Mock Strategy: Buy low, sell high. 2. Mock Bullish Scenario: Everything goes up!" };
            }
            return { text: '{"why": "Mock News Reason.", "action": "Mock Investor Action."}' };
        }
    };
    AI_MODELS.summarizer = {
        summarize: async ({ text }) => {
            console.warn("MOCK: AI_MODELS.summarizer used.");
            return { output: "Mock Summary: Check console for error details." };
        }
    };
}

// --- 1. CORE MESSAGE LISTENER ---
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


// --- 2. DCF/Data Logic (Mocked for Hackathon) ---

async function handleValuation(ticker) {
    // In a real scenario, this would call your external DCF Backend.
    // For the hackathon demo, we use mocked data.
    const mockData = {
        AAPL: { 
            price: 185.50, 
            date: "Oct 17, 2025", 
            source: "Mock API",
            targets: { '3m': 190, '6m': 205, '12m': 230 } 
        },
        // ... other tickers
    };

    const stock = mockData[ticker] || { price: 'N/A', targets: {} };
    
    // Simulate fetching raw data for AI analysis
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


// --- 3. CHROME AI API INTEGRATION ---

/**
 * Uses Summarizer and Prompt APIs for in-depth analysis.
 */
async function getAIAnalysis(leadershipText, stockType, macroTrend) {
    let statusMessage = "AI Inference Failed.";

    try {
        if (!LanguageModel) {
            // Fallback to mock logic if LanguageModel isn't present
            throw new Error("LanguageModel API not found. Running in mock mode.");
        }

        const availability = await LanguageModel.availability();
        console.log(`[Gemini Nano Status] Availability: ${availability}`);

        if (availability === 'unavailable') {
            statusMessage = "Gemini Nano is unavailable (hardware/space/setup issue).";
            throw new Error(statusMessage);
        }

        if (availability === 'downloadable' || availability === 'downloading') {
            statusMessage = `Model is currently '${availability}'. ATTEMPTING DOWNLOAD/INITIALIZATION. Wait 1-5 mins.`;
            console.warn(statusMessage);
        }
        
        // --- CRITICAL STEP: Calling create() to finalize model setup/download ---
        // This promise will resolve once the model is ready.
        const session = await LanguageModel.create({ temperature: 0.8 });

        // If we reach here, the model is fully initialized!
        
        // --- 1. Summarizer API ---
        const summaryResult = await AI_MODELS.summarizer.summarize({ text: leadershipText });
        const leadershipSummary = summaryResult.output.split('\n');

        // --- 2. Prompt API ---
        const prompt = `Based on the following: 
            Stock Type: ${stockType}
            Macro Trend: ${macroTrend}
            1. Generate a 3-point trading strategy (Timing, Risk, Allocation).
            2. Write a 2-paragraph highly BULLISH investment scenario for the next 12 months.
            Format the response as clear, readable text blocks.`;

        const aiResponse = await session.prompt({ prompt: prompt });
        session.destroy();

        const parts = aiResponse.text.split('2. Write a 2-paragraph highly BULLISH investment scenario');

        return {
            strategy: parts[0].trim(),
            bullishScenario: '2. Write a 2-paragraph highly BULLISH investment scenario' + parts[1].trim(),
            leadershipSummary: leadershipSummary
        };

    } catch (e) {
        console.error("Gemini Nano Inference Error:", e);
        // Ensure the fallback uses the mock objects to avoid crashing the UI
        const mockResponse = await AI_MODELS.prompt.prompt({ prompt: "strategy" }); 
        const mockSummary = await AI_MODELS.summarizer.summarize({ text: leadershipText });
        
        return {
            strategy: `[CRITICAL EPP ERROR: ${statusMessage}] | Running Mock Data.`,
            bullishScenario: `[Error: ${e.message}]. Please wait for model download to complete.`,
            leadershipSummary: mockSummary.output.split('\n')
        };
    }
}

/**
 * Uses Prompt API to generate actionable investment insight from a news story.
 */
async function getAINewsInsight(title, snippet) {
    if (AI_MODELS.prompt) {
        try {
            const prompt = `Analyze this financial news: Title: "${title}". Snippet: "${snippet}". 
                Your output must be a single JSON object with two keys:
                1. "why": A 1-sentence explanation of why the news is happening.
                2. "action": A 1-sentence instruction on what a typical investor should do (e.g., 'Monitor sector performance,' 'Consider a short-term hedge').`;
            
            const aiResponse = await AI_MODELS.prompt.prompt({
                prompt: prompt,
                temperature: 0.2 // Low temperature for factual, consistent JSON output
            });

            // Attempt to parse JSON response
            const jsonStart = aiResponse.text.indexOf('{');
            const jsonEnd = aiResponse.text.lastIndexOf('}') + 1;
            const jsonString = aiResponse.text.substring(jsonStart, jsonEnd);
            
            return JSON.parse(jsonString);

        } catch (e) {
            console.error("News Insight Prompt API failed or JSON parsing error:", e);
            return {
                why: "AI analysis unavailable.",
                action: "Review the full article manually."
            };
        }
    }
}
