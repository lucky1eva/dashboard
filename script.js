console.log('Website script loaded');

// =================================================================================
// Clinical Trials Dashboard - Evidence-Radar
// =================================================================================

// --- Global State ---
let allStudies = [];
let filteredStudies = [];
let currentCategory = 'overview';
let selectedForCompare = new Set();
let chartInstances = {};
const chartColors = ['#2c3e50', '#3498db', '#95a5a6', '#f1c40f', '#e74c3c', '#2ecc71'];

// --- Utility Functions ---
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

const getStudyCondition = (study) => {
    if (!study || !study.population) return 'Unknown';
    const pop = typeof study.population === 'string' ? JSON.parse(study.population || '{}') : study.population;
    return pop.condition || 'Unknown';
};

const getActiveContainers = () => {
    const section = document.querySelector('.content-section.active');
    return {
        section,
        cards: section.querySelector('.study-cards-grid'),
        noResults: section.querySelector('.no-results'),
        categoryTitle: section.querySelector('.category-title'),
    };
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.dashboard-container')) {
        initializeApp();
    }
});

async function initializeApp() {
    const style = document.createElement('style');
    style.innerHTML = `
        .content-section { display: none; }
        .content-section.active { display: block; }
    `;
    document.head.appendChild(style);

    showLoading(true);
    try {
        await loadStudies('data/manifest.json');
        initializeEventListeners();
        populateFilters();
        renderDashboard();
    } catch (error) {
        console.error('Dashboard initialization failed:', error);
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

async function loadStudies(manifestPath) {
    const cacheBuster = `?v=${new Date().getTime()}`;
    
    const manifestResponse = await fetch(`${manifestPath}${cacheBuster}`);
    if (!manifestResponse.ok) throw new Error('Manifest file (manifest.json) not found.');
    const manifest = await manifestResponse.json();
    if (!manifest.files?.length) throw new Error('No study files found in manifest.');

    const studyPromises = manifest.files.map(async (filename) => {
        try {
            const res = await fetch(`data/${filename}${cacheBuster}`);
            if (!res.ok) throw new Error(`Failed to load ${filename}`);
            const data = await res.json();
            data._id = data.study_id || filename;
            return data;
        } catch (e) {
            console.error(`Error processing ${filename}:`, e);
            return null;
        }
    });
    const results = await Promise.all(studyPromises);
    allStudies = results.filter(study => study);
    filteredStudies = [...allStudies];
    if (!allStudies.length) throw new Error('All study files failed to load.');
}


function initializeEventListeners() {
    document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', () => switchCategory(button.dataset.category));
    });
    const debouncedFilter = debounce(applyFilters, 300);
    ['searchInput', 'yearFilter', 'designFilter', 'conditionFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(id === 'searchInput' ? 'input' : 'change', debouncedFilter);
    });
    document.getElementById('clearFilters')?.addEventListener('click', clearAllFilters);
    document.getElementById('compareStudiesBtn')?.addEventListener('click', showComparisonModal);
    document.getElementById('clearCompareBtn')?.addEventListener('click', clearCompareSelection);
    document.getElementById('closeComparePanelBtn')?.addEventListener('click', () => toggleComparePanel(false));
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => (e.target === modal && closeModal(modal.id)));
        modal.querySelector('.close-modal')?.addEventListener('click', () => closeModal(modal.id));
    });
    document.addEventListener('keydown', (e) => (e.key === 'Escape' && document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id))));
}

// --- Data Population & Filtering ---
function populateFilters() {
    const years = [...new Set(allStudies.map(s => s.study_characteristics?.publication_year).filter(Boolean))].sort((a, b) => b - a);
    const designs = [...new Set(allStudies.map(s => s.study_characteristics?.design).filter(Boolean))].sort();
    const conditions = [...new Set(allStudies.map(getStudyCondition).filter(Boolean))].sort();
    populateSelect('yearFilter', years);
    populateSelect('designFilter', designs);
    populateSelect('conditionFilter', conditions);
}

