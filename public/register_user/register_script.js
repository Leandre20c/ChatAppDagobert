const regForm = document.getElementById("reg-form")
const usernameInput = document.getElementById("username")
const passwordInput = document.getElementById("password")

regForm.addEventListener('submit', registerUser)

async function registerUser(e) {
    e.preventDefault()
    
    const username = usernameInput.value.trim()
    const password = passwordInput.value

    if (username.length < 3 || username.length > 16) {
        alert('Username must contain between 3 and 16 caracters.')
        return
    }

    if (password.length < 6) {
        alert('Password must be at least 6 caracters.')
        return
    }

    socket.emit('register', { username, password })
}

socket.on('register-success', () => {
    alert('Account created!')
    window.location.href = 'connexion.html'
})

socket.on('register-error', (error) => {
    alert(error)
})