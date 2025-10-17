// background.js

//const AI_MODELS = chrome.ai;
const AI_MODELS = self.ai || chrome.ai || {
    // Mock the prompt and summarizer APIs if AI is not available
    prompt: {
        prompt: async ({ prompt }) => {
            console.warn("Gemini Nano API (self.ai/chrome.ai) is not available. Using mock response.");
            if (prompt.includes("strategy")) {
                return { text: "1. Mock Strategy: Buy low, sell high. 2. Mock Bullish Scenario: Everything goes up!" };
            } else if (prompt.includes("news")) {
                return { text: '{"why": "Mock News Reason.", "action": "Mock Investor Action."}' };
            }
            return { text: "Mock AI Response: AI unavailable." };
        }
    },
    summarizer: {
        summarize: async ({ text }) => {
            console.warn("Gemini Nano API (self.ai/chrome.ai) is not available. Using mock response.");
            return ["Mock Summary 1. (Leadership is strong)", "Mock Summary 2. (Margins are expanding)"];
        }
    }
};

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
 * Uses Summarizer and Rewriter APIs for in-depth analysis.
 */
async function getAIAnalysis(leadershipText, stockType, macroTrend) {
    
    let leadershipSummary = "Analysis not available.";
    let bullishScenario = "Scenario not available.";

    // --- A. Summarizer API: Leadership Analysis ---
    if (AI_MODELS.summarizer) {
        try {
            leadershipSummary = await AI_MODELS.summarizer.summarize({
                text: leadershipText,
                format: "bullets", // Requesting bullet-point format
                maxSentences: 3
            });
        } catch (e) {
            console.error("Summarizer API failed:", e);
            leadershipSummary = `[Error] Failed to summarize leadership statements. Raw text: ${leadershipText.substring(0, 50)}...`;
        }
    }

    // --- B. Prompt API (or Rewriter API): Strategy Recommendation & Bullish Scenario ---
    // Using Prompt API for more structured, creative output.
    if (AI_MODELS.prompt) {
        try {
            const prompt = `Based on the following: 
                Stock Type: ${stockType}
                Macro Trend: ${macroTrend}
                
                1. Generate a 3-point trading strategy (Timing, Risk, Allocation).
                2. Write a 2-paragraph highly BULLISH investment scenario for the next 12 months.
                Format the response as clear, readable text blocks.`;

            const aiResponse = await AI_MODELS.prompt.prompt({
                prompt: prompt,
                // Using a slightly higher temperature for more creative scenario writing
                temperature: 0.8 
            });

            // Parse response (simple split for demo)
            const parts = aiResponse.text.split('2. Write a 2-paragraph highly BULLISH investment scenario');
            
            return {
                strategy: parts[0].trim(),
                bullishScenario: '2. ' + parts[1].trim(), // Re-add the section header
                leadershipSummary: leadershipSummary
            };

        } catch (e) {
            console.error("Prompt API failed:", e);
            return {
                strategy: "[Error] Failed to generate strategy via Prompt API.",
                bullishScenario: "[Error] Failed to generate bullish scenario via Prompt API.",
                leadershipSummary: leadershipSummary
            };
        }
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
