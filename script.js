// =================================================================================
// Clinical Trials Dashboard - Evidence-Radar
// =================================================================================

// --- Global State ---
let allStudies = [];
let filteredStudies = [];
let currentCategory = 'overview';
let selectedForCompare = new Set();
let chartInstances = {};

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
        resultsInfo: section.querySelector('.results-info'),
        categoryTitle: section.querySelector('.category-title'),
    };
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    showLoading(true);
    try {
        await loadStudies();
        initializeEventListeners();
        populateFilters();
        renderDashboard();
    } catch (error) {
        console.error('Initialization failed:', error);
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

async function loadStudies() {
    const manifestResponse = await fetch('data/manifest.json');
    if (!manifestResponse.ok) throw new Error('Manifest file (manifest.json) not found.');
    const manifest = await manifestResponse.json();
    if (!manifest.files?.length) throw new Error('No study files found in manifest.');

    const studyPromises = manifest.files.map(async (filename) => {
        try {
            const res = await fetch(`data/${filename}`);
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
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
        modal.querySelector('.close-modal')?.addEventListener('click', () => closeModal(modal.id));
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id));
    });
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

    filteredStudies = allStudies.filter(study => {
        const title = (study.study_characteristics?.title || '').toLowerCase();
        return (!searchTerm || title.includes(searchTerm) || getStudyCondition(study).toLowerCase().includes(searchTerm)) &&
            (!year || study.study_characteristics?.publication_year == year) &&
            (!design || study.study_characteristics?.design == design) &&
            (!condition || getStudyCondition(study) == condition);
    });
    renderDashboard();
}

function clearAllFilters() {
    ['searchInput', 'yearFilter', 'designFilter', 'conditionFilter'].forEach(id => document.getElementById(id).value = '');
    filteredStudies = [...allStudies];
    renderDashboard();
}

