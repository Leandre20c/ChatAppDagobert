const socket = io()

const message_form = document.getElementById('message-form')
const message_input = document.getElementById('message-input')

const messages = document.getElementById('displayMessages')

const disconnect_button = document.getElementById("disconnect-button")

var username = localStorage.getItem("username")
if (username == null || username == "") {
    window.location.href = 'connexion.html'
}

message_form.addEventListener('submit', (e) => {
    e.preventDefault()

    if (message_input.value.trim() !== '') {
        socket.emit('message', "["+username+"]" + message_input.value)
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
    item.textContent = msg
    messages.appendChild(item)
})