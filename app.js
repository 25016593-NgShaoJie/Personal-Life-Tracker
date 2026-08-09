require('dotenv').config(); // import stuff from my .env file

// set up connections
const express = require('express'); // import express
const mysql = require('mysql2'); // import mysql2
const session = require('express-session'); // import express-session
const flash = require('connect-flash'); // import connect-flash
const bcrypt = require('bcrypt'); // import bcrypt for password hashing

const app = express(); // create an express app

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

// register routes
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { username, email, password } = req.body;
    // to be completed:
    // hash password 
    // check for duplicate email
    // insert into users table
});

// login routes
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    // to be completed:
    // look up user by email
    // compare hashed password
    // set req.session.user
    // redirect to /dashboard
});

// logout route
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// dashboard route 
app.get('/dashboard', checkAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});

// meals routes
app.get('/meals', checkAuthenticated, (req, res) => {
    // to be completed:
    // viewing meals for the logged-in user
    // render page
});

app.post('/meals', checkAuthenticated, (req, res) => {
    // to be completed:
    // insert a new meal for the logged-in user
    // redirect to /meals
});

app.post('/meals/:id/delete', checkAuthenticated, (req, res) => {
    // to be completed:
    // delete a meal by id for the logged-in user
    // redirect to /meals
});

// connect to the server
const PORT = process.env.PORT || 3000; // port from .env or default to 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); // start server