/**
 * MTG Deckbuilder — Frontend Application
 * Étape 2 : Collection display with Scryfall images
 */

// =========================================================================
// State
// =========================================================================
const state = {
    cards: [],
    stats: null,
    binders: [],
    filters: { search: '', rarity: '', binder: '', set_code: '' },
    page: 1,
    pageSize: 48,
    totalPages: 1,
    total: 0,
    viewMode: 'grid', // 'grid' | 'list'
    debounceTimer: null,
};

// =========================================================================
// DOM references
// =========================================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    grid: $('#card-grid'),
    pagination: $('#pagination'),
    resultsCount: $('#results-count'),
    filterSearch: $('#filter-search'),
    filterBinder: $('#filter-binder'),
    filterRarity: $('#filter-rarity'),
    filterPageSize: $('#filter-pagesize'),
    viewGrid: $('#view-grid'),
    viewList: $('#view-list'),
    rarityPills: $('#rarity-pills'),
    // Stats
    statTotal: $('#stat-total'),
    statUnique: $('#stat-unique'),
    statValue: $('#stat-value'),
    statBinders: $('#stat-binders'),
    headerValue: $('#header-value'),
    // Modal
    modal: $('#card-modal'),
    modalBackdrop: $('#modal-backdrop'),
    modalClose: $('#modal-close'),
    modalImage: $('#modal-image'),
    modalName: $('#modal-name'),
    modalSet: $('#modal-set'),
    modalRarity: $('#modal-rarity'),
    modalFoil: $('#modal-foil'),
    modalSetName: $('#modal-setname'),
    modalNumber: $('#modal-number'),
    modalQty: $('#modal-qty'),
    modalCondition: $('#modal-condition'),
    modalLang: $('#modal-lang'),
    modalPrice: $('#modal-price'),
    modalBinder: $('#modal-binder'),
    modalScryfallLink: $('#modal-scryfall-link'),
    // Nav
    mainNav: $('#main-nav'),
};

// =========================================================================
// API helpers
// =========================================================================
async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function loadStats() {
    try {
        state.stats = await fetchJSON('/api/collection/stats');
        renderStats();
    } catch (e) { console.error('Failed to load stats:', e); }
}

async function loadBinders() {
    try {
        const data = await fetchJSON('/api/collection/binders');
        state.binders = data.binders;
        renderBinderOptions();
    } catch (e) { console.error('Failed to load binders:', e); }
}

async function loadCollection() {
    const params = new URLSearchParams({
        page: state.page,
        page_size: state.pageSize,
    });
    if (state.filters.search) params.set('search', state.filters.search);
    if (state.filters.rarity) params.set('rarity', state.filters.rarity);
    if (state.filters.binder) params.set('binder', state.filters.binder);

    showSkeletons();

    try {
        const data = await fetchJSON(`/api/collection?${params}`);
        state.cards = data.cards;
        state.total = data.total;
        state.totalPages = data.total_pages;
        state.page = data.page;
        renderCards();
        renderPagination();
        renderResultsCount();
    } catch (e) {
        console.error('Failed to load collection:', e);
        dom.grid.innerHTML = `<div class="col-span-full text-center py-20 text-gray-500">Erreur de chargement</div>`;
    }
}

// =========================================================================
// Renderers
// =========================================================================
function renderStats() {
    const s = state.stats;
    if (!s) return;
    dom.statTotal.textContent = s.total_cards.toLocaleString('fr-FR');
    dom.statUnique.textContent = s.unique_entries.toLocaleString('fr-FR');
    dom.statValue.textContent = `${s.total_value.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${s.currency}`;
    dom.statBinders.textContent = Object.keys(s.binders).length;
    dom.headerValue.textContent = `${s.total_value.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${s.currency}`;

    // Rarity pills
    const rarityNames = { common: 'Commune', uncommon: 'Peu commune', rare: 'Rare', mythic: 'Mythique', special: 'Spéciale' };
    const rarityColors = { common: '#6b7280', uncommon: '#a0a0b0', rare: '#d4a84b', mythic: '#e8601c', special: '#a855f7' };
    dom.rarityPills.innerHTML = Object.entries(s.rarities)
        .sort((a, b) => b[1] - a[1])
        .map(([r, count]) => `
            <span class="rarity-pill">
                <span class="rarity-dot" style="background:${rarityColors[r] || '#6b7280'}"></span>
                ${rarityNames[r] || r} &middot; ${count.toLocaleString('fr-FR')}
            </span>
        `).join('');
}

