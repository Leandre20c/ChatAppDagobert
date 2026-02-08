const socket = io()

const message_form = document.getElementById('message-form')
const message_input = document.getElementById('message-input')

const messages = document.getElementById('display-messages')

const disconnect_button = document.getElementById("disconnect-button")

const create_room_form = document.getElementById('room-create-form')
const join_room_form = document.getElementById('room-join-form')
const created_room = document.getElementById('room-create-input')
const joined_room = document.getElementById('room-join-input')

var username = localStorage.getItem("username")
if (username == null || username == "") {
    window.location.href = 'connexion.html'
}

message_form.addEventListener('submit', (e) => {
    e.preventDefault()

    if (message_input.value.trim() !== '') {
        socket.emit('message', "["+username+"] " + message_input.value)
        message_input.value = ''
    }
})


disconnect_button.addEventListener("click", (e) => {
    e.preventDefault()

    localStorage.removeItem("username")
    window.location.href = 'connexion.html'
})

socket.on('message', (msg) => {
    const item = document.createElement('div')
    item.className = username+"-class"
    item.textContent = msg
    messages.appendChild(item)
})

create_room_form.addEventListener('submit', (e) => {
    e.preventDefault()

    if (created_room.value.trim() !== '') {
        socket.emit('create-room', created_room.value.trim())
    }
})

join_room_form.addEventListener('submit', (e) => {
    e.preventDefault()

    if (joined_room.value.trim() !== '') {
        socket.emit('join-room', joined_room.value.trim())
    }
})