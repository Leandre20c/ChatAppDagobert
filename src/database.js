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

    CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_name TEXT UNIQUE NOT NULL,
        is_permanent BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_members (
        room_id INTEGER NOT NULL,
        user_id INTEGER NOT null,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (room_id, user_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        room_id INTEGER,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS private_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
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


function initializeDatabase(database) {
    const stmt = database.prepare('SELECT id FROM rooms WHERE room_name = ?')
    const generalRoom = stmt.get('General')
    
    if (!generalRoom) {
        const insertStmt = database.prepare('INSERT INTO rooms (room_name, is_permanent) VALUES (?, 1)')
        insertStmt.run('General')
        console.log('Room "General" créée')
    }
}


function createRoomDB(database) {
    // Internal helper
    const normalizeRoomName = (roomName) => {
        const trimmed = roomName.trim()
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
    }

    const addUserToRoom = (userId, roomId) => {
        database.prepare('DELETE FROM room_members WHERE user_id = ?').run(userId)
        database.prepare('INSERT INTO room_members (user_id, room_id) VALUES (?, ?)').run(userId, roomId)
    }

    const addRoom = (roomName) => {
        const normalized = normalizeRoomName(roomName)
        const stmt = database.prepare('INSERT INTO rooms (room_name) VALUES (?)')
        const result = stmt.run(normalized)
        return result.lastInsertRowid
    }

    return {
        createRoom(userId, roomName) {
            try {
                const roomId = addRoom(roomName)
                try {
                    addUserToRoom(userId, roomId)
                } catch (error) {
                    database.prepare('DELETE FROM rooms WHERE id = ?').run(roomId)
                    return { success: false, error: 'Error adding user to room.' }
                }
                return { success: true, roomId: roomId }
            } catch (error) {
                return { success: false, error: 'This room already exists.' }
            }
        },

        deleteRoom(roomId) {
            const stmt = database.prepare('SELECT * FROM rooms WHERE id = ?')
            const room = stmt.get(roomId)

            if (!room) {
                return { success: false, error: 'Room does not exists' }
            }

            if (room.is_permanent) {
                return { success: false, error: 'Cannot delete permanent room' }
            }
        
            database.prepare('DELETE FROM rooms WHERE id = ?').run(roomId)

            return { success: true }
        },

        joinRoomById(userId, roomId) {
            try {
                const room = database.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId)
                
                if (!room) {
                    return { success: false, error: 'Room does not exist' }
                }
                
                addUserToRoom(userId, roomId)
                
                return { success: true, roomId: roomId }
            } catch (error) {
                return { success: false, error: 'Error joining room.' }
            }
        },
        
        joinRoomByName(userId, roomName) {
            try {
                const normalized = normalizeRoomName(roomName)
                let room = database.prepare('SELECT id FROM rooms WHERE room_name = ?').get(normalized)
                let roomId

                if (!room) {
                    roomId = addRoom(normalized)
                } else {
                    roomId = room.id
                }
                
                addUserToRoom(userId, roomId)
                
                return { success: true, roomId: roomId }
            } catch (error) {
                return { success: false, error: 'Error joining room.' }
            }
        },

        leaveRoom(userId) {
            try {
                const result = database.prepare('DELETE FROM room_members WHERE user_id = ?').run(userId)
                
                if (result.changes === 0) {
                    return { success: false, error: 'User is not in any room.' }
                }
            
                return { success: true }
            } catch (error) {
                return { success: false, error: 'Error leaving room.' }
            }
        },

        getAllRoomMessages() {
            // TODO
        },

        getAllRooms() {
            const stmt = database.prepare('SELECT id, room_name, created_at FROM rooms ORDER BY created_at DESC')
            return stmt.all()
        },

        getUsersInRoom(roomId) {

        },

        deleteEmptyRooms() {
            const stmt = database.prepare(`
                DELETE FROM rooms 
                WHERE id NOT IN (SELECT DISTINCT room_id FROM room_members)
                AND is_permanent = 0
            `)
            const result = stmt.run()
            return { success: true, deletedCount: result.changes }
        }
    }
}

const RoomDB = createRoomDB(db)
initializeDatabase(db)

module.exports = { 
    UserDB, 
    MessageDB,
    RoomDB,
    createUserDB,
    createMessageDB,
    createRoomDB,
    db
}