function renderBinderOptions() {
    const existing = dom.filterBinder.querySelector('option[value=""]');
    dom.filterBinder.innerHTML = '';
    dom.filterBinder.appendChild(existing || Object.assign(document.createElement('option'), { value: '', textContent: 'Tous les classeurs' }));
    state.binders.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        dom.filterBinder.appendChild(opt);
    });
}

function renderCards() {
    if (state.cards.length === 0) {
        dom.grid.innerHTML = `<div class="col-span-full text-center py-20"><p class="text-gray-500 text-lg">Aucune carte trouvée</p><p class="text-gray-600 text-sm mt-1">Essayez de modifier vos filtres</p></div>`;
        return;
    }

    dom.grid.className = state.viewMode === 'list' ? 'card-grid list-view' : 'card-grid';

    dom.grid.innerHTML = state.cards.map((card, i) => {
        const rarityClass = card.rarity || '';
        const foilClass = card.foil ? 'card-foil' : '';
        const delay = Math.min(i * 30, 500);

        return `
            <div class="card-item fade-in ${foilClass}" data-rarity="${rarityClass}" data-index="${i}" style="animation-delay:${delay}ms">
                <img src="${card.image_uri}" alt="${escapeHtml(card.name)}" loading="lazy" class="loading"
                     onload="this.classList.remove('loading');this.classList.add('loaded')"
                     onerror="this.src='/static/img/card-back.svg';this.classList.add('loaded')">
                ${card.quantity > 1 ? `<span class="card-qty-badge">x${card.quantity}</span>` : ''}
                <div class="card-overlay">
                    <div class="card-overlay-name">${escapeHtml(card.name)}</div>
                    <div class="card-overlay-set">${escapeHtml(card.set_name)} &middot; ${card.set_code.toUpperCase()}</div>
                </div>
                <div class="card-list-info">
                    <span class="card-list-name">${escapeHtml(card.name)}</span>
                    <span class="card-list-set">${card.set_code.toUpperCase()}</span>
                    <span class="card-list-rarity" style="color:${getRarityColor(card.rarity)}">${capitalizeFirst(card.rarity)}</span>
                    ${card.quantity > 1 ? `<span class="card-qty-badge">x${card.quantity}</span>` : '<span></span>'}
                    <span class="card-list-price">${card.purchase_price.toFixed(2)} €</span>
                </div>
            </div>
        `;
    }).join('');

    // Card click listeners
    dom.grid.querySelectorAll('.card-item').forEach(el => {
        el.addEventListener('click', () => openModal(state.cards[parseInt(el.dataset.index)]));
    });
}

function renderPagination() {
    if (state.totalPages <= 1) { dom.pagination.innerHTML = ''; return; }

    let buttons = [];
    const p = state.page;
    const tp = state.totalPages;

    buttons.push(`<button class="page-btn" data-page="1" ${p === 1 ? 'disabled' : ''}>&laquo;</button>`);
    buttons.push(`<button class="page-btn" data-page="${p - 1}" ${p === 1 ? 'disabled' : ''}>&lsaquo;</button>`);

    const range = getPageRange(p, tp, 5);
    if (range[0] > 1) buttons.push(`<span class="text-gray-600 px-1">...</span>`);
    range.forEach(n => {
        buttons.push(`<button class="page-btn ${n === p ? 'active' : ''}" data-page="${n}">${n}</button>`);
    });
    if (range[range.length - 1] < tp) buttons.push(`<span class="text-gray-600 px-1">...</span>`);

    buttons.push(`<button class="page-btn" data-page="${p + 1}" ${p === tp ? 'disabled' : ''}>&rsaquo;</button>`);
    buttons.push(`<button class="page-btn" data-page="${tp}" ${p === tp ? 'disabled' : ''}>&raquo;</button>`);

    dom.pagination.innerHTML = buttons.join('');
    dom.pagination.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pg = parseInt(btn.dataset.page);
            if (pg && pg !== state.page) { state.page = pg; loadCollection(); window.scrollTo({ top: 300, behavior: 'smooth' }); }
        });
    });
}

function renderResultsCount() {
    const start = (state.page - 1) * state.pageSize + 1;
    const end = Math.min(state.page * state.pageSize, state.total);
    dom.resultsCount.textContent = state.total > 0
        ? `${start}-${end} sur ${state.total.toLocaleString('fr-FR')} résultats`
        : 'Aucun résultat';
}

