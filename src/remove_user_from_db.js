const Database = require('better-sqlite3')
const db = new Database('./src/database.db')

// You juste have to do 'node src/remove_user_from_db.js ID' in cli

const userId = process.argv[2]

function removeUser(userId) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?')
    const user = stmt.get(userId)

    if (!user) {
        console.log(`User ${userId} dosesnt exists :(\n`)
        db.close()
        return;
    }
    
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
}

removeUser(userId)