function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    options.forEach(option => select.add(new Option(option, option)));
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const year = document.getElementById('yearFilter').value;
    const design = document.getElementById('designFilter').value;
    const condition = document.getElementById('conditionFilter').value;
    filteredStudies = allStudies.filter(study =>
        (!searchTerm || (study.study_characteristics?.title || '').toLowerCase().includes(searchTerm) || getStudyCondition(study).toLowerCase().includes(searchTerm)) &&
        (!year || study.study_characteristics?.publication_year == year) &&
        (!design || study.study_characteristics?.design == design) &&
        (!condition || getStudyCondition(study) == condition)
    );
    renderDashboard();
}

function clearAllFilters() {
    ['searchInput', 'yearFilter', 'designFilter', 'conditionFilter'].forEach(id => document.getElementById(id).value = '');
    filteredStudies = [...allStudies];
    renderDashboard();
}

// --- Main Rendering Logic ---
function renderDashboard() {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const isOverview = currentCategory === 'overview';
    document.getElementById('overview-section').classList.toggle('active', isOverview);
    document.getElementById('dynamic-section').classList.toggle('active', !isOverview);
    
    if (isOverview) {
        renderOverview();
    } else {
        renderCategoryPage();
    }
}

function switchCategory(category) {
    currentCategory = category;
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.toggle('active', btn.dataset.category === category));
    renderDashboard();
}

// --- Page-Specific Rendering ---
function renderOverview() {
    updateOverviewKPIs();
    renderOverviewCharts();
    updateCategoryHeader();
    renderStudyCards();
}

function renderCategoryPage() {
    const chartsGrid = document.getElementById('dynamic-charts-grid');
    chartsGrid.innerHTML = '';
    
    switch (currentCategory) {
        case 'study_characteristics':
            renderStudyCharacteristicsPage(chartsGrid);
            break;
        case 'population':
            renderPopulationPage(chartsGrid);
            break;
        case 'intervention':
            renderInterventionPage(chartsGrid);
            break;
        case 'outcomes':
            renderOutcomesPage(chartsGrid);
            break;
    }

    chartsGrid.style.display = chartsGrid.hasChildNodes() ? 'grid' : 'none';
    updateCategoryHeader();
    renderStudyCards();
}

// --- KPI & Header Updates ---
function updateOverviewKPIs() {
    const total = filteredStudies.length;
    const participants = filteredStudies.reduce((sum, s) => sum + (s.study_characteristics?.sample_size || 0), 0);
    const years = filteredStudies.map(s => s.study_characteristics?.publication_year).filter(Boolean);
    const yearRange = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '-';
    const avgSize = total > 0 ? Math.round(participants / total).toLocaleString() : 0;
    document.getElementById('overviewStudies').textContent = total.toLocaleString();
    document.getElementById('overviewParticipants').textContent = participants.toLocaleString();
    document.getElementById('overviewYears').textContent = yearRange;
    document.getElementById('overviewAvgSize').textContent = avgSize;
}

function updateCategoryHeader() {
    const titles = {
        overview: 'Studies',
        study_characteristics: 'Study Characteristics',
        population: 'Population',
        intervention: 'Interventions',
        outcomes: 'Outcomes'
    };
    const { categoryTitle } = getActiveContainers();
    if (categoryTitle) categoryTitle.textContent = titles[currentCategory] || 'Studies';
}

// --- Generic Component Creation ---
function renderStudyCards() {
    const { cards, noResults } = getActiveContainers();
    if (!cards || !noResults) return;
    cards.innerHTML = '';
    noResults.style.display = filteredStudies.length ? 'none' : 'block';
    if (filteredStudies.length) {
        filteredStudies.forEach(study => cards.appendChild(createStudyCard(study)));
    }
}

