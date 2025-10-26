// popup.js

const API_KEY_STORAGE_KEY = 'geminiCloudApiKey';
const WATCHLIST_KEY = 'watchlistStocks'; // Key for watchlist
const NEWS_CACHE_KEY = 'newsCache'; // NEW: Key for caching news

// NEW: Rules for how long to keep news before refreshing (in milliseconds)
const NEWS_REFRESH_RULES = {
    "12 hours": 2 * 60 * 60 * 1000,   // 2 hours
    "7 days": 24 * 60 * 60 * 1000,  // 24 hours
    "3 months": 7 * 24 * 60 * 60 * 1000 // 7 days
};

// Stores data for the *currently* analyzed stock
let currentStockData = null; 

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
    else if (type === 'info') notification.classList.add('notification-info'); // Use info for removals
    else notification.classList.add('notification-info'); // Default

    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000); // Shortened to 3s
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

    // Reset current data and UI
    currentStockData = null;
    document.getElementById('favorite-heart').style.display = 'none';
    document.getElementById('favorite-heart').classList.remove('favorited');

    document.getElementById('tickerInput').value = ticker;
    document.getElementById('dcf-container').style.display = 'none';
    document.getElementById('rationaleSection').style.display = 'none';
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
            
            // Automatically calculate intrinsic value
            calculateLocalDcf(response.ticker); // Pass ticker for watchlist check
            
            // Automatically display rationale
            const rationaleData = response.rationale;
            if (rationaleData && Object.keys(rationaleData).length > 0) {
                displayRationaleDetails(rationaleData);
                document.getElementById('rationaleSection').style.display = 'block';
            }

            document.getElementById('dcf-container').style.display = 'block';
            showNotification('DCF Parameters & Rationale loaded.', 'success');
        
        } else {
            showNotification(`Could not find data for ${ticker}.`, 'error');
        }
    });
}


// --- Populate UI with Gemini Data ---
function populateDcfInputs(data) {
    const params = data.dcfParameters;
    
    // Store latest price and consensus data for later calculation/display
    document.getElementById('final-results').dataset.latestPrice = data.latestPrice;
    document.getElementById('final-results').dataset.analystConsensus = JSON.stringify(data.analystConsensus);

    // Set headers
    document.getElementById('stockHeader').textContent = `${data.ticker} - Current: $${data.latestPrice.toFixed(2)}`;
    document.getElementById('priceInfo').textContent = `As of: ${data.priceDate}`;
    
    // --- NEW: Store data for watchlist ---
    currentStockData = {
        ticker: data.ticker,
        currentPrice: data.latestPrice,
        priceDate: data.priceDate,
        analystConsensus: data.analystConsensus,
        dcfValue: null, // Will be filled by calculateLocalDcf
        lastUpdated: new Date().toISOString()
    };
    
    // Set dataset for heart icon
    const heart = document.getElementById('favorite-heart');
    heart.dataset.ticker = data.ticker;

    // Populate input fields
    // UFCF Components
    document.getElementById('input-ttmNopat').value = params.ttmNopat.toFixed(2);
    document.getElementById('input-ttmDna').value = params.ttmDepreciationAndAmortization.toFixed(2);
    document.getElementById('input-ttmCapex').value = params.ttmCapitalExpenditures.toFixed(2);
    document.getElementById('input-ttmNwc').value = params.ttmChangeInNetWorkingCapital.toFixed(2);
    document.getElementById('input-ufcfGrowth').value = params.ufcfGrowthRate.toFixed(4);

    // WACC Components
    document.getElementById('input-marketEquity').value = params.marketValueEquity.toFixed(2);
    document.getElementById('input-marketDebt').value = params.marketValueDebt.toFixed(2);
    document.getElementById('input-costEquity').value = params.costOfEquity.toFixed(4);
    document.getElementById('input-costDebt').value = params.costOfDebt.toFixed(4);
    document.getElementById('input-taxRate').value = params.corporateTaxRate.toFixed(4);

    // Equity Value Components
    document.getElementById('input-netDebt').value = params.netDebt.toFixed(2);
    document.getElementById('input-shares').value = params.sharesOutstanding.toFixed(2);
    document.getElementById('input-perpGrowth').value = params.perpetualGrowthRate.toFixed(4);
}

