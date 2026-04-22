import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";

const toNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getAnalyticsOverview = asyncHandler(async (_req, res) => {
  const [orderStats, topProductsAgg, totalProducts, totalUsers, activeUsersAgg] = await Promise.all([
    Order.aggregate([
      {
        $group: {
          _id: null,
          ordersCount: { $sum: 1 },
          totalSales: {
            $sum: {
              $cond: [{ $ne: ["$status", "cancelled"] }, "$totalAmount", 0],
            },
          },
        },
      },
    ]),
    Order.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          quantitySold: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
          name: { $first: "$items.name" },
        },
      },
      { $sort: { quantitySold: -1, revenue: -1 } },
      { $limit: 10 },
    ]),
    Product.countDocuments({ isActive: true }),
    User.countDocuments({ role: "customer" }),
    Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      },
      { $group: { _id: "$user" } },
      { $count: "activeUsers7d" },
    ]),
  ]);

  const productIds = topProductsAgg.map((item) => item._id).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } })
    .select("name imageUrl price category stock")
    .lean();
  const productMap = new Map(products.map((item) => [String(item._id), item]));

  const topProducts = topProductsAgg.map((item) => {
    const product = productMap.get(String(item._id));
    return {
      productId: item._id,
      name: product?.name || item.name || "Product",
      imageUrl: product?.imageUrl || "",
      category: product?.category || "",
      price: toNumber(product?.price),
      quantitySold: toNumber(item.quantitySold),
      revenue: Number(toNumber(item.revenue).toFixed(2)),
      stock: toNumber(product?.stock),
    };
  });

  const ordersCount = toNumber(orderStats[0]?.ordersCount);
  const totalSales = Number(toNumber(orderStats[0]?.totalSales).toFixed(2));
  const activeUsers7d = toNumber(activeUsersAgg[0]?.activeUsers7d);

  res.status(200).json({
    success: true,
    data: {
      totalSales,
      ordersCount,
      totalProducts,
      totalUsers,
      activeUsers7d,
      topProducts,
    },
  });
});
