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
// Проверяем, где мы находимся
const isAmvera = !!process.env.AMVERA_DATA_PATH;
console.log(`🌍 Режим: ${isAmvera ? 'Amvera' : 'Локальный'}`);

// Путь к БД
const dbPath = isAmvera 
    ? path.join(process.env.AMVERA_DATA_PATH, 'library.db')
    : path.join(__dirname, 'database', 'library.db');

console.log(`📂 Путь к БД: ${dbPath}`);

// Создаем папку для БД
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
// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
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

        // Проверяем, есть ли таблицы
        try {
            db.exec('SELECT * FROM books LIMIT 1');
            console.log('✅ Таблицы уже существуют');
        } catch (e) {
            console.log('🔄 Создаем таблицы...');
            // Создаем таблицы
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    phone TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    consent_152fz BOOLEAN DEFAULT 1
                )
            `);

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

            db.run(`
                CREATE TABLE IF NOT EXISTS loans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    book_id INTEGER,
                    loan_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    due_date DATETIME,
                    return_date DATETIME,
                    status TEXT DEFAULT 'active',
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (book_id) REFERENCES books(id)
                )
            `);
            console.log('✅ Таблицы созданы');
        }

        // Добавляем тестовые данные, если их нет
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
// ТЕСТОВЫЕ ДАННЫЕ
// ============================================
function addTestData() {
    try {
        // Проверяем, есть ли книги
        const result = db.exec('SELECT COUNT(*) as count FROM books');
        const count = result[0]?.values?.[0]?.[0] || 0;
        console.log(`📊 Книг в БД: ${count}`);
        
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

        // Проверяем пользователей
        const userResult = db.exec('SELECT COUNT(*) as count FROM users');
        const userCount = userResult[0]?.values?.[0]?.[0] || 0;
        console.log(`👤 Пользователей в БД: ${userCount}`);
        
        if (userCount === 0) {
            console.log('👤 Создаем администратора...');
            const passwordHash = bcrypt.hashSync('password123', 10);
            const stmt = db.prepare(`
                INSERT INTO users (email, password_hash, full_name, phone)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run('admin@library.ru', passwordHash, 'Администратор', '+7(999)123-45-67');
            console.log('✅ Создан администратор (admin@library.ru / password123)');
        }
    } catch (err) {
        console.error('❌ Ошибка добавления тестовых данных:', err.message);
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С БД
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

        // Получаем общее количество
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

// Статистика
app.get('/api/stats', (req, res) => {
    try {
        console.log('📊 Запрос /api/stats');
        const totalBooks = getOne('SELECT COUNT(*) as total FROM books')?.total || 0;
        const totalUsers = getOne('SELECT COUNT(*) as total FROM users')?.total || 0;
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

        console.log(`📊 Статистика: книг=${totalBooks}, пользователей=${totalUsers}`);

        res.json({
            totalBooks,
            totalUsers,
            activeLoans,
            overdueLoans,
            popularBooks
        });
    } catch (err) {
        console.error('❌ Ошибка /api/stats:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Выдать книгу
app.post('/api/loans', (req, res) => {
    try {
        const { user_id, book_id, due_days = 14 } = req.body;

        // Проверяем наличие книги
        const book = getOne('SELECT available_copies FROM books WHERE id = ?', [book_id]);
        if (!book || book.available_copies < 1) {
            return res.status(400).json({ error: 'Книга недоступна' });
        }

        // Создаем запись о выдаче
        const result = runQuery(`
            INSERT INTO loans (user_id, book_id, due_date)
            VALUES (?, ?, datetime("now", "+" || ? || " days"))
        `, [user_id, book_id, due_days]);

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

// Получить все выдачи
app.get('/api/loans', (req, res) => {
    try {
        const loans = getAll(`
            SELECT l.*, u.full_name as user_name, b.title as book_title 
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

// Регистрация
app.post('/api/users/register', (req, res) => {
    try {
        const { email, password, full_name, phone, consent_152fz } = req.body;

        if (!email || !password || !full_name) {
            return res.status(400).json({ error: 'Email, пароль и имя обязательны' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        try {
            const result = runQuery(`
                INSERT INTO users (email, password_hash, full_name, phone, consent_152fz)
                VALUES (?, ?, ?, ?, ?)
            `, [email, passwordHash, full_name, phone, consent_152fz || 1]);
            
            saveDatabase();
            res.json({ 
                id: result.lastInsertRowid,
                message: 'Регистрация успешна'
            });
        } catch (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
            }
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Авторизация
app.post('/api/users/login', (req, res) => {
    try {
        const { email, password } = req.body;

        const user = getOne('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        delete user.password_hash;
        res.json({ 
            user,
            message: 'Вход выполнен'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Резервное копирование
app.get('/api/backup', (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, 'backups');
        const backupPath = path.join(backupDir, `library-backup-${timestamp}.db`);

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        saveDatabase();
        fs.copyFileSync(dbPath, backupPath);
        
        res.json({ 
            message: 'Бэкап создан',
            file: backupPath,
            timestamp: timestamp
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
            console.log(`📧 admin@library.ru / password123`);
            console.log(`📂 Путь к БД: ${dbPath}`);
            console.log(`🌍 Режим: ${isAmvera ? 'Amvera' : 'Локальный'}`);
        });
    } catch (err) {
        console.error('❌ Ошибка запуска сервера:', err.message);
        process.exit(1);
    }
}

startServer();