const socket = io()
const user_form = document.getElementById('user-form')
const name_input = document.getElementById("name-input")

// Check if already connected
const existingUsername = localStorage.getItem("username")
if (existingUsername) {
    socket.emit('register-username', existingUsername)
}

socket.on('username-accepted', (username) => {
    localStorage.setItem("username", username)
    window.location.href = "/index.html"
})

socket.on('username-error', (errorMessage) => {
    alert(errorMessage)
    name_input.value = ''
    name_input.focus()
})

user_form.addEventListener('submit', (e) => {
    e.preventDefault()

    const username = name_input.value.trim()
    
    if (username === '') {
        alert('Veuillez entrer un pseudo')
        return
    }

    if (username.length > 16) {
        alert('Le pseudo ne peut pas dépasser 16 caractères')
        return
    }

    const validUsername = /^[a-zA-Z0-9_-]+$/
    if (!validUsername.test(username)) {
        alert('Le pseudo ne peut contenir que des lettres, chiffres, tirets et underscores')
        return
    }

    socket.emit('register-username', username)
})