function createStudyCard(study) {
    const card = document.createElement('div');
    card.className = 'study-card';
    const sc = study.study_characteristics || {};
    const primaryOutcome = Array.isArray(study.outcomes) 
        ? (study.outcomes.find(o => o.primary)?.name || study.outcomes[0]?.name) 
        : study.outcomes?.primary_outcome;
    
    const dataHTML = `
        <div class="data-item"><strong>Condition:</strong> ${getStudyCondition(study) || 'N/A'}</div>
        <div class="data-item"><strong>Primary Outcome:</strong> ${primaryOutcome || 'N/A'}</div>`;
    
    card.innerHTML = `
        <div class="study-card-header">
            <h3 class="study-title">${sc.title || 'Untitled Study'}</h3>
            <div class="study-meta">
                <span>${sc.publication_year || 'N/A'}</span>
                <span>${sc.design || 'N/A'}</span>
                <span>n=${sc.sample_size?.toLocaleString() || 'N/A'}</span>
            </div>
        </div>
        <div class="study-card-body">${dataHTML}</div>
        <div class="study-card-footer">
            <label class="compare-checkbox-container">
                <input type="checkbox" data-study-id="${study._id}" ${selectedForCompare.has(study._id) ? 'checked' : ''}> Add to Compare
            </label>
        </div>`;
    card.querySelector('.study-title').addEventListener('click', () => openStudyModal(study));
    card.querySelector('input[type="checkbox"]').addEventListener('change', e => toggleCompareSelection(e.target.dataset.studyId, e.target.checked));
    return card;
}

// --- Category-Specific Page Renderers ---

function renderStudyCharacteristicsPage(grid) {
    const trials = filteredStudies.filter(s => {
        const design = s.study_characteristics?.design?.toLowerCase();
        if (!design || !s.study_characteristics.sample_size) return false;

        const isTrial = design.includes('randomised') || design.includes('randomized') || design.includes('rct') || design.includes('trial');
        const isExcluded = design.includes('economic') || design.includes('cost-effectiveness') || design.includes('model');

        return isTrial && !isExcluded;
    }).sort((a, b) => b.study_characteristics.sample_size - a.study_characteristics.sample_size);
    
    if (trials.length > 0) {
        const canvas = createChartContainer(grid, 'Sample Size of Randomised Trials', '', 'sampleSizeChart');
        createChart(canvas, 'bar', {
            labels: trials.map(s => (s.study_characteristics.title || 'Untitled').substring(0, 40) + '...'),
            datasets: [{
                label: 'Sample Size',
                data: trials.map(s => s.study_characteristics.sample_size),
                backgroundColor: chartColors[0]
            }]
        }, { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } });
    } else {
         const container = createChartContainer(grid, 'Sample Size of Randomised Trials', '', 'sampleSizeChart');
         container.parentElement.innerHTML += '<p style="text-align: center;">No trial data available for selected filters.</p>';
    }

    const durationData = aggregateData(s => s.study_characteristics?.follow_up_duration_month);
    if (durationData.length > 0) {
        const canvas = createChartContainer(grid, 'Study Follow-up Duration (Months)', '', 'durationChart');
        createChart(canvas, 'doughnut', {
            labels: durationData.map(i => `${i[0]}`),
            datasets: [{ data: durationData.map(i => i[1]), backgroundColor: chartColors }]
        }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } });
    }
}

function renderPopulationPage(grid) {
    const genderStudies = filteredStudies
        .filter(s => s.population?.sex_ratio_male !== undefined && s.population?.sex_ratio_male !== null)
        .sort((a, b) => b.population.sex_ratio_male - a.population.sex_ratio_male);

    if (genderStudies.length > 0) {
        const canvas = createChartContainer(grid, 'Male Sex Ratio by Study', '', 'genderRatioChart');
        createChart(canvas, 'bar', {
            labels: genderStudies.map(s => (s.study_characteristics.title || 'Untitled').substring(0, 40) + '...'),
            datasets: [{
                label: 'Male Sex Ratio',
                data: genderStudies.map(s => s.population.sex_ratio_male),
                backgroundColor: chartColors[1]
            }]
        }, { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } });
    }

    const ageData = filteredStudies.map(s => ({
            name: s.population?.name || 'N/A',
            condition: s.population?.condition || 'N/A',
            age: s.population?.target_population_age || 'N/A'
    })).filter(r => r.age !== 'N/A');

    if (ageData.length > 0) {
        createHtmlTable(grid, 'Population Age Details', ['Name', 'Condition', 'Target Age'], ageData.map(d => [d.name, d.condition, d.age]));
    }
}

