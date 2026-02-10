const Database = require('better-sqlite3')
const bcrypt = require('bcrypt')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.db'))

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

const UserDB =  {
    async register(username, password) {
        try {
            // Ici faut enregister le mec
        } catch (error) {
            return { success: false, error: 'This username already exists' }
        }
    },

    async login(username, password) {
        // La faut juste le trouver et renvoyer sucess

        if (found) {
            return { success: true, user: { id: user.id, username: user.username } }
        }
    }
} 

const MessageDB = {
    save(userId, username, room, message) {
        // Enregistrer un message
    },

    getByRoom(room, limit = 50) {
        // Avoir tous les messages de la room
    }
}

module.exports = { UserDB, MessageDB }