// --- Local DCF Calculation ---
function calculateLocalDcf(ticker) {
    try {
        // === 1. Read all values from input fields ===
        
        // UFCF Components
        const ttmNopat = parseFloat(document.getElementById('input-ttmNopat').value);
        const ttmDna = parseFloat(document.getElementById('input-ttmDna').value);
        const ttmCapex = parseFloat(document.getElementById('input-ttmCapex').value);
        const ttmNwc = parseFloat(document.getElementById('input-ttmNwc').value);
        const ufcfGrowth = parseFloat(document.getElementById('input-ufcfGrowth').value);

        // WACC Components
        const E = parseFloat(document.getElementById('input-marketEquity').value);
        const D = parseFloat(document.getElementById('input-marketDebt').value);
        const Re = parseFloat(document.getElementById('input-costEquity').value);
        const Rd = parseFloat(document.getElementById('input-costDebt').value);
        const t = parseFloat(document.getElementById('input-taxRate').value);

        // Equity Value Components
        const netDebt = parseFloat(document.getElementById('input-netDebt').value);
        const shares = parseFloat(document.getElementById('input-shares').value);
        const perpGrowth = parseFloat(document.getElementById('input-perpGrowth').value);
        
        // UPDATED: Get latestPrice from its new storage location
        const latestPrice = parseFloat(document.getElementById('final-results').dataset.latestPrice);

        // Validate all inputs
        const allInputs = [
            ttmNopat, ttmDna, ttmCapex, ttmNwc, ufcfGrowth,
            E, D, Re, Rd, t,
            netDebt, shares, perpGrowth, latestPrice
        ];

        if (allInputs.some(isNaN)) {
            showNotification("All input fields must be valid numbers.", "error");
            return;
        }

        // === 2. Calculate Base UFCF and WACC ===
        const baseUfcf = ttmNopat + ttmDna - ttmCapex - ttmNwc;
        const V = E + D;
        const wacc = (E/V * Re) + (D/V * Rd * (1 - t));

        if (wacc <= perpGrowth) {
            showNotification("Calculated WACC must be greater than Perpetual Growth Rate.", "error");
            return;
        }

        document.getElementById('baseUfcfValue').textContent = `$${baseUfcf.toFixed(2)}M`;
        document.getElementById('waccValue').textContent = `${(wacc * 100).toFixed(2)}%`;

        // === 3. Run DCF Calculation Logic ===
        const forecastPeriod = 5;
        let presentValuesSum = 0;
        for (let i = 1; i <= forecastPeriod; i++) {
            const futureUfcf = baseUfcf * Math.pow(1 + ufcfGrowth, i);
            const pv = futureUfcf / Math.pow(1 + wacc, i);
            presentValuesSum += pv;
        }
        const lastYearUfcf = baseUfcf * Math.pow(1 + ufcfGrowth, forecastPeriod);
        const terminalValue = (lastYearUfcf * (1 + perpGrowth)) / (wacc - perpGrowth);
        const pvTerminalValue = terminalValue / Math.pow(1 + wacc, forecastPeriod);
        const enterpriseValue = presentValuesSum + pvTerminalValue;
        const equityValue = enterpriseValue - netDebt;
        const intrinsicValuePerShare = equityValue / shares;

        // This function now handles both Intrinsic Value and Analyst Targets
        displayFinalResults(intrinsicValuePerShare, latestPrice);
        
        // --- NEW: Update currentStockData and show heart ---
        if (currentStockData) {
            currentStockData.dcfValue = intrinsicValuePerShare;
        }
        checkWatchlistStatus(ticker); // Check and set heart state
        document.getElementById('favorite-heart').style.display = 'block';
    
    } catch (e) {
        console.error("DCF Calculation Error:", e);
        showNotification(`Calculation Error: ${e.message}`, "error");
    }
}