function showSkeletons() {
    const count = state.viewMode === 'list' ? 10 : state.pageSize;
    dom.grid.className = state.viewMode === 'list' ? 'card-grid list-view' : 'card-grid';
    dom.grid.innerHTML = Array.from({ length: Math.min(count, 24) }, () =>
        `<div class="skeleton" style="aspect-ratio:488/680;"></div>`
    ).join('');
}

// =========================================================================
// Modal
// =========================================================================
function openModal(card) {
    dom.modalImage.src = card.image_uri;
    dom.modalImage.alt = card.name;
    dom.modalName.textContent = card.name;
    dom.modalSet.textContent = `${card.set_code.toUpperCase()} #${card.collector_number}`;
    dom.modalRarity.textContent = capitalizeFirst(card.rarity);
    dom.modalRarity.style.borderColor = getRarityColor(card.rarity);
    if (card.foil) { dom.modalFoil.textContent = 'Foil'; dom.modalFoil.classList.remove('hidden'); }
    else { dom.modalFoil.classList.add('hidden'); }
    dom.modalSetName.textContent = card.set_name;
    dom.modalNumber.textContent = card.collector_number;
    dom.modalQty.textContent = card.quantity;
    dom.modalCondition.textContent = formatCondition(card.condition);
    dom.modalLang.textContent = card.language.toUpperCase();
    dom.modalPrice.textContent = `${card.purchase_price.toFixed(2)} ${card.currency}`;
    dom.modalBinder.textContent = card.binder_name;
    dom.modalScryfallLink.href = `https://scryfall.com/card/${card.set_code.toLowerCase()}/${card.collector_number}`;
    dom.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    dom.modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function openImageModal(src, alt) {
    const modal = $('#image-modal');
    const img = $('#image-modal-img');
    if (modal && img) {
        img.src = src;
        img.alt = alt || '';
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeImageModal() {
    const modal = $('#image-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// =========================================================================
// Navigation
// =========================================================================
function initNavigation() {
    dom.mainNav.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            dom.mainNav.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            $$('.page-section').forEach(s => s.classList.add('hidden'));
            $(`#page-${tab.dataset.page}`).classList.remove('hidden');
        });
    });
}

// =========================================================================
// Event Listeners
// =========================================================================
function initEvents() {
    // Search with debounce
    dom.filterSearch.addEventListener('input', () => {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(() => {
            state.filters.search = dom.filterSearch.value.trim();
            state.page = 1;
            loadCollection();
        }, 300);
    });

    // Binder filter
    dom.filterBinder.addEventListener('change', () => {
        state.filters.binder = dom.filterBinder.value;
        state.page = 1;
        loadCollection();
    });

    // Rarity filter
    dom.filterRarity.addEventListener('change', () => {
        state.filters.rarity = dom.filterRarity.value;
        state.page = 1;
        loadCollection();
    });

    // Page size
    dom.filterPageSize.addEventListener('change', () => {
        state.pageSize = parseInt(dom.filterPageSize.value);
        state.page = 1;
        loadCollection();
    });

    // View toggle
    dom.viewGrid.addEventListener('click', () => {
        state.viewMode = 'grid';
        dom.viewGrid.classList.add('active'); dom.viewList.classList.remove('active');
        renderCards();
    });
    dom.viewList.addEventListener('click', () => {
        state.viewMode = 'list';
        dom.viewList.classList.add('active'); dom.viewGrid.classList.remove('active');
        renderCards();
    });

    // Modal close
    dom.modalClose.addEventListener('click', closeModal);
    dom.modalBackdrop.addEventListener('click', closeModal);
    
    const imageModalClose = $('#image-modal-close');
    const imageModalBackdrop = $('#image-modal-backdrop');
    if (imageModalClose) imageModalClose.addEventListener('click', closeImageModal);
    if (imageModalBackdrop) imageModalBackdrop.addEventListener('click', closeImageModal);

    document.addEventListener('keydown', (e) => { 
        if (e.key === 'Escape') {
            closeModal();
            if (typeof closeImageModal === 'function') closeImageModal();
        }
    });
}

// =========================================================================
// Utility functions
// =========================================================================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getRarityColor(rarity) {
    const map = { common: '#6b7280', uncommon: '#a0a0b0', rare: '#d4a84b', mythic: '#e8601c', special: '#a855f7' };
    return map[rarity] || '#6b7280';
}

