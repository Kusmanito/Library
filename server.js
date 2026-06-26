const express = require('express');
const sqlite3 = require('sqlite3');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================
// НАСТРОЙКА ПУТИ К БАЗЕ ДАННЫХ ДЛЯ AMVERA
// ============================================
const dbPath = process.env.AMVERA_DATA_PATH 
    ? `${process.env.AMVERA_DATA_PATH}/library.db` 
    : './database/library.db';

console.log(`📂 Путь к БД: ${dbPath}`);

// Создаем папку для БД, если её нет (локально)
if (!process.env.AMVERA_DATA_PATH) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`📁 Создана папка: ${dbDir}`);
    }
}

// Подключение к БД
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
    } else {
        console.log('✅ Подключено к SQLite');
        initDatabase();
    }
});

// ============================================
// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
// ============================================
function initDatabase() {
    db.serialize(() => {
        // Таблица пользователей
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

        // Таблица книг
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

        // Таблица выдачи
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

        addTestData();
    });
}

// ============================================
// ТЕСТОВЫЕ ДАННЫЕ
// ============================================
function addTestData() {
    db.get('SELECT COUNT(*) as count FROM books', (err, row) => {
        if (err) return console.error('Ошибка проверки книг:', err);
        if (row.count === 0) {
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

            books.forEach(book => {
                stmt.run(book);
            });

            stmt.finalize();
            console.log('✅ Добавлены тестовые книги');
        }
    });

    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) return console.error('Ошибка проверки пользователей:', err);
        if (row.count === 0) {
            const passwordHash = bcrypt.hashSync('password123', 10);
            db.run(`
                INSERT INTO users (email, password_hash, full_name, phone)
                VALUES (?, ?, ?, ?)
            `, ['admin@library.ru', passwordHash, 'Администратор', '+7(999)123-45-67']);
            console.log('✅ Создан администратор (admin@library.ru / password123)');
        }
    });
}

// ============================================
// API ЭНДПОИНТЫ
// ============================================

// Получить все книги
app.get('/api/books', (req, res) => {
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
    db.get(countQuery, params, (err, countRow) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        query += ' ORDER BY title LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        db.all(query, params, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                books: rows,
                total: countRow.total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        });
    });
});

// Получить книгу по ID
app.get('/api/books/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM books WHERE id = ?', [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Книга не найдена' });
        }
        res.json(row);
    });
});

// Добавить книгу
app.post('/api/books', (req, res) => {
    const { isbn, title, author, publisher, year, description, total_copies } = req.body;
    
    if (!title || !author) {
        return res.status(400).json({ error: 'Название и автор обязательны' });
    }

    const copies = total_copies || 1;
    db.run(`
        INSERT INTO books (isbn, title, author, publisher, year, description, total_copies, available_copies)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [isbn, title, author, publisher, year, description, copies, copies], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Книга с таким ISBN уже существует' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.json({ 
            id: this.lastID,
            message: 'Книга добавлена'
        });
    });
});

// Обновить книгу
app.put('/api/books/:id', (req, res) => {
    const { id } = req.params;
    const { title, author, publisher, year, description, total_copies, available_copies } = req.body;

    db.run(`
        UPDATE books 
        SET title = ?, author = ?, publisher = ?, year = ?, 
            description = ?, total_copies = ?, available_copies = ?
        WHERE id = ?
    `, [title, author, publisher, year, description, total_copies, available_copies, id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Книга не найдена' });
        }
        res.json({ message: 'Книга обновлена' });
    });
});

// Удалить книгу
app.delete('/api/books/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM books WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Книга не найдена' });
        }
        res.json({ message: 'Книга удалена' });
    });
});

// Статистика
app.get('/api/stats', (req, res) => {
    const stats = {};

    db.get('SELECT COUNT(*) as total FROM books', (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.totalBooks = row.total;

        db.get('SELECT COUNT(*) as total FROM users', (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.totalUsers = row.total;

            db.get('SELECT COUNT(*) as total FROM loans WHERE status = "active"', (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                stats.activeLoans = row.total;

                db.get('SELECT COUNT(*) as total FROM loans WHERE status = "active" AND due_date < datetime("now")', (err, row) => {
                    if (err) return res.status(500).json({ error: err.message });
                    stats.overdueLoans = row.total;

                    db.all(`
                        SELECT b.id, b.title, b.author, COUNT(l.id) as loan_count
                        FROM books b
                        JOIN loans l ON b.id = l.book_id
                        GROUP BY b.id
                        ORDER BY loan_count DESC
                        LIMIT 5
                    `, (err, rows) => {
                        if (err) return res.status(500).json({ error: err.message });
                        stats.popularBooks = rows;
                        res.json(stats);
                    });
                });
            });
        });
    });
});

// Выдать книгу
app.post('/api/loans', (req, res) => {
    const { user_id, book_id, due_days = 14 } = req.body;

    db.get('SELECT available_copies FROM books WHERE id = ?', [book_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row || row.available_copies < 1) {
            return res.status(400).json({ error: 'Книга недоступна' });
        }

        db.run(`
            INSERT INTO loans (user_id, book_id, due_date)
            VALUES (?, ?, datetime("now", "+" || ? || " days"))
        `, [user_id, book_id, due_days], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            db.run('UPDATE books SET available_copies = available_copies - 1 WHERE id = ?', [book_id]);
            res.json({ 
                loan_id: this.lastID,
                message: 'Книга выдана'
            });
        });
    });
});

// Вернуть книгу
app.put('/api/loans/:id/return', (req, res) => {
    const { id } = req.params;

    db.get('SELECT book_id FROM loans WHERE id = ? AND status = "active"', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Запись не найдена или уже возвращена' });

        db.run(`
            UPDATE loans 
            SET return_date = datetime("now"), status = "returned" 
            WHERE id = ?
        `, [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            db.run('UPDATE books SET available_copies = available_copies + 1 WHERE id = ?', [row.book_id]);
            res.json({ message: 'Книга возвращена' });
        });
    });
});

// Получить все выдачи
app.get('/api/loans', (req, res) => {
    db.all(`
        SELECT l.*, u.full_name as user_name, b.title as book_title 
        FROM loans l
        JOIN users u ON l.user_id = u.id
        JOIN books b ON l.book_id = b.id
        ORDER BY l.loan_date DESC
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Регистрация
app.post('/api/users/register', (req, res) => {
    const { email, password, full_name, phone, consent_152fz } = req.body;

    if (!email || !password || !full_name) {
        return res.status(400).json({ error: 'Email, пароль и имя обязательны' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    db.run(`
        INSERT INTO users (email, password_hash, full_name, phone, consent_152fz)
        VALUES (?, ?, ?, ?, ?)
    `, [email, passwordHash, full_name, phone, consent_152fz || 1], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.json({ 
            id: this.lastID,
            message: 'Регистрация успешна'
        });
    });
});

// Авторизация
app.post('/api/users/login', (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Неверный email или пароль' });

        delete user.password_hash;
        res.json({ 
            user,
            message: 'Вход выполнен'
        });
    });
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

// Статические файлы
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📚 Библиотечная система`);
    console.log(`🔗 http://localhost:${PORT}`);
    console.log(`📧 admin@library.ru / password123`);
});