// --- Display Final Calculated Results ---
function displayFinalResults(intrinsicValue, latestPrice) {
    document.getElementById('intrinsicValue').textContent = `$${intrinsicValue.toFixed(2)}`;
    
    const estimatesList = document.getElementById('analystEstimateTargets');
    estimatesList.innerHTML = ''; // Clear previous

    const consensusData = JSON.parse(document.getElementById('final-results').dataset.analystConsensus || '{}');

    const target3m = consensusData.target_3m || 0.0;
    const target6m = consensusData.target_6m || 0.0;
    const target12m = consensusData.target_12m || 0.0;

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
        'ufcfGrowth': { id: 'input-ufcfGrowth', step: 0.005 },
        'costEquity': { id: 'input-costEquity', step: 0.001 },
        'costDebt': { id: 'input-costDebt', step: 0.001 },
        'taxRate': { id: 'input-taxRate', step: 0.001 },
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

    let decimals = (step.toString().split('.')[1] || []).length;
    input.value = value.toFixed(decimals);
}

// --- Display AI Rationale ---
function displayRationaleDetails(rationale) {
    if (!rationale) return;

    document.getElementById('rationale-megatrends').textContent = rationale.sectoralMegatrends || 'N/A';
    document.getElementById('rationale-swot').textContent = rationale.swotAnalysis || 'N/A';
    document.getElementById('rationale-ufcf').textContent = rationale.ufcfComponents + "\n\n" + rationale.ufcfGrowthRate || 'N/A';
    document.getElementById('rationale-wacc').textContent = rationale.waccComponents || 'N/A';
    document.getElementById('rationale-netDebt').textContent = rationale.netDebt || 'N/A';
    document.getElementById('rationale-shares').textContent = rationale.sharesOutstanding || 'N/A';
    document.getElementById('rationale-perpGrowth').textContent = rationale.perpetualGrowthRate || 'N/A';
    document.getElementById('rationale-analystConsensus').textContent = rationale.analystConsensus || 'N/A';
}

// --- View Navigation ---
function handleNavClick(view) {
    // View containers
    const analysisView = document.getElementById('analysis-view');
    const watchlistView = document.getElementById('watchlist-view');
    const newsView = document.getElementById('news-view');
    
    // Nav buttons
    const navAnalysis = document.getElementById('nav-analysis');
    const navWatchlist = document.getElementById('nav-watchlist');
    const navNews = document.getElementById('nav-news');

    // Hide all views
    analysisView.style.display = 'none';
    watchlistView.style.display = 'none';
    newsView.style.display = 'none';
    
    // Deactivate all nav buttons
    navAnalysis.classList.remove('active');
    navWatchlist.classList.remove('active');
    navNews.classList.remove('active');

    if (view === 'watchlist') {
        watchlistView.style.display = 'block';
        navWatchlist.classList.add('active');
        loadWatchlist(); // Refresh watchlist every time it's viewed
    } else if (view === 'news') {
        newsView.style.display = 'block';
        navNews.classList.add('active');
        
        // --- MODIFIED LOGIC ---
        // Find the currently active sub-nav button
        let activeTimeframe = "12 hours"; // Default
        const activeBtn = document.querySelector('.sub-nav-btn.active');
        if (activeBtn) {
            activeTimeframe = activeBtn.dataset.timeframe;
        } else {
            // Ensure default is marked active if none are
            document.querySelectorAll('.sub-nav-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.timeframe === activeTimeframe);
            });
        }
        
        // Call the new master function to load cache and check for refresh
        loadAndRefreshNews(activeTimeframe);
        // --- END MODIFIED LOGIC ---

    } else { // 'analysis'
        analysisView.style.display = 'block';
        navAnalysis.classList.add('active');
    }
}