function formatCondition(c) {
    const map = { near_mint: 'Near Mint', lightly_played: 'Lightly Played', moderately_played: 'Moderately Played', heavily_played: 'Heavily Played', damaged: 'Damaged' };
    return map[c] || c;
}

function getPageRange(current, total, maxVisible) {
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, current - half);
    let end = Math.min(total, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
}

// =========================================================================
// DECK BUILDER MODULE (Étape 3)
// =========================================================================
const deckState = {
    decks: [],            // Array of { id, name, cards: [{ scryfall_id, name, image_uri, set_code, rarity, in_collection, quantity }] }
    activeDeckId: null,
    searchResults: [],
    searchQuery: '',
    searchHasMore: false,
    searchPage: 1,
    searchTotal: 0,
    searchLoading: false,
    searchTimer: null,
};

const STORAGE_KEY = 'mtg_deckbuilder_decks';

// --- LocalStorage helpers ---
function saveDecks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deckState.decks));
}

function loadDecks() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) deckState.decks = JSON.parse(raw);
    } catch (e) { console.error('Failed to load decks:', e); }
}

function getActiveDeck() {
    return deckState.decks.find(d => d.id === deckState.activeDeckId) || null;
}

// --- Deck CRUD ---
function createDeck(name) {
    const deck = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name || 'Nouveau Deck',
        cards: [],
    };
    deckState.decks.push(deck);
    saveDecks();
    deckState.activeDeckId = deck.id;
    renderDeckList();
    renderDeckDetail();
}

function deleteDeck(id) {
    deckState.decks = deckState.decks.filter(d => d.id !== id);
    if (deckState.activeDeckId === id) deckState.activeDeckId = null;
    saveDecks();
    renderDeckList();
    renderDeckDetail();
}

function renameDeck(id, newName) {
    const deck = deckState.decks.find(d => d.id === id);
    if (deck) { deck.name = newName; saveDecks(); renderDeckList(); }
}

function selectDeck(id) {
    deckState.activeDeckId = id;
    renderDeckList();
    renderDeckDetail();
}

function addCardToDeck(card) {
    const deck = getActiveDeck();
    if (!deck) return;
    const existing = deck.cards.find(c => c.scryfall_id === card.scryfall_id);
    if (existing) {
        existing.quantity++;
    } else {
        deck.cards.push({
            scryfall_id: card.scryfall_id,
            name: card.name,
            image_uri: card.image_uri,
            set_code: card.set_code,
            rarity: card.rarity,
            in_collection: card.in_collection || card.in_collection_by_name || false,
            quantity: 1,
        });
    }
    saveDecks();
    renderDeckDetail();
    renderDeckList(); // Update card count
}

function removeCardFromDeck(scryfallId) {
    const deck = getActiveDeck();
    if (!deck) return;
    deck.cards = deck.cards.filter(c => c.scryfall_id !== scryfallId);
    saveDecks();
    renderDeckDetail();
    renderDeckList();
}

function changeCardQty(scryfallId, delta) {
    const deck = getActiveDeck();
    if (!deck) return;
    const card = deck.cards.find(c => c.scryfall_id === scryfallId);
    if (!card) return;
    card.quantity += delta;
    if (card.quantity <= 0) {
        removeCardFromDeck(scryfallId);
        return;
    }
    saveDecks();
    renderDeckDetail();
    renderDeckList();
}

