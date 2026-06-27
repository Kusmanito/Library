const API_URL = '/api';
let currentUser = null;

// ============================================
// АВТОРИЗАЦИЯ ДЛЯ КАТАЛОГА
// ============================================

async function checkAuth() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            updateAdminLink(null);
            return;
        }

        const response = await fetch(`${API_URL}/auth/status?user_id=${userId}`);
        const data = await response.json();
        
        if (data.isAuth) {
            currentUser = data.user;
            updateAdminLink(currentUser);
        } else {
            localStorage.removeItem('userId');
            updateAdminLink(null);
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        updateAdminLink(null);
    }
}

function updateAdminLink(user) {
    const link = document.getElementById('adminLink');
    if (!link) return;

    if (user && (user.role === 'admin' || user.role === 'super_admin')) {
        link.style.display = 'block';
    } else {
        link.style.display = 'none';
    }
}

// ============================================
// КАТАЛОГ
// ============================================

function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        search: params.get('search') || '',
        author: params.get('author') || '',
        year: params.get('year') || '',
        page: parseInt(params.get('page')) || 1
    };
}

async function loadBooks() {
    const params = getUrlParams();
    const currentPage = params.page || 1;
    const ITEMS_PER_PAGE = 9;

    try {
        let url = `${API_URL}/books?limit=${ITEMS_PER_PAGE}&offset=${(currentPage - 1) * ITEMS_PER_PAGE}`;
        
        if (params.search) {
            url += `&search=${encodeURIComponent(params.search)}`;
        }
        if (params.author) {
            url += `&author=${encodeURIComponent(params.author)}`;
        }
        if (params.year) {
            url += `&year=${encodeURIComponent(params.year)}`;
        }

        console.log('📖 Запрос к API:', url);
        
        const response = await fetch(url);
        console.log('📖 Статус ответа:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📖 Получены данные:', data);

        if (data.books) {
            renderBooks(data.books);
            renderPagination(data.total, currentPage, ITEMS_PER_PAGE);
        } else {
            throw new Error('Нет данных о книгах');
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки книг:', error);
        const grid = document.getElementById('catalogGrid');
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                    <p style="font-size: 1.2rem; color: #e74c3c;">❌ Ошибка загрузки данных</p>
                    <p style="color: #7f8c8d; margin-top: 0.5rem;">${error.message}</p>
                    <button onclick="loadBooks()" class="btn-primary" style="margin-top: 1rem;">🔄 Попробовать снова</button>
                </div>
            `;
        }
    }
}

function renderBooks(books) {
    const grid = document.getElementById('catalogGrid');
    if (!grid) return;

    if (!books || books.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <p style="font-size: 1.2rem; color: #7f8c8d;">😕 Книги не найдены</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = books.map(book => `
        <div class="book-card">
            <div class="book-cover">📖</div>
            <div class="book-info">
                <h3>${book.title || 'Без названия'}</h3>
                <p class="author">${book.author || 'Автор неизвестен'}</p>
                <p class="year">${book.year || '—'}</p>
                <span class="availability ${book.available_copies > 0 ? 'available' : 'unavailable'}">
                    ${book.available_copies > 0 ? `✅ Доступно (${book.available_copies})` : '❌ Нет в наличии'}
                </span>
                ${book.description ? `<p style="font-size: 0.85rem; color: #7f8c8d; margin-top: 0.5rem;">${book.description.substring(0, 100)}${book.description.length > 100 ? '...' : ''}</p>` : ''}
            </div>
        </div>
    `).join('');
}

function renderPagination(total, currentPage, itemsPerPage) {
    const container = document.getElementById('pagination');
    if (!container) return;

    const totalPages = Math.ceil(total / itemsPerPage);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    container.innerHTML = html;
}

function goToPage(page) {
    const params = getUrlParams();
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    window.location.href = url.toString();
}

function filterBooks() {
    const params = getUrlParams();
    const searchInput = document.getElementById('searchInput');
    const authorFilter = document.getElementById('authorFilter');
    const yearFilter = document.getElementById('yearFilter');

    if (searchInput) params.search = searchInput.value.trim();
    if (authorFilter) params.author = authorFilter.value;
    if (yearFilter) params.year = yearFilter.value;
    params.page = 1;

    const url = new URL(window.location.href);
    url.search = '';
    if (params.search) url.searchParams.set('search', params.search);
    if (params.author) url.searchParams.set('author', params.author);
    if (params.year) url.searchParams.set('year', params.year);
    window.location.href = url.toString();
}

function clearFilters() {
    window.location.href = '/catalog.html';
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    
    const params = getUrlParams();
    const searchInput = document.getElementById('searchInput');
    if (searchInput && params.search) {
        searchInput.value = params.search;
    }
    loadBooks();
});

window.filterBooks = filterBooks;
window.clearFilters = clearFilters;
window.goToPage = goToPage;
window.loadBooks = loadBooks;