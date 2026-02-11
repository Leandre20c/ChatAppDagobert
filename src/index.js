const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const { UserDB, MessageDB, db } = require('./database')
//rooms dans la database

// State
const UsersState = {
    users: [], // [{socketId, userId, username, room, status}]

    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    },

    // Add/modify a connected user
    addUser: function(socketId, userId, username) {
        const user = { socketId, userId, username, room: 'general', status: 'online' }
        this.users = [...this.users.filter(u => u.socketId !== socketId), user]
        return user
    },

    // Update the room
    setUserRoom: function(socketId, room) {
        const user = this.users.find(u => u.socketId === socketId)
        if (user) {
            user.room = room
        }
        return user
    },

    // Get user by socket id
    getBySocketId: function(socketId) {
        return this.users.find(u => u.socketId === socketId)
    },

    // get user by his id (database)
    getByUserId: function(userId) {
        return this.users.find(u => u.userId === userId)
    },

    // get user by his username
    getUserByName: function(username) {
        return this.users.find(u => u.username === username)
    },

    // Get all users in a room
    getUsersInRoom: function(room) {
        return this.users.filter(u => u.room === room)
    },

    // On disconnect
    removeUser: function(socketId) {
        this.users = this.users.filter(u => u.socketId !== socketId)
    },

    // Get all active rooms
    getActiveRooms: function() {
        return [...new Set(this.users.map(u => u.room).filter(room => room !== null))]
    }
}

// On rend tout accessible avec express
app.use(express.static('public'))

// On demarre la bestiole
http.listen(3000, () => {
    console.log('Serveur lancé sur http://localhost:3000')
})

// Tous les events
io.on('connection', (socket) => {
    console.log('User ' + socket.id + ' connected')

    // On register
    socket.on('register', async ({ username, password }) => {
        const result = await UserDB.register(username, password)

        if (result.success === true) {
            socket.emit('register-success')
        } else {
            socket.emit('connexion-error', result.error)
        }
    })

    socket.on('login', async ({ username, password}) => {
        const result = await UserDB.login(username, password)

        if (result.success === true) {
            socket.emit('login-success')
            socket.emit('enterRoom', { name: result.user.username, room: 'PublicRoom' })
        } else {
            socket.emit('connexion-error', result.error)
        }
    })

    socket.on('verify-session', (username) => {
        // Verify if the user is in the db
        const stmt = db.prepare('SELECT id, username FROM users WHERE username = ?')
        const user = stmt.get(username)

        if (user) {
            // The user exists, add it to users
            UsersState.addUser(socket.id, user.id, user.username)
            socket.emit('session-valid', { username: user.username, userId: user.id })
        } else {
            // User is not in the db :(((
            socket.emit('session-invalid')
        }
    })

    // When user send message
    socket.on('message', (data) => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (!user) {
            socket.emit('error', 'Vous devez être connecté pour envoyer des messages')
            return
        }

        if (user.room) {
            io.to(user.room).emit('message', buildMessage(data.name, data.text))
        } else {
            io.emit('message', buildMessage(data.name, data.text))
        }
    })

    // When user enter a room
    socket.on('enterRoom', ({name, room}) => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (!user) {
            socket.emit('error', 'Vous devez être connecté')
            return
        }

        if (!room || room.trim() === '') {
            socket.emit('error', 'Nom de room invalide')
            return
        }

        const prevRoom = user.room

        if (prevRoom === room) {
            // Alert the player
            socket.emit('message', buildMessage("ALERT", "You are already in this room."))
            return
        }

        if (prevRoom != null) {
            socket.leave(prevRoom)
            io.to(prevRoom).emit('message', buildMessage('INFO', name + ' leaved the room'))
            
            // Update previous room
            io.to(prevRoom).emit('userList', {
                users: UsersState.getUsersInRoom(prevRoom)
            })
        }

        // Vérifie ou crée la room en base
        var roomId;
        const roomStmt = db.prepare('SELECT id FROM rooms WHERE room_name = ?');
        const foundRoom = roomStmt.get(room);
        if (!foundRoom) {
            const insertRoom = db.prepare('INSERT INTO rooms (room_name) VALUES (?)');
            const info = insertRoom.run(room);
            roomId = info.lastInsertRowid;
        } else {
            roomId = foundRoom.id;
        }

        // Ajoute le user à la room (table room_members)
        const userId = user.userId;
        const addMember = db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)');
        addMember.run(roomId, userId);

        // Update user's room côté state
        user.room = room;
        socket.join(room);

        // Récupère les users de la room depuis la base
        const usersStmt = db.prepare(`SELECT u.id, u.username FROM users u JOIN room_members rm ON u.id = rm.user_id WHERE rm.room_id = ?`);
        const usersInRoom = usersStmt.all(roomId);

        socket.emit('message', buildMessage("INFO", "Vous avez rejoint : " + room))
        io.to(room).emit('message', buildMessage("INFO", name + " joined the room"))

        // Update current room
        io.to(room).emit('userList', {
            users: usersInRoom
        });

        // Liste des rooms actives
        const activeRoomsStmt = db.prepare('SELECT r.room_name, COUNT(rm.user_id) as userCount FROM rooms r LEFT JOIN room_members rm ON r.id = rm.room_id GROUP BY r.id');
        const activeRooms = activeRoomsStmt.all();
        io.emit('roomList', {
            rooms: activeRooms
        });
    })

    // Disconnect
    socket.on('disconnect', () => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (user) {
            if (user.room) {
                io.to(user.room).emit('message', buildMessage('INFO', `${user.name} s'est déconnecté`))
                
                io.to(user.room).emit('userList', {
                    users: UsersState.getUsersInRoom(user.room)
                })
            }

            UsersState.removeUser(socket.id)

            io.emit('roomList', {
                rooms: UsersState.getActiveRooms().map(room => ({
                    name: room,
                    userCount: UsersState.getUsersInRoom(room).length
                }))
            })

            console.log(`User ${user.username} (${socket.id}) disconnected`)
        } else {
            console.log(`Unknown user ${socket.id} disconnected`)
        }
    })
})


function buildMessage(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date())
    }
}