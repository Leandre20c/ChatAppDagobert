const Database = require('better-sqlite3')
const bcrypt = require('bcrypt')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.db'))
db.pragma('journal_mode = WAL');

// table for users
// table for messages
// extendable for rooms, private msg, ect
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        room TEXT,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`)

// function so we can create a db for our tests
// Register: register a user in the db and search for incoherences
// Login: search a user in the db and return if it's found or nnot
function createUserDB(database) {
    return {
        async register(username, password) {
            try {
                const hashedPassword = await bcrypt.hash(password, 10)
                const stmt = database.prepare('INSERT INTO users (username, password) VALUES (?, ?)')
                const result = stmt.run(username, hashedPassword)
                return { success: true, userId: result.lastInsertRowid }
            } catch (error) {
                return { success: false, error: 'Ce pseudo existe déjà' }
            }
        },

        async login(username, password) {
            const stmt = database.prepare('SELECT * FROM users WHERE username = ?')
            const user = stmt.get(username)
            
            if (!user) {
                return { success: false, error: 'Utilisateur introuvable' }
            }

            const match = await bcrypt.compare(password, user.password)
            if (match) {
                return { success: true, user: { id: user.id, username: user.username } }
            }
            return { success: false, error: 'Mot de passe incorrect' }
        }
    }
}

const UserDB = createUserDB(db)

// function so we can create a db for our tests
function createMessageDB(database) {
    return {
        save(userId, username, room, message) {
            // Enregistrer un message
        },

        getByRoom(room, limit = 50) {
            // Avoir tous les messages de la room
        }
    }
}

const MessageDB = createMessageDB(db)

module.exports = { 
    UserDB, 
    MessageDB, 
    createUserDB,      // Pour les tests
    createMessageDB,   // Pour les tests
    db                 // db classique pour index.js
}