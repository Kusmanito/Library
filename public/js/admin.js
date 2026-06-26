const API_URL = '/api';

// Переключение вкладок
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`tab-${tabId}`)?.classList.add('active');
    document.querySelector(`.tab-btn[onclick="showTab('${tabId}')"]`)?.classList.add('active');

    if (tabId === 'manage') loadManageBooks();
    if (tabId === 'loans') loadLoans();
}

// ============ Управление книгами ============

// Добавление книги
async function addBook(event) {
    event.preventDefault();

    const book = {
        title: document.getElementById('bookTitle').value.trim(),
        author: document.getElementById('bookAuthor').value.trim(),
        isbn: document.getElementById('bookIsbn').value.trim(),
        publisher: document.getElementById('bookPublisher').value.trim(),
        year: parseInt(document.getElementById('bookYear').value) || null,
        total_copies: parseInt(document.getElementById('bookCopies').value) || 1,
        description: document.getElementById('bookDescription').value.trim()
    };

    if (!book.title || !book.author) {
        document.getElementById('addResult').innerHTML = `<div class="error">Название и автор обязательны</div>`;
        return;
    }

    try {
        const response = await fetch(`${API_URL}/books`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(book)
        });

        const result = await response.json();
        if (response.ok) {
            document.getElementById('addResult').innerHTML = `<div class="success">✅ ${result.message}</div>`;
            document.getElementById('addBookForm').reset();
            loadManageBooks();
        } else {
            document.getElementById('addResult').innerHTML = `<div class="error">❌ ${result.error}</div>`;
        }
    } catch (error) {
        document.getElementById('addResult').innerHTML = `<div class="error">❌ Ошибка: ${error.message}</div>`;
    }
}

// Загрузка книг для управления
async function loadManageBooks() {
    try {
        const response = await fetch(`${API_URL}/books?limit=100`);
        const data = await response.json();

        const container = document.getElementById('manageBooks');
        if (data.books.length === 0) {
            container.innerHTML = '<p style="color: #7f8c8d;">Книг пока нет</p>';
            return;
        }

        container.innerHTML = data.books.map(book => `
            <div class="book-item">
                <div>
                    <span class="book-title">${book.title}</span>
                    <span style="color: #7f8c8d; margin-left: 0.5rem;">${book.author}</span>
                    <span style="color: #95a5a6; font-size: 0.85rem; margin-left: 0.5rem;">
                        (${book.available_copies}/${book.total_copies} доступно)
                    </span>
                </div>
                <div class="book-actions">
                    <button onclick="deleteBook(${book.id})" class="btn-danger">🗑 Удалить</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

// Удаление книги
async function deleteBook(id) {
    if (!confirm('Удалить эту книгу?')) return;

    try {
        const response = await fetch(`${API_URL}/books/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadManageBooks();
        } else {
            const result = await response.json();
            alert(result.error);
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// ============ Выдача книг ============

// Создание выдачи
async function createLoan() {
    const bookId = parseInt(document.getElementById('loanBookId').value);
    const userId = parseInt(document.getElementById('loanUserId').value);
    const days = parseInt(document.getElementById('loanDays').value) || 14;

    if (!bookId || !userId) {
        document.getElementById('loanResult').innerHTML = `<div class="error">Укажите ID книги и пользователя</div>`;
        return;
    }

    try {
        const response = await fetch(`${API_URL}/loans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ book_id: bookId, user_id: userId, due_days: days })
        });

        const result = await response.json();
        if (response.ok) {
            document.getElementById('loanResult').innerHTML = `<div class="success">✅ ${result.message}</div>`;
            document.getElementById('loanBookId').value = '';
            document.getElementById('loanUserId').value = '';
            loadLoans();
        } else {
            document.getElementById('loanResult').innerHTML = `<div class="error">❌ ${result.error}</div>`;
        }
    } catch (error) {
        document.getElementById('loanResult').innerHTML = `<div class="error">❌ Ошибка: ${error.message}</div>`;
    }
}

// Загрузка выдач
async function loadLoans() {
    try {
        const response = await fetch(`${API_URL}/loans`);
        const loans = await response.json();

        const container = document.getElementById('loansList');
        if (loans.length === 0) {
            container.innerHTML = '<p style="color: #7f8c8d;">Нет активных выдач</p>';
            return;
        }

        container.innerHTML = loans.filter(l => l.status === 'active').map(loan => `
            <div class="loan-item">
                <div>
                    <strong>${loan.book_title}</strong>
                    <span style="color: #7f8c8d;">— ${loan.user_name}</span>
                    <span style="color: #95a5a6; font-size: 0.85rem;">
                        ${new Date(loan.loan_date).toLocaleDateString()} — до ${new Date(loan.due_date).toLocaleDateString()}
                    </span>
                    ${new Date(loan.due_date) < new Date() ? '<span style="color: #e74c3c;"> ⚠️ Просрочено</span>' : ''}
                </div>
                <button onclick="returnBook(${loan.id})" class="btn-success">↩ Вернуть</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

// Возврат книги
async function returnBook(loanId) {
    if (!confirm('Подтвердите возврат книги')) return;

    try {
        const response = await fetch(`${API_URL}/loans/${loanId}/return`, {
            method: 'PUT'
        });

        if (response.ok) {
            loadLoans();
        } else {
            const result = await response.json();
            alert(result.error);
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// ============ Резервное копирование ============

async function createBackup() {
    try {
        const response = await fetch(`${API_URL}/backup`);
        const result = await response.json();

        document.getElementById('backupResult').innerHTML = `
            <div class="success">✅ ${result.message}</div>
            <p style="color: #7f8c8d; font-size: 0.9rem;">Файл: ${result.file}</p>
        `;
    } catch (error) {
        document.getElementById('backupResult').innerHTML = `<div class="error">❌ Ошибка: ${error.message}</div>`;
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // По умолчанию показываем вкладку "Добавить"
    showTab('add');
});