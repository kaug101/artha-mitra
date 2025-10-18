// popup/popup.js

const API_KEY_STORAGE_KEY = 'geminiCloudApiKey';

// --- Function to Load Key Status on Popup Open ---
async function loadApiKeyStatus() {
    const statusElement = document.getElementById('keyStatus');
    const inputElement = document.getElementById('geminiApiKeyInput');

    const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
    const storedKey = result[API_KEY_STORAGE_KEY];

    if (storedKey) {
        statusElement.textContent = 'Status: Cloud API Key is saved and ready.';
        statusElement.style.color = 'green';
        inputElement.placeholder = 'Key is saved (Click Save to update)';
    } else {
        statusElement.textContent = 'Status: Cloud API Key is missing. Hybrid mode disabled.';
        statusElement.style.color = 'red';
        inputElement.placeholder = 'Enter Gemini Cloud API Key';
    }
}

// --- Event Listener for Saving Key ---
document.getElementById('saveApiKeyButton').addEventListener('click', async () => {
    const inputElement = document.getElementById('geminiApiKeyInput');
    const key = inputElement.value.trim();
    const statusElement = document.getElementById('keyStatus');

    if (key) {
        await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
        inputElement.value = ''; // Clear input after saving
        loadApiKeyStatus();
    } else {
        statusElement.textContent = 'Error: Please enter a valid key.';
        statusElement.style.color = 'orange';
    }
});

// Load the status when the DOM content is loaded
document.addEventListener('DOMContentLoaded', loadApiKeyStatus);

// --- Analyze Button Logic ---
document.getElementById('analyzeButton').addEventListener('click', () => {
    const ticker = document.getElementById('tickerInput').value.toUpperCase().trim();
    if (!ticker) {
        alert('Please enter a stock ticker.');
        return;
    }

    document.getElementById('results').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    // Clear previous AI output fields
    document.getElementById('strategyOutput').textContent = '';
    document.getElementById('bullishScenario').textContent = '';
    document.getElementById('leadershipSummary').innerHTML = '';


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
        
        // Display AI output or fallback/error messages
        document.getElementById('strategyOutput').textContent = aiResponse.strategy;
        document.getElementById('bullishScenario').textContent = aiResponse.bullishScenario;
        document.getElementById('leadershipSummary').innerHTML = aiResponse.leadershipSummary.join('<br>') || aiResponse.leadershipSummary; // Handles bullet points
        
        // Restore the standard details section UI
        document.getElementById('detailsSection').insertAdjacentHTML('beforeend', `
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

