const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// ПОДКЛЮЧЕНИЕ К POSTGRESQL
// ============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect((err) => {
    if (err) {
        console.error('❌ Ошибка подключения к PostgreSQL:', err.stack);
    } else {
        console.log('✅ Подключено к PostgreSQL');
        initDatabase();
    }
});

// ============================================
// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
// ============================================
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                role TEXT DEFAULT 'user',
                online BOOLEAN DEFAULT FALSE,
                last_seen TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS books (
                id SERIAL PRIMARY KEY,
                isbn TEXT UNIQUE,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                publisher TEXT,
                year INTEGER,
                description TEXT,
                total_copies INTEGER DEFAULT 1,
                available_copies INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS loans (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                book_id INTEGER REFERENCES books(id),
                who_took TEXT,
                loan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                due_date TIMESTAMP,
                return_date TIMESTAMP,
                status TEXT DEFAULT 'active'
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS page_visits (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                username TEXT,
                page TEXT NOT NULL,
                ip TEXT,
                user_agent TEXT,
                visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Таблицы созданы/проверены');
        await addTestData();
    } catch (err) {
        console.error('❌ Ошибка инициализации БД:', err.message);
    }
}

async function addTestData() {
    try {
        const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['creator']);
        if (adminCheck.rows.length === 0) {
            console.log('👑 Создаём супер-админа...');
            const hashAdmin = bcrypt.hashSync('admin123', 10);
            await pool.query(
                `INSERT INTO users (username, password_hash, full_name, role)
                 VALUES ($1, $2, $3, $4)`,
                ['creator', hashAdmin, 'Создатель', 'super_admin']
            );
            console.log('✅ Создан супер-админ (creator / admin123)');
        }

        const booksCheck = await pool.query('SELECT COUNT(*) FROM books');
        if (parseInt(booksCheck.rows[0].count) === 0) {
            console.log('📚 Добавляем тестовые книги...');
            const books = [
                ['978-5-17-118914-3', 'Война и мир', 'Лев Толстой', 'АСТ', 1869, 'Роман-эпопея', 5, 3],
                ['978-5-04-118923-9', 'Преступление и наказание', 'Достоевский', 'Эксмо', 1866, 'Роман', 4, 2],
                ['978-5-17-089876-5', 'Мастер и Маргарита', 'Булгаков', 'АСТ', 1967, 'Мистический роман', 3, 1],
                ['978-5-17-118886-8', '1984', 'Оруэлл', 'АСТ', 1949, 'Антиутопия', 2, 2],
                ['978-5-04-107984-4', 'Тихий Дон', 'Шолохов', 'Эксмо', 1940, 'Эпопея', 3, 0]
            ];

            for (const book of books) {
                await pool.query(
                    `INSERT INTO books (isbn, title, author, publisher, year, description, total_copies, available_copies)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    book
                );
            }
            console.log(`✅ Добавлено ${books.length} книг`);
        }

        const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['user']);
        if (userCheck.rows.length === 0) {
            console.log('👤 Создаём тестового пользователя...');
            const hashUser = bcrypt.hashSync('user123', 10);
            await pool.query(
                `INSERT INTO users (username, password_hash, full_name, role)
                 VALUES ($1, $2, $3, $4)`,
                ['user', hashUser, 'Тестовый пользователь', 'user']
            );
            console.log('✅ Создан пользователь (user / user123)');
        }
    } catch (err) {
        console.error('❌ Ошибка добавления тестовых данных:', err.message);
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================
async function getAll(query, params = []) {
    const result = await pool.query(query, params);
    return result.rows;
}

async function getOne(query, params = []) {
    const result = await pool.query(query, params);
    return result.rows[0] || null;
}

// ============================================
// API
// ============================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, full_name } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });

        const existing = await getOne('SELECT * FROM users WHERE username = $1', [username]);
        if (existing) return res.status(400).json({ error: 'Пользователь уже существует' });

        const hash = bcrypt.hashSync(password, 10);
        const result = await pool.query(
            `INSERT INTO users (username, password_hash, full_name, role)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [username, hash, full_name || username, 'user']
        );
        res.json({ id: result.rows[0].id, message: 'Регистрация успешна' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await getOne('SELECT * FROM users WHERE username = $1', [username]);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        await pool.query('UPDATE users SET online = TRUE, last_seen = NOW() WHERE id = $1', [user.id]);
        delete user.password_hash;
        res.json({ user, message: 'Вход выполнен' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (user_id) {
            await pool.query('UPDATE users SET online = FALSE WHERE id = $1', [user_id]);
        }
        res.json({ message: 'Выход выполнен' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/status', async (req, res) => {
    try {
        const { user_id } = req.query;
        if (!user_id) return res.json({ isAuth: false });
        const user = await getOne('SELECT id, username, full_name, role, online FROM users WHERE id = $1', [user_id]);
        res.json({ isAuth: !!user, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await getAll('SELECT id, username, full_name, role, online, last_seen FROM users');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/role', async (req, res) => {
    try {
        const { id } = req.params;
        const { role, admin_id } = req.body;
        const admin = await getOne('SELECT role FROM users WHERE id = $1', [admin_id]);
        if (!admin || admin.role !== 'super_admin') {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
        res.json({ message: 'Роль обновлена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/books', async (req, res) => {
    try {
        const { search, author, year, limit = 20, offset = 0 } = req.query;
        let query = 'SELECT * FROM books WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (title ILIKE $${paramIndex} OR author ILIKE $${paramIndex} OR isbn ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (author) {
            query += ` AND author = $${paramIndex}`;
            params.push(author);
            paramIndex++;
        }
        if (year) {
            query += ` AND year = $${paramIndex}`;
            params.push(year);
            paramIndex++;
        }

        const totalResult = await pool.query(query.replace('SELECT *', 'SELECT COUNT(*) as total'), params);
        const total = parseInt(totalResult.rows[0].total);

        query += ` ORDER BY title LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const books = await pool.query(query, params);
        res.json({ books: books.rows, total, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/books/:id', async (req, res) => {
    try {
        const book = await getOne('SELECT * FROM books WHERE id = $1', [req.params.id]);
        if (!book) return res.status(404).json({ error: 'Книга не найдена' });
        res.json(book);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/books', async (req, res) => {
    try {
        const { isbn, title, author, publisher, year, description, total_copies } = req.body;
        if (!title || !author) return res.status(400).json({ error: 'Название и автор обязательны' });

        const copies = total_copies || 1;
        const result = await pool.query(
            `INSERT INTO books (isbn, title, author, publisher, year, description, total_copies, available_copies)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [isbn, title, author, publisher, year, description, copies, copies]
        );
        res.json({ id: result.rows[0].id, message: 'Книга добавлена' });
    } catch (err) {
        if (err.message.includes('duplicate key')) {
            return res.status(400).json({ error: 'Книга с таким ISBN уже существует' });
        }
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/books/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, author, publisher, year, description, total_copies, available_copies } = req.body;
        const result = await pool.query(
            `UPDATE books 
             SET title = $1, author = $2, publisher = $3, year = $4, 
                 description = $5, total_copies = $6, available_copies = $7
             WHERE id = $8`,
            [title, author, publisher, year, description, total_copies, available_copies, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Книга не найдена' });
        res.json({ message: 'Книга обновлена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/books/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM books WHERE id = $1', [req.params.id]);
        res.json({ message: 'Книга удалена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const totalBooks = (await pool.query('SELECT COUNT(*) as total FROM books')).rows[0].total;
        const totalUsers = (await pool.query('SELECT COUNT(*) as total FROM users')).rows[0].total;
        const onlineUsers = (await pool.query('SELECT COUNT(*) as total FROM users WHERE online = TRUE')).rows[0].total;
        const activeLoans = (await pool.query('SELECT COUNT(*) as total FROM loans WHERE status = $1', ['active'])).rows[0].total;
        const overdueLoans = (await pool.query(
            `SELECT COUNT(*) as total FROM loans WHERE status = $1 AND due_date < NOW()`, ['active']
        )).rows[0].total;
        const popularBooks = await pool.query(`
            SELECT b.id, b.title, b.author, COUNT(l.id) as loan_count
            FROM books b JOIN loans l ON b.id = l.book_id
            GROUP BY b.id ORDER BY loan_count DESC LIMIT 5
        `);

        res.json({
            totalBooks: parseInt(totalBooks),
            totalUsers: parseInt(totalUsers),
            onlineUsers: parseInt(onlineUsers),
            activeLoans: parseInt(activeLoans),
            overdueLoans: parseInt(overdueLoans),
            popularBooks: popularBooks.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/loans', async (req, res) => {
    try {
        const { user_id, book_id, who_took, due_days = 14 } = req.body;
        const book = await getOne('SELECT available_copies FROM books WHERE id = $1', [book_id]);
        if (!book || book.available_copies < 1) return res.status(400).json({ error: 'Книга недоступна' });

        const result = await pool.query(
            `INSERT INTO loans (user_id, book_id, who_took, due_date)
             VALUES ($1, $2, $3, NOW() + INTERVAL '$4 days') RETURNING id`,
            [user_id, book_id, who_took || 'Администратор', due_days]
        );
        await pool.query('UPDATE books SET available_copies = available_copies - 1 WHERE id = $1', [book_id]);
        res.json({ loan_id: result.rows[0].id, message: 'Книга выдана' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/loans/:id/return', async (req, res) => {
    try {
        const { id } = req.params;
        const loan = await getOne('SELECT book_id FROM loans WHERE id = $1 AND status = $2', [id, 'active']);
        if (!loan) return res.status(404).json({ error: 'Запись не найдена' });

        await pool.query(`UPDATE loans SET return_date = NOW(), status = $1 WHERE id = $2`, ['returned', id]);
        await pool.query('UPDATE books SET available_copies = available_copies + 1 WHERE id = $1', [loan.book_id]);
        res.json({ message: 'Книга возвращена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/loans', async (req, res) => {
    try {
        const loans = await pool.query(`
            SELECT l.*, u.username as user_name, u.full_name as user_full_name,
                   b.title as book_title, b.author as book_author
            FROM loans l
            JOIN users u ON l.user_id = u.id
            JOIN books b ON l.book_id = b.id
            ORDER BY l.loan_date DESC
        `);
        res.json(loans.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/loans/active', async (req, res) => {
    try {
        const loans = await pool.query(`
            SELECT l.*, u.username as user_name, u.full_name as user_full_name,
                   b.title as book_title, b.author as book_author
            FROM loans l
            JOIN users u ON l.user_id = u.id
            JOIN books b ON l.book_id = b.id
            WHERE l.status = $1
            ORDER BY l.due_date ASC
        `, ['active']);
        res.json(loans.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// СТАТИСТИКА ПОСЕЩЕНИЙ
// ============================================

app.post('/api/visit', async (req, res) => {
    try {
        const { user_id, username, page } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'unknown';

        await pool.query(
            `INSERT INTO page_visits (user_id, username, page, ip, user_agent)
             VALUES ($1, $2, $3, $4, $5)`,
            [user_id || null, username || 'guest', page, ip, userAgent]
        );
        res.json({ message: 'ok' });
    } catch (err) {
        console.error('Ошибка записи визита:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats/detailed', async (req, res) => {
    try {
        const onlineNow = await pool.query(`
            SELECT COUNT(DISTINCT user_id) as online_count 
            FROM page_visits 
            WHERE visited_at > NOW() - INTERVAL '5 minutes'
              AND user_id IS NOT NULL
        `);

        const onlineUsers = await pool.query(`
            SELECT DISTINCT u.id, u.username, u.full_name, u.role,
                   (SELECT page FROM page_visits 
                    WHERE user_id = u.id 
                    ORDER BY visited_at DESC LIMIT 1) as current_page,
                   MAX(v.visited_at) as last_seen
            FROM users u
            JOIN page_visits v ON u.id = v.user_id
            WHERE v.visited_at > NOW() - INTERVAL '5 minutes'
            GROUP BY u.id
            ORDER BY last_seen DESC
        `);

        const guestsOnline = await pool.query(`
            SELECT COUNT(DISTINCT ip) as guests_count
            FROM page_visits 
            WHERE visited_at > NOW() - INTERVAL '5 minutes'
              AND user_id IS NULL
        `);

        const popularPages = await pool.query(`
            SELECT 
                page,
                COUNT(*) as visits,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT ip) as unique_ips
            FROM page_visits 
            WHERE visited_at::date = CURRENT_DATE
            GROUP BY page
            ORDER BY visits DESC
            LIMIT 10
        `);

        const todayStats = await pool.query(`
            SELECT 
                COUNT(*) as total_visits,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT ip) as unique_visitors
            FROM page_visits 
            WHERE visited_at::date = CURRENT_DATE
        `);

        const hourlyStats = await pool.query(`
            SELECT 
                EXTRACT(HOUR FROM visited_at) as hour,
                COUNT(*) as visits
            FROM page_visits 
            WHERE visited_at::date = CURRENT_DATE
            GROUP BY EXTRACT(HOUR FROM visited_at)
            ORDER BY hour
        `);

        res.json({
            onlineNow: parseInt(onlineNow.rows[0]?.online_count || 0),
            guestsOnline: parseInt(guestsOnline.rows[0]?.guests_count || 0),
            onlineUsers: onlineUsers.rows,
            popularPages: popularPages.rows,
            todayStats: todayStats.rows[0],
            hourlyStats: hourlyStats.rows
        });
    } catch (err) {
        console.error('Ошибка получения статистики:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/test', (req, res) => {
    res.json({ message: '✅ API работает', time: new Date().toISOString() });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`👑 Админ: creator / admin123`);
    console.log(`👤 Пользователь: user / user123`);
});