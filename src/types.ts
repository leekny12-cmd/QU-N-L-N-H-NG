export type OrderStatus = 'pending' | 'completed';

export interface Order {
  id: string;
  customerName: string;
  orderDate: string;
  dueDate: string;
  items: string;
  totalAmount: number;
  amountPaid: number;
  status: OrderStatus;
  createdAt: string;
}

export interface CustomerDebt {
  customerName: string;
  totalDebt: number;
  lastOrderDate: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'debt' | 'due' | 'system';
  date: string;
  isRead: boolean;
  orderId?: string;
}

export interface AppData {
  orders: Order[];
}
