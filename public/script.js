const username = localStorage.getItem('username')

const socket = io()

const message_input = document.getElementById('message-input')
const chatDisplay = document.querySelector('.chat-display')
const disconnect_button = document.getElementById("disconnect-button")
const createRoomInput = document.getElementById('room-create-input')
const searchRoomInput = document.getElementById('room-search-input')
const roomList = document.querySelector('.room-list')
const usernameDisplay = document.querySelector("#current-username")
const currentRoomName = document.querySelector('#current-room-name')
const memberCount = document.querySelector('#member-count')
const uploadFileButton = document.getElementById('upload-file')
const hiddenFileInput = document.getElementById('hidden-file-input')

// Should be useless now, but I don't want to remove it in real time
if (!username || username.trim() === "") {
    window.location.href = '/'
} else {
    socket.emit('verify-session', username)
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const view = item.dataset.view
        
        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'))
        item.classList.add('active')
        
        // Show corresponding view
        document.querySelectorAll('[class^="view-"]').forEach(v => v.classList.remove('active'))
        document.querySelector(`.view-${view}`).classList.add('active')
    })
})

// If there is something wrong
socket.on('session-invalid', () => {
    localStorage.removeItem('username')
    alert('Your session has expired, please reconnect')
    window.location.href = '/'
})

// If session is valid
socket.on('session-valid', (userData) => {
    usernameDisplay.textContent = username
    currentRoomName.textContent = userData.roomName
    console.log('Connected as:', userData.username)
})

socket.on('roomChanged', (roomName) => {
    currentRoomName.textContent = roomName
})

socket.on('error', (errorMessage) => {
    alert(errorMessage)
})

function sendMessage(e) {
    e.preventDefault()
    if (message_input.value.trim() !== '') {
        socket.emit('message', {
            name: username,
            text: message_input.value
        })
        message_input.value = ''
    }
    message_input.focus()
    chatDisplay.scrollTop = chatDisplay.scrollHeight
}

function tryCreateRoom(e) {
    e.preventDefault()
    
    if (createRoomInput.value.trim() !== '') {
        socket.emit('try-create-room', { 
            roomName: createRoomInput.value.trim()
        })
        createRoomInput.value = ''
    }
}

// When create room is pressed
document.querySelector('.form-create-room')
    .addEventListener('submit', tryCreateRoom)

socket.on('create-room-success', () => {
    console.log('Room created successfully!')
})

socket.on('create-room-failed', ({errorMessage}) => {
    alert(errorMessage)
})

// When send message is pressed
document.querySelector('.message-form')
    .addEventListener('submit', sendMessage)

disconnect_button.addEventListener("click", (e) => {
    e.preventDefault()
    localStorage.removeItem("username")
    window.location.href = 'connexion/login.html'
})

// Helper function to format time
function formatTime(isoString) {
    const date = new Date(isoString)
    return new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(date)
}