function renderInterventionPage(grid) {
    const interventionData = filteredStudies.flatMap(s => s.interventions || []);
    const typeData = aggregateData(i => i.intervention_type, interventionData);
    if (typeData.length) {
        const canvas = createChartContainer(grid, 'Intervention Types', '', 'intTypeChart');
        createChart(canvas, 'doughnut', {
            labels: typeData.map(i => i[0]),
            datasets: [{ data: typeData.map(i => i[1]), backgroundColor: chartColors }]
        }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } });
    }

    const treatmentData = aggregateData(i => i.treatment, interventionData).slice(0, 10);
    if (treatmentData.length) {
        const canvas = createChartContainer(grid, 'Top 10 Interventions', '', 'topIntChart');
        createChart(canvas, 'bar', {
            labels: treatmentData.map(i => i[0]),
            datasets: [{ data: treatmentData.map(i => i[1]), backgroundColor: chartColors[1] }]
        }, { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } });
    }
}

function renderOutcomesPage(grid) {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const year = document.getElementById('yearFilter').value;
    const condition = document.getElementById('conditionFilter').value;

    const relevantStudies = allStudies.filter(study =>
        (!searchTerm || (study.study_characteristics?.title || '').toLowerCase().includes(searchTerm) || getStudyCondition(study).toLowerCase().includes(searchTerm)) &&
        (!year || study.study_characteristics?.publication_year == year) &&
        (!condition || getStudyCondition(study) == condition)
    );

    const modelParamDataByCurrency = {};
    const directCostsData = [];

    for (const study of relevantStudies) {
        const studyTitle = study.study_characteristics?.title || 'Untitled Study';
        const truncatedTitle = studyTitle.length > 50 ? studyTitle.substring(0, 50) + '...' : studyTitle;

        if (study.economic_data) {
            const params = study.economic_data.model_parameters;
            const icerAnalysis = study.economic_data.icer_analysis;
            const currency = params?.currency_code || icerAnalysis?.currency_code || 'UNKNOWN';
            
            const icerValue = params?.ICER ?? icerAnalysis?.icer_value;
            const wtpValue = params?.WTP_threshold;

            if (icerValue !== undefined || wtpValue !== undefined) {
                if (!modelParamDataByCurrency[currency]) {
                    modelParamDataByCurrency[currency] = { labels: [], icer: [], wtp: [] };
                }
                modelParamDataByCurrency[currency].labels.push(truncatedTitle);
                modelParamDataByCurrency[currency].icer.push(icerValue ?? 0);
                modelParamDataByCurrency[currency].wtp.push(wtpValue ?? 0);
            }

            if (Array.isArray(study.economic_data.direct_medical) && study.economic_data.direct_medical.length > 0) {
                study.economic_data.direct_medical.forEach(cost => {
                    directCostsData.push([
                        studyTitle,
                        cost.cost_type || 'N/A',
                        `${cost.value?.toLocaleString() || 'N/A'} ${params?.currency_code || ''}`.trim()
                    ]);
                });
            }
        }
    }

    let wasDataFound = false;

    // Render Model Parameter Charts
    for (const currency in modelParamDataByCurrency) {
        if (modelParamDataByCurrency[currency].labels.length > 0) {
            wasDataFound = true;
            const data = modelParamDataByCurrency[currency];
            const canvas = createChartContainer(grid, `Model Parameters (Unit: ${currency})`, '', `modelParamsChart-${currency}`);
            
            if(canvas) {
                canvas.parentElement.style.gridColumn = '1 / -1';
            }

            createChart(canvas, 'bar', {
                labels: data.labels,
                datasets: [
                    { label: 'ICER', data: data.icer, backgroundColor: chartColors[0] },
                    { label: 'WTP Threshold', data: data.wtp, backgroundColor: chartColors[1] }
                ]
            }, { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { ticks: { beginAtZero: true } } } });
        }
    }

    // Render Direct Costs Table
    if (directCostsData.length > 0) {
        wasDataFound = true;
        createHtmlTable(grid, 'Direct Medical Costs', ['Study', 'Cost Type', 'Value'], directCostsData);
    }
    
    if (!wasDataFound) {
        grid.innerHTML = '<div class="chart-container" style="text-align: center; padding: 20px; grid-column: 1 / -1;"><p>No specific economic data found for the selected filters.</p></div>';
    }
}


