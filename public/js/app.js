const API_URL = '/api';
let currentUser = null;

async function checkAuth() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            updateAuthUI(null);
            updateNavigation(null);
            return;
        }

        const response = await fetch(`${API_URL}/auth/status?user_id=${userId}`);
        const data = await response.json();
        
        if (data.isAuth) {
            currentUser = data.user;
            updateAuthUI(currentUser);
            updateNavigation(currentUser);
        } else {
            localStorage.removeItem('userId');
            updateAuthUI(null);
            updateNavigation(null);
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        updateAuthUI(null);
        updateNavigation(null);
    }
}

function updateAuthUI(user) {
    const section = document.getElementById('authSection');
    if (!section) return;

    if (user) {
        section.innerHTML = `
            <span class="user-name">👤 ${user.full_name || user.username}</span>
            <button onclick="logout()" class="btn-logout">Выйти</button>
        `;
    } else {
        section.innerHTML = `
            <a href="/login.html" class="btn-login">Войти</a>
            <a href="/login.html?register=true" class="btn-register">Регистрация</a>
        `;
    }
}

function updateNavigation(user) {
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;

    const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');
    const isAuth = !!user;

    // Определяем, на какой мы странице
    const currentPage = window.location.pathname;

    let html = '';

    // Главная всегда видна
    html += `<li><a href="/" class="${currentPage === '/' || currentPage === '/index.html' ? 'active' : ''}">Главная</a></li>`;

    // Каталог всегда виден
    html += `<li><a href="/catalog.html" class="${currentPage.includes('catalog') ? 'active' : ''}">Каталог</a></li>`;

    // Админка только для админов
    if (isAdmin) {
        html += `<li><a href="/admin.html" class="${currentPage.includes('admin') ? 'active' : ''}">Админка</a></li>`;
    }

    // Профиль только для авторизованных
    if (isAuth) {
        html += `<li><a href="/profile.html" class="${currentPage.includes('profile') ? 'active' : ''}">👤 Профиль</a></li>`;
    }

    navLinks.innerHTML = html;
}

async function logout() {
    try {
        const userId = localStorage.getItem('userId');
        if (userId) {
            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
        }
        localStorage.removeItem('userId');
        currentUser = null;
        updateAuthUI(null);
        updateNavigation(null);
        loadStats();
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const stats = await response.json();

        document.getElementById('totalBooks').textContent = stats.totalBooks || 0;
        document.getElementById('onlineUsers').textContent = stats.onlineUsers || 0;
        document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
        document.getElementById('activeLoans').textContent = stats.activeLoans || 0;

        const grid = document.getElementById('popularBooksGrid');
        if (grid) {
            if (!stats.popularBooks || stats.popularBooks.length === 0) {
                grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #7f8c8d;">Пока нет данных</p>';
            } else {
                grid.innerHTML = stats.popularBooks.map(book => `
                    <div class="book-card">
                        <div class="book-cover">📖</div>
                        <div class="book-info">
                            <h3>${book.title || 'Без названия'}</h3>
                            <p class="author">${book.author || 'Автор неизвестен'}</p>
                            <p style="color: #3498db; font-weight: bold;">Выдано: ${book.loan_count || 0} раз</p>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки статистики:', error);
    }
}

function searchBooks() {
    const query = document.getElementById('searchInput')?.value.trim();
    if (query) {
        window.location.href = `/catalog.html?search=${encodeURIComponent(query)}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadStats();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchBooks();
        });
    }
});

window.searchBooks = searchBooks;
window.logout = logout;
window.loadStats = loadStats;