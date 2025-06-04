// server.js
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken'); 
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json());

// CORS Configuration
const corsOptions = {
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'https://finease-2kj3.onrender.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Serve static files
app.use(express.static(path.join(__dirname,'html')));

// ===============================
// DATABASE CONNECTION & MODELS
// ===============================

// Add retry mechanism for MongoDB connection
function connectWithRetry() {
    mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    }).then(() => {
        console.log('Connected to MongoDB');
    }).catch(err => {
        console.error('MongoDB connection error:', err);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
    });
}

// Replace current MongoDB connection with retry mechanism
mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected! Reconnecting...');
    connectWithRetry();
});

connectWithRetry();

// User Schema 
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    surveyCompleted: { type: Boolean, default: false },
});

// Budget schema
const budgetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    income: { type: Number, required: true },
    customCategories: [{
        id: String,
        name: String,
        color: String,
        default: Number
    }],
    allocations: [{
        id: String,
        percent: Number
    }],
    lastUpdated: { type: Date, default: Date.now }
});

// Expense schema
const expenseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    initialAmount: { type: Number, required: true },
    remainingAmount: { type: Number, required: true },
    expenses: [{
        item: String,
        amount: Number,
        category: String,
        date: { type: Date, default: Date.now }
    }],
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    finishedAt: { type: Date }
});

// Transaction schema
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    type: { type: String, enum: ['expense', 'income'], default: 'expense' },
    date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Budget = mongoose.model('Budget', budgetSchema);
const ExpenseSession = mongoose.model('ExpenseSession', expenseSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// ===============================
// MIDDLEWARE
// ===============================

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// ===============================
// ROUTES
// ===============================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword, name });
        await user.save();

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        
        res.status(201).json({
            token,
            user: { id: user._id, email: user.email, name: user.name }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        
        res.json({
            token,
            user: { id: user._id, email: user.email, name: user.name }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Budget Routes
app.post('/api/budget/save', authenticateToken, async (req, res) => {
    try {
        const { income, customCategories, allocations } = req.body;
        
        const budgetData = {
            userId: req.user.userId,
            income: parseFloat(income) || 0,
            customCategories: customCategories || [],
            allocations: allocations || [],
            lastUpdated: new Date()
        };

        const budget = await Budget.findOneAndUpdate(
            { userId: req.user.userId },
            budgetData,
            { upsert: true, new: true }
        );

        res.json({ success: true, budget, lastUpdated: budget.lastUpdated });
    } catch (error) {
        console.error('Budget save error:', error);
        res.status(500).json({ error: 'Failed to save budget' });
    }
});

app.get('/api/budget/load', authenticateToken, async (req, res) => {
    try {
        const budget = await Budget.findOne({ userId: req.user.userId });
        
        if (!budget) {
            return res.status(404).json({ error: 'No budget found' });
        }

        res.json(budget);
    } catch (error) {
        console.error('Budget load error:', error);
        res.status(500).json({ error: 'Failed to load budget' });
    }
});

// Expense Tracking Routes
app.post('/api/expense/start', authenticateToken, async (req, res) => {
    try {
        const { initialAmount } = req.body;
        
        if (!initialAmount || initialAmount <= 0) {
            return res.status(400).json({ error: 'Valid initial amount required' });
        }

        // End any existing active sessions
        await ExpenseSession.updateMany(
            { userId: req.user.userId, isActive: true },
            { isActive: false, finishedAt: new Date() }
        );

        const expenseSession = new ExpenseSession({
            userId: req.user.userId,
            initialAmount: parseFloat(initialAmount),
            remainingAmount: parseFloat(initialAmount),
            expenses: []
        });

        await expenseSession.save();
        res.json(expenseSession);
    } catch (error) {
        console.error('Start expense tracking error:', error);
        res.status(500).json({ error: 'Failed to start expense tracking' });
    }
});

app.get('/api/expense/current', authenticateToken, async (req, res) => {
    try {
        const expenseSession = await ExpenseSession.findOne({
            userId: req.user.userId,
            isActive: true
        }).sort({ createdAt: -1 });

        if (!expenseSession) {
            return res.status(404).json({ error: 'No active expense session' });
        }

        res.json(expenseSession);
    } catch (error) {
        console.error('Get current expense error:', error);
        res.status(500).json({ error: 'Failed to get current expense session' });
    }
});

app.post('/api/expense/add', authenticateToken, async (req, res) => {
    try {
        const { item, amount, category } = req.body;
        
        if (!item || !amount || !category) {
            return res.status(400).json({ error: 'Item, amount, and category are required' });
        }

        const expenseSession = await ExpenseSession.findOne({
            userId: req.user.userId,
            isActive: true
        });

        if (!expenseSession) {
            return res.status(404).json({ error: 'No active expense session' });
        }

        const expenseAmount = parseFloat(amount);
        
        // Update remaining amount based on category
        let newRemainingAmount = expenseSession.remainingAmount;
        if (category === 'Income') {
            newRemainingAmount += expenseAmount;
        } else {
            newRemainingAmount -= expenseAmount;
        }

        // Add expense to session
        expenseSession.expenses.push({
            item,
            amount: expenseAmount,
            category,
            date: new Date()
        });
        expenseSession.remainingAmount = newRemainingAmount;

        await expenseSession.save();

        // Also save to transactions for dashboard
        const transaction = new Transaction({
            userId: req.user.userId,
            description: item,
            amount: expenseAmount,
            category,
            type: category === 'Income' ? 'income' : 'expense'
        });
        await transaction.save();

        res.json(expenseSession);
    } catch (error) {
        console.error('Add expense error:', error);
        res.status(500).json({ error: 'Failed to add expense' });
    }
});

app.delete('/api/expense/finish', authenticateToken, async (req, res) => {
    try {
        const expenseSession = await ExpenseSession.findOneAndUpdate(
            { userId: req.user.userId, isActive: true },
            { isActive: false, finishedAt: new Date() },
            { new: true }
        );

        if (!expenseSession) {
            return res.status(404).json({ error: 'No active expense session' });
        }

        res.json(expenseSession);
    } catch (error) {
        console.error('Finish expense tracking error:', error);
        res.status(500).json({ error: 'Failed to finish expense tracking' });
    }
});

// Transaction Routes
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const transactions = await Transaction.find({ userId: req.user.userId })
            .sort({ date: -1 })
            .limit(limit);

        res.json(transactions);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: 'Failed to get transactions' });
    }
});

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'html', 'index.html'));
});

// Enhance error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});