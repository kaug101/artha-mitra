// popup.js

const API_KEY_STORAGE_KEY = 'geminiCloudApiKey';
const FMP_API_KEY_STORAGE_KEY = 'fmpCloudApiKey';

// --- Function to Load Gemini Key Status ---
async function loadApiKeyStatus() {
    const statusElement = document.getElementById('keyStatus');
    const inputElement = document.getElementById('geminiApiKeyInput');
    const cloudIcon = document.getElementById('cloudKeyIcon');

    try {
        const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
        const storedKey = result[API_KEY_STORAGE_KEY];

        if (storedKey) {
            statusElement.textContent = 'Status: Cloud API Key is saved. Cloud-first mode is ACTIVE.';
            statusElement.style.color = 'green';
            inputElement.placeholder = 'Key is saved (Click to update)';
            cloudIcon.style.stroke = 'green';
        } else {
            statusElement.textContent = 'Status: Cloud API Key is missing. Using on-device Nano model.';
            statusElement.style.color = 'orange';
            inputElement.placeholder = 'Enter Gemini Cloud API Key';
            cloudIcon.style.stroke = 'orange';
        }
    } catch (e) {
        console.error("Error loading API key status:", e);
        statusElement.textContent = 'Error loading key status.';
    }
}

// --- Function to Load FMP Key Status ---
async function loadFmpApiKeyStatus() {
    const statusElement = document.getElementById('fmpKeyStatus');
    const inputElement = document.getElementById('fmpApiKeyInput');
    try {
        const result = await chrome.storage.local.get(FMP_API_KEY_STORAGE_KEY);
        if (result[FMP_API_KEY_STORAGE_KEY]) {
            statusElement.textContent = 'Status: FMP API Key is saved. Real-time data is ACTIVE.';
            statusElement.style.color = 'green';
            inputElement.placeholder = 'Key is saved (Click to update)';
        } else {
            statusElement.textContent = 'Status: FMP API Key is missing. Valuation will use mock data.';
            statusElement.style.color = 'red';
            inputElement.placeholder = 'Enter FMP API Key';
        }
    } catch (e) {
        console.error("Error loading FMP key status:", e);
        statusElement.textContent = 'Error loading key status.';
    }
}

// --- Event Listeners for Saving Keys ---
document.getElementById('saveApiKeyButton').addEventListener('click', async () => {
    const inputElement = document.getElementById('geminiApiKeyInput');
    const key = inputElement.value.trim();
    if (key) {
        await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
    } else {
        await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
    }
    inputElement.value = '';
    loadApiKeyStatus();
});

document.getElementById('saveFmpApiKeyButton').addEventListener('click', async () => {
    const inputElement = document.getElementById('fmpApiKeyInput');
    const key = inputElement.value.trim();
    if (key) {
        await chrome.storage.local.set({ [FMP_API_KEY_STORAGE_KEY]: key });
    } else {
        await chrome.storage.local.remove(FMP_API_KEY_STORAGE_KEY);
    }
    inputElement.value = '';
    loadFmpApiKeyStatus();
});

// Load statuses when the DOM content is loaded
document.addEventListener('DOMContentLoaded', () => {
    loadApiKeyStatus();
    loadFmpApiKeyStatus();
});


// --- Analyze Button Logic ---
document.getElementById('analyzeButton').addEventListener('click', () => {
    const ticker = document.getElementById('tickerInput').value.toUpperCase().trim();
    if (!ticker) {
        alert('Please enter a stock ticker.');
        return;
    }

    document.getElementById('results').style.display = 'none';
    document.getElementById('detailsSection').style.display = 'none';
    document.getElementById('toggleDetails').textContent = 'Show AI Analysis';
    document.getElementById('loading').style.display = 'block';
    
    chrome.runtime.sendMessage({ action: "runValuation", ticker: ticker }, (response) => {
        document.getElementById('loading').style.display = 'none';
        
        if (chrome.runtime.lastError) {
            console.error("Error from background:", chrome.runtime.lastError.message);
            alert("An error occurred. Check the service worker console for details.");
            return;
        }
        
        if (response && response.error) {
             alert(`Valuation Error: ${response.error}`);
        } else if (response && response.price !== 'N/A') {
            displayResults(ticker, response);
            // Pass raw financials to a data attribute for later use
            document.getElementById('toggleDetails').dataset.rawFinancials = JSON.stringify(response.rawFinancials);
        } else {
            alert(`Could not find data for ${ticker}.`);
        }
    });
});

function displayResults(ticker, data) {
    document.getElementById('stockHeader').textContent = `${ticker} - Current Price: $${data.price.toFixed(2)}`;
    document.getElementById('priceInfo').textContent = `Date: ${new Date().toLocaleDateString()} (Source: Live Data)`;
    
    const targetsList = document.getElementById('dcfTargets');
    targetsList.innerHTML = ''; 

    const dcfTitle = document.createElement('h4');
    dcfTitle.textContent = 'DCF Valuation:';
    dcfTitle.style.marginTop = '10px';
    dcfTitle.style.marginBottom = '5px';
    targetsList.appendChild(dcfTitle);

    const li = document.createElement('li');
    li.innerHTML = `<b>Intrinsic Value: $${data.dcf.dcfPrice.toFixed(2)}</b>`;
    targetsList.appendChild(li);

    const dcfInputs = document.createElement('p');
    dcfInputs.style.fontSize = '0.8em';
    dcfInputs.style.color = '#666';
    dcfInputs.innerHTML = `(Based on ${Math.round(data.dcf.inputs.fcfGrowthRate * 100)}% FCF growth & ${data.dcf.inputs.discountRate * 100}% discount rate)`;
    targetsList.appendChild(dcfInputs);
    
    // Display Price Estimates
    if (data.estimates) {
        const estimatesList = document.getElementById('estimateTargets');
        estimatesList.innerHTML = ''; // Clear previous results

        const estimatesTitle = document.createElement('h4');
        estimatesTitle.textContent = 'Price Targets:';
        estimatesTitle.style.marginTop = '10px';
        estimatesTitle.style.marginBottom = '5px';
        estimatesList.appendChild(estimatesTitle);

        const estimate3m = document.createElement('li');
        estimate3m.innerHTML = `3-Month Target: <b>$${data.estimates.threeMonth.toFixed(2)}</b>`;
        estimatesList.appendChild(estimate3m);

        const estimate6m = document.createElement('li');
        estimate6m.innerHTML = `6-Month Target: <b>$${data.estimates.sixMonth.toFixed(2)}</b>`;
        estimatesList.appendChild(estimate6m);

        const estimate12m = document.createElement('li');
        estimate12m.innerHTML = `12-Month Target: <b>$${data.estimates.twelveMonth.toFixed(2)}</b>`;
        estimatesList.appendChild(estimate12m);
    }

    document.getElementById('results').style.display = 'block';
    // Pass detailed DCF data to the toggle button's dataset
    document.getElementById('toggleDetails').dataset.dcfDetails = JSON.stringify(data.dcf);
}

