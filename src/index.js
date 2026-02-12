const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const { UserDB, MessageDB, RoomDB, db } = require('./database')

let activeRooms = []

function loadRooms() {
    const stmt = db.prepare('SELECT id, room_name, is_permanent FROM rooms')
    activeRooms = stmt.all()
    console.log(`${activeRooms.length} rooms loaded:`, activeRooms.map(r => r.room_name))
}

// Load all permanents rooms
loadRooms()

// State
const UsersState = {
    users: [], // [{socketId, userId, username, room, status}]

    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    },

    // Add/modify a connected user
    addUser: function(socketId, userId, username) {
        const user = { socketId, userId, username, room: 'General', status: 'online' }
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

    // On login
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
            // Check where is the user
            const roomStmt = db.prepare(`
                SELECT r.id, r.room_name 
                FROM room_members rm
                JOIN rooms r ON rm.room_id = r.id
                WHERE rm.user_id = ?
            `)
            let userRoom = roomStmt.get(user.id)

            // If no room attributed, move him in general
            if (!userRoom) {
                const generalRoom = db.prepare('SELECT id, room_name FROM rooms WHERE room_name = ?').get('General')
                if (generalRoom) {
                    RoomDB.joinRoomById(user.id, generalRoom.id)
                    userRoom = generalRoom
                }
            }

            UsersState.addUser(socket.id, user.id, user.username)
            const userState = UsersState.getBySocketId(socket.id)
            userState.room = userRoom.room_name

            socket.join(userRoom.room_name)

            socket.emit('session-valid', { 
                username: user.username, 
                userId: user.id,
                roomName: userRoom.room_name,
                roomUserCount: UsersState.getUsersInRoom(userRoom.room_name).length
            })

            socket.emit('roomList', {
                rooms: RoomDB.getAllRooms().map(room => ({
                    id: room.id,
                    room_name: room.room_name,
                    isPermanent: room.is_permanent,
                    userCount: UsersState.getUsersInRoom(room.room_name).length
                }))
            })

            socket.emit('userList', {
                users: UsersState.getUsersInRoom(userRoom.room_name)
            })

            socket.to(userRoom.room_name).emit('message', buildMessage('INFO', `${username} a rejoint le salon`))

            io.to(userRoom.room_name).emit('userList', {
                users: UsersState.getUsersInRoom(userRoom.room_name)
            })

        } else {
            // User is not in the db
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
    socket.on('enterRoom', async ({name, roomName}) => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (!user) {
            socket.emit('error', 'You must be connected.')
            return
        }

        if (!roomName || roomName.trim() === '') {
            console.log('Invalid room: ', roomName)
            socket.emit('error', 'Invalid room name: ' + roomName)
            return
        }

        const normalizedRoomName = roomName.trim().charAt(0).toUpperCase() + roomName.trim().slice(1).toLowerCase()

        // Join the room (it creates one if the room doesnt exists)
        const result = RoomDB.joinRoomByName(user.userId, normalizedRoomName)
        if (!result.success) {
            socket.emit('error', result.error)
            return
        }

        const prevRoom = user.room

        // Cannot join a room that you are already in
        if (prevRoom === normalizedRoomName) {
            socket.emit('message', buildMessage("ALERT", "You are already in this room."))
            return
        }

        // Update previous room
        if (prevRoom != null) {
            socket.leave(prevRoom)
            io.to(prevRoom).emit('message', buildMessage('INFO', name + ' leaved the room'))
            
            io.to(prevRoom).emit('userList', {
                users: UsersState.getUsersInRoom(prevRoom)
            })

            const result = RoomDB.deleteEmptyRooms()
            if (result.deletedCount > 0) console.log(`${result.deletedCount} rooms removed.`)
        }

        // Update user's room
        user.room = normalizedRoomName
        socket.join(normalizedRoomName)

        // Tell to everyone except the client
        socket.to(normalizedRoomName).emit('message', buildMessage("INFO", name + " joined the room"))

        // Only to client
        socket.emit('message', buildMessage("INFO", "You have joined the room " + normalizedRoomName))

        // To display the correct room
        socket.emit('roomChanged', normalizedRoomName)

        // Update lists
        io.to(normalizedRoomName).emit('userList', {
            users: UsersState.getUsersInRoom(normalizedRoomName)
        })

        io.emit('roomList', {
            rooms: RoomDB.getAllRooms().map(room => ({
                ...room,
                userCount: UsersState.getUsersInRoom(room.room_name).length
            }))
        })
    })

    // Disconnect
    socket.on('disconnect', () => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (user) {
            RoomDB.leaveRoom(user.userId)

            io.to(user.room).emit('message', buildMessage('INFO', `${user.name} s'est déconnecté`))
            
            io.to(user.room).emit('userList', {
                users: UsersState.getUsersInRoom(user.room)
            })

            UsersState.removeUser(socket.id)
            const result = RoomDB.deleteEmptyRooms()
            if (result.deletedCount > 0) console.log(`${result.deletedCount} rooms removed.`)

            io.emit('roomList', {
                rooms: RoomDB.getAllRooms().map(room => ({
                    ...room,
                    userCount: UsersState.getUsersInRoom(room.room_name).length
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