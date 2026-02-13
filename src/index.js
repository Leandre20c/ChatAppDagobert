const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const { UserDB, MessageDB, RoomDB, db } = require('./database')
const fs = require('fs')
const sharp = require('sharp')
let activeRooms = []

// Pour les images
const multer = require('multer')
const path = require('path')

const UPLOAD_TEMP_DIR = path.join(__dirname, 'temp_uploads')
const UPLOAD_FINAL_DIR = path.join(__dirname, '../public/uploads')

//TEMP_UPLAAD AND UPLOADS HAVE TO EXIST FOR SURE
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
    console.log('Création du dossier temporaire :', UPLOAD_TEMP_DIR)
    fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true })
}

if (!fs.existsSync(UPLOAD_FINAL_DIR)) {
    console.log('Création du dossier final :', UPLOAD_FINAL_DIR)
    fs.mkdirSync(UPLOAD_FINAL_DIR, { recursive: true })
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_TEMP_DIR)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})
const upload = multer({ storage: storage })


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

// Photo upload endpoint
app.post('/upload-photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' })
        }

        const user = UsersState.getBySocketId(req.body.socketId)
        if (!user) {
            fs.unlinkSync(req.file.path)
            return res.status(401).json({ error: 'User not authenticated' })
        }

        // SHARP CONVERTION
        const processedFilename = `img${Date.now()}_${Math.round(Math.random() * 1E9)}.webp`
        const finalFilePath = path.join(UPLOAD_FINAL_DIR, processedFilename)

        await sharp(req.file.path)
            .resize(800, 600, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })
            .toFile(finalFilePath)

        // CLEAN TEMPSTORAGE
        fs.unlinkSync(req.file.path)

        const publicUrl = `/uploads/${processedFilename}`

        // Emit photo
        const photoMessage = {
            name: user.username,
            text: req.body.message || '',
            photoUrl: publicUrl,
            time: new Intl.DateTimeFormat('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
            }).format(new Date())
        }

        io.to(user.room).emit('message', photoMessage)

        res.json({ success: true, photoUrl: publicUrl })

    } catch (error) {
        console.error('Error processing photo:', error)
        res.status(500).json({ error: 'Error processing photo' })
    }
})

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
                roomName: userRoom.room_name
            })

            socket.emit('roomList', {
                rooms: RoomDB.getAllRooms().map(room => ({
                    ...room,
                    userCount: UsersState.getUsersInRoom(room.room_name).length
                }))
            })

            socket.emit('userList', {
                users: UsersState.getUsersInRoom(userRoom.room_name)
            })

            broadcastRoomList()

            socket.to(userRoom.room_name).emit('message', buildMessage('INFO', `${username} a rejoint le salon`))

            broadcastUserList(userRoom.room_name)

        } else {
            // User is not in the db
            socket.emit('session-invalid')
        }
    })

    socket.on('try-create-room', ({roomName}) => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (!user) {
            socket.emit('create-room-failed', {errorMessage: 'You must be connected.'})
            return
        }

        if (!roomName || roomName.trim() === '') {
            socket.emit('create-room-failed', {errorMessage: 'Room name cannot be empty.'})
            return
        }

        const normalizedRoomName = roomName.trim().charAt(0).toUpperCase() + roomName.trim().slice(1).toLowerCase()

        // Check if room already exists
        const existingRoom = db.prepare('SELECT id FROM rooms WHERE room_name = ?').get(normalizedRoomName)
        if (existingRoom) {
            socket.emit('create-room-failed', {errorMessage: 'This room already exists.'})
            return
        }

        // Create the room
        const result = RoomDB.createRoom(user.userId, normalizedRoomName)
        
        if (!result.success) {
            socket.emit('create-room-failed', {errorMessage: result.error})
            return
        }

        // Join the new room (same logic as enterRoom)
        const prevRoom = user.room

        // Leave previous room
        if (prevRoom != null) {
            socket.leave(prevRoom)
            io.to(prevRoom).emit('message', buildMessage('INFO', user.username + ' left the room'))
            broadcastUserList(prevRoom)
            
            const deleteResult = RoomDB.deleteEmptyRooms()
            if (deleteResult.deletedCount > 0) console.log(`${deleteResult.deletedCount} rooms removed.`)
        }

        // Update user's room
        user.room = normalizedRoomName
        socket.join(normalizedRoomName)

        // Notify
        socket.emit('message', buildMessage("INFO", "You have created and joined the room " + normalizedRoomName))
        socket.emit('roomChanged', normalizedRoomName)

        // Update lists
        broadcastUserList(normalizedRoomName)
        broadcastRoomList()

        socket.emit('create-room-success')
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
            
            broadcastUserList(prevRoom)

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
        broadcastUserList(normalizedRoomName)

        broadcastRoomList()
    })

    // Disconnect
    socket.on('disconnect', () => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (user) {
            RoomDB.leaveRoom(user.userId)

            io.to(user.room).emit('message', buildMessage('INFO', `${user.name} s'est déconnecté`))
            
            broadcastUserList(user.room)

            UsersState.removeUser(socket.id)
            const result = RoomDB.deleteEmptyRooms()
            if (result.deletedCount > 0) console.log(`${result.deletedCount} rooms removed.`)

            broadcastRoomList()

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

function broadcastRoomList() {
    io.emit('roomList', {
        rooms: RoomDB.getAllRooms().map(room => ({
            ...room,
            userCount: UsersState.getUsersInRoom(room.room_name).length
        }))
    })
}

function broadcastUserList(roomName) {
    io.to(roomName).emit('userList', {
        users: UsersState.getUsersInRoom(roomName)
    })
}