function displayDcfCalculation(dcfDetails) {
    const outputEl = document.getElementById('dcfCalculationOutput');
    if (!dcfDetails || !dcfDetails.inputs || !dcfDetails.calculation) {
        outputEl.textContent = 'DCF calculation details are not available.';
        return;
    }

    const { inputs, calculation } = dcfDetails;

    // Helper to format numbers as currency in billions
    const formatBillions = (num) => `$${(num / 1e9).toFixed(2)}B`;

    let detailsText = `1. Inputs & Assumptions:
   - Most Recent FCF: ${formatBillions(inputs.recentFCF)}
   - FCF Growth Rate: ${(inputs.fcfGrowthRate * 100).toFixed(2)}%
   - Discount Rate (WACC): ${(inputs.discountRate * 100).toFixed(2)}%
   - Terminal Growth Rate: ${(inputs.terminalGrowthRate * 100).toFixed(2)}%
   - Shares Outstanding: ${(inputs.sharesOutstanding / 1e9).toFixed(2)}B

2. Free Cash Flow Projection (5 Years):
`;
    calculation.projectedFcfList.forEach((fcf, i) => {
        detailsText += `   - Year ${i + 1}: ${formatBillions(fcf)}\n`;
    });

    detailsText += `
3. Valuation Summary:
   - PV of Projected FCF: ${formatBillions(calculation.presentValueFCF)}
   - PV of Terminal Value: ${formatBillions(calculation.presentTerminalValue)}
   - Total Intrinsic Value: ${formatBillions(calculation.intrinsicValue)}
   - Intrinsic Value / Share: $${dcfDetails.dcfPrice.toFixed(2)}
`;
    outputEl.textContent = detailsText;
}

function getDetailedAnalysis(rawFinancials) {
    const detailsSection = document.getElementById('detailsSection');
    const aiHeaderEl = document.getElementById('aiAnalysisHeader');
    const leadershipSummaryEl = document.getElementById('leadershipSummary');
    const strategyOutputEl = document.getElementById('strategyOutput');
    const bullishScenarioEl = document.getElementById('bullishScenario');

    detailsSection.style.display = 'block';
    aiHeaderEl.textContent = 'AI Analysis';
    leadershipSummaryEl.innerHTML = '<p style="color:orange;">Running AI Analysis (Cloud-First)...</p>';
    strategyOutputEl.textContent = '';
    bullishScenarioEl.textContent = '';

    chrome.runtime.sendMessage({ 
        action: "getAIAnalysis", 
        leadershipText: rawFinancials.leadershipText,
        stockType: rawFinancials.stockType,
        macroTrend: rawFinancials.macroTrend
    }, (aiResponse) => {
        if (chrome.runtime.lastError) {
            console.error("Error receiving AI analysis:", chrome.runtime.lastError.message);
            leadershipSummaryEl.innerHTML = `<p style="color:red;">Failed to connect to the background script.</p>`;
            return;
        }

        aiHeaderEl.textContent = `AI Analysis (Powered by Gemini ${aiResponse.source})`;
        leadershipSummaryEl.innerHTML = aiResponse.leadershipSummary.join('<br>') || '';
        strategyOutputEl.textContent = aiResponse.strategy || '';
        bullishScenarioEl.textContent = aiResponse.bullishScenario || '';
    });
}

// --- Toggle Logic ---
document.getElementById('toggleDetails').addEventListener('click', (e) => {
    const section = document.getElementById('detailsSection');
    const isVisible = section.style.display === 'block';
    
    if (isVisible) {
        section.style.display = 'none';
        e.target.textContent = 'Show AI Analysis';
    } else {
        const rawFinancials = JSON.parse(e.target.dataset.rawFinancials || '{}');
        const dcfDetails = JSON.parse(e.target.dataset.dcfDetails || '{}');
        if (Object.keys(rawFinancials).length > 0) {
            displayDcfCalculation(dcfDetails);
            getDetailedAnalysis(rawFinancials);
            e.target.textContent = 'Hide AI Analysis';
        } else {
            alert("Run a valuation first to get AI analysis.");
        }
    }
});


// --- Modal Logic ---
const modal = document.getElementById('apiKeyModal');
const cloudIcon = document.getElementById('cloudKeyIcon');
const closeButton = document.querySelector('.close-button');

cloudIcon.onclick = function() { modal.style.display = "block"; }
closeButton.onclick = function() { modal.style.display = "none"; }
window.onclick = function(event) {
  if (event.target == modal) {
    modal.style.display = "none";
  }
}
