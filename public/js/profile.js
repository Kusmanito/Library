const API_URL = '/api';
let currentUser = null;

async function checkAuth() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch(`${API_URL}/auth/status?user_id=${userId}`);
        const data = await response.json();
        
        if (data.isAuth) {
            currentUser = data.user;
            updateAuthUI(currentUser);
            loadUserInfo();
            loadMyLoans();
        } else {
            localStorage.removeItem('userId');
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        window.location.href = '/login.html';
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
    }
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
        window.location.href = '/';
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

async function loadUserInfo() {
    const container = document.getElementById('userInfo');
    if (!currentUser) return;

    container.innerHTML = `
        <p><strong>👤 Имя:</strong> ${currentUser.full_name || currentUser.username}</p>
        <p><strong>🔑 Логин:</strong> ${currentUser.username}</p>
        <p><strong>🛡️ Роль:</strong> ${currentUser.role === 'super_admin' ? 'Создатель' : currentUser.role === 'admin' ? 'Администратор' : 'Пользователь'}</p>
        <p><strong>🟢 Статус:</strong> ${currentUser.online ? 'Онлайн' : 'Офлайн'}</p>
    `;
}

async function loadMyLoans() {
    const container = document.getElementById('myLoans');
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_URL}/loans`);
        const loans = await response.json();
        
        const myLoans = loans.filter(l => l.user_id === currentUser.id && l.status === 'active');
        
        if (myLoans.length === 0) {
            container.innerHTML = '<p style="color: #7f8c8d;">У вас нет активных выдач</p>';
            return;
        }

        container.innerHTML = myLoans.map(loan => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px;">
                <div>
                    <strong>${loan.book_title}</strong>
                    <span style="color: #7f8c8d;">— ${loan.book_author}</span>
                    <span style="color: #95a5a6; font-size: 0.85rem;">
                        Выдал: ${loan.who_took || 'Администратор'} | 
                        ${new Date(loan.loan_date).toLocaleDateString()} — до ${new Date(loan.due_date).toLocaleDateString()}
                    </span>
                    ${new Date(loan.due_date) < new Date() ? '<span style="color: #e74c3c;"> ⚠️ Просрочено! Верните книгу!</span>' : ''}
                </div>
                <button onclick="returnBook(${loan.id})" class="btn-success" style="background: #27ae60; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer;">↩ Вернуть</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки выдач:', error);
        container.innerHTML = '<p class="error">❌ Ошибка загрузки</p>';
    }
}

async function returnBook(loanId) {
    if (!confirm('Подтвердите возврат книги')) return;

    try {
        const response = await fetch(`${API_URL}/loans/${loanId}/return`, {
            method: 'PUT'
        });

        if (response.ok) {
            loadMyLoans();
        } else {
            const result = await response.json();
            alert(result.error || 'Ошибка возврата');
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', checkAuth);
window.logout = logout;
window.returnBook = returnBook;