require('dotenv').config(); // import stuff from my .env file

// set up connections
const express = require('express'); // import express
const mysql = require('mysql2'); // import mysql2
const session = require('express-session'); // import express-session
const flash = require('connect-flash'); // import connect-flash
const bcrypt = require('bcrypt'); // import bcrypt for password hashing
const multer = require('multer'); // import multer for file uploads
const path = require('path'); // import path for file paths

const app = express(); // create an express app

// setting up multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/meals');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, and WEBP images are allowed.'));
        }
    }
});

// create connection to db
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

// connect to db
db.connect((err) => {
    if (err) throw err;
    console.log('Connected to database.');
});

// middleware to parse incoming requests
app.use(express.json()); // read json data (req.body)
app.use(express.urlencoded({ extended: true })); // read form data (req.body)
app.use(express.static('public'));               // CSS files

// set up session and flash messages
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

app.use(flash()); // flash messages
app.set('view engine', 'ejs'); // view engine to ejs

// set up flash messages and user session
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// middleware to see if user authenticated
function checkAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    req.flash('error', 'Please log in to view this page.');
    res.redirect('/login');
}

// ROUTES

// index route (landing page)
app.get('/', (req, res) => {
    res.render('index');
});

// register routes
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/register');
    }

    // check if the email is already taken
    const checkSql = 'SELECT id FROM users WHERE email = ?';
    db.query(checkSql, [email], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            req.flash('error', 'An account with that email already exists.');
            return res.redirect('/register');
        }

        // hash the password before saving it
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) throw err;

            const insertSql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
            db.query(insertSql, [username, email, hashedPassword], (err) => {
                if (err) throw err;

                req.flash('success', 'Registration successful! Please log in.');
                res.redirect('/login');
            });
        });
    });
});

// login routes
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const user = results[0];

        bcrypt.compare(password, user.password, (err, match) => {
            if (err) throw err;

            if (match) {
                req.session.user = user;
                req.flash('success', 'Login successful!');
                res.redirect('/dashboard');
            } else {
                req.flash('error', 'Invalid email or password.');
                res.redirect('/login');
            }
        });
    });
});

// logout route
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// dashboard route 
app.get('/dashboard', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const mealsSql = 'SELECT COUNT(*) AS count FROM meals WHERE user_id = ? AND DATE(meal_time) = CURDATE()';
    const exerciseSql = 'SELECT COUNT(*) AS count FROM exercise WHERE user_id = ? AND DATE(logged_at) = CURDATE()';
    const sleepSql = 'SELECT COUNT(*) AS count FROM sleep WHERE user_id = ? AND DATE(bedtime) = CURDATE()';
    const activitiesSql = 'SELECT COUNT(*) AS count FROM activities WHERE user_id = ? AND DATE(logged_at) = CURDATE()';

    db.query(mealsSql, [userId], (err, mealsResult) => {
        if (err) throw err;

        db.query(exerciseSql, [userId], (err, exerciseResult) => {
            if (err) throw err;

            db.query(sleepSql, [userId], (err, sleepResult) => {
                if (err) throw err;

                db.query(activitiesSql, [userId], (err, activitiesResult) => {
                    if (err) throw err;

                    res.render('dashboard', {
                        mealsCount: mealsResult[0].count,
                        exerciseCount: exerciseResult[0].count,
                        sleepCount: sleepResult[0].count,
                        activitiesCount: activitiesResult[0].count
                    });
                });
            });
        });
    });
});

// meals routes
app.get('/meals', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const sql = 'SELECT * FROM meals WHERE user_id = ? ORDER BY meal_time DESC';
    db.query(sql, [userId], (err, results) => {
        if (err) throw err;

        res.render('meals', { meals: results });
    });
});

//add meal
app.post('/meals', checkAuthenticated, upload.single('photo'), (req, res) => {
    const userId = req.session.user.id;
    const { name, meal_type, meal_time, rating, notes } = req.body;

    if (!name || !meal_type || !meal_time) {
        req.flash('error', 'Name, meal type, and time are required.');
        return res.redirect('/meals');
    }

    const photoPath = req.file ? '/uploads/meals/' + req.file.filename : null;

    const sql = 'INSERT INTO meals (user_id, name, meal_type, meal_time, rating, notes, photo_path) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.query(sql, [userId, name, meal_type, meal_time, rating || null, notes || null, photoPath], (err) => {
        if (err) throw err;

        req.flash('success', 'Meal logged!');
        res.redirect('/meals');
    });
});

