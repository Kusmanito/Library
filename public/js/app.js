const API_URL = '/api';

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const stats = await response.json();

        document.getElementById('totalBooks').textContent = stats.totalBooks || 0;
        document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
        document.getElementById('activeLoans').textContent = stats.activeLoans || 0;
        document.getElementById('overdueLoans').textContent = stats.overdueLoans || 0;

        const grid = document.getElementById('popularBooksGrid');
        if (grid && stats.popularBooks) {
            if (stats.popularBooks.length === 0) {
                grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #7f8c8d;">Пока нет данных</p>';
            } else {
                grid.innerHTML = stats.popularBooks.map(book => `
                    <div class="book-card">
                        <div class="book-cover">📖</div>
                        <div class="book-info">
                            <h3>${book.title}</h3>
                            <p class="author">${book.author}</p>
                            <p style="color: #3498db; font-weight: bold;">Выдано: ${book.loan_count} раз</p>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

document.addEventListener('DOMContentLoaded', loadStats);