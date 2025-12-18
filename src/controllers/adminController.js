const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const mongoose = require('mongoose');

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    // Parallel queries for better performance
    const [
      totalOrders,
      totalRevenue,
      totalCustomers,
      totalProducts,
      todayOrders,
      todayRevenue,
      weekOrders,
      weekRevenue,
      monthOrders,
      monthRevenue,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      lowStockProducts,
      outOfStockProducts,
      recentOrders,
      topProducts
    ] = await Promise.all([
      // Total stats
      Order.countDocuments(),
      Order.aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      User.countDocuments({ role: 'user' }),
      Product.countDocuments(),

      // Today stats
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),

      // Week stats
      Order.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Order.aggregate([{ $match: { createdAt: { $gte: startOfWeek } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),

      // Month stats
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Order.aggregate([{ $match: { createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),

      // Order status counts
      Order.countDocuments({ status: { $in: ['Pending', 'Confirmed'] } }),
      Order.countDocuments({ status: 'Delivered' }),
      Order.countDocuments({ status: 'Cancelled' }),

      // Stock alerts
      Product.countDocuments({ stockQuantity: { $lte: 5, $gt: 0 }, inStock: true }),
      Product.countDocuments({ $or: [{ inStock: false }, { stockQuantity: 0 }] }),

      // Recent orders
      Order.find()
        .populate('user', 'name email')
        .sort('-createdAt')
        .limit(10)
        .select('orderNumber totalAmount status paymentStatus createdAt user'),

      // Top selling products (from all completed orders)
      Order.aggregate([
        { $match: { status: 'Delivered' } },
        { $unwind: '$items' },
        { $group: { _id: '$items.product', totalSold: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'productInfo' } },
        { $unwind: '$productInfo' },
        { $project: { name: '$productInfo.name', emoji: '$productInfo.emoji', totalSold: 1, revenue: 1 } }
      ])
    ]);

    // Payment method breakdown
    const paymentStats = await Order.aggregate([
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } }
    ]);

    // Daily revenue for last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);

      const dayRevenue = await Order.aggregate([
        { $match: { createdAt: { $gte: date, $lt: nextDate } } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } }
      ]);

      last7Days.push({
        date: date.toISOString().split('T')[0],
        revenue: dayRevenue[0]?.revenue || 0,
        orders: dayRevenue[0]?.orders || 0
      });
    }

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          totalCustomers,
          totalProducts
        },
        today: {
          orders: todayOrders,
          revenue: todayRevenue[0]?.total || 0
        },
        week: {
          orders: weekOrders,
          revenue: weekRevenue[0]?.total || 0
        },
        month: {
          orders: monthOrders,
          revenue: monthRevenue[0]?.total || 0
        },
        orders: {
          pending: pendingOrders,
          completed: completedOrders,
          cancelled: cancelledOrders
        },
        inventory: {
          lowStock: lowStockProducts,
          outOfStock: outOfStockProducts
        },
        recentOrders,
        topProducts,
        paymentStats,
        revenueChart: last7Days
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    next(error);
  }
};

// @desc    Get all customers with pagination and stats
// @route   GET /api/admin/customers
// @access  Private/Admin
exports.getCustomers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    const query = { role: 'user' };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const [customersData, total] = await Promise.all([
      User.find(query)
        .select('name email phone createdAt addresses')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    // Calculate stats for each customer from orders
    const customers = await Promise.all(
      customersData.map(async (customer) => {
        const orderStats = await Order.aggregate([
          { 
            $match: { 
              user: customer._id,
              status: { $ne: 'Cancelled' }
            } 
          },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalSpent: { $sum: '$totalAmount' }
            }
          }
        ]);

        return {
          ...customer,
          stats: {
            totalOrders: orderStats[0]?.totalOrders || 0,
            totalSpent: orderStats[0]?.totalSpent || 0
          }
        };
      })
    );

    res.status(200).json({
      success: true,
      count: customers.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: customers
    });
  } catch (error) {
    console.error('Get customers error:', error);
    next(error);
  }
};

// @desc    Get customer details with order history
// @route   GET /api/admin/customers/:id
// @access  Private/Admin
exports.getCustomerDetails = async (req, res, next) => {
  try {
    const customer = await User.findById(req.params.id)
      .select('-password');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Calculate customer stats - FIXED: Added 'new' keyword
    const orderStats = await Order.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(req.params.id),
          status: { $ne: 'Cancelled' }
        } 
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' }
        }
      }
    ]);

    const orders = await Order.find({ user: req.params.id })
      .populate('items.product')
      .sort('-createdAt');

    const customerData = customer.toObject();
    customerData.stats = {
      totalOrders: orderStats[0]?.totalOrders || 0,
      totalSpent: orderStats[0]?.totalSpent || 0
    };

    res.status(200).json({
      success: true,
      data: {
        customer: customerData,
        orders
      }
    });
  } catch (error) {
    console.error('Get customer details error:', error);
    next(error);
  }
};

// @desc    Update product stock
// @route   PUT /api/admin/products/:id/stock
// @access  Private/Admin
exports.updateProductStock = async (req, res, next) => {
  try {
    const { stockQuantity, inStock } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (stockQuantity !== undefined) {
      product.stockQuantity = stockQuantity;
      product.inStock = stockQuantity > 0;
    }

    if (inStock !== undefined) {
      product.inStock = inStock;
    }

    await product.save();

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new product
// @route   POST /api/admin/products
// @access  Private/Admin
exports.createProduct = async (req, res, next) => {
  try {
    const product = await Product.create(req.body);

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update product
// @route   PUT /api/admin/products/:id
// @access  Private/Admin
exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product
// @route   DELETE /api/admin/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await product.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get revenue analytics
// @route   GET /api/admin/analytics/revenue
// @access  Private/Admin
exports.getRevenueAnalytics = async (req, res, next) => {
  try {
    const { period = 'month' } = req.query; // day, week, month, year

    let groupBy;
    let dateRange = new Date();

    switch (period) {
      case 'day':
        groupBy = { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } };
        dateRange.setHours(dateRange.getHours() - 24);
        break;
      case 'week':
        groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        dateRange.setDate(dateRange.getDate() - 7);
        break;
      case 'month':
        groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        dateRange.setMonth(dateRange.getMonth() - 1);
        break;
      case 'year':
        groupBy = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
        dateRange.setFullYear(dateRange.getFullYear() - 1);
        break;
    }

    const analytics = await Order.aggregate([
      { $match: { createdAt: { $gte: dateRange }, status: { $ne: 'Cancelled' } } },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      period,
      data: analytics
    });
  } catch (error) {
    next(error);
  }
};