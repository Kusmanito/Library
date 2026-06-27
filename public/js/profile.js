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
        <div class="profile-info" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="info-item" style="padding: 10px; background: #f8f9fa; border-radius: 8px;">
                <div class="label" style="font-size: 0.85rem; color: #7f8c8d;">👤 Имя</div>
                <div class="value" style="font-size: 1.1rem; font-weight: 500; color: #2c3e50;">${currentUser.full_name || currentUser.username}</div>
            </div>
            <div class="info-item" style="padding: 10px; background: #f8f9fa; border-radius: 8px;">
                <div class="label" style="font-size: 0.85rem; color: #7f8c8d;">🔑 Логин</div>
                <div class="value" style="font-size: 1.1rem; font-weight: 500; color: #2c3e50;">${currentUser.username}</div>
            </div>
            <div class="info-item" style="padding: 10px; background: #f8f9fa; border-radius: 8px;">
                <div class="label" style="font-size: 0.85rem; color: #7f8c8d;">🛡️ Роль</div>
                <div class="value" style="font-size: 1.1rem; font-weight: 500; color: #2c3e50;">${currentUser.role === 'super_admin' ? 'Создатель' : currentUser.role === 'admin' ? 'Администратор' : 'Пользователь'}</div>
            </div>
            <div class="info-item" style="padding: 10px; background: #f8f9fa; border-radius: 8px;">
                <div class="label" style="font-size: 0.85rem; color: #7f8c8d;">🟢 Статус</div>
                <div class="value" style="font-size: 1.1rem; font-weight: 500; color: ${currentUser.online ? '#27ae60' : '#95a5a6'};">${currentUser.online ? 'Онлайн' : 'Офлайн'}</div>
            </div>
        </div>
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
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #7f8c8d;">
                    <p style="font-size: 1.2rem;">📚 У вас нет активных выдач</p>
                    <p style="font-size: 0.9rem;">Все книги возвращены или вы ничего не брали</p>
                </div>
            `;
            return;
        }

        container.innerHTML = myLoans.map(loan => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px; background: ${new Date(loan.due_date) < new Date() ? '#fff5f5' : 'white'}; border-radius: 8px; margin-bottom: 8px;">
                <div>
                    <strong style="font-size: 1.1rem;">${loan.book_title}</strong>
                    <span style="color: #7f8c8d; margin-left: 0.5rem;">${loan.book_author}</span>
                    <div style="margin-top: 4px; font-size: 0.9rem; color: #555;">
                        📅 Выдал: ${loan.who_took || 'Администратор'}
                    </div>
                    <div style="font-size: 0.9rem; color: #555;">
                        📆 Взята: ${new Date(loan.loan_date).toLocaleDateString()} 
                        <span style="color: #e74c3c; font-weight: 600;">⏰ Вернуть до: ${new Date(loan.due_date).toLocaleDateString()}</span>
                    </div>
                    ${new Date(loan.due_date) < new Date() ? '<div style="color: #e74c3c; font-weight: bold; margin-top: 4px;">⚠️ ВНИМАНИЕ! Срок возврата ПРОШЁЛ! Срочно верните книгу!</div>' : ''}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки выдач:', error);
        container.innerHTML = '<p class="error">❌ Ошибка загрузки</p>';
    }
}

document.addEventListener('DOMContentLoaded', checkAuth);
window.logout = logout;