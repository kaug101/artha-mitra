// popup/popup.js

document.getElementById('analyzeButton').addEventListener('click', () => {
    const ticker = document.getElementById('tickerInput').value.toUpperCase().trim();
    if (!ticker) {
        alert('Please enter a stock ticker.');
        return;
    }

    document.getElementById('results').style.display = 'none';
    document.getElementById('loading').style.display = 'block';

    // Send message to background.js to start valuation
    chrome.runtime.sendMessage({ action: "runValuation", ticker: ticker }, (response) => {
        document.getElementById('loading').style.display = 'none';
        
        if (response && response.price !== 'N/A') {
            displayResults(ticker, response);
            // After displaying core results, fetch the in-depth AI analysis
            getDetailedAnalysis(response.rawFinancials);
        } else {
            alert(`Could not find data for ${ticker}.`);
        }
    });
});

function displayResults(ticker, data) {
    document.getElementById('stockHeader').textContent = `${ticker} - Current Price: $${data.price}`;
    document.getElementById('priceInfo').textContent = `Date: ${data.date} (Source: ${data.source})`;
    
    const targetsList = document.getElementById('dcfTargets');
    targetsList.innerHTML = ''; // Clear previous targets

    for (const [key, value] of Object.entries(data.targets)) {
        const li = document.createElement('li');
        li.textContent = `${key} Target: $${value}`;
        targetsList.appendChild(li);
    }
    
    document.getElementById('results').style.display = 'block';
}

function getDetailedAnalysis(rawFinancials) {
    document.getElementById('detailsSection').innerHTML = '<p style="color:red;">Running Gemini Nano...</p>';
    
    // Send raw data to background.js for AI processing
    chrome.runtime.sendMessage({ 
        action: "getAIAnalysis", 
        leadershipText: rawFinancials.leadershipText,
        stockType: rawFinancials.stockType,
        macroTrend: rawFinancials.macroTrend
    }, (aiResponse) => {
        // Clear temp loading message
        document.getElementById('detailsSection').innerHTML = ''; 
        
        document.getElementById('detailsSection').insertAdjacentHTML('afterbegin', `
            <h3>AI Analysis (Powered by Gemini Nano)</h3>
            <h4>Leadership Analysis (Summarizer API)</h4>
            <p>${aiResponse.leadershipSummary.join('<br>') || aiResponse.leadershipSummary}</p> 
            
            <h4>Strategy & Bullish Scenario (Prompt API)</h4>
            <pre>${aiResponse.strategy}</pre>
            <pre>${aiResponse.bullishScenario}</pre>
            
            <button class="prompt-button" onclick="alert('Re-check Numbers function would trigger a content script (content.js) to scrape live L2 data.')">Re-check Numbers (L2 Data)</button>
        `);
    });
}

document.getElementById('toggleDetails').addEventListener('click', (e) => {
    const section = document.getElementById('detailsSection');
    const isVisible = section.style.display === 'block';
    section.style.display = isVisible ? 'none' : 'block';
    e.target.textContent = isVisible ? 'Show Background & AI Analysis' : 'Hide Background & AI Analysis';
});

document.getElementById('noFeedback').addEventListener('click', () => {
    alert('Thank you for using Artha-Mitra! We invite your feedback: https://forms.gle/31fUb9PxCfn1x79TA');
});

// Mock Global News integration (Would be pulled from background.js via chrome.storage)
// The news item analysis would be done by getAINewsInsight in background.js
// This part is for visual demo only.
// In the actual hackathon, you'd fetch 10 news items and run getAINewsInsight on each.

function mockNewsDisplay() {
    const newsItem = {
        title: "Fed signals potential rate hike, warns of sticky inflation",
        snippet: "Chairman Powell mentioned ongoing labor market strength and elevated energy costs as key concerns in the latest minutes.",
        affectedStocks: "SPY, TLT, Financials"
    };

    chrome.runtime.sendMessage({ 
        action: "getAINewsInsight", 
        newsTitle: newsItem.title, 
        newsSnippet: newsItem.snippet 
    }, (insight) => {
        console.log("News Insight:", insight);
        // For the demo, you could display this in a dedicated News tab in the popup
    });
}

// mockNewsDisplay(); // Uncomment to test news API call