// --- Main Rendering Logic ---
function renderDashboard() {
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

function renderOverview() {
    updateOverviewKPIs();
    renderOverviewCharts();
    updateCategoryHeader();
    renderStudyCards();
}

function renderCategoryPage() {
    updateCategoryHeader();
    renderStudyCards();
}

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

function renderOverviewCharts() {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    createGeographyChart();
    createDesignsChart();
    createConditionsChart();
    createOutcomesList();
}

function updateCategoryHeader() {
    const titles = {
        overview: 'Studies',
        study_characteristics: 'Study Characteristics',
        population: 'Population Details',
        intervention: 'Interventions',
        outcomes: 'Outcomes'
    };
    const { categoryTitle } = getActiveContainers();
    if (categoryTitle) categoryTitle.textContent = titles[currentCategory] || 'Studies';
}

function renderStudyCards() {
    const { cards, noResults } = getActiveContainers();
    if (!cards || !noResults) return;
    cards.innerHTML = '';
    noResults.style.display = filteredStudies.length ? 'none' : 'block';
    if (filteredStudies.length) {
        filteredStudies.forEach(study => cards.appendChild(createStudyCard(study, currentCategory)));
    }
}

// --- Component & Chart Creation ---
function createStudyCard(study, category) {
    const card = document.createElement('div');
    card.className = 'study-card';
    const sc = study.study_characteristics || {};
    let dataHTML = '';

    switch (category) {
        case 'study_characteristics':
            dataHTML = `<div class="data-item"><strong>Location:</strong> ${sc.geographic_location || 'N/A'}</div><div class="data-item"><strong>Phase:</strong> ${sc.phase || 'N/A'}</div>`;
            break;
        case 'population':
            const pop = (typeof study.population === 'string' ? JSON.parse(study.population || '{}') : study.population) || {};
            dataHTML = `<div class="data-item"><strong>Condition:</strong> ${pop.condition || 'N/A'}</div><div class="data-item"><strong>Age Range:</strong> ${pop.age_range || 'N/A'}</div>`;
            break;
        case 'intervention':
            const int = Array.isArray(study.interventions) ? study.interventions[0] || {} : {};
            dataHTML = `<div class="data-item"><strong>Name:</strong> ${int.treatment || 'N/A'}</div><div class="data-item"><strong>Dosage:</strong> ${int.dose || 'N/A'}</div>`;
            break;
        case 'outcomes':
            const out = Array.isArray(study.outcomes) ? study.outcomes[0] || {} : study.outcomes || {};
            dataHTML = `<div class="data-item"><strong>Primary:</strong> ${out.name || out.primary_outcome || 'N/A'}</div><div class="data-item"><strong>Time Point:</strong> ${out.time_point || 'N/A'}</div>`;
            break;
        default: // Overview
            const primaryOutcome = Array.isArray(study.outcomes) ? (study.outcomes.find(o => o.primary)?.name || study.outcomes[0]?.name) : study.outcomes?.primary_outcome;
            dataHTML = `<div class="data-item"><strong>Condition:</strong> ${getStudyCondition(study) || 'N/A'}</div><div class="data-item"><strong>Primary Outcome:</strong> ${primaryOutcome || 'N/A'}</div>`;
            break;
    }
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
                <input type="checkbox" data-study-id="${study._id}" ${selectedForCompare.has(study._id) ? 'checked' : ''}>
                Add to Compare
            </label>
        </div>`;
    card.querySelector('.study-title').addEventListener('click', () => openStudyModal(study));
    card.querySelector('input[type="checkbox"]').addEventListener('change', e => toggleCompareSelection(e.target.dataset.studyId, e.target.checked));
    return card;
}

function createChart(canvasId, type, data, options) {
    const ctx = document.getElementById(canvasId);
    if (ctx) chartInstances[canvasId] = new Chart(ctx, { type, data, options });
}

function createGeographyChart() {
    const locations = filteredStudies.reduce((acc, s) => {
        const loc = s.study_characteristics?.geographic_location || 'Unknown';
        if (loc !== 'Unknown') acc[loc] = (acc[loc] || 0) + 1;
        return acc;
    }, {});
    const sorted = Object.entries(locations).sort((a, b) => b[1] - a[1]);
    const chartColors = ['#00274C', '#4A90E2', '#7BAEE0', '#A8C9EC', '#FFD700', '#FDB813'];
    createChart('geoChart', 'bar', {
        labels: sorted.map(item => item[0]),
        datasets: [{
            data: sorted.map(item => item[1]),
            backgroundColor: chartColors,
            borderRadius: 6
        }]
    }, { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } });
}

function createDesignsChart() {
    const designs = filteredStudies.reduce((acc, study) => {
        let design = study.study_characteristics?.design || 'Unknown';
        if (design.toLowerCase().includes('rct')) design = 'RCT';
        acc[design] = (acc[design] || 0) + 1;
        return acc;
    }, {});
    const chartColors = ['#00274C', '#4A90E2', '#7BAEE0', '#FFD700', '#ADB5BD'];
    createChart('designsChart', 'pie', {
        labels: Object.keys(designs),
        datasets: [{
            data: Object.values(designs),
            backgroundColor: chartColors
        }]
    }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } });
}

function createConditionsChart() {
    const conditions = filteredStudies.reduce((acc, study) => {
        const cond = getStudyCondition(study);
        if (cond !== 'Unknown') acc[cond] = (acc[cond] || 0) + 1;
        return acc;
    }, {});
    const sorted = Object.entries(conditions).sort((a, b) => b[1] - a[1]).slice(0, 5);
    createChart('conditionsChart', 'bar', {
        labels: sorted.map(item => item[0]),
        datasets: [{
            data: sorted.map(item => item[1]),
            backgroundColor: '#4A90E2',
            borderRadius: 6
        }]
    }, { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } });
}

function createOutcomesList() {
    const listContainer = document.getElementById('outcomesList');
    if (!listContainer) return;
    const counts = filteredStudies.reduce((acc, { outcomes }) => {
        const outs = Array.isArray(outcomes) ? outcomes : (outcomes ? [outcomes] : []);
        outs.forEach(o => {
            [o?.name, o?.primary_outcome, ...(o?.secondary_outcomes || [])].filter(Boolean).forEach(name => {
                const key = String(name).trim();
                if (key) acc[key] = (acc[key] || 0) + 1;
            });
        });
        return acc;
    }, {});
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    listContainer.innerHTML = sorted.length ? sorted.map(([outcome, count]) => `
        <div class="outcome-item">
            <div class="outcome-text">${outcome}</div>
            <div class="outcome-count">${count}</div>
        </div>`).join('') : '<p>No outcome data available.</p>';
}

// --- UI State, Modals, & Compare ---
const toggleSidebar = () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    setTimeout(() => Object.values(chartInstances).forEach(c => c?.resize()), 300);
};

const showLoading = (isLoading) => {
    document.getElementById('loadingSpinner').style.display = isLoading ? 'flex' : 'none';
};

const toggleComparePanel = (show) => {
    document.getElementById('comparePanel').classList.toggle('active', show);
};

const openModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};

const closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `<h3>Error</h3><p>${message}</p><button onclick="location.reload()">Reload</button>`;
    document.body.appendChild(errorDiv);
    const style = document.createElement('style');
    style.textContent = `
        .error-message { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        text-align: center; z-index: 10001; border-top: 4px solid var(--primary-color); }
        .error-message h3 { margin-bottom: 1rem; color: var(--primary-color); }
        .error-message button { margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; }`;
    document.head.appendChild(style);
}

function toggleCompareSelection(studyId, isSelected) {
    if (isSelected) {
        if (selectedForCompare.size < 3) {
            selectedForCompare.add(studyId);
        } else {
            alert('You can only compare up to 3 studies at a time.');
            document.querySelector(`input[data-study-id="${studyId}"]`).checked = false;
        }
    } else {
        selectedForCompare.delete(studyId);
    }
    updateComparePanel();
}

function updateComparePanel() {
    const count = selectedForCompare.size;
    toggleComparePanel(count > 0);
    document.getElementById('compareCount').textContent = count;
    document.getElementById('compareStudiesBtn').disabled = count < 2;
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
        if (!obj) return 'N/A';
        if (typeof obj === 'string') {
            try { obj = JSON.parse(obj); } catch { return obj; }
        }
        return Object.entries(obj).map(([key, value]) => `<div><strong>${key.replace(/_/g, ' ')}:</strong> ${value || 'N/A'}</div>`).join('');
    };
    contentEl.innerHTML = `
        <div class="modal-section"><h3>Study Characteristics</h3><div class="modal-grid">${formatObject(study.study_characteristics)}</div></div>
        <div class="modal-section"><h3>Population</h3><div class="modal-grid">${formatObject(study.population)}</div></div>
        <div class="modal-section"><h3>Interventions</h3>${(study.interventions || []).map(int => `<div class="modal-grid">${formatObject(int)}</div>`).join('<hr>')}</div>
        <div class="modal-section"><h3>Outcomes</h3><div class="modal-grid">${formatObject(study.outcomes)}</div></div>`;
    openModal('studyModal');
}

function showComparisonModal() {
    const studiesToCompare = [...selectedForCompare].map(id => allStudies.find(s => s._id === id));
    const contentEl = document.getElementById('comparisonContent');
    const headers = studiesToCompare.map(s => `<th>${s.study_characteristics?.title || s._id}</th>`).join('');
    const getRow = (label, keyFn) => `<tr><td><strong>${label}</strong></td>${studiesToCompare.map(s => `<td>${keyFn(s) || 'N/A'}</td>`).join('')}</tr>`;
    contentEl.innerHTML = `
        <table class="comparison-table">
            <thead><tr><th>Characteristic</th>${headers}</tr></thead>
            <tbody>
                ${getRow('Publication Year', s => s.study_characteristics?.publication_year)}
                ${getRow('Design', s => s.study_characteristics?.design)}
                ${getRow('Sample Size', s => s.study_characteristics?.sample_size?.toLocaleString())}
                ${getRow('Condition', s => getStudyCondition(s))}
                ${getRow('Primary Outcome', s => Array.isArray(s.outcomes) ? (s.outcomes.find(o=>o.primary)?.name || s.outcomes[0]?.name) : s.outcomes?.primary_outcome)}
                ${getRow('Intervention', s => (Array.isArray(s.interventions) && s.interventions.length > 0 ? s.interventions[0]?.treatment : 'N/A'))}
            </tbody>
        </table>`;
    openModal('comparisonModal');
}