// --- Scryfall Search ---
async function searchScryfall(query, page = 1) {
    if (!query || query.length < 2) return;
    deckState.searchLoading = true;
    const loadingEl = $('#db-search-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    try {
        const data = await fetchJSON(`/api/scryfall/search?q=${encodeURIComponent(query)}&page=${page}`);
        if (page === 1) {
            deckState.searchResults = data.data;
        } else {
            deckState.searchResults = [...deckState.searchResults, ...data.data];
        }
        deckState.searchHasMore = data.has_more;
        deckState.searchTotal = data.total_cards;
        deckState.searchPage = page;
        renderSearchResults();
    } catch (e) {
        console.error('Scryfall search failed:', e);
        const grid = $('#db-search-results');
        if (grid) grid.innerHTML = `<div class="col-span-full text-center py-12 text-red-400">Erreur de recherche</div>`;
    } finally {
        deckState.searchLoading = false;
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

// --- Renderers ---
function renderDeckList() {
    const container = $('#db-deck-list');
    if (!container) return;

    if (deckState.decks.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-600 text-sm py-8">Aucun deck. Créez-en un !</div>';
        return;
    }

    container.innerHTML = deckState.decks.map(deck => {
        const count = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
        const isActive = deck.id === deckState.activeDeckId;
        return `
            <div class="db-deck-entry ${isActive ? 'active' : ''}" data-deck-id="${deck.id}">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(deck.name)}</span>
                <span class="db-deck-entry-count">${count}</span>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.db-deck-entry').forEach(el => {
        el.addEventListener('click', () => selectDeck(el.dataset.deckId));
    });
}

function renderDeckDetail() {
    const emptyEl = $('#db-deck-empty');
    const detailEl = $('#db-deck-detail');
    const deck = getActiveDeck();

    if (!deck) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (detailEl) detailEl.classList.add('hidden');
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (detailEl) detailEl.classList.remove('hidden');

    // Deck name input
    const nameInput = $('#db-deck-name-input');
    if (nameInput) nameInput.value = deck.name;

    // Stats
    const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
    const inColCards = deck.cards.filter(c => c.in_collection).reduce((sum, c) => sum + c.quantity, 0);
    const pct = totalCards > 0 ? Math.round((inColCards / totalCards) * 100) : 0;

    const countEl = $('#db-deck-card-count');
    const pctEl = $('#db-deck-collection-pct');
    if (countEl) countEl.textContent = `${totalCards} carte${totalCards !== 1 ? 's' : ''}`;
    if (pctEl) {
        pctEl.textContent = `${pct}% dans la collection`;
        pctEl.className = pct === 100 ? 'text-emerald-400' : pct > 50 ? 'text-yellow-400' : 'text-red-400';
    }

    // Card list
    const cardList = $('#db-deck-cards');
    if (!cardList) return;

    if (deck.cards.length === 0) {
        cardList.innerHTML = '<div class="text-center text-gray-600 text-sm py-6">Deck vide. Recherchez des cartes pour en ajouter.</div>';
        return;
    }

    cardList.innerHTML = deck.cards.map(card => `
        <div class="db-deck-card fade-in" data-sid="${card.scryfall_id}">
            <img src="${card.image_uri}" alt="${escapeHtml(card.name)}" loading="lazy"
                 onerror="this.src='/static/img/card-back.svg'">
            <span class="db-deck-card-name ${card.in_collection ? 'in-col' : 'not-in-col'}" title="${escapeHtml(card.name)}${card.in_collection ? ' (dans la collection)' : ' (hors collection)'}">${escapeHtml(card.name)}</span>
            <div class="db-qty-controls">
                <button class="db-qty-btn remove" data-action="minus" data-sid="${card.scryfall_id}">-</button>
                <span class="db-qty-val">${card.quantity}</span>
                <button class="db-qty-btn" data-action="plus" data-sid="${card.scryfall_id}">+</button>
            </div>
        </div>
    `).join('');

    // Quantity button listeners
    cardList.querySelectorAll('.db-qty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sid = btn.dataset.sid;
            const action = btn.dataset.action;
            changeCardQty(sid, action === 'plus' ? 1 : -1);
        });
    });
}

function renderSearchResults() {
    const grid = $('#db-search-results');
    const countEl = $('#db-search-count');
    const loadMoreEl = $('#db-load-more');
    if (!grid) return;

    if (deckState.searchResults.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-gray-600">Aucun résultat pour cette recherche</div>`;
        if (countEl) countEl.textContent = '';
        if (loadMoreEl) loadMoreEl.classList.add('hidden');
        return;
    }

    if (countEl) countEl.textContent = `${deckState.searchResults.length} sur ${deckState.searchTotal} résultats`;

    const hasDeck = !!getActiveDeck();

    grid.innerHTML = deckState.searchResults.map((card, i) => {
        const owned = card.in_collection || card.in_collection_by_name;
        const badgeClass = owned ? 'owned' : 'not-owned';
        const badgeText = owned ? 'Collection' : 'Absente';
        const delay = Math.min(i * 20, 400);

        return `
            <div class="db-result-card fade-in" data-index="${i}" style="animation-delay:${delay}ms">
                <img src="${card.image_uri}" alt="${escapeHtml(card.name)}" loading="lazy" class="loading"
                     onload="this.classList.remove('loading');this.classList.add('loaded')"
                     onerror="this.src='/static/img/card-back.svg';this.classList.add('loaded')">
                <span class="db-collection-badge ${badgeClass}">${badgeText}</span>
                ${hasDeck ? `
                    <div class="db-add-overlay">
                        <button class="db-add-btn" data-index="${i}">+ Ajouter au deck</button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Add-to-deck button listeners
    grid.querySelectorAll('.db-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = deckState.searchResults[parseInt(btn.dataset.index)];
            if (card) addCardToDeck(card);
        });
    });

    // Show/hide load more
    if (loadMoreEl) {
        if (deckState.searchHasMore) {
            loadMoreEl.classList.remove('hidden');
        } else {
            loadMoreEl.classList.add('hidden');
        }
    }
}

// --- Deck Builder Event Initialization ---
function initDeckBuilder() {
    loadDecks();
    renderDeckList();
    renderDeckDetail();

    // New deck button -> open modal
    const newDeckBtn = $('#db-new-deck');
    const newDeckModal = $('#db-new-deck-modal');
    const newDeckBackdrop = $('#db-modal-backdrop');
    const newDeckNameInput = $('#db-new-deck-name');
    const newDeckCancel = $('#db-new-deck-cancel');
    const newDeckConfirm = $('#db-new-deck-confirm');

    if (newDeckBtn) {
        newDeckBtn.addEventListener('click', () => {
            if (newDeckModal) newDeckModal.classList.remove('hidden');
            if (newDeckNameInput) { newDeckNameInput.value = ''; newDeckNameInput.focus(); }
        });
    }

    function closeNewDeckModal() {
        if (newDeckModal) newDeckModal.classList.add('hidden');
    }

    if (newDeckCancel) newDeckCancel.addEventListener('click', closeNewDeckModal);
    if (newDeckBackdrop) newDeckBackdrop.addEventListener('click', closeNewDeckModal);
    if (newDeckConfirm) {
        newDeckConfirm.addEventListener('click', () => {
            const name = newDeckNameInput ? newDeckNameInput.value.trim() : '';
            createDeck(name || 'Nouveau Deck');
            closeNewDeckModal();
        });
    }
    // Enter key to create
    if (newDeckNameInput) {
        newDeckNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const name = newDeckNameInput.value.trim();
                createDeck(name || 'Nouveau Deck');
                closeNewDeckModal();
            }
        });
    }

    // Delete deck button
    const deleteBtn = $('#db-delete-deck');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const deck = getActiveDeck();
            if (deck && confirm(`Supprimer le deck "${deck.name}" ?`)) {
                deleteDeck(deck.id);
            }
        });
    }

    // Rename deck on input change
    const nameInput = $('#db-deck-name-input');
    if (nameInput) {
        let renameTimer = null;
        nameInput.addEventListener('input', () => {
            clearTimeout(renameTimer);
            renameTimer = setTimeout(() => {
                if (deckState.activeDeckId) {
                    renameDeck(deckState.activeDeckId, nameInput.value.trim() || 'Sans nom');
                }
            }, 400);
        });
    }

    // Scryfall search with debounce
    const searchInput = $('#db-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(deckState.searchTimer);
            deckState.searchTimer = setTimeout(() => {
                const q = searchInput.value.trim();
                deckState.searchQuery = q;
                deckState.searchPage = 1;
                if (q.length >= 2) {
                    searchScryfall(q, 1);
                } else {
                    deckState.searchResults = [];
                    const grid = $('#db-search-results');
                    if (grid) grid.innerHTML = `<div class="col-span-full text-center py-16 text-gray-600">
                        <svg class="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <p>Recherchez une carte Magic pour l'ajouter au deck</p></div>`;
                    const countEl = $('#db-search-count');
                    if (countEl) countEl.textContent = '';
                }
            }, 400);
        });
    }

    // Load more results
    const loadMoreBtn = $('#db-load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (deckState.searchHasMore && deckState.searchQuery) {
                searchScryfall(deckState.searchQuery, deckState.searchPage + 1);
            }
        });
    }
}

