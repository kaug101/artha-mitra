// popup.js

const API_KEY_STORAGE_KEY = 'geminiCloudApiKey';

// --- Notification Bar Logic ---
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) {
        console.error("Notification element not found!");
        return;
    }
    notification.textContent = message;
    notification.className = 'notification-bar'; // Reset classes
    
    if (type === 'error') notification.classList.add('notification-error');
    else if (type === 'success') notification.classList.add('notification-success');
    else notification.classList.add('notification-info');

    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}


// --- Function to Load Gemini Key Status ---
async function loadApiKeyStatus() {
    const statusElement = document.getElementById('keyStatus');
    const inputElement = document.getElementById('geminiApiKeyInput');
    const cloudIcon = document.getElementById('cloudKeyIcon');

    try {
        const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
        const storedKey = result[API_KEY_STORAGE_KEY];

        if (storedKey) {
            statusElement.textContent = 'Status: Cloud API Key is saved.';
            statusElement.style.color = 'green';
            inputElement.placeholder = 'Key is saved (Click to update)';
            cloudIcon.style.stroke = 'green';
        } else {
            statusElement.textContent = 'Status: Cloud API Key is missing.';
            statusElement.style.color = 'orange';
            inputElement.placeholder = 'Enter Gemini Cloud API Key';
            cloudIcon.style.stroke = 'orange';
        }
    } catch (e) {
        console.error("Error loading API key status:", e);
        statusElement.textContent = 'Error loading key status.';
    }
}


// --- Core Ticker Analysis Function ---
function runTickerAnalysis(ticker) {
    if (!ticker) {
        showNotification('Please enter or select a stock ticker.', 'error');
        return;
    }

    document.getElementById('tickerInput').value = ticker;
    document.getElementById('dcf-container').style.display = 'none';
    document.getElementById('rationaleSection').style.display = 'none';
    document.getElementById('toggleRationale').textContent = 'Show AI Rationale';
    document.getElementById('final-results').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    chrome.runtime.sendMessage({ action: "runValuation", ticker: ticker }, (response) => {
        document.getElementById('loading').style.display = 'none';
        
        if (chrome.runtime.lastError) {
            console.error("Error from background:", chrome.runtime.lastError.message);
            showNotification("An error occurred. Check the service worker console.", "error");
            return;
        }
        
        if (response && response.error) {
             showNotification(`Analysis Error: ${response.error}`, 'error');
        } else if (response && response.dcfParameters) {
            populateDcfInputs(response);
            document.getElementById('dcf-container').style.display = 'block';
            showNotification('DCF Parameters loaded from Gemini.', 'success');
        } else {
            showNotification(`Could not find data for ${ticker}.`, 'error');
        }
    });
}

// --- Populate UI with Gemini Data ---
function populateDcfInputs(data) {
    const params = data.dcfParameters;
    
    // Calculate TTM FCF from quarterly data
    const ttmFcf = params.quarterlyFreeCashFlows.reduce((a, b) => a + b, 0);

    // Store latest price for later calculation
    document.getElementById('calculateButton').dataset.latestPrice = data.latestPrice;

    // Set headers
    document.getElementById('stockHeader').textContent = `${data.ticker} - Current: $${data.latestPrice.toFixed(2)}`;
    document.getElementById('priceInfo').textContent = `As of: ${data.priceDate}`;
    
    // Display quarterly FCF data
    document.getElementById('quarterlyFcfDisplay').textContent = `(Quarters: ${params.quarterlyFreeCashFlows.join(', ')})`;

    // Populate input fields
    document.getElementById('input-ttmFcf').value = ttmFcf.toFixed(2);
    document.getElementById('input-fcfGrowth').value = params.cashFlowGrowthRate.toFixed(4);
    document.getElementById('input-wacc').value = params.wacc.toFixed(4);
    document.getElementById('input-netDebt').value = params.netDebt.toFixed(2);
    document.getElementById('input-shares').value = params.sharesOutstanding.toFixed(2);
    document.getElementById('input-perpGrowth').value = params.perpetualGrowthRate.toFixed(4);
    
    // Store rationale data in the toggle button
    document.getElementById('toggleRationale').dataset.rationale = JSON.stringify(data.rationale);
}

// --- Local DCF Calculation ---
function calculateLocalDcf() {
    try {
        // Read all values from input fields
        const baseFcf = parseFloat(document.getElementById('input-ttmFcf').value);
        const growthRate = parseFloat(document.getElementById('input-fcfGrowth').value);
        const wacc = parseFloat(document.getElementById('input-wacc').value);
        const netDebt = parseFloat(document.getElementById('input-netDebt').value);
        const shares = parseFloat(document.getElementById('input-shares').value);
        const perpGrowth = parseFloat(document.getElementById('input-perpGrowth').value);
        
        const latestPrice = parseFloat(document.getElementById('calculateButton').dataset.latestPrice);

        if ([baseFcf, growthRate, wacc, netDebt, shares, perpGrowth, latestPrice].some(isNaN)) {
            showNotification("All input fields must be valid numbers.", "error");
            return;
        }

        if (wacc <= perpGrowth) {
            showNotification("WACC must be greater than Perpetual Growth Rate.", "error");
            return;
        }

        // --- DCF Calculation Logic ---
        const forecastPeriod = 5;
        let presentValuesSum = 0;

        // 1. Calculate PV of forecasted cash flows
        for (let i = 1; i <= forecastPeriod; i++) {
            const futureFcf = baseFcf * Math.pow(1 + growthRate, i);
            const pv = futureFcf / Math.pow(1 + wacc, i);
            presentValuesSum += pv;
        }

        // 2. Calculate Terminal Value
        const terminalYearFcf = baseFcf * Math.pow(1 + growthRate, forecastPeriod + 1);
        const terminalValue = (terminalYearFcf * (1 + perpGrowth)) / (wacc - perpGrowth);

        // 3. Calculate PV of Terminal Value
        const pvTerminalValue = terminalValue / Math.pow(1 + wacc, forecastPeriod);

        // 4. Calculate Enterprise and Equity Value
        const enterpriseValue = presentValuesSum + pvTerminalValue;
        const equityValue = enterpriseValue - netDebt;
        
        // 5. Calculate Intrinsic Value Per Share
        const intrinsicValuePerShare = equityValue / shares;

        displayFinalResults(intrinsicValuePerShare, latestPrice);
    
    } catch (e) {
        console.error("DCF Calculation Error:", e);
        showNotification(`Calculation Error: ${e.message}`, "error");
    }
}

