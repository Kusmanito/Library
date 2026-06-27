const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const initSqlJs = require('sql.js');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

console.log(`📁 Папка public: ${path.join(__dirname, 'public')}`);

// ============================================
// ПУТЬ К БАЗЕ ДАННЫХ (В ПАПКЕ ПРОЕКТА)
// ============================================
const dbPath = path.join(__dirname, 'database', 'library.db');
console.log(`📂 Путь к БД: ${dbPath}`);

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`📁 Создана папка: ${dbDir}`);
}

let db = null;

// ============================================
// СОХРАНЕНИЕ БД
// ============================================
function saveDatabase() {
    try {
        if (!db) return false;
        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
        console.log('✅ БД сохранена');
        return true;
    } catch (err) {
        console.error('❌ Ошибка сохранения БД:', err.message);
        return false;
    }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ БД
// ============================================
async function initDatabase() {
    try {
        const SQL = await initSqlJs();
        const fileExists = fs.existsSync(dbPath);

        if (fileExists) {
            console.log('📂 Загружаем существующую БД...');
            const data = fs.readFileSync(dbPath);
            db = new SQL.Database(data);
            console.log('✅ БД загружена');
            return db;
        }

        console.log('🆕 Создаём новую БД...');
        db = new SQL.Database();

        // ----- ТАБЛИЦЫ -----
        db.run(`
            CREATE TABLE users (
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

        db.run(`
            CREATE TABLE books (
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

        db.run(`
            CREATE TABLE loans (
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

        // ----- АДМИН -----
        const hashAdmin = bcrypt.hashSync('admin123', 10);
        db.run(
            `INSERT INTO users (username, password_hash, full_name, role)
             VALUES (?, ?, ?, ?)`,
            ['creator', hashAdmin, 'Создатель', 'super_admin']
        );

        // ----- ОБЫЧНЫЙ ПОЛЬЗОВАТЕЛЬ -----
        const hashUser = bcrypt.hashSync('user123', 10);
        db.run(
            `INSERT INTO users (username, password_hash, full_name, role)
             VALUES (?, ?, ?, ?)`,
            ['user', hashUser, 'Тестовый пользователь', 'user']
        );

        // ----- КНИГИ -----
        const books = [
            ['978-5-17-118914-3', 'Война и мир', 'Лев Толстой', 'АСТ', 1869, 'Роман-эпопея', 5, 3],
            ['978-5-04-118923-9', 'Преступление и наказание', 'Достоевский', 'Эксмо', 1866, 'Роман', 4, 2],
            ['978-5-17-089876-5', 'Мастер и Маргарита', 'Булгаков', 'АСТ', 1967, 'Мистический роман', 3, 1],
            ['978-5-17-118886-8', '1984', 'Оруэлл', 'АСТ', 1949, 'Антиутопия', 2, 2],
            ['978-5-04-107984-4', 'Тихий Дон', 'Шолохов', 'Эксмо', 1940, 'Эпопея', 3, 0]
        ];

        const insertBook = db.prepare(`
            INSERT INTO books (isbn, title, author, publisher, year, description, total_copies, available_copies)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of books) insertBook.run(b);

        saveDatabase();
        console.log('✅ Новая БД создана и заполнена');
        return db;
    } catch (err) {
        console.error('❌ Ошибка инициализации БД:', err.message);
        throw err;
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================
function getAll(query, params = []) {
    const stmt = db.prepare(query);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function getOne(query, params = []) {
    const stmt = db.prepare(query);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

function runQuery(query, params = []) {
    const stmt = db.prepare(query);
    stmt.run(params);
    stmt.free();
    return { changes: db.getRowsModified(), lastInsertRowid: db.lastInsertRowId };
}

// ============================================
// SOCKET.IO (РЕАЛЬНОЕ ВРЕМЯ)
// ============================================
let onlineVisitors = 0;

io.on('connection', (socket) => {
    onlineVisitors++;
    io.emit('visitors_count', onlineVisitors);
    console.log(`👤 Посетитель подключился. Онлайн: ${onlineVisitors}`);

    socket.on('disconnect', () => {
        onlineVisitors--;
        io.emit('visitors_count', onlineVisitors);
        console.log(`👤 Посетитель отключился. Онлайн: ${onlineVisitors}`);
    });
});

// ============================================
// API
// ============================================
app.post('/api/auth/register', (req, res) => {
    try {
        const { username, password, full_name } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });

        if (getOne('SELECT * FROM users WHERE username = ?', [username])) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const result = runQuery(
            `INSERT INTO users (username, password_hash, full_name, role)
             VALUES (?, ?, ?, ?)`,
            [username, hash, full_name || username, 'user']
        );
        saveDatabase();
        res.json({ id: result.lastInsertRowid, message: 'Регистрация успешна' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const user = getOne('SELECT * FROM users WHERE username = ?', [username]);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        runQuery('UPDATE users SET online = 1, last_seen = datetime("now") WHERE id = ?', [user.id]);
        saveDatabase();
        delete user.password_hash;
        res.json({ user, message: 'Вход выполнен' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.get('/api/auth/status', (req, res) => {
    try {
        const { user_id } = req.query;
        if (!user_id) return res.json({ isAuth: false });
        const user = getOne('SELECT id, username, full_name, role, online FROM users WHERE id = ?', [user_id]);
        res.json({ isAuth: !!user, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users', (req, res) => {
    try {
        res.json(getAll('SELECT id, username, full_name, role, online, last_seen FROM users'));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/role', (req, res) => {
    try {
        const { id } = req.params;
        const { role, admin_id } = req.body;
        const admin = getOne('SELECT role FROM users WHERE id = ?', [admin_id]);
        if (!admin || admin.role !== 'super_admin') {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        runQuery('UPDATE users SET role = ? WHERE id = ?', [role, id]);
        saveDatabase();
        res.json({ message: 'Роль обновлена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/books', (req, res) => {
    try {
        const { search, author, year, limit = 20, offset = 0 } = req.query;
        let query = 'SELECT * FROM books WHERE 1=1';
        const params = [];
        if (search) {
            query += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        if (author) { query += ' AND author = ?'; params.push(author); }
        if (year) { query += ' AND year = ?'; params.push(year); }

        const total = getOne(query.replace('SELECT *', 'SELECT COUNT(*) as total'), params)?.total || 0;
        query += ' ORDER BY title LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        res.json({ books: getAll(query, params), total, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/books/:id', (req, res) => {
    try {
        const book = getOne('SELECT * FROM books WHERE id = ?', [req.params.id]);
        if (!book) return res.status(404).json({ error: 'Книга не найдена' });
        res.json(book);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/books', (req, res) => {
    try {
        const { isbn, title, author, publisher, year, description, total_copies } = req.body;
        if (!title || !author) return res.status(400).json({ error: 'Название и автор обязательны' });

        const copies = total_copies || 1;
        const result = runQuery(
            `INSERT INTO books (isbn, title, author, publisher, year, description, total_copies, available_copies)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [isbn, title, author, publisher, year, description, copies, copies]
        );
        saveDatabase();
        res.json({ id: result.lastInsertRowid, message: 'Книга добавлена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
        if (result.changes === 0) return res.status(404).json({ error: 'Книга не найдена' });
        saveDatabase();
        res.json({ message: 'Книга обновлена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/books/:id', (req, res) => {
    try {
        runQuery('DELETE FROM books WHERE id = ?', [req.params.id]);
        saveDatabase();
        res.json({ message: 'Книга удалена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats', (req, res) => {
    try {
        const totalBooks = getOne('SELECT COUNT(*) as total FROM books')?.total || 0;
        const totalUsers = getOne('SELECT COUNT(*) as total FROM users')?.total || 0;
        const onlineUsers = getOne('SELECT COUNT(*) as total FROM users WHERE online = 1')?.total || 0;
        const activeLoans = getOne('SELECT COUNT(*) as total FROM loans WHERE status = "active"')?.total || 0;
        const overdueLoans = getOne('SELECT COUNT(*) as total FROM loans WHERE status = "active" AND due_date < datetime("now")')?.total || 0;
        const popularBooks = getAll(`
            SELECT b.id, b.title, b.author, COUNT(l.id) as loan_count
            FROM books b JOIN loans l ON b.id = l.book_id
            GROUP BY b.id ORDER BY loan_count DESC LIMIT 5
        `);

        res.json({
            totalBooks,
            totalUsers,
            onlineUsers,
            activeLoans,
            overdueLoans,
            popularBooks
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/loans', (req, res) => {
    try {
        const { user_id, book_id, who_took, due_days = 14 } = req.body;
        const book = getOne('SELECT available_copies FROM books WHERE id = ?', [book_id]);
        if (!book || book.available_copies < 1) return res.status(400).json({ error: 'Книга недоступна' });

        const result = runQuery(
            `INSERT INTO loans (user_id, book_id, who_took, due_date)
             VALUES (?, ?, ?, datetime("now", "+" || ? || " days"))`,
            [user_id, book_id, who_took || 'Администратор', due_days]
        );
        runQuery('UPDATE books SET available_copies = available_copies - 1 WHERE id = ?', [book_id]);
        saveDatabase();
        res.json({ loan_id: result.lastInsertRowid, message: 'Книга выдана' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/loans/:id/return', (req, res) => {
    try {
        const { id } = req.params;
        const loan = getOne('SELECT book_id FROM loans WHERE id = ? AND status = "active"', [id]);
        if (!loan) return res.status(404).json({ error: 'Запись не найдена' });

        runQuery(`UPDATE loans SET return_date = datetime("now"), status = "returned" WHERE id = ?`, [id]);
        runQuery('UPDATE books SET available_copies = available_copies + 1 WHERE id = ?', [loan.book_id]);
        saveDatabase();
        res.json({ message: 'Книга возвращена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/loans', (req, res) => {
    try {
        res.json(getAll(`
            SELECT l.*, u.username as user_name, u.full_name as user_full_name,
                   b.title as book_title, b.author as book_author
            FROM loans l
            JOIN users u ON l.user_id = u.id
            JOIN books b ON l.book_id = b.id
            ORDER BY l.loan_date DESC
        `));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/loans/active', (req, res) => {
    try {
        res.json(getAll(`
            SELECT l.*, u.username as user_name, u.full_name as user_full_name,
                   b.title as book_title, b.author as book_author
            FROM loans l
            JOIN users u ON l.user_id = u.id
            JOIN books b ON l.book_id = b.id
            WHERE l.status = 'active'
            ORDER BY l.due_date ASC
        `));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/test', (req, res) => {
    res.json({ message: '✅ API работает', time: new Date().toISOString(), dbExists: fs.existsSync(dbPath) });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// ЗАПУСК
// ============================================
initDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`👑 Админ: creator / admin123`);
        console.log(`👤 Пользователь: user / user123`);
        console.log(`📂 БД: ${dbPath}`);
        console.log(`📁 Файл БД существует: ${fs.existsSync(dbPath)}`);
    });
}).catch(err => {
    console.error('❌ Ошибка запуска:', err);
    process.exit(1);
});