// =========================================================================
// SUGGESTIONS MODULE (Étape 4)
// =========================================================================
const sgState = {
    selectedCard: null,     // { scryfall_id, name, image_uri, set_code, set_name }
    searchTimer: null,
    lastSuggestionId: 0,
    pollInterval: null,
    suggestions: [],
};

// --- Card search for suggestion form ---
async function sgSearchCards(query) {
    if (!query || query.length < 2) {
        const dropdown = $('#sg-card-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
        return;
    }

    try {
        const data = await fetchJSON(`/api/scryfall/search?q=${encodeURIComponent(query)}`);
        const dropdown = $('#sg-card-dropdown');
        if (!dropdown) return;

        if (data.data.length === 0) {
            dropdown.innerHTML = '<div class="p-3 text-center text-gray-600 text-sm">Aucun résultat</div>';
            dropdown.classList.remove('hidden');
            return;
        }

        // Show top 8 results
        const results = data.data.slice(0, 8);
        dropdown.innerHTML = results.map((card, i) => {
            const owned = card.in_collection || card.in_collection_by_name;
            const badge = owned
                ? '<span class="sg-col-badge owned">✓ Collection</span>'
                : '<span class="sg-col-badge absent">✗ Absente</span>';
            return `
            <div class="sg-card-option" data-index="${i}">
                <img src="${card.image_uri}" alt="" onerror="this.src='/static/img/card-back.svg'">
                <div class="flex-1 min-w-0">
                    <div class="sg-card-option-name">${escapeHtml(card.name)}</div>
                    <div class="sg-card-option-set">${escapeHtml(card.set_name || '')} · ${(card.set_code || '').toUpperCase()}</div>
                </div>
                ${badge}
            </div>
        `;
        }).join('');

        dropdown.classList.remove('hidden');

        // Click listeners on options
        dropdown.querySelectorAll('.sg-card-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const card = results[parseInt(opt.dataset.index)];
                sgSelectCard(card);
            });
        });
    } catch (e) {
        console.error('Suggestion card search failed:', e);
    }
}

