const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const { UserDB, MessageDB, db } = require('./database')
const rooms = []

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

        // Update user's room
        user.room = room
        socket.join(room)

        // If room doesnt exist, add it
        if (!rooms.includes(room)) {
            rooms.push(room)
        }

        socket.emit('message', buildMessage("INFO", "Vous avez rejoint : " + room))
        io.to(room).emit('message', buildMessage("INFO", name + " joined the room"))

        // Update current room
        io.to(room).emit('userList', {
            users: UsersState.getUsersInRoom(room)
        })

        io.emit('roomList', {
            rooms: UsersState.getActiveRooms().map(room => ({
                name: room,
                userCount: UsersState.getUsersInRoom(room).length
            }))
        })
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