// --- Load and Display Watchlist ---
async function loadWatchlist() {
    const content = document.getElementById('watchlist-content');
    content.innerHTML = '<p>Loading watchlist...</p>';

    try {
        const result = await chrome.storage.local.get(WATCHLIST_KEY);
        let watchlist = result[WATCHLIST_KEY] || [];

        if (watchlist.length === 0) {
            content.innerHTML = '<p>Your watchlist is empty. Analyze a stock and click the heart icon to add it.</p>';
            return;
        }

        // Calculate upside and sort
        watchlist.forEach(item => {
            const price = item.currentPrice || 0.01; // Avoid division by zero
            const target12m = item.analystConsensus?.target_12m || 0;
            item.upside = (target12m / price) - 1;
        });

        watchlist.sort((a, b) => b.upside - a.upside); // Sort by highest upside

        // Build HTML table
        let tableHtml = `
            <table class="watchlist-table">
                <thead>
                    <tr>
                        <th>Ticker</th>
                        <th>Price</th>
                        <th>DCF</th>
                        <th>12m Tgt</th>
                        <th>12m Upside</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const item of watchlist) {
            const upsideClass = item.upside >= 0 ? 'watchlist-upside' : 'watchlist-downside';
            const updatedDate = new Date(item.lastUpdated).toLocaleDateString();

            tableHtml += `
                <tr>
                    <td>
                        <b>${item.ticker}</b>
                        <span class="watchlist-date">${updatedDate}</span>
                    </td>
                    <td>$${item.currentPrice.toFixed(2)}</td>
                    <td>$${item.dcfValue.toFixed(2)}</td>
                    <td>$${item.analystConsensus.target_12m.toFixed(2)}</td>
                    <td>
                        <b class="${upsideClass}">${(item.upside * 100).toFixed(1)}%</b>
                    </td>
                    <td>
                        <span class="watchlist-remove" data-ticker="${item.ticker}">&times;</span>
                    </td>
                </tr>
            `;
        }

        tableHtml += '</tbody></table>';
        content.innerHTML = tableHtml;

        // Add event listeners to remove buttons
        document.querySelectorAll('.watchlist-remove').forEach(button => {
            button.addEventListener('click', (e) => {
                const tickerToRemove = e.target.dataset.ticker;
                removeWatchlistItem(tickerToRemove);
            });
        });

    } catch (e) {
        console.error("Error loading watchlist:", e);
        content.innerHTML = '<p>Error loading watchlist.</p>';
        showNotification('Could not load watchlist.', 'error');
    }
}

// --- Remove Item from Watchlist ---
async function removeWatchlistItem(ticker) {
    if (!ticker) return;
    try {
        const result = await chrome.storage.local.get(WATCHLIST_KEY);
        let watchlist = result[WATCHLIST_KEY] || [];
        
        const updatedWatchlist = watchlist.filter(item => item.ticker !== ticker);
        
        await chrome.storage.local.set({ [WATCHLIST_KEY]: updatedWatchlist });
        showNotification(`${ticker} removed from watchlist.`, 'info');
        loadWatchlist(); // Refresh the view
        
        // If the removed item is the one currently being viewed, update the heart
        if (currentStockData && currentStockData.ticker === ticker) {
            document.getElementById('favorite-heart').classList.remove('favorited');
        }

    } catch (e) {
        console.error("Error removing watchlist item:", e);
        showNotification('Error removing item.', 'error');
    }
}


// --- Check Watchlist Status for Current Ticker ---
async function checkWatchlistStatus(ticker) {
    if (!ticker) return;
    try {
        const result = await chrome.storage.local.get(WATCHLIST_KEY);
        const watchlist = result[WATCHLIST_KEY] || [];
        const isFavorited = watchlist.some(item => item.ticker === ticker);
        
        const heart = document.getElementById('favorite-heart');
        if (isFavorited) {
            heart.classList.add('favorited');
        } else {
            heart.classList.remove('favorited');
        }
    } catch (e) {
        console.error("Error checking watchlist status:", e);
    }
}

// --- Handle Favorite (Heart) Click ---
async function handleFavoriteClick() {
    const heart = document.getElementById('favorite-heart');
    const ticker = heart.dataset.ticker;
    
    if (!ticker || !currentStockData || currentStockData.ticker !== ticker) {
        showNotification('Cannot add to watchlist, data is missing.', 'error');
        return;
    }
    
    // Ensure DCF value is calculated
    if (currentStockData.dcfValue === null) {
        showNotification('Please wait for DCF calculation to finish.', 'warning');
        return;
    }

    try {
        const result = await chrome.storage.local.get(WATCHLIST_KEY);
        let watchlist = result[WATCHLIST_KEY] || [];
        
        const isFavorited = watchlist.some(item => item.ticker === ticker);

        if (isFavorited) {
            // Remove it
            const updatedWatchlist = watchlist.filter(item => item.ticker !== ticker);
            await chrome.storage.local.set({ [WATCHLIST_KEY]: updatedWatchlist });
            heart.classList.remove('favorited');
            showNotification(`${ticker} removed from watchlist.`, 'info');
        } else {
            // Add it
            // Update timestamp before saving
            currentStockData.lastUpdated = new Date().toISOString();
            // Remove old entry if it exists (e.g., from a partial add)
            const filteredWatchlist = watchlist.filter(item => item.ticker !== ticker);
            filteredWatchlist.push(currentStockData);
            
            await chrome.storage.local.set({ [WATCHLIST_KEY]: filteredWatchlist });
            heart.classList.add('favorited');
            showNotification(`${ticker} added to watchlist!`, 'success');
        }
    } catch (e) {
        console.error("Error saving to watchlist:", e);
        showNotification('Error updating watchlist.', 'error');
    }
}

// --- NEW: News Tab Logic ---

// --- NEW: Set News Status Icon ---
function setNewsStatusIcon(status) { // 'old', 'updating', 'updated'
    const icon = document.getElementById('news-status-icon');
    if (!icon) return;

    icon.classList.remove('status-updating', 'status-updated');
    icon.title = "News data status: Unknown";

    if (status === 'updating') {
        icon.classList.add('status-updating');
        icon.title = "News data status: Updating in background...";
    } else if (status === 'updated') {
        icon.classList.add('status-updated');
        icon.title = "News data status: Up to date.";
    } else { // 'old' or default
        // No extra class needed, default is red
        icon.title = "News data status: Old. Update may be needed.";
    }
}

// --- NEW: Save News to Cache ---
async function saveNewsToCache(timeframe, newsItems) {
    try {
        const result = await chrome.storage.local.get(NEWS_CACHE_KEY);
        const cache = result[NEWS_CACHE_KEY] || {};
        cache[timeframe] = {
            lastUpdated: new Date().toISOString(),
            newsItems: newsItems
        };
        await chrome.storage.local.set({ [NEWS_CACHE_KEY]: cache });
    } catch (e) {
        console.error("Error saving news to cache:", e);
    }
}

// --- NEW: Load News from Cache ---
async function loadNewsFromCache(timeframe) {
    try {
        const result = await chrome.storage.local.get(NEWS_CACHE_KEY);
        const cache = result[NEWS_CACHE_KEY] || {};
        return cache[timeframe]; // Returns { lastUpdated, newsItems } or undefined
    } catch (e) {
        console.error("Error loading news from cache:", e);
        return undefined;
    }
}

// --- NEW: Master Function to Load and Refresh News ---
async function loadAndRefreshNews(timeframe) {
    const loading = document.getElementById('news-loading');
    const content = document.getElementById('news-content');
    
    // 1. Immediately load from cache
    const cachedData = await loadNewsFromCache(timeframe);
    
    if (cachedData && cachedData.newsItems.length > 0) {
        displayNews(cachedData.newsItems); // Show stale data immediately
        content.style.display = 'block';
        loading.style.display = 'none';
    } else {
        // No cache, show loading
        content.innerHTML = '';
        content.style.display = 'none';
        loading.style.display = 'block';
        setNewsStatusIcon('old'); // No data, so it's 'old'
    }

    // 2. Decide if a fetch is needed
    const now = new Date().getTime();
    const lastUpdated = cachedData ? new Date(cachedData.lastUpdated).getTime() : 0;
    const refreshInterval = NEWS_REFRESH_RULES[timeframe];
    const needsRefresh = (now - lastUpdated > refreshInterval) || !cachedData;

    if (needsRefresh) {
        // 3.a. Fetch in background
        setNewsStatusIcon('updating');
        if (!cachedData) { // Only show loading spinner if we have NO data at all
            loading.style.display = 'block';
            content.style.display = 'none';
        }
        
        chrome.runtime.sendMessage({ action: "getNews", timeframe: timeframe }, async (response) => {
            // This callback runs when the fetch completes
            
            if (chrome.runtime.lastError) {
                console.error("Error from background:", chrome.runtime.lastError.message);
                showNotification("An error occurred. Check the service worker console.", "error");
                if (!cachedData) { // If we had no cache, hide loading and show error
                    loading.style.display = 'none';
                    content.innerHTML = '<p>Error loading news.</p>';
                    content.style.display = 'block';
                }
                setNewsStatusIcon('old'); // Fetch failed, data is old
                return;
            }
            
            if (response && response.error) {
                 showNotification(`News Error: ${response.error}`, 'error');
                 if (!cachedData) {
                    loading.style.display = 'none';
                    content.innerHTML = '<p>Error loading news.</p>';
                    content.style.display = 'block';
                 }
                 setNewsStatusIcon('old');
            } else if (response && response.newsItems) {
                // SUCCESS!
                loading.style.display = 'none';
                content.style.display = 'block';
                
                displayNews(response.newsItems); // Display the new data
                await saveNewsToCache(timeframe, response.newsItems); // Save it
                setNewsStatusIcon('updated'); // Mark as updated
                
                // Only show notification if we *didn't* have a cache
                if (!cachedData) {
                    showNotification(`Top ${response.newsItems.length} news items loaded.`, 'success');
                }
            } else {
                // Empty response
                showNotification('Could not find news.', 'error');
                if (!cachedData) {
                    loading.style.display = 'none';
                    content.innerHTML = '<p>No news items were found.</p>';
                    content.style.display = 'block';
                }
                setNewsStatusIcon('old'); // Failed to get data
            }
        });

    } else {
        // 3.b. No fetch needed, cache is fresh
        setNewsStatusIcon('updated');
        if (loading.style.display === 'block') { // Should only happen if cache was empty but fetch not needed (rare)
             loading.style.display = 'none';
             content.style.display = 'block';
             if(cachedData) displayNews(cachedData.newsItems);
        }
    }
}


// --- UPDATED: 2. Display News ---
function displayNews(newsItems) {
    const content = document.getElementById('news-content');
    content.innerHTML = ''; // Clear previous
    content.style.display = 'block'; // Ensure it's visible

    if (!newsItems || newsItems.length === 0) {
        content.innerHTML = '<p>No news items were found for this period.</p>';
        return;
    }

    for (const item of newsItems) {
        // 1. Format Ticker Links
        let impactTags = '';
        if (item.affectedAssets && item.affectedAssets.length > 0) {
            impactTags = item.affectedAssets.map(asset => {
                const name = asset.name || 'N/A';
                const ticker = asset.ticker;
                
                if (ticker) {
                    // Create a link if ticker exists
                    return `<a href="#" class="news-ticker-link" data-ticker="${ticker}">${name} (${ticker})</a>`;
                } else {
                    // Just a regular span
                    return `<span class="news-impact-tag">${name}</span>`;
                }
            }).join('');
        } else {
            impactTags = '<span class="news-impact-tag">General</span>';
        }

        // 2. Format Datetime
        let formattedDate = 'Date unknown';
        if (item.datetime) {
            try {
                const dateObj = new Date(item.datetime);
                // Format: Oct 26, 11:30 AM
                formattedDate = dateObj.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            } catch (e) {
                console.warn("Could not parse news datetime:", item.datetime, e);
                formattedDate = item.datetime; // Fallback to raw string
            }
        }
        
        // 3. Create HTML
        content.innerHTML += `
            <div class="news-item-card">
                <h5>${item.headline || 'No Headline'}</h5>
                
                <!-- NEW: Source and Date/Time row -->
                <div class="news-meta">
                    <span class="news-source">Source: ${item.source || 'Unknown'}</span>
                    <span class="news-datetime">${formattedDate}</span>
                </div>
                
                <p>${item.summary || 'No summary available.'}</p>
                <span class="news-impact-label">Key Assets Affected:</span>
                ${impactTags}
            </div>
        `;
    }
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

    // --- Single Stock Analysis Button Logic (UPDATED) ---
    document.getElementById('runDcfValuationButton').addEventListener('click', () => {
        const ticker = document.getElementById('tickerInput').value.toUpperCase().trim();
        runTickerAnalysis(ticker);
    });

    // --- API Key Save Button ---
    document.getElementById('saveApiKeyButton').addEventListener('click', async () => {
        const inputElement = document.getElementById('geminiApiKeyInput');
        const key = inputElement.value.trim();
        if (key) {
            await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
             showNotification('Gemini APIKey saved successfully!', 'success');
        } else {
            await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
            showNotification('Gemini API Key removed.', 'info');
        }
        inputElement.value = '';
        loadApiKeyStatus();
    });

    // --- Parameter Adjustment Buttons ---
    document.getElementById('dcf-inputs').addEventListener('click', (e) => {
        if (e.target.classList.contains('adjust-btn')) {
            const field = e.target.dataset.field;
            const op = e.target.dataset.op;
            adjustInputValue(field, op);
        }
    });
    
    // --- View Navigation Listeners ---
    document.getElementById('nav-analysis').addEventListener('click', () => handleNavClick('analysis'));
    document.getElementById('nav-watchlist').addEventListener('click', () => handleNavClick('watchlist'));
    document.getElementById('nav-news').addEventListener('click', () => handleNavClick('news')); // Added

    // --- Heart Icon Listener ---
    document.getElementById('favorite-heart').addEventListener('click', handleFavoriteClick);

    // --- MODIFIED: News Sub-Nav Listeners ---
    document.querySelectorAll('.sub-nav-btn').forEach(button => {
        button.addEventListener('click', () => {
            // Deactivate all
            document.querySelectorAll('.sub-nav-btn').forEach(btn => btn.classList.remove('active'));
            // Activate clicked one
            button.classList.add('active');
            
            // --- MODIFIED CALL ---
            // Fetch news for the selected timeframe
            const timeframe = button.dataset.timeframe;
            loadAndRefreshNews(timeframe); // Use the new master function
            // --- END MODIFIED CALL ---
        });
    });
    
    // --- NEW: News Ticker Link Click Listener (Event Delegation) ---
    document.getElementById('news-content').addEventListener('click', (e) => {
        // Check if the clicked element is a ticker link
        if (e.target.classList.contains('news-ticker-link')) {
            e.preventDefault(); // Stop the link from navigating
            
            const ticker = e.target.dataset.ticker;
            if (ticker) {
                // 1. Set the value in the analysis input
                document.getElementById('tickerInput').value = ticker;
                
                // 2. Switch to the analysis tab
                handleNavClick('analysis');
                
                // 3. Optional: Automatically run the analysis
                // runTickerAnalysis(ticker); 
                // Decided against auto-running to let user click the button.
                
                // 4. Show a notification
                showNotification(`Loaded ${ticker}. Click 'Run DCF Valuation' to analyze.`, 'info');
            }
        }
    });
});
