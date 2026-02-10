const regForm = document.getElementById("log-form")
const usernameInput = document.getElementById("username")
const passwordInput = document.getElementById("password")

regForm.addEventListener('submit', registerUser)

async function registerUser(e) {
    e.preventDefault()
    
    const username = usernameInput.value.trim()
    const password = passwordInput.value


    socket.emit('register', { username, password })
}

socket.on('register-success', () => {
    alert('Account created!')
    window.location.href = 'connexion.html'
})

socket.on('register-error', (error) => {
    alert(error)
})