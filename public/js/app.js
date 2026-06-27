const API_URL = '/api';

// ============================================
// АВТОРИЗАЦИЯ
// ============================================

// Текущий пользователь
let currentUser = null;

// Проверка статуса авторизации
async function checkAuth() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            updateAuthUI(null);
            return;
        }

        const response = await fetch(`${API_URL}/auth/status?user_id=${userId}`);
        const data = await response.json();
        
        if (data.isAuth) {
            currentUser = data.user;
            updateAuthUI(currentUser);
            updateAdminLink(currentUser);
        } else {
            localStorage.removeItem('userId');
            updateAuthUI(null);
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        updateAuthUI(null);
    }
}

// Обновление UI авторизации
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

// Обновление ссылки на админку
function updateAdminLink(user) {
    const link = document.getElementById('adminLink');
    if (!link) return;

    if (user && (user.role === 'admin' || user.role === 'super_admin')) {
        link.style.display = 'block';
    } else {
        link.style.display = 'none';
    }
}

// Выход
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
        updateAdminLink(null);
        loadStats(); // Обновляем статистику
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

// ============================================
// СТАТИСТИКА
// ============================================

async function loadStats() {
    try {
        console.log('📊 Запрос к /api/stats');
        const response = await fetch(`${API_URL}/stats`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const stats = await response.json();
        console.log('📊 Получена статистика:', stats);

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
        document.getElementById('totalBooks').textContent = '❌';
        document.getElementById('onlineUsers').textContent = '❌';
        document.getElementById('totalUsers').textContent = '❌';
        document.getElementById('activeLoans').textContent = '❌';
    }
}

// ============================================
// ПОИСК
// ============================================

function searchBooks() {
    const query = document.getElementById('searchInput')?.value.trim();
    if (query) {
        window.location.href = `/catalog.html?search=${encodeURIComponent(query)}`;
    }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

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

// Делаем функции глобальными
window.searchBooks = searchBooks;
window.logout = logout;
window.loadStats = loadStats;