import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Users, 
  Search, 
  Filter,
  TrendingUp,
  Wallet,
  Bell,
  Trash2,
  ChevronRight,
  X,
  Calendar,
  Image as ImageIcon,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';
import { Order, OrderStatus, CustomerDebt, Notification } from './types';

// --- Constants & Mock Data ---
const STORAGE_KEY = 'ordermaster_data';
const NOTIFICATIONS_KEY = 'ordermaster_notifications';

const INITIAL_ORDERS: Order[] = [
  {
    id: '1',
    customerName: 'Nguyễn Văn A',
    orderDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    items: '10x Áo thun, 5x Quần jean',
    totalAmount: 2500000,
    amountPaid: 1000000,
    status: 'pending',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    customerName: 'Trần Thị B',
    orderDate: new Date(Date.now() - 172800000).toISOString(),
    dueDate: new Date(Date.now() - 86400000).toISOString(),
    items: '2x Giày thể thao',
    totalAmount: 1200000,
    amountPaid: 1200000,
    status: 'completed',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  }
];

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'debt'>('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [orderToPay, setOrderToPay] = useState<Order | null>(null);
  const [orderIdToDelete, setOrderIdToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [itemsText, setItemsText] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  // Update itemsText when editingOrder changes
  useEffect(() => {
    setItemsText(editingOrder?.items || '');
  }, [editingOrder]);

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setOrders(JSON.parse(saved));
      } catch (e) {
        setOrders(INITIAL_ORDERS);
      }
    } else {
      setOrders(INITIAL_ORDERS);
    }

    const savedNotifications = localStorage.getItem(NOTIFICATIONS_KEY);
    if (savedNotifications) {
      try {
        setNotifications(JSON.parse(savedNotifications));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (orders.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      generateNotifications();
    }
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  }, [notifications]);

  const generateNotifications = useCallback(() => {
    const newNotifications: Notification[] = [];
    const now = new Date();

    orders.forEach(order => {
      if (order.status === 'pending') {
        const dueDate = parseISO(order.dueDate);
        const debt = order.totalAmount - order.amountPaid;

        if (debt > 0) {
          if (isToday(dueDate)) {
            newNotifications.push({
              id: `due-today-${order.id}`,
              title: 'Đến hạn thanh toán',
              message: `Đơn hàng của ${order.customerName} đến hạn thanh toán hôm nay (${new Intl.NumberFormat('vi-VN').format(debt)} đ).`,
              type: 'due',
              date: new Date().toISOString(),
              isRead: false,
              orderId: order.id
            });
          } else if (isPast(dueDate)) {
            newNotifications.push({
              id: `overdue-${order.id}`,
              title: 'Quá hạn thanh toán',
              message: `Đơn hàng của ${order.customerName} đã quá hạn (${new Intl.NumberFormat('vi-VN').format(debt)} đ).`,
              type: 'debt',
              date: new Date().toISOString(),
              isRead: false,
              orderId: order.id
            });
          }
        }
      }
    });

    // Merge with existing notifications, avoiding duplicates by ID
    setNotifications(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const uniqueNew = newNotifications.filter(n => !existingIds.has(n.id));
      if (uniqueNew.length === 0) return prev;
      return [...uniqueNew, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
  }, [orders]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const clearNotifications = () => {
    setNotifications([]);
    setIsNotificationOpen(false);
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // --- Computed Data ---
  const stats = useMemo(() => {
    const pending = orders.filter(o => o.status === 'pending');
    const completed = orders.filter(o => o.status === 'completed');
    const totalDebt = orders.reduce((acc, o) => acc + (o.totalAmount - o.amountPaid), 0);
    const overdue = pending.filter(o => isPast(parseISO(o.dueDate)) && !isToday(parseISO(o.dueDate)));
    
    return {
      total: orders.length,
      pending: pending.length,
      completed: completed.length,
      totalDebt,
      overdue: overdue.length
    };
  }, [orders]);

  const customerDebts = useMemo(() => {
    const debts: Record<string, CustomerDebt> = {};
    orders.forEach(o => {
      const debt = o.totalAmount - o.amountPaid;
      if (!debts[o.customerName]) {
        debts[o.customerName] = {
          customerName: o.customerName,
          totalDebt: 0,
          lastOrderDate: o.orderDate
        };
      }
      debts[o.customerName].totalDebt += debt;
      if (new Date(o.orderDate) > new Date(debts[o.customerName].lastOrderDate)) {
        debts[o.customerName].lastOrderDate = o.orderDate;
      }
    });
    return Object.values(debts).filter(d => d.totalDebt > 0).sort((a, b) => b.totalDebt - a.totalDebt);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => {
        const matchesSearch = o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             o.items.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, searchQuery, statusFilter]);

  // --- Handlers ---
  const handleAddOrder = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const newOrder: Order = {
      id: editingOrder?.id || Math.random().toString(36).substr(2, 9),
      customerName: formData.get('customerName') as string,
      items: formData.get('items') as string,
      totalAmount: Number(formData.get('totalAmount')),
      amountPaid: Number(formData.get('amountPaid')),
      status: formData.get('status') as OrderStatus,
      dueDate: formData.get('dueDate') as string,
      orderDate: editingOrder?.orderDate || new Date().toISOString(),
      createdAt: editingOrder?.createdAt || new Date().toISOString(),
    };

    if (editingOrder) {
      setOrders(prev => prev.map(o => o.id === editingOrder.id ? newOrder : o));
    } else {
      setOrders(prev => [newOrder, ...prev]);
    }
    
    setIsModalOpen(false);
    setEditingOrder(null);
  };

  const deleteOrder = (id: string) => {
    setOrderIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (orderIdToDelete) {
      setOrders(prev => prev.filter(o => o.id !== orderIdToDelete));
      setIsDeleteModalOpen(false);
      setOrderIdToDelete(null);
    }
  };

  const toggleStatus = (id: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === id) {
        const newStatus = o.status === 'pending' ? 'completed' : 'pending';
        return { ...o, status: newStatus as OrderStatus };
      }
      return o;
    }));
  };

  const handlePayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orderToPay) return;

    const formData = new FormData(e.currentTarget);
    const paymentAmount = Number(formData.get('paymentAmount'));
    
    setOrders(prev => prev.map(o => {
      if (o.id === orderToPay.id) {
        const newAmountPaid = o.amountPaid + paymentAmount;
        return { 
          ...o, 
          amountPaid: newAmountPaid,
          status: newAmountPaid >= o.totalAmount ? 'completed' : o.status
        };
      }
      return o;
    }));

    setIsPaymentModalOpen(false);
    setOrderToPay(null);
  };

  const processImage = async (file: File) => {
    setIsProcessingImage(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Hãy liệt kê danh sách các sản phẩm và số lượng tương ứng có trong hình ảnh này. Trả về kết quả dưới dạng danh sách ngắn gọn, ví dụ: '5x Áo thun, 2x Quần jean'. Chỉ trả về danh sách sản phẩm, không thêm lời chào hay giải thích." },
              { inlineData: { data: base64Data, mimeType: file.type } }
            ]
          }
        ]
      });

      if (response.text) {
        setItemsText(prev => prev ? `${prev}\n${response.text}` : response.text || '');
      }
    } catch (error) {
      console.error("Error processing image:", error);
      alert("Có lỗi xảy ra khi xử lý hình ảnh. Vui lòng thử lại.");
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImage(file);
    e.target.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await processImage(file);
          break;
        }
      }
    }
  };

  // --- UI Components ---
  const StatCard = ({ title, value, icon: Icon, color, subValue }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between">
      <div>
        <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
      </div>
      <div className={cn("p-3 rounded-xl", color)}>
        <Icon size={24} className="text-white" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-around items-center md:top-0 md:bottom-auto md:flex-col md:w-20 md:h-full md:border-t-0 md:border-r z-50">
        <div className="hidden md:block mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold">OM</div>
        </div>
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={cn("p-3 rounded-xl transition-all", activeTab === 'dashboard' ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:text-slate-600")}
        >
          <LayoutDashboard size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          className={cn("p-3 rounded-xl transition-all", activeTab === 'orders' ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:text-slate-600")}
        >
          <Clock size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('debt')}
          className={cn("p-3 rounded-xl transition-all", activeTab === 'debt' ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:text-slate-600")}
        >
          <Wallet size={24} />
        </button>
        <div className="md:mt-auto relative">
          <button 
            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            className={cn("p-3 transition-all relative", isNotificationOpen ? "text-indigo-600" : "text-slate-400 hover:text-slate-600")}
          >
            <Bell size={24} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          <AnimatePresence>
            {isNotificationOpen && (
              <>
                <div 
                  className="fixed inset-0 z-[60] md:hidden" 
                  onClick={() => setIsNotificationOpen(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="absolute bottom-16 left-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[70] md:bottom-auto md:top-0 md:left-16 overflow-hidden"
                >
                  <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <h3 className="font-bold text-slate-900">Thông báo</h3>
                    <button 
                      onClick={clearNotifications}
                      className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-wider"
                    >
                      Xóa tất cả
                    </button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell size={32} className="mx-auto text-slate-200 mb-2" />
                        <p className="text-sm text-slate-400">Không có thông báo mới</p>
                      </div>
                    ) : (
                      notifications.map(notification => (
                        <div 
                          key={notification.id} 
                          onClick={() => {
                            markAsRead(notification.id);
                            if (notification.orderId) {
                              setSearchQuery(orders.find(o => o.id === notification.orderId)?.customerName || '');
                              setActiveTab('orders');
                              setIsNotificationOpen(false);
                            }
                          }}
                          className={cn(
                            "p-4 border-b border-slate-50 last:border-0 cursor-pointer transition-colors hover:bg-slate-50",
                            !notification.isRead && "bg-indigo-50/30"
                          )}
                        >
                          <div className="flex gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                              notification.type === 'debt' ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"
                            )}>
                              {notification.type === 'debt' ? <AlertCircle size={16} /> : <Clock size={16} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900">{notification.title}</p>
                              <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{notification.message}</p>
                              <p className="text-[10px] text-slate-400 mt-1">{format(parseISO(notification.date), 'HH:mm, dd/MM')}</p>
                            </div>
                            {!notification.isRead && (
                              <div className="w-2 h-2 bg-indigo-600 rounded-full mt-1.5 shrink-0" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pb-24 pt-6 px-4 md:pl-28 md:pr-8 md:pt-8 max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {activeTab === 'dashboard' && "Tổng quan hệ thống"}
              {activeTab === 'orders' && "Danh sách đơn hàng"}
              {activeTab === 'debt' && "Quản lý công nợ"}
            </h1>
            <p className="text-slate-500 text-sm">Chào mừng quay trở lại, {format(new Date(), 'EEEE, dd MMMM', { locale: vi })}</p>
          </div>
          <button 
            onClick={() => { setEditingOrder(null); setIsModalOpen(true); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-95"
          >
            <Plus size={20} />
            Tạo đơn mới
          </button>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                  title="Tổng đơn hàng" 
                  value={stats.total} 
                  icon={TrendingUp} 
                  color="bg-blue-500" 
                />
                <StatCard 
                  title="Chưa hoàn thành" 
                  value={stats.pending} 
                  icon={Clock} 
                  color="bg-amber-500" 
                  subValue={`${stats.overdue} đơn quá hạn`}
                />
                <StatCard 
                  title="Đã hoàn thành" 
                  value={stats.completed} 
                  icon={CheckCircle2} 
                  color="bg-emerald-500" 
                />
                <StatCard 
                  title="Tổng công nợ" 
                  value={new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stats.totalDebt)} 
                  icon={Wallet} 
                  color="bg-rose-500" 
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Reminders Section */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Bell size={20} className="text-indigo-600" />
                      Nhắc nhở hôm nay
                    </h2>
                    <button onClick={() => setActiveTab('orders')} className="text-indigo-600 text-sm font-medium hover:underline">Xem tất cả</button>
                  </div>
                  <div className="space-y-3">
                    {orders.filter(o => o.status === 'pending' && (isToday(parseISO(o.dueDate)) || isPast(parseISO(o.dueDate)))).length === 0 ? (
                      <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-200 text-center">
                        <p className="text-slate-400">Không có đơn hàng nào cần xử lý gấp hôm nay.</p>
                      </div>
                    ) : (
                      orders
                        .filter(o => o.status === 'pending' && (isToday(parseISO(o.dueDate)) || isPast(parseISO(o.dueDate))))
                        .map(order => (
                          <div key={order.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:border-indigo-200 transition-all">
                            <div className={cn(
                              "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                              isPast(parseISO(order.dueDate)) && !isToday(parseISO(order.dueDate)) ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                            )}>
                              <AlertCircle size={24} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-slate-900 truncate">{order.customerName}</h4>
                              <p className="text-xs text-slate-500 truncate">{order.items}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-slate-900">
                                {new Intl.NumberFormat('vi-VN').format(order.totalAmount - order.amountPaid)} đ
                              </p>
                              <p className={cn(
                                "text-[10px] font-bold uppercase tracking-wider",
                                isPast(parseISO(order.dueDate)) && !isToday(parseISO(order.dueDate)) ? "text-rose-500" : "text-amber-500"
                              )}>
                                {isToday(parseISO(order.dueDate)) ? "Hạn hôm nay" : "Quá hạn"}
                              </p>
                            </div>
                            <button 
                              onClick={() => toggleStatus(order.id)}
                              className="p-2 text-slate-300 hover:text-emerald-500 transition-colors"
                            >
                              <CheckCircle2 size={20} />
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Top Debtors */}
                <div className="space-y-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Users size={20} className="text-indigo-600" />
                    Nợ nhiều nhất
                  </h2>
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {customerDebts.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-sm">Chưa có công nợ.</div>
                    ) : (
                      customerDebts.slice(0, 5).map((debt, idx) => (
                        <div key={idx} className="p-4 flex items-center justify-between border-b border-slate-50 last:border-0">
                          <div>
                            <p className="font-bold text-sm text-slate-900">{debt.customerName}</p>
                            <p className="text-[10px] text-slate-400">Đơn cuối: {format(parseISO(debt.lastOrderDate), 'dd/MM/yyyy')}</p>
                          </div>
                          <p className="text-sm font-bold text-rose-600">
                            {new Intl.NumberFormat('vi-VN').format(debt.totalDebt)} đ
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div 
              key="orders"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Tìm tên khách hàng hoặc sản phẩm..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  {(['all', 'pending', 'completed'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                        statusFilter === status 
                          ? "bg-indigo-600 text-white" 
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {status === 'all' ? 'Tất cả' : status === 'pending' ? 'Chưa xong' : 'Đã xong'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orders Table */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Khách hàng</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Sản phẩm</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng tiền</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Đã trả</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400">Không tìm thấy đơn hàng nào.</td>
                        </tr>
                      ) : (
                        filteredOrders.map((order) => (
                          <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <p className="font-bold text-slate-900">{order.customerName}</p>
                              <p className="text-[10px] text-slate-400">Ngày đặt: {format(parseISO(order.orderDate), 'dd/MM/yyyy')}</p>
                            </td>
                            <td className="px-6 py-4 max-w-xs">
                              <p className="text-sm text-slate-600 truncate">{order.items}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-bold text-slate-900">{new Intl.NumberFormat('vi-VN').format(order.totalAmount)} đ</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className={cn(
                                "text-sm font-medium",
                                order.amountPaid < order.totalAmount ? "text-rose-500" : "text-emerald-600"
                              )}>
                                {new Intl.NumberFormat('vi-VN').format(order.amountPaid)} đ
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                order.status === 'completed' 
                                  ? "bg-emerald-50 text-emerald-600" 
                                  : "bg-amber-50 text-amber-600"
                              )}>
                                {order.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => { setOrderToPay(order); setIsPaymentModalOpen(true); }}
                                  className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all"
                                  title="Xác nhận thanh toán"
                                >
                                  <Wallet size={18} />
                                </button>
                                <button 
                                  onClick={() => toggleStatus(order.id)}
                                  className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"
                                  title="Đổi trạng thái"
                                >
                                  <CheckCircle2 size={18} />
                                </button>
                                <button 
                                  onClick={() => { setEditingOrder(order); setIsModalOpen(true); }}
                                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                  title="Sửa"
                                >
                                  <ChevronRight size={18} />
                                </button>
                                <button 
                                  onClick={() => deleteOrder(order.id)}
                                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Xóa"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'debt' && (
            <motion.div 
              key="debt"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {customerDebts.length === 0 ? (
                <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                  <Wallet size={48} className="mx-auto text-slate-200 mb-4" />
                  <p className="text-slate-400">Hiện tại không có khách hàng nào nợ.</p>
                </div>
              ) : (
                customerDebts.map((debt, idx) => (
                  <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-indigo-200 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl">
                        {debt.customerName.charAt(0)}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Tổng nợ</p>
                        <p className="text-xl font-bold text-rose-600">{new Intl.NumberFormat('vi-VN').format(debt.totalDebt)} đ</p>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{debt.customerName}</h3>
                    <p className="text-sm text-slate-500 mb-6 flex items-center gap-1">
                      <Calendar size={14} />
                      Giao dịch cuối: {format(parseISO(debt.lastOrderDate), 'dd/MM/yyyy')}
                    </p>
                    <button 
                      onClick={() => { setSearchQuery(debt.customerName); setActiveTab('orders'); }}
                      className="w-full py-2.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                    >
                      Xem chi tiết đơn hàng
                      <ChevronRight size={16} />
                    </button>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && orderToPay && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPaymentModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden z-[120]"
            >
              <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900">Xác nhận thanh toán</h3>
                <button 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="p-2 hover:bg-white rounded-xl text-slate-400 transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handlePayment} className="p-6 space-y-6">
                <div className="bg-indigo-50 p-4 rounded-2xl">
                  <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Khách hàng</p>
                  <p className="font-bold text-indigo-900">{orderToPay.customerName}</p>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Tổng tiền</p>
                      <p className="font-bold text-indigo-900">{new Intl.NumberFormat('vi-VN').format(orderToPay.totalAmount)} đ</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Còn nợ</p>
                      <p className="font-bold text-rose-600">{new Intl.NumberFormat('vi-VN').format(orderToPay.totalAmount - orderToPay.amountPaid)} đ</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Số tiền thanh toán thêm (VNĐ)</label>
                  <input 
                    required 
                    type="number"
                    name="paymentAmount"
                    autoFocus
                    placeholder="Nhập số tiền..."
                    defaultValue={orderToPay.totalAmount - orderToPay.amountPaid}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-lg font-bold"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all"
                  >
                    Xác nhận
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-8 text-center"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Xác nhận xóa</h2>
              <p className="text-slate-500 text-sm mb-8">
                Bạn có chắc chắn muốn xóa đơn hàng này? Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all"
                >
                  Hủy
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold shadow-lg shadow-rose-100 transition-all active:scale-95"
                >
                  Xóa ngay
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Form */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-900">{editingOrder ? 'Sửa đơn hàng' : 'Tạo đơn hàng mới'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleAddOrder} className="p-8 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tên khách hàng</label>
                  <input 
                    required 
                    name="customerName"
                    defaultValue={editingOrder?.customerName}
                    placeholder="Nhập tên khách hàng..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sản phẩm / Chi tiết</label>
                    <label className={cn(
                      "flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer transition-colors",
                      isProcessingImage && "opacity-50 cursor-not-allowed"
                    )}>
                      {isProcessingImage ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Đang xử lý...
                        </>
                      ) : (
                        <>
                          <ImageIcon size={12} />
                          Nhập bằng hình ảnh
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleImageUpload}
                        disabled={isProcessingImage}
                      />
                    </label>
                  </div>
                  <textarea 
                    required 
                    name="items"
                    value={itemsText}
                    onChange={(e) => setItemsText(e.target.value)}
                    onPaste={handlePaste}
                    placeholder="Ví dụ: 5x Áo thun, 2x Quần... (Có thể dán hình ảnh trực tiếp vào đây)"
                    rows={2}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng tiền (VNĐ)</label>
                    <input 
                      type="number"
                      name="totalAmount"
                      defaultValue={editingOrder?.totalAmount}
                      placeholder="0"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Đã thanh toán</label>
                    <input 
                      type="number"
                      name="amountPaid"
                      defaultValue={editingOrder?.amountPaid || 0}
                      placeholder="0"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hạn hoàn thành</label>
                    <input 
                      required 
                      type="date"
                      name="dueDate"
                      defaultValue={editingOrder ? format(parseISO(editingOrder.dueDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái</label>
                    <select 
                      name="status"
                      defaultValue={editingOrder?.status || 'pending'}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none"
                    >
                      <option value="pending">Đang xử lý</option>
                      <option value="completed">Hoàn thành</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all active:scale-95"
                  >
                    {editingOrder ? 'Cập nhật đơn hàng' : 'Lưu đơn hàng'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