// delete meal 
app.post('/meals/:id/delete', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const mealId = req.params.id;

    const sql = 'DELETE FROM meals WHERE id = ? AND user_id = ?';
    db.query(sql, [mealId, userId], (err) => {
        if (err) throw err;

        req.flash('success', 'Meal deleted.');
        res.redirect('/meals');
    });
});

// excercises routes
app.get('/exercise', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const sql = 'SELECT * FROM exercise WHERE user_id = ? ORDER BY logged_at DESC';
    db.query(sql, [userId], (err, results) => {
        if (err) throw err;

        res.render('exercise', { exercises: results });
    });
});

// new excercise 
app.post('/exercise', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const { activity_type, duration_minutes, intensity, notes, logged_at } = req.body;

    if (!activity_type || !duration_minutes || !logged_at) {
        req.flash('error', 'Activity type, duration, and date/time are required.');
        return res.redirect('/exercise');
    }

    const sql = 'INSERT INTO exercise (user_id, activity_type, duration_minutes, intensity, notes, logged_at) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [userId, activity_type, duration_minutes, intensity, notes || null, logged_at], (err) => {
        if (err) throw err;

        req.flash('success', 'Exercise logged!');
        res.redirect('/exercise');
    });
});

// delete excercise
app.post('/exercise/:id/delete', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const exerciseId = req.params.id;

    const sql = 'DELETE FROM exercise WHERE id = ? AND user_id = ?';
    db.query(sql, [exerciseId, userId], (err) => {
        if (err) throw err;

        req.flash('success', 'Exercise entry deleted.');
        res.redirect('/exercise');
    });
});

// sleep routes
app.get('/sleep', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const sql = 'SELECT * FROM sleep WHERE user_id = ? ORDER BY bedtime DESC';
    db.query(sql, [userId], (err, results) => {
        if (err) throw err;

        res.render('sleep', { sleeps: results });
    });
});

//add sleep
app.post('/sleep', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const { bedtime, wake_time, quality_rating } = req.body;

    if (!bedtime || !wake_time) {
        req.flash('error', 'Bedtime and wake time are required.');
        return res.redirect('/sleep');
    }

    const sql = 'INSERT INTO sleep (user_id, bedtime, wake_time, quality_rating) VALUES (?, ?, ?, ?)';
    db.query(sql, [userId, bedtime, wake_time, quality_rating || null], (err) => {
        if (err) throw err;

        req.flash('success', 'Sleep logged!');
        res.redirect('/sleep');
    });
});

//delete sleep
app.post('/sleep/:id/delete', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const sleepId = req.params.id;

    const sql = 'DELETE FROM sleep WHERE id = ? AND user_id = ?';
    db.query(sql, [sleepId, userId], (err) => {
        if (err) throw err;

        req.flash('success', 'Sleep entry deleted.');
        res.redirect('/sleep');
    });
});

//activities routes
app.get('/activities', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const sql = 'SELECT * FROM activities WHERE user_id = ? ORDER BY logged_at DESC';
    db.query(sql, [userId], (err, results) => {
        if (err) throw err;

        res.render('activities', { activities: results });
    });
});

// add activity
app.post('/activities', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const { title, category, duration_minutes, notes, logged_at } = req.body;

    if (!title || !category || !duration_minutes || !logged_at) {
        req.flash('error', 'Title, category, duration, and date/time are required.');
        return res.redirect('/activities');
    }

    const sql = 'INSERT INTO activities (user_id, title, category, duration_minutes, notes, logged_at) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [userId, title, category, duration_minutes, notes || null, logged_at], (err) => {
        if (err) throw err;

        req.flash('success', 'Activity logged!');
        res.redirect('/activities');
    });
});

//delete activity
app.post('/activities/:id/delete', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const activityId = req.params.id;

    const sql = 'DELETE FROM activities WHERE id = ? AND user_id = ?';
    db.query(sql, [activityId, userId], (err) => {
        if (err) throw err;

        req.flash('success', 'Activity deleted.');
        res.redirect('/activities');
    });
});

// connect to the server
const PORT = process.env.PORT || 4000; // port from .env or default to 4000
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`)); // start server