// --- Chart & Table Helpers ---
const aggregateData = (keyFn, data = filteredStudies) => {
    const counts = data.reduce((acc, item) => {
        const key = keyFn(item);
        if (key && key !== 'Unknown' && key !== 'N/A') {
            acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
};

function createChart(canvas, type, data, options) {
    if (!canvas) return;
    if (chartInstances[canvas.id]) chartInstances[canvas.id].destroy();
    chartInstances[canvas.id] = new Chart(canvas, { type, data, options });
}

function createChartContainer(grid, title, iconSVG, canvasId) {
    const container = document.createElement('div');
    container.className = 'chart-container';
    container.innerHTML = `<h3>${iconSVG}${title}</h3><canvas id="${canvasId}"></canvas>`;
    grid.appendChild(container);
    return container.querySelector('canvas');
}

function createHtmlTable(grid, title, headers, rows) {
    const tableHtml = `
        <div class="table-wrapper">
            <table class="dashboard-table">
                <thead>
                    <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    const container = document.createElement('div');
    container.className = 'chart-container table-container';
    container.innerHTML = `<h3>${title}</h3>${tableHtml}`;
    grid.appendChild(container);
    if (!document.getElementById('dashboard-table-styles')) {
        const style = document.createElement('style');
        style.id = 'dashboard-table-styles';
        style.innerHTML = `
            .table-container { display: flex; flex-direction: column; grid-column: 1 / -1; height: 420px; }
            .table-wrapper { overflow: auto; height: 100%; }
            .dashboard-table { width: 100%; border-collapse: collapse; font-size: 14px; }
            .dashboard-table th, .dashboard-table td { padding: 8px 12px; border: 1px solid var(--db-border); text-align: left; vertical-align: top;}
            .dashboard-table th { background-color: var(--db-bg); font-weight: 600; position: sticky; top: 0; }
            .dashboard-table tr:nth-child(even) { background-color: #f8f9fa; }
        `;
        document.head.appendChild(style);
    }
}

// --- Overview Page Charts ---
function renderOverviewCharts() {
    createGeographyChart();
    createDesignsChart();
    createConditionsChart();
    createOutcomesList();
}

// CORRECTED: This function robustly groups and normalizes geographic locations.
function createGeographyChart() {
    // This helper function normalizes a single place name.
    const normalizeSingleLocation = (locPart) => {
        if (!locPart) return null;
        const lower = locPart.toLowerCase().trim();

        // UK Aliases
        if (lower === 'uk' || lower === 'united kingdom' || lower === 'england' || lower.endsWith(', uk')) {
            return 'UK';
        }
        // USA Aliases
        if (lower === 'us' || lower === 'usa' || lower === 'united states' || lower.endsWith(', usa') || lower.endsWith(', us')) {
            return 'USA';
        }
        // China Aliases
        if (lower === 'cn' || lower === 'china' || lower.endsWith(', china')) {
            return 'China';
        }
        // Korea Aliases
        if (lower === 'korea' || lower.endsWith(', korea')) {
            return 'Korea';
        }
        // France Aliases
        if (lower === 'france' || lower.endsWith(', france')) {
            return 'France';
        }
        // Return the original, trimmed location if no specific rule applies.
        return locPart.trim();
    };

    const geoCounts = filteredStudies.reduce((acc, study) => {
        const locationStr = study.study_characteristics?.geographic_location;
        if (locationStr) {
            // Split the string by common delimiters like 'and', ',', ';'
            const locations = locationStr.split(/ and |;/);
            const uniqueNormalizedLocations = new Set();

            locations.forEach(part => {
                const trimmedPart = part.trim();
                if (trimmedPart) { // Ensure the part is not an empty string
                    const normalized = normalizeSingleLocation(trimmedPart);
                    if (normalized) {
                        uniqueNormalizedLocations.add(normalized);
                    }
                }
            });

            // Add counts for each unique normalized location found in the study
            uniqueNormalizedLocations.forEach(loc => {
                acc[loc] = (acc[loc] || 0) + 1;
            });
        }
        return acc;
    }, {});

    if (Object.keys(geoCounts).length === 0) return;
    const data = Object.entries(geoCounts).sort((a, b) => b[1] - a[1]);

    createChart(document.getElementById('geoChart'), 'bar', {
        labels: data.map(i => i[0]),
        datasets: [{ data: data.map(i => i[1]), backgroundColor: chartColors, borderRadius: 6 }]
    }, { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } });
}


function createDesignsChart() {
    const normalizeDesign = (design) => {
        if (!design) return 'Other';
        const d = design.toLowerCase();
        if (d.includes('randomized') || d.includes('randomised') || d.includes('controlled')) return 'RCT';
        if (d.includes('model') || d.includes('cost-effectiveness')) return 'CEA';
        return design;
    };
    const data = aggregateData(s => normalizeDesign(s.study_characteristics?.design));
    if (data.length === 0) return;
    createChart(document.getElementById('designsChart'), 'pie', {
        labels: data.map(i => i[0]),
        datasets: [{ data: data.map(i => i[1]), backgroundColor: chartColors }]
    }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } });
}

function createConditionsChart() {
    const data = aggregateData(getStudyCondition).slice(0, 5);
    if (data.length === 0) return;
    createChart(document.getElementById('conditionsChart'), 'bar', {
        labels: data.map(i => i[0]),
        datasets: [{ data: data.map(i => i[1]), backgroundColor: chartColors[1], borderRadius: 6 }]
    }, { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } });
}

function createOutcomesList() {
    const listContainer = document.getElementById('outcomesList');
    if(!listContainer) return;
    const outcomeData = filteredStudies.flatMap(s => s.outcomes || []);
    const data = aggregateData(o => o.name || o.primary_outcome, outcomeData);
    listContainer.innerHTML = data.length ? data.map(([name, count]) => `<div class="outcome-item"><div class="outcome-text">${name}</div><div class="outcome-count">${count}</div></div>`).join('') : '<p>No outcome data.</p>';
}

// --- Modals, Compare, and other UI State Functions ---
const toggleSidebar = () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    setTimeout(() => Object.values(chartInstances).forEach(c => c && c.resize()), 300);
};
const showLoading = isLoading => {
    const loader = document.getElementById('loadingSpinner');
    if(loader) loader.style.display = isLoading ? 'flex' : 'none';
};
const toggleComparePanel = show => {
    const panel = document.getElementById('comparePanel');
    if(panel) panel.classList.toggle('active', show);
};
const openModal = modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};
const closeModal = modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};
function showError(message) {
    const dashboardContainer = document.querySelector('.dashboard-container');
    if (!dashboardContainer) return;
    dashboardContainer.innerHTML = `<div class="error-message"><h3>Error</h3><p>${message}</p><button onclick="location.reload()">Reload Page</button></div>`;
    const style = document.createElement('style');
    style.textContent = `.error-message { text-align: center; padding: 2rem; border-top: 4px solid var(--db-accent); background: var(--db-card-bg); }`;
    document.head.appendChild(style);
}
function toggleCompareSelection(studyId, isSelected) {
    if (isSelected) {
        if (selectedForCompare.size < 3) selectedForCompare.add(studyId);
        else {
            alert('You can only compare up to 3 studies at a time.');
            document.querySelector(`input[data-study-id="${studyId}"]`).checked = false;
        }
    } else selectedForCompare.delete(studyId);
    updateComparePanel();
}
function updateComparePanel() {
    const count = selectedForCompare.size;
    toggleComparePanel(count > 0);
    const countEl = document.getElementById('compareCount');
    const btnEl = document.getElementById('compareStudiesBtn');
    if(countEl) countEl.textContent = count;
    if(btnEl) btnEl.disabled = count < 2;
}
function clearCompareSelection() {
    selectedForCompare.clear();
    document.querySelectorAll('input[type="checkbox"][data-study-id]').forEach(cb => cb.checked = false);
    updateComparePanel();
}

function openStudyModal(study) {
    document.getElementById('modalTitle').textContent = study.study_characteristics?.title || 'Study Details';
    const contentEl = document.getElementById('studyContent');
    const formatObject = (obj) => {
        if (obj === null || obj === undefined) return 'N/A';
        if (typeof obj !== 'object') return String(obj);

        if (Array.isArray(obj)) {
            return obj.map(item => `<div class="modal-grid" style="border: 1px solid #eee; margin-top: 5px; padding: 5px;">${formatObject(item)}</div>`).join('');
        }

        return Object.entries(obj).map(([key, value]) => {
            const formattedValue = (value !== null && typeof value === 'object')
                ? `<div style="padding-left: 15px;">${formatObject(value)}</div>`
                : (String(value) || 'N/A');
            return `<div><strong>${key.replace(/_/g, ' ')}:</strong> ${formattedValue}</div>`;
        }).join('');
    };
    contentEl.innerHTML = `
        <div class="modal-section"><h3>Study Characteristics</h3><div class="modal-grid">${formatObject(study.study_characteristics)}</div></div>
        <div class="modal-section"><h3>Population</h3><div class="modal-grid">${formatObject(study.population)}</div></div>
        <div class="modal-section"><h3>Interventions</h3><div class="modal-grid">${formatObject(study.interventions)}</div></div>
        <div class="modal-section"><h3>Clinical Outcomes</h3><div class="modal-grid">${formatObject(study.outcomes)}</div></div>
        <div class="modal-section"><h3>Economic Data</h3><div class="modal-grid">${formatObject(study.economic_data)}</div></div>`;
    openModal('studyModal');
}

function showComparisonModal() {
    const studiesToCompare = [...selectedForCompare].map(id => allStudies.find(s => s._id === id));
    const contentEl = document.getElementById('comparisonContent');
    const headers = studiesToCompare.map(s => `<th>${(s.study_characteristics?.title || 'Untitled').substring(0,50)}...</th>`).join('');
    const getRow = (label, keyFn) => `<tr><td><strong>${label}</strong></td>${studiesToCompare.map(s => `<td>${keyFn(s) || 'N/A'}</td>`).join('')}</tr>`;
    contentEl.innerHTML = `
        <table class="comparison-table">
            <thead><tr><th>Characteristic</th>${headers}</tr></thead>
            <tbody>
                ${getRow('Publication Year', s => s.study_characteristics?.publication_year)}
                ${getRow('Design', s => s.study_characteristics?.design)}
                ${getRow('Sample Size', s => s.study_characteristics?.sample_size?.toLocaleString())}
                ${getRow('Condition', s => getStudyCondition(s))}
                ${getRow('Primary Outcome', s => Array.isArray(s.outcomes) ? (s.outcomes.find(o => o.primary)?.name || s.outcomes[0]?.name) : s.outcomes?.primary_outcome)}
                ${getRow('Intervention', s => (Array.isArray(s.interventions) && s.interventions.length > 0 ? s.interventions[0]?.treatment : 'N/A'))}
            </tbody>
        </table>`;
    openModal('comparisonModal');
}