function sgSelectCard(card) {
    sgState.selectedCard = {
        scryfall_id: card.scryfall_id,
        name: card.name,
        image_uri: card.image_uri,
        set_code: card.set_code,
        set_name: card.set_name || '',
    };

    // Show preview
    const preview = $('#sg-card-preview');
    const img = $('#sg-card-preview-img');
    const name = $('#sg-card-preview-name');
    const set = $('#sg-card-preview-set');
    if (preview) preview.classList.remove('hidden');
    if (img) img.src = card.image_uri;
    if (name) name.textContent = card.name;
    if (set) set.textContent = `${card.set_name || ''} · ${(card.set_code || '').toUpperCase()}`;

    // Hide dropdown
    const dropdown = $('#sg-card-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    // Clear search input
    const searchInput = $('#sg-card-search');
    if (searchInput) searchInput.value = '';

    sgUpdateSubmitButton();
}

function sgClearCard() {
    sgState.selectedCard = null;
    const preview = $('#sg-card-preview');
    if (preview) preview.classList.add('hidden');
    sgUpdateSubmitButton();
}

function sgUpdateSubmitButton() {
    const author = ($('#sg-author')?.value || '').trim();
    const hasCard = !!sgState.selectedCard;
    const btn = $('#sg-submit');
    if (btn) btn.disabled = !(author && hasCard);
}

// --- Submit suggestion ---
async function sgSubmitSuggestion() {
    const author = ($('#sg-author')?.value || '').trim();
    const deckName = ($('#sg-deck-name')?.value || '').trim();
    const card = sgState.selectedCard;
    if (!author || !deckName || !card) return;

    const btn = $('#sg-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi...'; }

    try {
        const resp = await fetch('/api/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                author,
                deck_name: deckName,
                card_name: card.name,
                card_scryfall_id: card.scryfall_id,
                card_image_uri: card.image_uri,
                card_set_code: card.set_code,
            }),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        // Success — reset form
        const authorInput = $('#sg-author');
        const deckInput = $('#sg-deck-name');
        if (authorInput) authorInput.value = '';
        if (deckInput) deckInput.value = '';
        sgClearCard();

        // Show success message
        const success = $('#sg-success');
        if (success) {
            success.classList.remove('hidden');
            setTimeout(() => success.classList.add('hidden'), 4000);
        }

        // Refresh feed immediately
        sgPollSuggestions();
    } catch (e) {
        console.error('Failed to submit suggestion:', e);
        alert('Erreur lors de l\'envoi de la suggestion.');
    } finally {
        if (btn) {
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Envoyer la suggestion`;
            sgUpdateSubmitButton();
        }
    }
}

// --- Polling for new suggestions ---
async function sgPollSuggestions() {
    try {
        const data = await fetchJSON(`/api/suggestions?since_id=${sgState.lastSuggestionId}`);
        const newItems = data.suggestions || [];

        if (sgState.lastSuggestionId === 0) {
            // First load — show all (they come reversed from server)
            sgState.suggestions = newItems;
        } else if (newItems.length > 0) {
            // Polling — new items come in ascending order, prepend to our list
            sgState.suggestions = [...newItems.reverse(), ...sgState.suggestions];
        }

        // Update last known ID
        if (sgState.suggestions.length > 0) {
            sgState.lastSuggestionId = Math.max(...sgState.suggestions.map(s => s.id));
        }

        sgRenderFeed(data.total);
    } catch (e) {
        console.error('Suggestions poll failed:', e);
    }
}

function sgRenderFeed(total) {
    const feed = $('#sg-feed');
    const countEl = $('#sg-feed-count');
    if (!feed) return;

    if (countEl) countEl.textContent = `${total || sgState.suggestions.length} suggestion${(total || sgState.suggestions.length) !== 1 ? 's' : ''}`;

    if (sgState.suggestions.length === 0) {
        feed.innerHTML = `<div class="text-center text-gray-600 py-16">
            <svg class="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            <p>Aucune suggestion pour le moment</p>
            <p class="text-xs mt-1">Les nouvelles suggestions apparaîtront ici en temps réel</p>
        </div>`;
        return;
    }

    feed.innerHTML = sgState.suggestions.map((s, i) => {
        const imgSrc = s.card_image_uri || '/static/img/card-back.svg';
        const timeAgo = sgFormatTimeAgo(s.timestamp);
        const deckPart = s.deck_name
            ? ` pour le deck <span class="sg-deck">${escapeHtml(s.deck_name)}</span>`
            : '';
        return `
            <div class="sg-suggestion">
                <img src="${imgSrc}" alt="${escapeHtml(s.card_name)}" onerror="this.src='/static/img/card-back.svg'" class="cursor-pointer hover:scale-105 transition-transform" data-index="${i}">
                <div class="sg-suggestion-body">
                    <div class="sg-suggestion-text">
                        <span class="sg-author">${escapeHtml(s.author)}</span> suggère
                        <span class="sg-card-name">${escapeHtml(s.card_name)}</span>
                        ${deckPart}
                    </div>
                    <div class="sg-suggestion-time">${timeAgo}</div>
                </div>
            </div>
        `;
    }).join('');

    // Add click listeners to images
    feed.querySelectorAll('.sg-suggestion img').forEach(img => {
        img.addEventListener('click', () => {
            const index = parseInt(img.dataset.index);
            const suggestion = sgState.suggestions[index];
            if (suggestion) {
                openImageModal(suggestion.card_image_uri || '/static/img/card-back.svg', suggestion.card_name);
            }
        });
    });
}

function sgFormatTimeAgo(isoStr) {
    const now = new Date();
    const then = new Date(isoStr);
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 10) return "À l'instant";
    if (diffSec < 60) return `Il y a ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Il y a ${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    return then.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// --- Init ---
function initSuggestions() {
    // Card search with debounce
    const searchInput = $('#sg-card-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(sgState.searchTimer);
            sgState.searchTimer = setTimeout(() => {
                sgSearchCards(searchInput.value.trim());
            }, 400);
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#sg-card-search') && !e.target.closest('#sg-card-dropdown')) {
                const dropdown = $('#sg-card-dropdown');
                if (dropdown) dropdown.classList.add('hidden');
            }
        });
    }

    // Clear card button
    const clearBtn = $('#sg-card-clear');
    if (clearBtn) clearBtn.addEventListener('click', sgClearCard);

    // Form field validation listeners
    const authorInput = $('#sg-author');
    const deckInput = $('#sg-deck-name');
    if (authorInput) authorInput.addEventListener('input', sgUpdateSubmitButton);
    if (deckInput) deckInput.addEventListener('input', sgUpdateSubmitButton);

    // Submit button
    const submitBtn = $('#sg-submit');
    if (submitBtn) submitBtn.addEventListener('click', sgSubmitSuggestion);

    // Initial feed load
    sgPollSuggestions();

    // Start polling every 5 seconds
    sgState.pollInterval = setInterval(sgPollSuggestions, 5000);
}


// =========================================================================
// Init
// =========================================================================
async function init() {
    initNavigation();
    initEvents();
    initDeckBuilder();
    initSuggestions();
    await Promise.all([loadStats(), loadBinders()]);
    await loadCollection();
}

document.addEventListener('DOMContentLoaded', init);
