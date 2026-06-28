const API_URL = '/api';
let currentUser = null;

async function checkAdminAccess() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            window.location.href = '/login.html';
            return false;
        }

        const response = await fetch(`${API_URL}/auth/status?user_id=${userId}`);
        const data = await response.json();
        
        if (!data.isAuth) {
            window.location.href = '/login.html';
            return false;
        }

        currentUser = data.user;
        
        if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
            document.body.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; gap: 1rem;">
                    <h1 style="color: #e74c3c;">⛔ Доступ запрещен</h1>
                    <p style="color: #7f8c8d;">У вас нет прав доступа к админ-панели.</p>
                    <a href="/" class="btn-primary">Вернуться на главную</a>
                </div>
            `;
            return false;
        }

        document.getElementById('adminUser').textContent = `👑 ${currentUser.full_name || currentUser.username}`;
        return true;
    } catch (error) {
        console.error('Ошибка проверки доступа:', error);
        window.location.href = '/login.html';
        return false;
    }
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const tab = document.getElementById(`tab-${tabId}`);
    if (tab) tab.classList.add('active');
    
    const btn = document.querySelector(`.tab-btn[onclick="showTab('${tabId}')"]`);
    if (btn) btn.classList.add('active');

    if (tabId === 'manage') loadManageBooks();
    if (tabId === 'loans') loadLoans();
    if (tabId === 'users') loadUsers();
    if (tabId === 'give') loadGiveData();
    if (tabId === 'stats') loadStats();
}

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
        document.getElementById('addResult').innerHTML = `<div class="error">❌ Название и автор обязательны</div>`;
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
            document.getElementById('addResult').innerHTML = `<div class="error">❌ ${result.error || 'Ошибка'}</div>`;
        }
    } catch (error) {
        document.getElementById('addResult').innerHTML = `<div class="error">❌ Ошибка: ${error.message}</div>`;
    }
}

async function loadManageBooks() {
    try {
        const response = await fetch(`${API_URL}/books?limit=100`);
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const data = await response.json();
        const container = document.getElementById('manageBooks');
        
        if (!data.books || data.books.length === 0) {
            container.innerHTML = '<p style="color: #7f8c8d;">Книг пока нет</p>';
            return;
        }

        container.innerHTML = data.books.map(book => `
            <div class="book-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px;">
                <div>
                    <span class="book-title" style="font-weight: 600;">${book.title}</span>
                    <span style="color: #7f8c8d; margin-left: 0.5rem;">${book.author}</span>
                    <span style="color: #95a5a6; font-size: 0.85rem; margin-left: 0.5rem;">
                        (${book.available_copies}/${book.total_copies} доступно)
                    </span>
                </div>
                <div class="book-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button onclick="addBookCopy(${book.id})" class="btn-success" style="background: #27ae60; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer;">
                        ➕ Пополнить
                    </button>
                    <button onclick="deleteBook(${book.id})" class="btn-danger" style="background: #e74c3c; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer;">
                        🗑 Удалить
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки книг:', error);
        document.getElementById('manageBooks').innerHTML = `<p class="error">❌ Ошибка загрузки: ${error.message}</p>`;
    }
}

async function addBookCopy(bookId) {
    const count = prompt('Сколько экземпляров добавить?', '1');
    if (!count) return;
    
    const num = parseInt(count);
    if (isNaN(num) || num < 1) {
        alert('Введите число больше 0');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/books/${bookId}`);
        const book = await response.json();
        
        if (!book) {
            alert('Книга не найдена');
            return;
        }

        const newTotal = (book.total_copies || 0) + num;
        const newAvailable = (book.available_copies || 0) + num;

        const updateResponse = await fetch(`${API_URL}/books/${bookId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...book,
                total_copies: newTotal,
                available_copies: newAvailable
            })
        });

        if (updateResponse.ok) {
            alert(`✅ Добавлено ${num} экземпляров!`);
            loadManageBooks();
        } else {
            const result = await updateResponse.json();
            alert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
}

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
            alert(result.error || 'Ошибка удаления');
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

