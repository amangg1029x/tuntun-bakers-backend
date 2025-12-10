const express = require('express');
const router = express.Router();
const { clerkAuth } = require('../middleware/clerkAuth');
const { authorize } = require('../middleware/clerkAuth');
const adminController = require('../controllers/adminController');
const orderController = require('../controllers/orderController');

// All routes require authentication and admin role
router.use(clerkAuth);
router.use(authorize('admin'));

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// Customer Management
router.get('/customers', adminController.getCustomers);
router.get('/customers/:id', adminController.getCustomerDetails);

// Product Management
router.post('/products', adminController.createProduct);
router.put('/products/:id', adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);
router.put('/products/:id/stock', adminController.updateProductStock);

// Order Management
router.get('/orders', orderController.getAllOrders);
router.put('/orders/:id/status', orderController.updateOrderStatus);

// Analytics
router.get('/analytics/revenue', adminController.getRevenueAnalytics);

module.exports = router;