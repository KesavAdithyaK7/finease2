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
// DATABASE MODELS
// ===============================

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB successfully');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// User Schema 
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    surveyCompleted: { type: Boolean, default: false },
});

// Expense schema
const expenseTrackingSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    initialAmount: {
        type: Number,
        required: true
    },
    remainingAmount: {
        type: Number,
        required: true
    },
    expenses: [{
        item: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        date: {
            type: Date,
            default: Date.now
        }
    }]
});

// Survey Schema
const surveySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    ageGroup: {
        type: String,
        required: true
    },
    incomeRange: {
        type: String,
        required: true
    },
    savings: {
        type: Number,
        required: true
    },
    primaryGoal: {
        type: String,
        required: true
    },
    experience: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Budget Schema
const budgetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    income: {
        type: Number,
        required: true
    },
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
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Initialize Models
const User = mongoose.model('User', userSchema);
const ExpenseTracking = mongoose.model('ExpenseTracking', expenseTrackingSchema);
const Budget = mongoose.model('Budget', budgetSchema);
const Survey = mongoose.model('Survey', surveySchema);

// ===============================
// AUTHENTICATION MIDDLEWARE
// ===============================
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        const user = await User.findOne({ _id: decoded._id });
        
        if (!user) {
            throw new Error();
        }

        req.user = user;
        next();
    } catch (e) {
        res.status(401).send({ error: 'Please authenticate' });
    }
};

// ===============================
// API ROUTES
// ===============================

// Authentication Routes
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const user = new User({ name, email, password: await bcrypt.hash(password, 8) });
        await user.save();
        
        const token = jwt.sign(
            { _id: user._id }, 
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '7d' }
        );

        res.status(201).send({
            user: { id: user._id, name: user.name, email: user.email }, 
            token 
        });
    } catch (e) {
        res.status(400).send({ error: e.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).send({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).send({ error: 'Invalid login credentials' });
        }

        const token = jwt.sign(
            { _id: user._id }, 
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '7d' }
        );

        res.send({ 
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email,
                surveyCompleted: user.surveyCompleted
            }, 
            token 
        });
    } catch (e) {
        res.status(400).send({ error: e.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Survey Routes
app.post('/api/survey', auth, async (req, res) => {
    try {
        // Validate required fields
        const requiredFields = ['ageGroup', 'incomeRange', 'savings', 'primaryGoal', 'experience'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                error: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        const survey = new Survey({
            userId: req.user._id,
            ageGroup: req.body.ageGroup,
            incomeRange: req.body.incomeRange,
            savings: Number(req.body.savings),
            primaryGoal: req.body.primaryGoal,
            experience: req.body.experience
        });

        await survey.save();

        res.status(201).json({
            success: true,
            message: 'Survey submitted successfully'
        });

    } catch (error) {
        res.status(500).json({
            error: error.message || 'Failed to save survey'
        });
    }
});

app.post('/api/user/survey-completed', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.surveyCompleted = true;
        await user.save();
        res.json({ message: 'Survey status updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Budget Routes
app.post('/api/budget/save', auth, async (req, res) => {
    try {
        let budget = await Budget.findOne({ userId: req.user._id });
        if (!budget) {
            budget = new Budget({ userId: req.user._id, ...req.body });
        } else {
            budget.income = req.body.income;
            budget.customCategories = req.body.customCategories;
            budget.allocations = req.body.allocations;
            budget.lastUpdated = new Date();
        }
        await budget.save();
        res.json(budget);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/budget/load', auth, async (req, res) => {
    try {
        const budget = await Budget.findOne({ userId: req.user._id });
        if (!budget) {
            return res.status(404).json({ error: 'No budget found' });
        }
        res.json(budget);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Expense Routes
app.post('/api/expense/start', auth, async (req, res) => {
    try {
        const expenseTracking = new ExpenseTracking({
            userId: req.user._id,
            initialAmount: req.body.initialAmount,
            remainingAmount: req.body.initialAmount,
            expenses: []
        });
        await expenseTracking.save();
        res.status(201).send(expenseTracking);
    } catch (e) {
        res.status(400).send({ error: e.message });
    }
});

app.post('/api/expense/add', auth, async (req, res) => {
    try {
        const { item, amount } = req.body;
        
        const expenseTracking = await ExpenseTracking.findOne({ userId: req.user._id });
        if (!expenseTracking) {
            return res.status(404).send({ error: 'No active expense tracking found' });
        }

        if (amount > expenseTracking.remainingAmount) {
            return res.status(400).send({ error: 'Insufficient balance' });
        }

        expenseTracking.expenses.push({ item, amount });
        expenseTracking.remainingAmount -= amount;
        await expenseTracking.save();
        
        res.send(expenseTracking);
    } catch (e) {
        res.status(400).send({ error: e.message });
    }
});

app.get('/api/expense/current', auth, async (req, res) => {
    try {
        const expenseTracking = await ExpenseTracking.findOne({ userId: req.user._id });
        if (!expenseTracking) {
            return res.status(404).send({ error: 'No expense tracking found' });
        }
        res.send(expenseTracking);
    } catch (e) {
        res.status(500).send({ error: e.message });
    }
});

app.delete('/api/expense/finish', auth, async (req, res) => {
    try {
        const expenseTracking = await ExpenseTracking.findOneAndDelete({ userId: req.user._id });
        if (!expenseTracking) {
            return res.status(404).send({ error: 'No expense tracking found' });
        }
        res.send(expenseTracking);
    } catch (e) {
        res.status(500).send({ error: e.message });
    }
});

// Recommendation Routes
app.get('/api/recommendations/:id', async (req, res) => {
    try {
        const userSurvey = await Survey.findById(req.params.id);
        
        // Find similar profiles
        const similarProfiles = await Survey.find({
            ageGroup: userSurvey.ageGroup,
            incomeRange: userSurvey.incomeRange,
            savings: { $gte: userSurvey.savings - 10, $lte: userSurvey.savings + 10 }
        }).limit(10);

        // Generate recommendations
        const recommendations = generateRecommendations(userSurvey, similarProfiles);
        
        res.json(recommendations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===============================
// HELPER FUNCTIONS
// ===============================
function generateRecommendations(userSurvey, similarProfiles) {
    // Calculate average savings
    const avgSavings = similarProfiles.reduce((sum, profile) => sum + profile.savings, 0) / similarProfiles.length;

    // Generate personalized recommendations
    const recommendations = {
        budgetPlan: {},
        suggestions: []
    };

    // Basic budget allocation based on income range
    switch(userSurvey.incomeRange) {
        case '0-25000':
            recommendations.budgetPlan = {
                necessities: 60,
                savings: 20,
                discretionary: 20
            };
            break;
        case '25001-50000':
            recommendations.budgetPlan = {
                necessities: 50,
                savings: 30,
                discretionary: 20
            };
            break;
        default:
            recommendations.budgetPlan = {
                necessities: 40,
                savings: 40,
                discretionary: 20
            };
    }

    // Add personalized suggestions
    if (userSurvey.savings < avgSavings) {
        recommendations.suggestions.push('Consider increasing your savings rate to match peers in your income group');
    }

    // Fixed: Changed userSurvey.goals to userSurvey.primaryGoal to match schema
    if (userSurvey.primaryGoal === 'emergency') {
        recommendations.suggestions.push('Aim to save 6 months of expenses for emergency fund');
    }

    return recommendations;
}

// ===============================
// ERROR HANDLING
// ===============================
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// ===============================
// SERVE FRONTEND
// ===============================
// Serve index.html for any request that doesn't match an API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'index.html'));
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});