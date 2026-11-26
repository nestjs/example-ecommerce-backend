import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { cartItems, orderItems, orders, products, type Order, type OrderItem } from '../database/schema.js';

export type OrderWithItems = Order & { items: Omit<OrderItem, 'orderId'>[] };

@Injectable()
export class OrdersService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** Turns the user's cart into an order, or throws without changing anything. */
  checkout(userId: string): Promise<OrderWithItems> {
    return this.db.transaction(async (tx) => {
      // Taking the cart is the first statement. A second checkout of the same
      // cart waits for this transaction, then finds it empty.
      const taken = await tx.delete(cartItems).where(eq(cartItems.userId, userId)).returning();
      if (taken.length === 0) {
        throw new ConflictException('Your cart is empty');
      }
      // Lock products in one order across all checkouts, so two of them never deadlock.
      taken.sort((a, b) => a.productId.localeCompare(b.productId));

      const items: Omit<OrderItem, 'orderId'>[] = [];
      for (const { productId, quantity } of taken) {
        // Checks and takes the stock in one statement: no read-then-write window.
        const [product] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${quantity}` })
          .where(and(eq(products.id, productId), eq(products.active, true), gte(products.stock, quantity)))
          .returning({ name: products.name, price: products.price });
        if (!product) {
          // Rolls back the whole transaction: the cart and the other products are untouched.
          throw new ConflictException(`Not enough stock for product ${productId}`);
        }
        items.push({ productId, name: product.name, unitPrice: product.price, quantity });
      }

      const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const [order] = await tx.insert(orders).values({ userId, status: 'placed', total }).returning();
      await tx.insert(orderItems).values(items.map((item) => ({ ...item, orderId: order.id })));
      return { ...order, items };
    });
  }

  findMine(userId: string): Promise<Order[]> {
    return this.db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(100);
  }

  async findOne(userId: string, id: string): Promise<OrderWithItems> {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)));
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return { ...order, items: await this.items(this.db, order.id) };
  }

  /** The owner cancels an order that hasn't shipped, and its stock goes back. */
  cancel(userId: string, id: string): Promise<Order> {
    return this.db.transaction(async (tx) => {
      // Conditional: of a cancel and a ship racing for the same order, one wins.
      const [order] = await tx
        .update(orders)
        .set({ status: 'cancelled' })
        .where(and(eq(orders.id, id), eq(orders.userId, userId), eq(orders.status, 'placed')))
        .returning();
      if (!order) {
        return this.refuse(tx, id, userId);
      }
      for (const { productId, quantity } of await this.items(tx, order.id)) {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${quantity}` })
          .where(eq(products.id, productId));
      }
      return order;
    });
  }

  /** Staff mark a placed order as shipped. */
  async ship(id: string): Promise<Order> {
    const [order] = await this.db
      .update(orders)
      .set({ status: 'shipped' })
      .where(and(eq(orders.id, id), eq(orders.status, 'placed')))
      .returning();
    return order ?? this.refuse(this.db, id);
  }

  private items(db: Pick<NodePgDatabase, 'select'>, orderId: string) {
    return db
      .select({
        productId: orderItems.productId,
        name: orderItems.name,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.name));
  }

  /** Why a conditional update changed nothing: 404 if the order isn't there (or isn't theirs), 409 otherwise. */
  private async refuse(db: Pick<NodePgDatabase, 'select'>, id: string, userId?: string): Promise<never> {
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, id), userId ? eq(orders.userId, userId) : undefined));
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    throw new ConflictException(`Order is already ${order.status}`);
  }
}