// --- Display Final Calculated Results ---
function displayFinalResults(intrinsicValue, latestPrice) {
    document.getElementById('intrinsicValue').textContent = `$${intrinsicValue.toFixed(2)}`;
    
    const estimatesList = document.getElementById('newEstimateTargets');
    estimatesList.innerHTML = ''; // Clear previous

    // Calculate progressive targets
    const diff = intrinsicValue - latestPrice;
    const target3m = latestPrice + (diff * 0.25);
    const target6m = latestPrice + (diff * 0.5);
    const target12m = intrinsicValue; // 12-month target is the full intrinsic value

    estimatesList.innerHTML = `
        <li>3-Month Target: <b>$${target3m.toFixed(2)}</b></li>
        <li>6-Month Target: <b>$${target6m.toFixed(2)}</b></li>
        <li>12-Month Target: <b>$${target12m.toFixed(2)}</b></li>
    `;

    document.getElementById('final-results').style.display = 'block';
}

// --- Handle Input Adjustments ---
function adjustInputValue(field, op) {
    const fieldMap = {
        'fcfGrowth': { id: 'input-fcfGrowth', step: 0.005 },
        'wacc': { id: 'input-wacc', step: 0.001 },
        'netDebt': { id: 'input-netDebt', step: 100 },
        'shares': { id: 'input-shares', step: 10 },
        'perpGrowth': { id: 'input-perpGrowth', step: 0.001 }
    };

    const config = fieldMap[field];
    if (!config) return;

    const input = document.getElementById(config.id);
    let value = parseFloat(input.value);
    const step = config.step;

    if (op === '+') {
        value += step;
    } else if (op === '-') {
        value -= step;
    }

    // Fix precision issues
    let decimals = (step.toString().split('.')[1] || []).length;
    input.value = value.toFixed(decimals);
}

// --- Display AI Rationale ---
function displayRationaleDetails(rationale) {
    if (!rationale) return;
    document.getElementById('rationale-cashFlow').textContent = rationale.cashFlow || 'N/A';
    document.getElementById('rationale-netDebt').textContent = rationale.netDebt || 'N/A';
    document.getElementById('rationale-wacc').textContent = rationale.wacc || 'N/A';
    document.getElementById('rationale-shares').textContent = rationale.sharesOutstanding || 'N/A';
    document.getElementById('rationale-perpGrowth').textContent = rationale.perpetualGrowthRate || 'N/A';
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadApiKeyStatus();

    // --- Modal Logic ---
    const modal = document.getElementById('apiKeyModal');
    const cloudIcon = document.getElementById('cloudKeyIcon');
    const closeButton = document.querySelector('.close-button');

    if (cloudIcon) cloudIcon.addEventListener('click', () => { modal.style.display = "block"; });
    if (closeButton) closeButton.addEventListener('click', () => { modal.style.display = "none"; });
    window.addEventListener('click', (event) => {
        if (event.target == modal) modal.style.display = "none";
    });

    // --- Single Stock Analysis Button Logic ---
    document.getElementById('analyzeButton').addEventListener('click', () => {
        const ticker = document.getElementById('tickerInput').value.toUpperCase().trim();
        runTickerAnalysis(ticker);
    });

    // --- API Key Save Button ---
    document.getElementById('saveApiKeyButton').addEventListener('click', async () => {
        const inputElement = document.getElementById('geminiApiKeyInput');
        const key = inputElement.value.trim();
        if (key) {
            await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
             showNotification('Gemini API Key saved successfully!', 'success');
        } else {
            await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
            showNotification('Gemini API Key removed.', 'info');
        }
        inputElement.value = '';
        loadApiKeyStatus();
    });

    // --- Toggle Rationale Logic ---
    document.getElementById('toggleRationale').addEventListener('click', (e) => {
        const section = document.getElementById('rationaleSection');
        const isVisible = section.style.display === 'block';
        
        if (isVisible) {
            section.style.display = 'none';
            e.target.textContent = 'Show AI Rationale';
        } else {
            const rationaleData = JSON.parse(e.target.dataset.rationale || '{}');
            if (Object.keys(rationaleData).length > 0) {
                displayRationaleDetails(rationaleData);
                section.style.display = 'block';
                e.target.textContent = 'Hide AI Rationale';
            } else {
                showNotification("Run an analysis first to see rationale.", "info");
            }
        }
    });

    // --- Local DCF Calculation Button ---
    document.getElementById('calculateButton').addEventListener('click', calculateLocalDcf);

    // --- Parameter Adjustment Buttons ---
    document.getElementById('dcf-inputs').addEventListener('click', (e) => {
        if (e.target.classList.contains('adjust-btn')) {
            const field = e.target.dataset.field;
            const op = e.target.dataset.op;
            adjustInputValue(field, op);
        }
    });
});