// Helper function to display a message
function displayMessage(data) {
   const name = data.username || data.name
    const text = data.message || data.text || ''
    const time = data.created_at ? formatTime(data.created_at) : data.time
    const photoUrl = data.file_path || data.photoUrl
    const messageType = data.message_type || 'USER_MESSAGE'
    
    const li = document.createElement('li')
    li.className = 'post'
    
    // Style based on message type
    switch(messageType) {
        case 'USER_MESSAGE':
            if (name === username) li.className = 'post post--right'
            else li.className = 'post post--left'
            break
        case 'USER_JOIN':
            li.className = 'post post--join post--event'
            break
        case 'USER_LEAVE':
            li.className = 'post post--leave post--event'
            break
        case 'USER_DISCONNECT':
            li.className = 'post post--disconnect post--event'
            break
        case 'ROOM_CREATED':
            li.className = 'post post--room-created post--event'
            break
        case 'SYSTEM_INFO':
            li.className = 'post post--info post--event'
            break
        case 'SYSTEM_ALERT':
            li.className = 'post post--alert post--event'
            break
        case 'SYSTEM_ERROR':
            li.className = 'post post--error post--event'
            break
    }

    let contentHtml = ''
    let iconHtml = ''
    
    // Icons based on type
    switch(messageType) {
        case 'USER_JOIN':
            iconHtml = '<i class="fa-solid fa-arrow-right-to-bracket"></i>'
            break
        case 'USER_LEAVE':
            iconHtml = '<i class="fa-solid fa-arrow-right-from-bracket"></i>'
            break
        case 'USER_DISCONNECT':
            iconHtml = '<i class="fa-solid fa-plug-circle-xmark"></i>'
            break
        case 'ROOM_CREATED':
            iconHtml = '<i class="fa-solid fa-door-open"></i>'
            break
        case 'SYSTEM_INFO':
            iconHtml = '<i class="fa-solid fa-circle-info"></i>'
            break
        case 'SYSTEM_ALERT':
            iconHtml = '<i class="fa-solid fa-circle-exclamation"></i>'
            break
        case 'SYSTEM_ERROR':
            iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>'
            break
    }
    
    // Check if there's an image attachment
    if (photoUrl && photoUrl !== '') {
        contentHtml = `<div class="post__text">
            <img src="${photoUrl}" class="post--image" style="max-width: 200px; border-radius: 8px; cursor: pointer;" onclick="window.open(this.src)">
            ${text ? `<br><span>${text}</span>` : ''}
        </div>`
    } else {
        contentHtml = `<div class="post__text">${text}</div>`
    }

    if (messageType !== 'USER_MESSAGE') {
        li.innerHTML = `
            ${iconHtml} ${contentHtml} <span class="post__header--time">${time}</span>
            `
    }
    else if (name !== username) {
        li.innerHTML = `
            <div class="post__header">
                <span class="post__header--name">${name}</span>
                <span class="post__header--time">${time}</span>
            </div>
            ${contentHtml}`
    } else {
        li.innerHTML = `
            ${contentHtml}
            <div class="post__header">
                <span class="post__header--time">${time}</span>
            </div>`
    }
    
    chatDisplay.appendChild(li)
    chatDisplay.scrollTop = chatDisplay.scrollHeight
}

// Listen for message history (when joining a room)
socket.on('messageHistory', (messages) => {
    // Clear chat display
    chatDisplay.innerHTML = ''
    
    // Display all messages from history
    messages.forEach(msg => {
        displayMessage(msg)
    })
})

// Listen for new messages
socket.on('message', (data) => {
    displayMessage(data)
})

socket.on('userList', ({ users }) => {
    memberCount.textContent = users.length
})

socket.on('roomList', ({ rooms }) => {
    showRooms(rooms)
})

function showRooms(rooms) {
    roomList.textContent = ''
    if (rooms && rooms.length > 0) {
        rooms.forEach((room) => {
            const roomDiv = document.createElement('div')
            roomDiv.className = 'roomItem'

            roomDiv.innerHTML = `
                <span class="roomItem--count"><i class="fa-solid fa-user connected-user-icon fa-sm"></i>${room.userCount}</span>
                <span class="roomItem--name">${room.room_name}</span>
            `
            
            roomDiv.title = `Click to join ${room.room_name}.`
            
            roomDiv.addEventListener('click', () => {  
                socket.emit('enterRoom', {
                    name: username,
                    roomName: room.room_name
                })
            })
            
            roomList.appendChild(roomDiv)
        })
    }
}

uploadFileButton.addEventListener('click', () => {
    hiddenFileInput.click()
})

hiddenFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('photo', file)
    formData.append('socketId', socket.id)

    try {
        const response = await fetch('/upload-photo', {
            method: 'POST',
            body: formData
        })

        const result = await response.json()

        if (!result.success) {
            alert('Error sending image: ' + result.error)
        } else {
            console.log('Image sent successfully!')
        }
    } catch (err) {
        console.error('Upload error:', err)
        alert('Error sending the image')
    }

    hiddenFileInput.value = ''
})