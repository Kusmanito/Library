const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

console.log(`📁 Папка public: ${path.join(__dirname, 'public')}`);

// ============================================
// НАСТРОЙКА ПУТИ К БАЗЕ ДАННЫХ
// ============================================
const isAmvera = !!process.env.AMVERA_DATA_PATH;
console.log(`🌍 Режим: ${isAmvera ? 'Amvera' : 'Локальный'}`);

const dbPath = isAmvera 
    ? path.join(process.env.AMVERA_DATA_PATH, 'library.db')
    : path.join(__dirname, 'database', 'library.db');

console.log(`📂 Путь к БД: ${dbPath}`);

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`📁 Создана папка: ${dbDir}`);
}

let db = null;

// ============================================
// РАБОТА С БАЗОЙ ДАННЫХ
// ============================================
function loadDatabase() {
    try {
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath);
            console.log(`📥 Загружено ${data.length} байт из БД`);
            return new Uint8Array(data);
        }
        console.log('ℹ️ Файл БД не найден, будет создан новый');
        return null;
    } catch (err) {
        console.error('❌ Ошибка загрузки БД:', err.message);
        return null;
    }
}

function saveDatabase() {
    try {
        if (db) {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(dbPath, buffer);
            console.log(`✅ База данных сохранена (${data.length} байт)`);
            return true;
        }
        return false;
    } catch (err) {
        console.error('❌ Ошибка сохранения БД:', err.message);
        return false;
    }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ (ОБНОВЛЕННАЯ)
// ============================================
async function initDatabase() {
    try {
        console.log('🔄 Инициализация базы данных...');
        const SQL = await initSqlJs();
        const data = loadDatabase();
        
        if (data) {
            db = new SQL.Database(data);
            console.log('✅ База данных загружена');
        } else {
            db = new SQL.Database();
            console.log('✅ Создана новая база данных');
        }

        // ============================================
        // НОВЫЕ ТАБЛИЦЫ
        // ============================================

        // 1. Пользователи (добавлены поля role и online)
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                role TEXT DEFAULT 'user',
                online BOOLEAN DEFAULT 0,
                last_seen DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Книги (без изменений)
        db.run(`
            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                isbn TEXT UNIQUE,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                publisher TEXT,
                year INTEGER,
                description TEXT,
                total_copies INTEGER DEFAULT 1,
                available_copies INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Выдача книг (добавлен who_took)
        db.run(`
            CREATE TABLE IF NOT EXISTS loans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                book_id INTEGER,
                who_took TEXT,
                loan_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                due_date DATETIME,
                return_date DATETIME,
                status TEXT DEFAULT 'active',
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (book_id) REFERENCES books(id)
            )
        `);

        // 4. Сессии (для отслеживания онлайн)
        db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                token TEXT UNIQUE,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        console.log('✅ Таблицы созданы/проверены');
        
        // Создаем супер-админа (создателя)
        createSuperAdmin();
        addTestData();
        saveDatabase();
        
        console.log('✅ Инициализация БД завершена');
        return db;
    } catch (err) {
        console.error('❌ Ошибка инициализации БД:', err.message);
        throw err;
    }
}

// ============================================
// СОЗДАНИЕ СУПЕР-АДМИНА
// ============================================
function createSuperAdmin() {
    try {
        const result = db.exec("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'");
        const count = result[0]?.values?.[0]?.[0] || 0;
        
        if (count === 0) {
            console.log('👑 Создаем супер-админа (создателя)...');
            const passwordHash = bcrypt.hashSync('admin123', 10);
            const stmt = db.prepare(`
                INSERT INTO users (username, password_hash, full_name, role)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run('creator', passwordHash, 'Создатель системы', 'super_admin');
            console.log('✅ Создан супер-админ (creator / admin123)');
        }
    } catch (err) {
        console.error('❌ Ошибка создания супер-админа:', err.message);
    }
}