async function loadGiveData() {
    try {
        const usersResponse = await fetch(`${API_URL}/users`);
        const users = await usersResponse.json();
        
        const userSelect = document.getElementById('loanUserSelect');
        userSelect.innerHTML = '<option value="">Выберите пользователя...</option>';
        users.forEach(user => {
            userSelect.innerHTML += `<option value="${user.id}">${user.full_name || user.username} (${user.username})</option>`;
        });

        const booksResponse = await fetch(`${API_URL}/books?limit=100`);
        const booksData = await booksResponse.json();
        
        const bookSelect = document.getElementById('loanBookSelect');
        bookSelect.innerHTML = '<option value="">Выберите книгу...</option>';
        booksData.books.forEach(book => {
            if (book.available_copies > 0) {
                bookSelect.innerHTML += `<option value="${book.id}">${book.title} - ${book.author} (${book.available_copies} доступно)</option>`;
            }
        });

        loadActiveLoans();
    } catch (error) {
        console.error('Ошибка загрузки данных для выдачи:', error);
    }
}

async function createLoan() {
    const userId = document.getElementById('loanUserSelect').value;
    const bookId = document.getElementById('loanBookSelect').value;
    const days = parseInt(document.getElementById('loanDays').value) || 14;

    if (!userId || !bookId) {
        document.getElementById('loanGiveResult').innerHTML = `<div class="error">❌ Выберите пользователя и книгу</div>`;
        return;
    }

    try {
        const response = await fetch(`${API_URL}/loans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: userId, 
                book_id: bookId, 
                who_took: currentUser?.full_name || currentUser?.username || 'Администратор',
                due_days: days 
            })
        });

        const result = await response.json();
        if (response.ok) {
            document.getElementById('loanGiveResult').innerHTML = `<div class="success">✅ ${result.message}</div>`;
            loadGiveData();
        } else {
            document.getElementById('loanGiveResult').innerHTML = `<div class="error">❌ ${result.error || 'Ошибка'}</div>`;
        }
    } catch (error) {
        document.getElementById('loanGiveResult').innerHTML = `<div class="error">❌ Ошибка: ${error.message}</div>`;
    }
}

async function loadActiveLoans() {
    try {
        const response = await fetch(`${API_URL}/loans/active`);
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const loans = await response.json();
        const container = document.getElementById('activeLoansList');
        
        if (loans.length === 0) {
            container.innerHTML = '<p style="color: #7f8c8d;">Нет активных выдач</p>';
            return;
        }

        container.innerHTML = loans.map(loan => `
            <div class="loan-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px;">
                <div>
                    <strong>${loan.book_title}</strong>
                    <span style="color: #7f8c8d;">— ${loan.user_full_name || loan.user_name}</span>
                    <span style="color: #95a5a6; font-size: 0.85rem;">
                        Выдал: ${loan.who_took || 'Администратор'} | 
                        ${new Date(loan.loan_date).toLocaleDateString()} — до ${new Date(loan.due_date).toLocaleDateString()}
                    </span>
                    ${new Date(loan.due_date) < new Date() ? '<span style="color: #e74c3c;"> ⚠️ Просрочено</span>' : ''}
                </div>
                <button onclick="returnBook(${loan.id})" class="btn-success" style="background: #27ae60; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer;">↩ Вернуть</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки выдач:', error);
        document.getElementById('activeLoansList').innerHTML = `<p class="error">❌ ${error.message}</p>`;
    }
}

async function loadLoans() {
    try {
        const response = await fetch(`${API_URL}/loans`);
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const loans = await response.json();
        const container = document.getElementById('loansList');
        
        if (loans.length === 0) {
            container.innerHTML = '<p style="color: #7f8c8d;">История выдач пуста</p>';
            return;
        }

        container.innerHTML = loans.map(loan => `
            <div class="loan-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px;">
                <div>
                    <strong>${loan.book_title}</strong>
                    <span style="color: #7f8c8d;">— ${loan.user_full_name || loan.user_name}</span>
                    <span style="color: #95a5a6; font-size: 0.85rem;">
                        Выдал: ${loan.who_took || 'Администратор'} | 
                        ${new Date(loan.loan_date).toLocaleDateString()}
                        ${loan.return_date ? ` → возвращено ${new Date(loan.return_date).toLocaleDateString()}` : ''}
                    </span>
                    <span style="font-size: 0.85rem; ${loan.status === 'active' ? 'color: #27ae60;' : 'color: #95a5a6;'}">
                        ${loan.status === 'active' ? '✅ Активно' : '📄 Возвращена'}
                    </span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки выдач:', error);
        document.getElementById('loansList').innerHTML = `<p class="error">❌ ${error.message}</p>`;
    }
}

async function returnBook(loanId) {
    if (!confirm('Подтвердите возврат книги')) return;

    try {
        const response = await fetch(`${API_URL}/loans/${loanId}/return`, {
            method: 'PUT'
        });

        if (response.ok) {
            loadGiveData();
            loadLoans();
        } else {
            const result = await response.json();
            alert(result.error || 'Ошибка возврата');
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/users`);
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const users = await response.json();
        const container = document.getElementById('usersList');
        
        if (users.length === 0) {
            container.innerHTML = '<p style="color: #7f8c8d;">Пользователей пока нет</p>';
            return;
        }

        container.innerHTML = users.map(user => {
            const isAdmin = user.role === 'admin' || user.role === 'super_admin';
            const isCreator = user.role === 'super_admin';
            return `
                <div class="user-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <strong>${user.full_name || user.username}</strong>
                        <span style="color: #7f8c8d; margin-left: 0.5rem;">@${user.username}</span>
                        <span style="color: #95a5a6; font-size: 0.85rem; margin-left: 0.5rem;">
                            ${user.online ? '🟢 онлайн' : '⚪ офлайн'}
                        </span>
                        <span style="margin-left: 0.5rem; font-size: 0.85rem; ${isAdmin ? 'color: #e74c3c;' : 'color: #95a5a6;'}">
                            ${isCreator ? '👑 Создатель' : isAdmin ? '🛡️ Админ' : '👤 Пользователь'}
                        </span>
                    </div>
                    ${currentUser?.role === 'super_admin' && user.role !== 'super_admin' ? `
                        <div class="user-actions">
                            <button onclick="toggleAdmin(${user.id}, ${!isAdmin})" class="btn-secondary" style="background: ${isAdmin ? '#e74c3c' : '#27ae60'}; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer;">
                                ${isAdmin ? '❌ Забрать права' : '✅ Дать права админа'}
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        document.getElementById('usersList').innerHTML = `<p class="error">❌ ${error.message}</p>`;
    }
}

async function toggleAdmin(userId, makeAdmin) {
    if (!confirm(`Подтвердите ${makeAdmin ? 'выдачу' : 'забор'} прав администратора`)) return;

    try {
        const response = await fetch(`${API_URL}/users/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                role: makeAdmin ? 'admin' : 'user',
                admin_id: currentUser.id 
            })
        });

        if (response.ok) {
            loadUsers();
        } else {
            const result = await response.json();
            alert(result.error || 'Ошибка обновления роли');
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// ============================================
// СТАТИСТИКА
// ============================================

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/stats/detailed`);
        if (!response.ok) throw new Error('Ошибка загрузки статистики');
        
        const stats = await response.json();

        document.getElementById('onlineNow').textContent = stats.onlineNow || 0;
        document.getElementById('guestsOnline').textContent = stats.guestsOnline || 0;
        document.getElementById('todayVisits').textContent = stats.todayStats?.total_visits || 0;
        document.getElementById('todayUsers').textContent = stats.todayStats?.unique_users || 0;

        const onlineList = document.getElementById('onlineUsersList');
        if (stats.onlineUsers && stats.onlineUsers.length > 0) {
            onlineList.innerHTML = stats.onlineUsers.map(user => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
                    <span>
                        <strong>${user.full_name || user.username}</strong>
                        <span style="color: #7f8c8d; font-size: 0.85rem;">(@${user.username})</span>
                        <span style="color: #95a5a6; font-size: 0.85rem;">${user.role === 'super_admin' ? '👑' : user.role === 'admin' ? '🛡️' : ''}</span>
                    </span>
                    <span style="color: #27ae60; font-size: 0.9rem;">
                        📍 ${user.current_page || 'Неизвестно'}
                        <span style="color: #95a5a6; font-size: 0.75rem;">
                            (${new Date(user.last_seen).toLocaleTimeString()})
                        </span>
                    </span>
                </div>
            `).join('');
        } else {
            onlineList.innerHTML = '<p style="color: #7f8c8d;">Нет пользователей в сети</p>';
        }

        const locations = document.getElementById('userLocations');
        if (stats.onlineUsers && stats.onlineUsers.length > 0) {
            const locationMap = {};
            stats.onlineUsers.forEach(user => {
                const page = user.current_page || 'Неизвестно';
                if (!locationMap[page]) locationMap[page] = [];
                locationMap[page].push(user.full_name || user.username);
            });
            locations.innerHTML = Object.entries(locationMap).map(([page, users]) => `
                <div style="padding: 6px 0; border-bottom: 1px solid #eee;">
                    <strong>📍 ${page}</strong>
                    <span style="color: #7f8c8d; font-size: 0.85rem;">— ${users.join(', ')}</span>
                </div>
            `).join('');
        } else {
            locations.innerHTML = '<p style="color: #7f8c8d;">Нет данных о местоположении</p>';
        }

        const pagesList = document.getElementById('popularPagesList');
        if (stats.popularPages && stats.popularPages.length > 0) {
            pagesList.innerHTML = stats.popularPages.map((page, index) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
                    <span>
                        <strong>#${index + 1}</strong>
                        <span style="margin-left: 0.5rem;">${page.page}</span>
                    </span>
                    <span>
                        <span style="color: #3498db;">${page.visits} просмотров</span>
                        <span style="color: #7f8c8d; font-size: 0.85rem; margin-left: 0.5rem;">
                            (${page.unique_users} пользователей)
                        </span>
                    </span>
                </div>
            `).join('');
        } else {
            pagesList.innerHTML = '<p style="color: #7f8c8d;">Нет данных</p>';
        }

        const hourlyContainer = document.getElementById('hourlyStats');
        if (stats.hourlyStats && stats.hourlyStats.length > 0) {
            const maxVisits = Math.max(...stats.hourlyStats.map(h => parseInt(h.visits)));
            hourlyContainer.innerHTML = stats.hourlyStats.map(h => {
                const percent = maxVisits > 0 ? (h.visits / maxVisits * 100) : 0;
                return `
                    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 4px 0;">
                        <span style="width: 40px; font-size: 0.85rem; color: #7f8c8d;">${String(h.hour).padStart(2, '0')}:00</span>
                        <div style="flex: 1; background: #ecf0f1; border-radius: 4px; height: 20px; overflow: hidden;">
                            <div style="width: ${percent}%; background: linear-gradient(90deg, #3498db, #2ecc71); height: 100%; border-radius: 4px; transition: width 0.3s;"></div>
                        </div>
                        <span style="font-size: 0.85rem; color: #2c3e50; width: 40px; text-align: right;">${h.visits}</span>
                    </div>
                `;
            }).join('');
        } else {
            hourlyContainer.innerHTML = '<p style="color: #7f8c8d;">Нет данных по часам</p>';
        }

    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
        document.getElementById('onlineUsersList').innerHTML = `<p class="error">❌ Ошибка загрузки: ${error.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const hasAccess = await checkAdminAccess();
    if (hasAccess) {
        showTab('give');
    }
});

window.showTab = showTab;
window.addBook = addBook;
window.deleteBook = deleteBook;
window.addBookCopy = addBookCopy;
window.createLoan = createLoan;
window.returnBook = returnBook;
window.toggleAdmin = toggleAdmin;
window.loadManageBooks = loadManageBooks;
window.loadLoans = loadLoans;
window.loadUsers = loadUsers;
window.loadGiveData = loadGiveData;
window.loadStats = loadStats;