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

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});

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
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

// Transaction schema for cross-platform transaction history
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    item: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    date: { type: Date, default: Date.now },
    description: String
});

const User = mongoose.model('User', userSchema);
const Budget = mongoose.model('Budget', budgetSchema);
const Expense = mongoose.model('Expense', expenseSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// Auth middleware
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token, authorization denied' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'Token is not valid' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ error: 'Token is not valid' });
    }
};

// ===============================
// BUDGET ROUTES
// ===============================

app.post('/api/budget/save', auth, async (req, res) => {
    try {
        console.log('Saving budget for user:', req.user._id);
        console.log('Budget data received:', req.body);
        
        let budget = await Budget.findOne({ userId: req.user._id });
        
        if (!budget) {
            budget = new Budget({
                userId: req.user._id,
                income: req.body.income,
                customCategories: req.body.customCategories || [],
                allocations: req.body.allocations || [],
                lastUpdated: new Date()
            });
        } else {
            budget.income = req.body.income;
            budget.customCategories = req.body.customCategories || [];
            budget.allocations = req.body.allocations || [];
            budget.lastUpdated = new Date();
        }
        
        await budget.save();
        console.log('Budget saved successfully');
        
        res.json({
            success: true,
            message: 'Budget saved successfully',
            budget: budget,
            lastUpdated: budget.lastUpdated
        });
    } catch (error) {
        console.error('Error saving budget:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

app.get('/api/budget/load', auth, async (req, res) => {
    try {
        console.log('Loading budget for user:', req.user._id);
        
        const budget = await Budget.findOne({ userId: req.user._id });
        
        if (!budget) {
            console.log('No budget found for user');
            return res.status(404).json({ 
                success: false,
                error: 'No budget found' 
            });
        }
        
        console.log('Budget loaded successfully');
        res.json(budget);
    } catch (error) {
        console.error('Error loading budget:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ===============================
// EXPENSE ROUTES
// ===============================

app.post('/api/expense/start', auth, async (req, res) => {
    try {
        console.log('Starting expense tracking for user:', req.user._id);
        
        // End any existing active expense session
        await Expense.updateMany(
            { userId: req.user._id, isActive: true },
            { isActive: false }
        );
        
        const expense = new Expense({
            userId: req.user._id,
            initialAmount: req.body.initialAmount,
            remainingAmount: req.body.initialAmount,
            expenses: []
        });
        
        await expense.save();
        console.log('Expense tracking started');
        
        res.json(expense);
    } catch (error) {
        console.error('Error starting expense tracking:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/expense/current', auth, async (req, res) => {
    try {
        const expense = await Expense.findOne({ 
            userId: req.user._id, 
            isActive: true 
        });
        
        if (!expense) {
            return res.status(404).json({ error: 'No active expense session found' });
        }
        
        res.json(expense);
    } catch (error) {
        console.error('Error getting current expense:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/expense/add', auth, async (req, res) => {
    try {
        const expense = await Expense.findOne({ 
            userId: req.user._id, 
            isActive: true 
        });
        
        if (!expense) {
            return res.status(404).json({ error: 'No active expense session found' });
        }
        
        const { item, amount, category } = req.body;
        
        // Check if sufficient balance for expenses (not income)
        if (category !== 'Income' && amount > expense.remainingAmount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        // Add the expense/income to expense session
        expense.expenses.push({ item, amount, category, date: new Date() });
        
        // Update remaining amount
        if (category === 'Income') {
            expense.remainingAmount += amount;
            expense.initialAmount += amount;
        } else {
            expense.remainingAmount -= amount;
        }
        
        await expense.save();
        
        // ALSO save to transactions collection for cross-platform access
        const transaction = new Transaction({
            userId: req.user._id,
            item: item,
            amount: amount,
            category: category,
            type: category === 'Income' ? 'income' : 'expense',
            description: item,
            date: new Date()
        });
        
        await transaction.save();
        console.log('Expense and transaction saved successfully');
        
        res.json(expense);
    } catch (error) {
        console.error('Error adding expense:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/expense/finish', auth, async (req, res) => {
    try {
        const expense = await Expense.findOne({ 
            userId: req.user._id, 
            isActive: true 
        });
        
        if (!expense) {
            return res.status(404).json({ error: 'No active expense session found' });
        }
        
        expense.isActive = false;
        await expense.save();
        
        console.log('Expense tracking finished');
        res.json(expense);
    } catch (error) {
        console.error('Error finishing expense tracking:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===============================
// TRANSACTION ROUTES (for dashboard)
// ===============================

app.get('/api/transactions', auth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        
        const transactions = await Transaction.find({ userId: req.user._id })
            .sort({ date: -1 })
            .limit(limit);
        
        console.log(`Loaded ${transactions.length} transactions for user`);
        res.json(transactions);
    } catch (error) {
        console.error('Error loading transactions:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===============================
// AUTH ROUTES
// ===============================

app.post('/api/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create user
        user = new User({
            email,
            password: hashedPassword,
            name
        });
        
        await user.save();
        
        // Create token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Create token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ===============================
// DEFAULT ROUTES
// ===============================

// Default route - serve login.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'html', 'login.html'));
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});