// ============================================
// ТЕСТОВЫЕ ДАННЫЕ
// ============================================
function addTestData() {
    try {
        // Проверяем книги
        const result = db.exec('SELECT COUNT(*) as count FROM books');
        const count = result[0]?.values?.[0]?.[0] || 0;
        
        if (count === 0) {
            console.log('📚 Добавляем тестовые книги...');
            const books = [
                ['978-5-17-118914-3', 'Война и мир', 'Лев Толстой', 'АСТ', 1869, 'Великий роман о жизни русского общества.', 5, 3],
                ['978-5-04-118923-9', 'Преступление и наказание', 'Фёдор Достоевский', 'Эксмо', 1866, 'Роман о моральных последствиях преступления.', 4, 2],
                ['978-5-17-089876-5', 'Мастер и Маргарита', 'Михаил Булгаков', 'АСТ', 1967, 'Роман-мистерия о любви и дьяволе.', 3, 1],
                ['978-5-17-118886-8', '1984', 'Джордж Оруэлл', 'АСТ', 1949, 'Роман-антиутопия о тоталитарном обществе.', 2, 2],
                ['978-5-04-107984-4', 'Тихий Дон', 'Михаил Шолохов', 'Эксмо', 1940, 'Эпопея о донском казачестве.', 3, 0]
            ];

            const stmt = db.prepare(`
                INSERT INTO books (isbn, title, author, publisher, year, description, total_copies, available_copies)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const book of books) {
                stmt.run(book);
            }
            console.log(`✅ Добавлено ${books.length} книг`);
        }

        // Проверяем обычного пользователя (для теста)
        const userResult = db.exec("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        const userCount = userResult[0]?.values?.[0]?.[0] || 0;
        
        if (userCount === 0) {
            console.log('👤 Создаем тестового пользователя...');
            const passwordHash = bcrypt.hashSync('user123', 10);
            const stmt = db.prepare(`
                INSERT INTO users (username, password_hash, full_name, role)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run('user', passwordHash, 'Обычный пользователь', 'user');
            console.log('✅ Создан пользователь (user / user123)');
        }
    } catch (err) {
        console.error('❌ Ошибка добавления тестовых данных:', err.message);
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================
function getAll(query, params = []) {
    try {
        const stmt = db.prepare(query);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    } catch (err) {
        console.error('❌ Ошибка getAll:', err.message);
        return [];
    }
}

function getOne(query, params = []) {
    try {
        const stmt = db.prepare(query);
        stmt.bind(params);
        if (stmt.step()) {
            const result = stmt.getAsObject();
            stmt.free();
            return result;
        }
        stmt.free();
        return null;
    } catch (err) {
        console.error('❌ Ошибка getOne:', err.message);
        return null;
    }
}

function runQuery(query, params = []) {
    try {
        const stmt = db.prepare(query);
        stmt.run(params);
        stmt.free();
        return { changes: db.getRowsModified(), lastInsertRowid: db.lastInsertRowId };
    } catch (err) {
        console.error('❌ Ошибка runQuery:', err.message);
        throw err;
    }
}

// ============================================
// API ЭНДПОИНТЫ
// ============================================

// ---------- АВТОРИЗАЦИЯ ----------

// Регистрация
app.post('/api/auth/register', (req, res) => {
    try {
        const { username, password, full_name } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }

        // Проверяем, существует ли пользователь
        const existing = getOne('SELECT * FROM users WHERE username = ?', [username]);
        if (existing) {
            return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        const result = runQuery(`
            INSERT INTO users (username, password_hash, full_name, role)
            VALUES (?, ?, ?, ?)
        `, [username, passwordHash, full_name || username, 'user']);
        
        saveDatabase();
        res.json({ 
            id: result.lastInsertRowid,
            message: 'Регистрация успешна! Теперь войдите в систему.'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Вход
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }

        const user = getOne('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        // Обновляем статус онлайн
        runQuery('UPDATE users SET online = 1, last_seen = datetime("now") WHERE id = ?', [user.id]);
        saveDatabase();

        delete user.password_hash;
        res.json({ 
            user,
            message: 'Вход выполнен'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Выход
app.post('/api/auth/logout', (req, res) => {
    try {
        const { user_id } = req.body;
        if (user_id) {
            runQuery('UPDATE users SET online = 0 WHERE id = ?', [user_id]);
            saveDatabase();
        }
        res.json({ message: 'Выход выполнен' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Проверка статуса пользователя
app.get('/api/auth/status', (req, res) => {
    try {
        const { user_id } = req.query;
        if (!user_id) {
            return res.json({ isAuth: false });
        }
        
        const user = getOne('SELECT id, username, full_name, role, online FROM users WHERE id = ?', [user_id]);
        if (!user) {
            return res.json({ isAuth: false });
        }
        
        res.json({ isAuth: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------- ПОЛЬЗОВАТЕЛИ ----------

// Получить всех пользователей (для админки)
app.get('/api/users', (req, res) => {
    try {
        const users = getAll('SELECT id, username, full_name, role, online, last_seen FROM users');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Обновить роль пользователя (только для супер-админа)
app.put('/api/users/:id/role', (req, res) => {
    try {
        const { id } = req.params;
        const { role, admin_id } = req.body;
        
        // Проверяем, что админ - супер-админ
        const admin = getOne('SELECT role FROM users WHERE id = ?', [admin_id]);
        if (!admin || admin.role !== 'super_admin') {
            return res.status(403).json({ error: 'Только создатель может выдавать права админа' });
        }
        
        runQuery('UPDATE users SET role = ? WHERE id = ?', [role, id]);
        saveDatabase();
        res.json({ message: 'Роль пользователя обновлена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------- КНИГИ ----------

// Получить все книги
app.get('/api/books', (req, res) => {
    try {
        console.log('📖 Запрос /api/books');
        const { search, author, year, limit = 20, offset = 0 } = req.query;
        
        let query = 'SELECT * FROM books WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        if (author) {
            query += ' AND author = ?';
            params.push(author);
        }
        if (year) {
            query += ' AND year = ?';
            params.push(year);
        }

        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const countResult = getOne(countQuery, params);
        const total = countResult ? countResult.total : 0;

        query += ' ORDER BY title LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const books = getAll(query, params);
        console.log(`📖 Найдено книг: ${books.length}`);

        res.json({
            books: books,
            total: total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (err) {
        console.error('❌ Ошибка /api/books:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Получить книгу по ID
app.get('/api/books/:id', (req, res) => {
    try {
        const book = getOne('SELECT * FROM books WHERE id = ?', [req.params.id]);
        if (!book) {
            return res.status(404).json({ error: 'Книга не найдена' });
        }
        res.json(book);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Добавить книгу
app.post('/api/books', (req, res) => {
    try {
        const { isbn, title, author, publisher, year, description, total_copies } = req.body;
        
        if (!title || !author) {
            return res.status(400).json({ error: 'Название и автор обязательны' });
        }

        const copies = total_copies || 1;
        const result = runQuery(`
            INSERT INTO books (isbn, title, author, publisher, year, description, total_copies, available_copies)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [isbn, title, author, publisher, year, description, copies, copies]);
        
        saveDatabase();
        res.json({ 
            id: result.lastInsertRowid,
            message: 'Книга добавлена'
        });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Книга с таким ISBN уже существует' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Обновить книгу
app.put('/api/books/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { title, author, publisher, year, description, total_copies, available_copies } = req.body;

        const result = runQuery(`
            UPDATE books 
            SET title = ?, author = ?, publisher = ?, year = ?, 
                description = ?, total_copies = ?, available_copies = ?
            WHERE id = ?
        `, [title, author, publisher, year, description, total_copies, available_copies, id]);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Книга не найдена' });
        }
        saveDatabase();
        res.json({ message: 'Книга обновлена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Удалить книгу
app.delete('/api/books/:id', (req, res) => {
    try {
        const result = runQuery('DELETE FROM books WHERE id = ?', [req.params.id]);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Книга не найдена' });
        }
        saveDatabase();
        res.json({ message: 'Книга удалена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------- СТАТИСТИКА ----------

app.get('/api/stats', (req, res) => {
    try {
        console.log('📊 Запрос /api/stats');
        const totalBooks = getOne('SELECT COUNT(*) as total FROM books')?.total || 0;
        const totalUsers = getOne('SELECT COUNT(*) as total FROM users')?.total || 0;
        const onlineUsers = getOne('SELECT COUNT(*) as total FROM users WHERE online = 1')?.total || 0;
        const activeLoans = getOne('SELECT COUNT(*) as total FROM loans WHERE status = "active"')?.total || 0;
        const overdueLoans = getOne('SELECT COUNT(*) as total FROM loans WHERE status = "active" AND due_date < datetime("now")')?.total || 0;
        
        const popularBooks = getAll(`
            SELECT b.id, b.title, b.author, COUNT(l.id) as loan_count
            FROM books b
            JOIN loans l ON b.id = l.book_id
            GROUP BY b.id
            ORDER BY loan_count DESC
            LIMIT 5
        `);

        console.log(`📊 Статистика: книг=${totalBooks}, пользователей=${totalUsers}, онлайн=${onlineUsers}`);

        res.json({
            totalBooks,
            totalUsers,
            onlineUsers,
            activeLoans,
            overdueLoans,
            popularBooks
        });
    } catch (err) {
        console.error('❌ Ошибка /api/stats:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------- ВЫДАЧА КНИГ (ОБНОВЛЕННАЯ) ----------

// Выдать книгу (с указанием кто взял)
app.post('/api/loans', (req, res) => {
    try {
        const { user_id, book_id, who_took, due_days = 14 } = req.body;

        // Проверяем наличие книги
        const book = getOne('SELECT available_copies FROM books WHERE id = ?', [book_id]);
        if (!book || book.available_copies < 1) {
            return res.status(400).json({ error: 'Книга недоступна' });
        }

        // Создаем запись о выдаче
        const result = runQuery(`
            INSERT INTO loans (user_id, book_id, who_took, due_date)
            VALUES (?, ?, ?, datetime("now", "+" || ? || " days"))
        `, [user_id, book_id, who_took || 'Администратор', due_days]);

        // Уменьшаем количество доступных копий
        runQuery('UPDATE books SET available_copies = available_copies - 1 WHERE id = ?', [book_id]);
        
        saveDatabase();
        res.json({ 
            loan_id: result.lastInsertRowid,
            message: 'Книга выдана'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Вернуть книгу
app.put('/api/loans/:id/return', (req, res) => {
    try {
        const { id } = req.params;

        // Проверяем, активна ли выдача
        const loan = getOne('SELECT book_id FROM loans WHERE id = ? AND status = "active"', [id]);
        if (!loan) {
            return res.status(404).json({ error: 'Запись не найдена или уже возвращена' });
        }

        // Обновляем статус выдачи
        runQuery(`
            UPDATE loans 
            SET return_date = datetime("now"), status = "returned" 
            WHERE id = ?
        `, [id]);

        // Увеличиваем количество доступных копий
        runQuery('UPDATE books SET available_copies = available_copies + 1 WHERE id = ?', [loan.book_id]);
        
        saveDatabase();
        res.json({ message: 'Книга возвращена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Получить все выдачи (с информацией о пользователях и книгах)
app.get('/api/loans', (req, res) => {
    try {
        const loans = getAll(`
            SELECT 
                l.*, 
                u.username as user_name, 
                u.full_name as user_full_name,
                b.title as book_title,
                b.author as book_author
            FROM loans l
            JOIN users u ON l.user_id = u.id
            JOIN books b ON l.book_id = b.id
            ORDER BY l.loan_date DESC
        `);
        res.json(loans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Получить активные выдачи
app.get('/api/loans/active', (req, res) => {
    try {
        const loans = getAll(`
            SELECT 
                l.*, 
                u.username as user_name, 
                u.full_name as user_full_name,
                b.title as book_title,
                b.author as book_author
            FROM loans l
            JOIN users u ON l.user_id = u.id
            JOIN books b ON l.book_id = b.id
            WHERE l.status = 'active'
            ORDER BY l.due_date ASC
        `);
        res.json(loans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------- ТЕСТОВЫЙ ЭНДПОИНТ ----------
app.get('/api/test', (req, res) => {
    res.json({ 
        message: '✅ API работает!', 
        time: new Date().toISOString(),
        environment: isAmvera ? 'Amvera' : 'Local',
        dbExists: fs.existsSync(dbPath)
    });
});

// ============================================
// СТАТИЧЕСКИЕ ФАЙЛЫ (ОБРАБОТЧИК 404)
// ============================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================
async function startServer() {
    try {
        await initDatabase();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Сервер запущен на порту ${PORT}`);
            console.log(`📚 Библиотечная система`);
            console.log(`👑 Супер-админ (создатель): creator / admin123`);
            console.log(`👤 Тестовый пользователь: user / user123`);
            console.log(`📂 Путь к БД: ${dbPath}`);
            console.log(`🌍 Режим: ${isAmvera ? 'Amvera' : 'Локальный'}`);
        });
    } catch (err) {
        console.error('❌ Ошибка запуска сервера:', err.message);
        process.exit(1);
    }
}

startServer();