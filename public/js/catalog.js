const API_URL = '/api';
let currentPage = 1;
const ITEMS_PER_PAGE = 9;
let totalBooks = 0;

// Получение параметров URL
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        search: params.get('search') || '',
        author: params.get('author') || '',
        year: params.get('year') || '',
        page: parseInt(params.get('page')) || 1
    };
}

// Загрузка книг
async function loadBooks() {
    const params = getUrlParams();
    currentPage = params.page || 1;

    try {
        const url = new URL(`${API_URL}/books`);
        if (params.search) url.searchParams.set('search', params.search);
        if (params.author) url.searchParams.set('author', params.author);
        if (params.year) url.searchParams.set('year', params.year);
        url.searchParams.set('limit', ITEMS_PER_PAGE);
        url.searchParams.set('offset', (currentPage - 1) * ITEMS_PER_PAGE);

        const response = await fetch(url);
        const data = await response.json();

        totalBooks = data.total;
        renderBooks(data.books);
        renderPagination(data.total);
        updateFilters(data.books);
    } catch (error) {
        console.error('Ошибка загрузки книг:', error);
        document.getElementById('catalogGrid').innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #e74c3c;">
                ❌ Ошибка загрузки данных
            </div>
        `;
    }
}

// Рендер книг
function renderBooks(books) {
    const grid = document.getElementById('catalogGrid');
    if (!grid) return;

    if (books.length === 0) {
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
                <h3>${book.title}</h3>
                <p class="author">${book.author}</p>
                <p class="year">${book.year || '—'}</p>
                <span class="availability ${book.available_copies > 0 ? 'available' : 'unavailable'}">
                    ${book.available_copies > 0 ? `✅ Доступно (${book.available_copies})` : '❌ Нет в наличии'}
                </span>
                ${book.description ? `<p style="font-size: 0.85rem; color: #7f8c8d; margin-top: 0.5rem;">${book.description.substring(0, 100)}${book.description.length > 100 ? '...' : ''}</p>` : ''}
            </div>
        </div>
    `).join('');
}

// Пагинация
function renderPagination(total) {
    const container = document.getElementById('pagination');
    if (!container) return;

    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
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

// Переход на страницу
function goToPage(page) {
    const params = getUrlParams();
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    window.location.href = url.toString();
}

// Обновление фильтров
function updateFilters(books) {
    // Авторы
    const authorFilter = document.getElementById('authorFilter');
    if (authorFilter) {
        const authors = [...new Set(books.map(b => b.author))].sort();
        const currentValue = authorFilter.value;
        authorFilter.innerHTML = `<option value="">Все авторы</option>`;
        authors.forEach(author => {
            authorFilter.innerHTML += `<option value="${author}" ${author === currentValue ? 'selected' : ''}>${author}</option>`;
        });
    }

    // Годы
    const yearFilter = document.getElementById('yearFilter');
    if (yearFilter) {
        const years = [...new Set(books.map(b => b.year))].filter(y => y).sort((a, b) => b - a);
        const currentValue = yearFilter.value;
        yearFilter.innerHTML = `<option value="">Все годы</option>`;
        years.forEach(year => {
            yearFilter.innerHTML += `<option value="${year}" ${year == currentValue ? 'selected' : ''}>${year}</option>`;
        });
    }
}

// Фильтрация
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

// Сброс фильтров
function clearFilters() {
    window.location.href = '/catalog.html';
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    const params = getUrlParams();
    const searchInput = document.getElementById('searchInput');
    if (searchInput && params.search) {
        searchInput.value = params.search;
    }
    loadBooks();
});